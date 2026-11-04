# Backlog

Offene Punkte, Bugs und Ideen. Erledigtes nach unten in „Erledigt“ verschieben (mit Datum + Commit).

---

## Offen

### [Sicherheit] Token-Inventur InfluxDB
Stand `influx auth list` 03.11.2026:

| Token | angelegt | Nutzung | Status |
|---|---|---|---|
| for weatherdata of station | 25.06.2023 | unklar — evtl. Altlast | **inaktiv seit 03.11.** (vom User deaktiviert) → 1–2 Tage beobachten, dann löschen |
| Martin's Token | 03.06.2023 | **Operator-Token** aus `influx setup` (Wert im Passwort-Manager), jetzt in der CLI | aktiv, behalten, nie in Scripte |
| token to read data from Influx for Grafana and iobroker | 16.01.2026 | Grafana + ioBroker lesen | aktiv |
| write data from iobroker scripts to influxDB | ? | vermutlich `global_influx.js` (`w_nWg…`) | aktiv |
| token for influx adapter in iobroker | 28.09.2026 | influxdb-Adapter | aktiv |
| evcc / evcc reading only | 01.11.2026 | evcc | aktiv |

To do:
- „for weatherdata of station“: fällt in 1–2 Tagen nichts aus (Wetterdaten, Grafana, evcc, ioBroker) → löschen;
  fällt etwas aus → wieder aktivieren und Fundstelle hier notieren.

Hilfreiche Befehle (CLI läuft mit dem Operator-Token):
- Übersicht ohne Token-Werte: `influx auth list --json | grep -E '"(description|status)"'`
- Existiert ein Token noch? `influx auth list --json | grep -c '<erste 10 Zeichen>'` (0 = gelöscht)
- Fundstellen eines Tokens auf dem PI: `sudo grep -rIl "<erste 10–15 Zeichen>" /opt/iobroker/iobroker-data/ /etc/telegraf/ /etc/grafana/ /etc/evcc* ~/`
  (+ Grafana *Connections → Data sources* prüfen, dort ggf. verschlüsselt).
- Operator-Token verloren → Notfallzugang `influxd recovery auth create-operator` (InfluxDB vorher stoppen).

### [Feature] Überwachung: Fehler sollen nicht unbemerkt bleiben — **Stufe 1 umgesetzt**
- **04.11.2026 entschieden:** Kanal **Telegram** (Pushover per `KANAL` umschaltbar), eigenes Script `src/Wetter_Watchdog.js`,
  erste Version nur Idee 1 (Sofort-Alarm bei Log-Fehlern). Status: im Repo, auf dem PI einspielen + Test-DP auslösen.
- Spätere Stufen (offen): Morgen-Check (Idee 2) — erkennt auch Läufe, die *gar nicht* stattfinden (z. B. Script gestoppt,
  JS-Instanz hängt), was der Log-Alarm prinzipbedingt nicht sieht; Plausibilität (3); `Letzter_Erfolg` (5).
Anlass: Störung Okt. 2026 lief ~1 Woche unbemerkt, obwohl jede Nacht Fehler im Log standen; Influx-Duplikate
liefen ~5 Wochen, Regentage-Bug ggf. noch länger. Ideen (noch nicht entschieden):

1. **Sofort-Alarm bei Fehlern im Log:** `onLog('error', ...)` in einem Watchdog-Script, gefiltert auf die
   Wetter-Scripte und `influxdb.0` → Push-Nachricht.
2. **Morgen-Check (z. B. 07:00):** prüft, ob die Nacht gelaufen ist, und meldet sonst:
   - `VorTag.Temperatur_Durchschnitt` heute aktualisiert (`ts`)?
   - `Control.Statusmeldung` = „erfolgreich“?
   - genau 1 Punkt heute in `weather_monthly_running` / `weather_yearly_running` (erkennt auch Duplikate)
   - am Monatsersten: `Data.JJJJ.MM` des Vormonats vorhanden, `Data.JJJJ.<Monat>.*` ≠ 0, genau 1 Punkt in `wetterstatistik_<Jahr>`
3. **Plausibilitätsprüfungen** (z. B. monatlich):
   - Regentage ≤ Anzahl Tage mit `Regen_Tag >= 0.1` in den Rohdaten (hätte den Regentage-Bug gezeigt)
   - Sonnenscheindauer/Solarenergie Monat > 0 im Sommerhalbjahr (hätte den Sonnenschein-Punkt gezeigt)
   - Tiefstwert ≤ Durchschnitt ≤ Höchstwert, Werte in plausiblen Grenzen
4. **Nach Adapter-Updates** (influxdb, javascript): Hinweis/Extra-Check am nächsten Morgen.
5. Optional: `Control.Letzter_Erfolg` (Zeitstempel) in `weatherStats` setzen → einfach im VIS/Dashboard anzeigbar.

Offene Fragen: Benachrichtigungskanal (Telegram, Pushover, E-Mail, …? welcher Adapter ist installiert),
Umfang (erst 1+2, dann 3?), eigenes Script `Wetter_Watchdog.js` vs. Erweiterung von `weatherStats`.

### [Bug] Regentage werden an Tagen ohne Regen-Messpunkte falsch gezählt — **Fix im Repo (V2.3.2), nur noch auf PI einspielen**
- **04.11.2026:** Fix in `wetterstatistik_iobroker.js` V2.3.2 (`Regentage = 0` im Zweig `regen.length == 0`).
- **Abgleich 04.11.2026 (Abfragen unten): 2026 nicht betroffen, keine Korrektur nötig.**
  `tage_ohne_daten` = 0 in allen Monaten (der influxdb-Adapter schreibt `Regen_Tag` jeden Tag) → der Bug konnte nie greifen.

  | Monat 2026 | Jan | Feb | Mär | Apr | Mai | Jun | Jul | Aug | Sep | Okt |
  |---|---|---|---|---|---|---|---|---|---|---|
  | Rohdaten (letzter `Regen_Tag` ≥ 0.1) | 9 | 16 | 13 | 8 | 13 | 14 | 13 | 10 | 10 | 19 |
  | Statistik (`wetterstatistik_2026`) | 9 | 16 | 13 | 8 | 13 | 14 | 13 | **9** | 10 | 19 |

  August −1: vermutlich Grenzfall am Tagesrand (Script liest 00:01:12–23:59:59, Abfrage den ganzen Tag) — nicht weiter verfolgt.
- Der Fix bleibt trotzdem sinnvoll (Schutz, falls Influx einmal keine Regenpunkte für einen Tag hat, z. B. Adapter-Ausfall).
- `Regentage` ist eine Script-globale Variable (`wetterstatistik_iobroker.js`, `let Regentage`).
- In `main()` wird sie nur gesetzt, wenn Influx für den Tag `Regen_Tag`-Punkte liefert (`regen.length > 0`).
- Liefert Influx keine Punkte, behält die Variable ihren alten Wert — nach dem Hochzählen ist das die
  Monatssumme (z. B. 19), also *truthy* → es wird ein Regentag (Monat + Jahr) gezählt.
- Ebenso nach `speichern_Monat()`, das `Regentage` auf die Monatssumme setzt.
- Fix: `Regentage = 0;` im Zweig `regen.length == 0` (bzw. vor der Auswertung zurücksetzen).
- Danach prüfen, ob Regentage 2026 zu hoch sind (Abgleich mit Tagen `Regen_Tag >= 0.1` in Influx).
- `Ausfall_Nachholen.js` ist nicht betroffen (prüft `regenRows.length > 0`).

```flux
// Abgleich 1: echte Regentage pro Monat aus den Rohdaten (letzter Regen_Tag-Wert des Tages >= 0.1)
// + Tage ohne Regen-Messpunkte (nur an diesen Tagen konnte der Bug zuschlagen)
import "timezone"
option location = timezone.location(name: "Europe/Berlin")

from(bucket: "iobroker")
  |> range(start: 2026-01-01T00:00:00+01:00, stop: 2026-11-01T00:00:00+01:00)
  |> filter(fn: (r) => r._measurement == "wetterstation" and r._field == "Regen_Tag")
  |> aggregateWindow(every: 1d, fn: last, createEmpty: true, timeSrc: "_start")
  |> map(fn: (r) => ({_time: r._time,
        regentag:   if exists r._value and r._value >= 0.1 then 1 else 0,
        ohne_daten: if exists r._value then 0 else 1}))
  |> window(every: 1mo)
  |> reduce(identity: {regentage: 0, tage_ohne_daten: 0},
            fn: (r, accumulator) => ({regentage: accumulator.regentage + r.regentag,
                                      tage_ohne_daten: accumulator.tage_ohne_daten + r.ohne_daten}))
  |> keep(columns: ["_start", "regentage", "tage_ohne_daten"])
```

```flux
// Abgleich 2: was die Statistik je Monat gespeichert hat
from(bucket: "iobroker")
  |> range(start: 2026-01-01T00:00:00Z)
  |> filter(fn: (r) => r._measurement == "wetterstatistik_2026" and r._field =~ /^Regentage_/)
  |> last()
  |> keep(columns: ["_field", "_value"])
```

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
- 12.01./27.01.: **bewusst nicht bereinigt** (Entscheidung 04.11.2026) — nur 2 Einzelpunkte, Statistik selbst
  nicht betroffen, nur `mean()`/`count()` über diese Tage minimal verzerrt. Bei Bedarf später mit den Abfragen unten nachholen.

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

### [Verbesserung] Update-Check: Versionen numerisch vergleichen
- `check_update()` vergleicht auf Gleichheit → meldet auch eine *ältere* Release-Version als „neu“.
- Eigentlicher Fehler (`2.3.1` vs. `V2.3.1`, Meldung bei jeder Version) behoben 03.11.2026, siehe Erledigt.
- Optional: numerisch vergleichen und nur bei höherer Release-Version melden.

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
- **03.11.2026** – Nachtlauf geprüft: weatherStats V2.3.1 ohne Influx-Fehler (tag_des_jahres=306, Jahres-Ø 12,04),
  Writer 01:05 genau 1× geschrieben
- **03.11.2026** – Veröffentlichter InfluxDB-Token `N-aPZgG2…` (Commit `d2dbaa0`, öffentlich seit 01.06.2026): existiert
  in InfluxDB nicht mehr (`influx auth list` findet ihn nicht → gelöscht, Zeitpunkt unbekannt, vermutlich bei der
  Umstellung 28.09.). War noch in der `influx`-CLI-Konfig eingetragen → CLI auf Operator-Token umgestellt.
- **03.11.2026** – Update-Check-Fehler behoben (`v`-Präfix nur einseitig entfernt), auch auf dem PI eingespielt
- **04.11.2026** – Regentage-Bug behoben (V2.3.2, Commit `b8afd57`); Abgleich mit Rohdaten: Regentage 2026 stimmen
  (Bug hat nie gegriffen), keine Datenkorrektur nötig
- **04.11.2026** – Duplikate 12.01./27.01.2026 bewusst nicht bereinigt (unkritisch)
