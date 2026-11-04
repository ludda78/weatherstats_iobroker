# Changelog

## [Unreleased]
### Added
- `Wetter_Watchdog.js` V0.1: Sofort-Alarm per Telegram (oder Pushover) bei Fehlern/Warnungen der Wetter-Scripte
  und Fehlern des influxdb-Adapters; gebündelt (2 Min), gleiche Meldung max. alle 6 h; DPs unter `Statistik.Wetter.Watchdog`
- `Wetter_Watchdog.js` V0.2: Nachtruhe 22–7 Uhr (Meldungen werden gesammelt und um 7 Uhr als „Nachtbericht“ geschickt);
  Verbindungsfehler des influxdb-Adapters (ECONNREFUSED, Timeout, …) werden ignoriert — bleibt Influx wirklich weg,
  melden die Wetter-Scripte selbst einen Fehler

## [2.3.2] – 2026-11-04
### Fixed
- Regentage: An Tagen ohne `Regen_Tag`-Punkte in Influx wurde `Regentage` nicht zurückgesetzt und behielt den
  Wert des Vortags (nach dem Hochzählen die Monatssumme, also > 0) → es wurde fälschlich ein Regentag gezählt
  (Monat + Jahr). Jetzt `Regentage = 0` in diesem Fall.
- Update-Check: `v` wird jetzt bei Release-Tag **und** Script-Version entfernt. Vorher wurde `2.3.1` mit `V2.3.1`
  verglichen → „Neue Script-Version verfügbar“ bei jeder Version (gesehen am 03.11.2026).

## [2.3.1] – 2026-11-02
### Fixed
- Kompatibilität mit influxdb-Adapter 5.x: Multi-Query wird einzeln abgesetzt (`influxMultiQuery()`),
  vorher Fehler `invalid statement: ,` und keine Tagesauswertung → [Störung Oktober 2026](Stoerung_2026-10.md)
- `global_influx.js`: `influxWrite()` gibt `true`/`false` zurück (vorher Fehlalarm + 3-fache Writes)

### Added
- `Ausfall_Nachholen.js`: ausgefallene Tagesläufe nachholen inkl. Influx-Korrektur
- Influx-Hilfsscripte ins Repo aufgenommen: `global_influx.js`, `monthlyStatsCreateApply_V1.js`, `writeMonthlyStats2InfluxDB_v2.js`

### Security
- Hartkodierten Token aus `Wetter_aktuell_Monat_Jahr.js` entfernt (alter Token muss in InfluxDB widerrufen werden)

---

## [2.3.0] – 2026-06-29
- Tagestemperatur-Extremwerte (warmste Nacht, niedrigster Höchstwert, höchster/niedrigster Tagesdurchschnitt) als Jahres- und Rekordwert

## [2.2.0] – 2026-05-04
- Aktuelle Trockenperiode als eigener Datenpunkt (`Info.Trockenperiode_aktuell`)

## [2.1.x] – 2026-04
- Sonnenscheindauer und Solarenergie, diverse Fixes (Details im Script-Kopf)

---

## [2.0.7] – 2026-01-05
### Changed
- Tagesdurchschnitt jetzt zeitgewichtet (Influx-Timestamps)
- Initialwert des Jahresdurchschnitts am 01.01. auf ersten Tageswert gesetzt

### Fixed
- Abweichung zwischen Monats- und Jahresdurchschnitt im Januar

---

## [2.0.6] – 2025-02-02
- Anpassung Monatsdurchschnittsberechnung
