## Ursprung & Lizenz

Dieses Projekt basiert auf dem Open-Source-Projekt  
https://github.com/SBorg2014/WLAN-Wetterstation

Originalautor:
- SBorg2014 (MIT License)

Weiterentwicklung & Anpassungen:
- ludda78

# Wetterstation Statistik für ioBroker & InfluxDB

Dieses Projekt stellt ein erweitertes Statistik-Skript für WLAN-Wetterstationen
auf Basis von ioBroker und InfluxDB v2 bereit.

Der Fokus liegt auf:
- meteorologisch sauberen Durchschnittsberechnungen
- stabilen Monats- und Jahresstatistiken
- langfristiger Nachvollziehbarkeit der Werte

---

## Features

- Zeitgewichtete Tagesdurchschnittstemperatur
- Monats- und Jahresdurchschnitt aus Tagesmitteln
- Automatische Monats- und Jahresstatistiken
- Rekordwerte (Temperatur, Regen, Wind)
- Vorjahresvergleiche
- InfluxDB v2 kompatibel

---

## Berechnungslogik (Kurzfassung)

| Ebene | Methode |
|------|--------|
| Messwerte → Tag | zeitgewichtet |
| Tag → Monat | arithmetischer Mittelwert |
| Tag → Jahr | arithmetischer Mittelwert (gleitend) |

Am 01.01. wird der Jahresdurchschnitt korrekt mit dem ersten Tageswert initialisiert.

➡️ Details siehe: `docs/berechnungslogik.md`

---

## Voraussetzungen

- ioBroker ≥ 3.x
- JavaScript-Adapter
- InfluxDB v2
- Wetterstationsdaten im Standardformat (keine Aliase)

---

## Installation

1. Skript aus `src/wetterstatistik_iobroker.js` kopieren
2. In ioBroker JavaScript-Adapter einfügen
3. Konfigurationsbereich am Skriptanfang anpassen
4. Skript aktivieren

---

## Skripte

| Datei | Typ | Zeitplan | Aufgabe |
|------|-----|----------|---------|
| `src/wetterstatistik_iobroker.js` | normal | täglich 01:03 | Tages-/Monats-/Jahres-/Rekordwerte aus InfluxDB berechnen, am Monatsersten `Data.JJJJ.MM` speichern |
| `src/global_influx.js` | **global** | – | `influxWrite()` (gibt `true`/`false` zurück) und Logger-Helfer; `INFLUX_TOKEN` lokal eintragen |
| `src/Wetter_aktuell_Monat_Jahr.js` | normal | täglich 01:05 | laufende Monats-/Jahreswerte nach `weather_monthly_running` / `weather_yearly_running` |
| `src/monthlyStatsCreateApply_V1.js` | normal | am 1. um 01:05 | JSON `Data.JJJJ.MM` in Einzel-DPs `Data.JJJJ.<Monatsname>.*` übertragen |
| `src/writeMonthlyStats2InfluxDB_v2.js` | normal | am 1. um 01:48 | Vormonatswerte nach `wetterstatistik_<Jahr>` |
| `src/Wetter_Watchdog.js` | normal | dauerhaft | Sofort-Alarm (Telegram/Pushover) bei Fehlern/Warnungen der Wetter-Scripte und von `influxdb.0`; Test über DP `Statistik.Wetter.Watchdog.Test` |
| `src/Ausfall_Nachholen.js` | einmalig | – | ausgefallene Tagesläufe nachholen (inkl. Influx-Korrektur), erst mit `DRY_RUN = true` |
| `src/Duplikate_Aufraeumen.js` | einmalig | – | 3-fache Influx-Punkte (29.09.–25.10.2026) löschen, erst mit `DRY_RUN = true` |
| `src/Temp_Extremwerte_Backfill.js`, `src/Rekordwerte_Backfill.js` | einmalig | – | historische Backfills |

Die drei Influx-Writer benötigen das globale Skript. Der Token gehört nur in die lokale Kopie auf dem ioBroker, **nie ins Repo**.

---

## Dokumentation

- [CHANGELOG.md](CHANGELOG.md) – Versionen
- [BACKLOG.md](BACKLOG.md) – offene Punkte, Bugs, Ideen
- [Berechnungslogik.md](Berechnungslogik.md) – wie die Werte berechnet werden
- [Stoerung_2026-10.md](Stoerung_2026-10.md) – Ausfall Okt. 2026 (influxdb-Adapter 5.x), Ursache und Wiederherstellung

---

## Lizenz

MIT License
