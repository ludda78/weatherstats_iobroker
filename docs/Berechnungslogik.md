# Berechnungslogik – Wetterstation Statistik

Dieses Dokument beschreibt die Berechnungslogik der Temperatur-
Durchschnittswerte in diesem Projekt.

Ziel ist eine meteorologisch sinnvolle, nachvollziehbare und stabile
Langzeitstatistik auf Basis von ioBroker und InfluxDB.

---

## 1. Tagesdurchschnittstemperatur

### Grundlage
- Einzelmessungen der Außentemperatur aus InfluxDB
- Zeitstempel-basierte Messwerte mit ungleichmäßigen Abständen

### Methode
**Zeitgewichteter Mittelwert**

Messwerte werden nicht gleich gewichtet, sondern entsprechend der Dauer,
für die sie gültig sind.

### Formel

Tagesdurchschnitt =
Σ (Temperaturᵢ × Dauerᵢ)

Σ Dauerᵢ


- `Dauerᵢ` = Zeitspanne bis zur nächsten Messung
- Der letzte Messwert eines Tages gilt bis 23:59:59

### Motivation
Ein arithmetisches Mittel der Messpunkte würde kurze Ausreißer
überbewerten. Die zeitgewichtete Berechnung bildet den tatsächlichen
Temperaturverlauf korrekt ab.

---

## 2. Monatsdurchschnittstemperatur

### Grundlage
- Tagesdurchschnittstemperaturen

### Methode
**Arithmetischer Mittelwert über Kalendertage**

### Inkrementelle Berechnung

Monatsdurchschnittₙ =
(
Monatsdurchschnittₙ₋₁ × (n−1)

Tagesdurchschnittₙ
)
/
n

- Jeder Kalendertag wird gleich gewichtet
- Die Zeitgewichtung erfolgt ausschließlich innerhalb des Tages

### Begründung
Diese Methode entspricht der üblichen klimatologischen Praxis für
Monatsmittelwerte.

---

## 3. Jahresdurchschnittstemperatur

### Grundlage
- Tagesdurchschnittstemperaturen

### Besonderheit am Jahresanfang

Am **01.01.** wird der Jahresdurchschnitt **direkt mit dem Tagesdurchschnitt**
initialisiert.

Jahresdurchschnitt (01.01.) = Tagesdurchschnitt (01.01.)

Dadurch wird ein künstlicher Initialwert (z. B. 0 °C) vermieden.

### Ab dem 02.01.

Jahresdurchschnittₙ =
(
Jahresdurchschnittₙ₋₁ × (n−1)

Tagesdurchschnittₙ
)/n

### Ergebnis
- Monats- und Jahresdurchschnitt sind im Januar konsistent
- Stabiler, gleitender Jahresmittelwert
- Keine Nachwirkungen eines Initialwertes

---

## 4. Zusammenfassung der Gewichtung

| Ebene | Berechnungsmethode |
|----|-------------------|
| Messwerte → Tag | Zeitgewichteter Mittelwert |
| Tag → Monat | Arithmetischer Mittelwert |
| Tag → Jahr | Arithmetischer Mittelwert (gleitend) |

### Designentscheidung
Hohe Genauigkeit dort, wo die Messdichte relevant ist (Tagesebene),
und einfache, stabile Mittelwerte auf Monats- und Jahresebene.

---

## 5. Hinweis zu Vergleichbarkeit

Die gewählte Methodik stellt sicher:
- Vergleichbarkeit zwischen Monaten und Jahren
- Stabilität bei unregelmäßigen Messintervallen
- Nachvollziehbarkeit für langfristige Auswertungen (z. B. Grafana)
