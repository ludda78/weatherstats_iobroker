# Backlog

Offene Punkte, Bugs und Ideen. Erledigtes nach unten in „Erledigt“ verschieben (mit Datum + Commit).

---

## Offen

### [Sicherheit] Alten InfluxDB-Token widerrufen — **dringend, vorgemerkt für 03.11.2026 morgens**
- Token `N-aPZgG2…` stand in `src/Wetter_aktuell_Monat_Jahr.js` (Commit `d2dbaa0`, 01.06.2026) und ist im öffentlichen GitHub-Repo in der Historie sichtbar.
- Aktuell genutzter Token auf dem PI ist ein anderer (`w_nWg…`), war nie im Repo.
- To do: in InfluxDB unter *Load Data → API Tokens* den alten Token löschen.
- Historie umschreiben (Force-Push) ist optional — nach dem Widerruf ist der Token wertlos.

### [Bug] Regentage werden an Tagen ohne Regen-Messpunkte falsch gezählt
- `Regentage` ist eine Script-globale Variable (`wetterstatistik_iobroker.js`, `let Regentage`).
- In `main()` wird sie nur gesetzt, wenn Influx für den Tag `Regen_Tag`-Punkte liefert (`regen.length > 0`).
- Liefert Influx keine Punkte, behält die Variable ihren alten Wert — nach dem Hochzählen ist das die
  Monatssumme (z. B. 19), also *truthy* → es wird ein Regentag (Monat + Jahr) gezählt.
- Ebenso nach `speichern_Monat()`, das `Regentage` auf die Monatssumme setzt.
- Fix: `Regentage = 0;` im Zweig `regen.length == 0` (bzw. vor der Auswertung zurücksetzen).
- Danach prüfen, ob Regentage 2026 zu hoch sind (Abgleich mit Tagen `Regen_Tag >= 0.1` in Influx).
- `Ausfall_Nachholen.js` ist nicht betroffen (prüft `regenRows.length > 0`).

### [Daten] Doppelte Punkte in Influx seit Umstellung auf `global_influx.js`
- Ursache: `influxWrite()` gab nichts zurück → Writer werteten jeden Lauf als Fehlschlag und
  schrieben 3× (Retry nach 10 und 20 Min). Behoben am 02.11.2026.
- Betroffen:
  - `weather_monthly_running` / `weather_yearly_running`: je 3 Punkte pro Tag (01:05, 01:15, 01:25)
    von der Umstellung bis 25.10.2026 (ab 26.10. bereits bereinigt durch `Ausfall_Nachholen.js`).
  - `wetterstatistik_<Jahr>`: je 3 Punkte für jeden Monatsersten nach der Umstellung (01:48, 01:58, 02:08).
- Werte der Duplikate sind identisch → verfälschen `mean()`/`count()`/`sum()` über Zeit (nicht aber `last()`).
- Befund 02.11.2026 (Abfragen unten):
  - `weather_monthly_running`: **3 Punkte/Tag ab 29.09.2026 01:05** (erstes Tagesfenster mit count 3 endet 29.09. 00:00 UTC)
    → Umstellung auf `global_influx.js` am 28.09.2026. Betroffen 29.09.–25.10. (ab 26.10. bereinigt).
  - `weather_monthly_running`: **2 Punkte am 12.01. und 27.01.2026** → Einzelfälle, andere Ursache (Writer 2× gelaufen?).
    Der scheinbare „2er-Verlauf“ Jan–März im ersten Diagramm war ein UTC-Artefakt (Tagesfenster in UTC,
    Writer schreibt 01:05 Ortszeit; z. B. Zeitumstellung 29.03.) — mit `option location = Europe/Berlin` verschwunden.
  - Sonst sauber (1 Punkt/Tag).
  - `wetterstatistik_2026`: nur **September** 3× (geschrieben 01.10.), Oktober sauber.
- **Aufräum-Script:** `src/Duplikate_Aufraeumen.js` (DRY_RUN zuerst) — löscht 29.09.–25.10. jeweils 01:06–01:59
  in beiden `*_running` sowie 01.10. 01:49–02:30 in `wetterstatistik_2026`. Status: **erledigt 02.11.2026 22:44**
  (55 Fenster × 2 = 110 Punkte gelöscht).
- Offen: 12.01./27.01. — erst Werte beider Punkte ansehen, dann entscheiden.

```flux
// Punkte pro deutschem Kalendertag (Zeitstempel = Fensterende, also 00:00 des Folgetags)
import "timezone"
option location = timezone.location(name: "Europe/Berlin")

from(bucket: "iobroker")
  |> range(start: 2026-01-01T00:00:00Z)
  |> filter(fn: (r) => r._measurement == "weather_monthly_running" and r._field == "Temperatur_Durchschnitt")
  |> aggregateWindow(every: 1d, fn: count, createEmpty: false)
  |> filter(fn: (r) => r._value > 1)
  |> keep(columns: ["_time", "_value"])
```

```flux
// Monatswerte: Felder mit mehr als einem Punkt
from(bucket: "iobroker")
  |> range(start: 2026-01-01T00:00:00Z)
  |> filter(fn: (r) => r._measurement == "wetterstatistik_2026")
  |> group(columns: ["_field"])
  |> count()
  |> filter(fn: (r) => r._value > 1)
```

### [Feature/Bug] Sonnenscheindauer und Solarenergie werden nicht erfasst
- In der Oktober-Statistik 2026 sind `Sonnenscheindauer_Monat` und `Solarenergie_Monat` = 0,
  ebenso `Jahreswerte.Sonnenschein_Max_Monat` / `Solarenergie_Max_Monat`.
- War schon vor dem Ausfall so (Wert kam aus `aktueller_Monat.*`, nicht aus dem Nachholen).
- Vermutung: `0_userdata.0.WetterstationFroggit.Sonnenschein_VorTag` / `.Solarenergie_VorTag`
  (und `*_Jahr`) existieren nicht oder sind leer → `main()` addiert jeden Tag 0.
- To do: DPs im Broker prüfen; ggf. Werte aus Influx (Rohdaten Solarstrahlung) berechnen.
- Für die Ausfalltage 25.10.–01.11.2026 sind die Werte ohnehin nicht nachholbar.

### [Bug] Update-Check meldet ältere Version als „neu“
- `check_update()` vergleicht nur auf Gleichheit: Release `v2.1.1` ≠ `V2.3.1` → „Neue Script-Version verfügbar“.
- Fix: Versionen numerisch vergleichen, oder aktuelles Release auf GitHub anlegen.
- Entschärft 02.11.2026: Release `v2.3.1` angelegt → Meldung verschwindet. Grundproblem (Gleichheitsvergleich) bleibt.

### [Doku] `writeMonthlyStats2InfluxDB_v2.js` / `monthlyStatsCreateApply_V1.js` absichern
- Wenn `Data.JJJJ.MM` fehlt, legt `monthlyStatsCreateApply_V1` die DPs mit 0 an und der Writer schreibt
  Nullen nach Influx (so am 01.11.2026 passiert).
- Idee: DPs ohne Startwert anlegen bzw. Writer abbrechen, wenn `Data.JJJJ.MM` fehlt.

---

## Erledigt

- **02.11.2026** – influxdb-Adapter 5.x: Multi-Query-Fehler in `weatherStats` behoben (V2.3.1), Ausfall 25.10.–01.11. nachgeholt,
  `influxWrite()`-Rückgabewert behoben → siehe [Stoerung_2026-10.md](Stoerung_2026-10.md) (Commit `8cff760`)
- **02.11.2026** – Influx-Duplikate 29.09.–25.10. (110 Punkte) mit `Duplikate_Aufraeumen.js` gelöscht
- **02.11.2026** – GitHub-Release [v2.3.1](https://github.com/ludda78/weatherstats_iobroker/releases/tag/v2.3.1) angelegt
