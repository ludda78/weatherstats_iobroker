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

1. Skript aus `src/wetterstation-statistik.js` kopieren
2. In ioBroker JavaScript-Adapter einfügen
3. Konfigurationsbereich am Skriptanfang anpassen
4. Skript aktivieren

---

## Lizenz

MIT License
