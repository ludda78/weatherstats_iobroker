// ============================================================
//  Einmalig ausführen: doppelte Influx-Punkte löschen
//
//  Hintergrund: influxWrite() (global_influx.js) gab bis 02.11.2026 keinen
//  Rückgabewert -> die Writer werteten jeden Lauf als Fehlschlag und
//  schrieben 3x (Retry nach 10 + 20 Min). Umstellung auf das globale Script
//  war am 28.09.2026, erster Dreifach-Write am 29.09.2026.
//
//  Gelöscht wird pro Tag nur das Zeitfenster der Wiederholungen, der erste
//  Punkt bleibt erhalten:
//   - weather_monthly_running / weather_yearly_running: 01:06–01:59
//     an jedem Tag von TAG_VON bis TAG_BIS (ab 26.10. hat Ausfall_Nachholen.js
//     bereits bereinigt)
//   - wetterstatistik_<Jahr>: Monatsersten 01:49–02:30 (Writer läuft 01:48)
//
//  Erst DRY_RUN = true (listet die zu löschenden Punkte), dann false.
//  Benötigt das globale Influx-Script (getInfluxCfg, INFLUX_TOKEN).
//  Nach dem Ausführen Script deaktivieren!
// ============================================================

const DRY_RUN          = true;

const INFLUXDB_INSTANZ = '0';
const INFLUXDB_BUCKET  = 'iobroker';

const TAG_VON  = new Date(2026, 8, 29);   // 29.09.2026
const TAG_BIS  = new Date(2026, 9, 25);   // 25.10.2026 (einschließlich)
const MONATSERSTE = [new Date(2026, 9, 1)];   // 01.10.2026 -> September-Werte in wetterstatistik_2026

const RUNNING   = ['weather_monthly_running', 'weather_yearly_running'];

function zeit(d) { return d.toLocaleString('de-DE'); }

// [start, stop, measurement]-Fenster aufbauen (Ortszeit, Sommer-/Winterzeit wird von Date berücksichtigt)
function fensterListe() {
    const liste = [];
    for (let t = new Date(TAG_VON); t <= TAG_BIS; t.setDate(t.getDate() + 1)) {
        const a = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 1, 6, 0);
        const b = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 1, 59, 59);
        for (const m of RUNNING) liste.push([a, b, m]);
    }
    for (const t of MONATSERSTE) {
        const jahrVormonat = new Date(t.getFullYear(), t.getMonth() - 1, 1).getFullYear();
        liste.push([new Date(t.getFullYear(), t.getMonth(), 1, 1, 49, 0), new Date(t.getFullYear(), t.getMonth(), 1, 2, 30, 0),
                    'wetterstatistik_' + jahrVormonat]);
    }
    return liste;
}

// Anzahl der Punkte (Zeitstempel) in einem Fenster zählen
function zaehlen(a, b, m) {
    const q = 'from(bucket: "' + INFLUXDB_BUCKET + '") |> range(start: ' + a.toISOString() + ', stop: ' + b.toISOString() + ')'
            + ' |> filter(fn: (r) => r._measurement == "' + m + '") |> group() |> keep(columns: ["_time"]) |> unique(column: "_time")';
    return new Promise((resolve, reject) => {
        sendTo('influxdb.' + INFLUXDB_INSTANZ, 'query', q, res => {
            if (res.error) { reject(res.error); return; }
            const rows = (res.result && Array.isArray(res.result[0])) ? res.result[0] : (res.result || []);
            resolve(rows.length);
        });
    });
}

async function loeschen(a, b, m) {
    const axios = require('axios');
    const cfg = await getInfluxCfg();
    await axios.post(cfg.url + '/api/v2/delete',
        { start: a.toISOString(), stop: b.toISOString(), predicate: '_measurement="' + m + '"' },
        { params: { bucket: cfg.bucket, org: cfg.org },
          headers: { 'Content-Type': 'application/json', Authorization: 'Token ' + INFLUX_TOKEN }, timeout: 30000 });
}

async function aufraeumen() {
    const liste = fensterListe();
    console.log('[Duplikate] ' + liste.length + ' Zeitfenster' + (DRY_RUN ? ' (DRY_RUN - es wird nichts gelöscht)' : ''));
    let summe = 0;
    for (const [a, b, m] of liste) {
        const n = await zaehlen(a, b, m);
        summe += n;
        if (n === 0) continue;
        if (n > 2) console.warn('[Duplikate] ' + m + ' ' + zeit(a) + ': ' + n + ' Punkte im Fenster - erwartet 2, bitte prüfen!');
        if (DRY_RUN) {
            console.log('[Duplikate][DRY] ' + m + ': würde ' + n + ' Punkt(e) löschen, ' + zeit(a) + ' – ' + zeit(b));
        } else {
            await loeschen(a, b, m);
            console.log('[Duplikate] ' + m + ': ' + n + ' Punkt(e) gelöscht, ' + zeit(a) + ' – ' + zeit(b));
        }
    }
    console.log('[Duplikate] Fertig: ' + summe + ' Punkte ' + (DRY_RUN ? 'würden gelöscht. Prüfen, dann DRY_RUN = false.' : 'gelöscht. Script jetzt deaktivieren!'));
}

aufraeumen().catch(err => console.error('[Duplikate] Fehler: ' + err));
