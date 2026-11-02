# Störung Oktober 2026: keine Wetterstatistik, Oktoberwerte = 0

**Zeitraum:** 25.10.2026 – 02.11.2026 · **Behoben:** 02.11.2026 · **Commit:** `8cff760`

## Symptome

- Monatswerte Oktober 2026 in Influx (`wetterstatistik_2026`) alle 0.
- Log jede Nacht seit 26.10.:
  - `influxdb.0 queries: HttpError: compilation failed: error @1:180-1:181: invalid statement: , ...`
  - `weatherStats_neu: [main] Keine Temperaturdaten für den Vortag vorhanden!`
  - `Wetter_aktuell_Monat_Jahr: Versuch 1/2 fehlgeschlagen ... nach 3 Versuchen nicht geschrieben`
- Am 01.11.: `monthlyStatsCreateApply_V1: Kein Wert zum Setzen für ...Oktober...`,
  `writeMonthlyStats2InfluxDB_v2: Monatsdaten Oktober 2026: nach 3 Versuchen nicht geschrieben`

## Ursachen

Zwei voneinander unabhängige Fehler, die zufällig zeitgleich auffielen:

### 1. influxdb-Adapter 5.x bricht Multi-Queries (Hauptursache)

- `weatherStats` schickt drei Flux-Abfragen in einem `sendTo(..., 'query', ...)`, getrennt durch `;`.
- Adapter 4.x hat an `;` gesplittet und die Abfragen einzeln ausgeführt.
- Adapter 5.x (ab 5.1.7, 21.10.2026) splittet zwar noch, übergibt das Array aber an `query()` statt `queries()`
  → JavaScript verbindet es mit `,` → Flux meldet `invalid statement: ,` genau an den Stellen der `;`
  (Zeichen 180 und 353).
- Folge: `main()` brach jeden Tag ab. Nicht mehr fortgeschrieben: `VorTag`, `aktueller_Monat`, `Jahreswerte`, `Rekordwerte`.
  Am 01.11. wurde `speichern_Monat()` nicht ausgeführt → kein `Data.2026.10`, kein Monatsreset.
- Kette am 01.11.: `monthlyStatsCreateApply_V1` fand kein `Data.2026.10` → legte `Data.2026.Oktober.*` mit 0 an
  → `writeMonthlyStats2InfluxDB_v2` schrieb diese Nullen nach Influx.

### 2. `influxWrite()` ohne Rückgabewert (Fehlalarm + Duplikate)

- Seit der Umstellung aller Influx-Writes auf das globale Script lieferte `influxWrite()` immer `undefined`.
- Die Writer prüfen `if (ok)` → werteten jeden Lauf als Fehlschlag und wiederholten ihn 2× nach je 10 Min.
- Die Schreibvorgänge selbst waren erfolgreich (kein `Influx write error` im Log) → jeder Wert steht **3×** in Influx.

## Behebung

| Was | Änderung |
|-----|----------|
| `wetterstatistik_iobroker.js` → V2.3.1 | neue Funktion `influxMultiQuery()`: Abfragen einzeln senden, Ergebnis im alten Format zusammensetzen; in `main()` und `VorJahr()` eingesetzt. Funktioniert mit Adapter 4.x und 5.x. |
| `global_influx.js` | `influxWrite()` gibt `true`/`false` zurück |
| `Wetter_aktuell_Monat_Jahr.js` | Repo auf PI-Version gebracht (+4 Felder aus V2.3.0, Token entfernt) |
| `monthlyStatsCreateApply_V1.js` | Funktion benannt (`monatswerteAnlegen`), damit von Hand startbar |

## Datenwiederherstellung (02.11.2026, ca. 22:15)

1. `Ausfall_Nachholen.js` mit `DRY_RUN = true`, Werte geprüft, dann `DRY_RUN = false`:
   - Tage 25.10.–01.11. aus Influx-Rohdaten nachgerechnet (VorTag, aktueller_Monat, Jahreswerte, Rekordwerte)
   - Oktober als `Data.2026.10` gespeichert, Monat zurückgesetzt, 01.11. in den November übernommen
   - Influx: `weather_monthly_running` / `weather_yearly_running` ab 26.10. gelöscht, 16 korrekte Punkte (je 01:05) geschrieben
   - Influx: Null-Punkte in `wetterstatistik_2026` am 01.11. 01:40–02:30 gelöscht
   - `Vorjahres_Monat` für November aus `Data.2025.11` gesetzt
2. `monthlyStatsCreateApply_V1` von Hand → `Data.2026.Oktober.*` befüllt
3. `writeMonthlyStats2InfluxDB_v2` von Hand → Oktober 2026 einmal nach Influx
4. `weatherStats_neu` (V2.3.1) gestartet

**Oktober 2026:** Ø 11,34 °C · Min 1 °C · Max 23,78 °C · Regen 58,43 mm an 19 Tagen · Böe max. 34,92 km/h

## Nicht wiederherstellbar

- Sonnenschein/Solarenergie der Ausfalltage (nur als VorTag-DP im Broker vorhanden) — war aber ohnehin 0, siehe Backlog.
- Jahres-Trockenperiode im Ausfallzeitraum (aktuelle Trockenperiode wird beim nächsten Lauf korrekt gesetzt).
- `RegenmengeJahr` / `Trockenperiode_*` in den nachgeschriebenen `weather_yearly_running`-Punkten.

## To do am 03.11.2026 (morgens)

- [ ] **Alten InfluxDB-Token `N-aPZgG2…` löschen** (InfluxDB → *Load Data → API Tokens*) — steht in der öffentlichen Git-Historie
- [ ] 01:03 `weatherStats_neu`: `TagesTemp_Durchschnitt (zeitgewichtet)`, `tag_des_jahres=306`, kein Influx-Fehler
- [ ] 01:05 `Wetter_aktuell_Monat_Jahr`: genau einmal `Daily weather statistics written`
- [ ] Werte 12.01./27.01.2026 in `weather_*_running` ansehen (Duplikate, siehe Backlog)

## Duplikate bereinigt (02.11.2026, ca. 22:45)

- `Duplikate_Aufraeumen.js`: DRY_RUN ergab in allen 55 Fenstern genau 2 Punkte (110 gesamt), dann gelöscht.
- Betroffen: `weather_monthly_running` / `weather_yearly_running` 29.09.–25.10. (01:15 + 01:25), `wetterstatistik_2026` September (01.10. 01:58 + 02:08).

## Offene Folgepunkte

Siehe [BACKLOG.md](BACKLOG.md): alten Token widerrufen, Duplikate aufräumen, Regentage-Bug, Sonnenschein, Update-Check.

## Hinweise für künftige Adapter-Updates

- Nach Updates des influxdb-Adapters am nächsten Morgen das Log von `weatherStats` prüfen.
- Ausgefallene Tage lassen sich mit `Ausfall_Nachholen.js` nachholen, solange es **vor** dem nächsten Monatswechsel
  passiert (bzw. vor dem nächsten 01:03-Lauf, wenn ein Monatswechsel im Ausfall lag).
- Nach Änderungen an globalen Scripten die JavaScript-Instanz neu starten.
