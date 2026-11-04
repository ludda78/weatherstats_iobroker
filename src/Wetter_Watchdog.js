/*
 * Wetter_Watchdog.js  –  V0.2  (04.11.2026, ludda78)
 *   V0.2: Nachtruhe (Meldungen 22–7 Uhr als Nachtbericht um 7 Uhr), Influx-Verbindungsfehler ignorieren
 *   V0.1: Sofort-Alarm bei Log-Fehlern
 *
 * Sofort-Alarm, wenn die Wetter-Scripte oder der influxdb-Adapter Fehler/Warnungen ins Log schreiben.
 * Anlass: Störung Okt. 2026 lief ~1 Woche unbemerkt, obwohl jede Nacht Fehler im Log standen
 *         (siehe docs/Stoerung_2026-10.md).
 *
 * Funktionsweise:
 *  - onLog() hört auf alle Log-Meldungen der Stufen in STUFEN.
 *  - Berücksichtigt werden nur Meldungen der Scripte in SCRIPTE und der Adapter in ADAPTER.
 *  - Meldungen werden BUENDEL_SEK lang gesammelt und als EINE Nachricht verschickt
 *    (nachts kommen meist mehrere Folgefehler auf einmal).
 *  - Gleiche Meldung wird höchstens alle SPERRE_STD Stunden erneut gemeldet.
 *  - Letzte Meldung + Zeitpunkt zusätzlich in Datenpunkten (für VIS/Dashboard).
 *
 * Hinweis: onLog() sieht keine Meldungen des eigenen Scripts (keine Endlosschleife möglich).
 */

// *** Einstellungen ************************************************************************************
const KANAL            = 'telegram';        // 'telegram' | 'pushover' | 'keiner' (nur Datenpunkte/Log)
const TELEGRAM_INSTANZ = 'telegram.1';      // Instanz anpassen (Objekte -> Instanzen)
const TELEGRAM_USER    = '';                // '' = an alle Telegram-Benutzer, sonst Benutzername
const PUSHOVER_INSTANZ = 'pushover.0';

// Script-Namen wie in ioBroker (ohne Ordner); Meldungen aus global_influx.js erscheinen unter dem aufrufenden Script
const SCRIPTE = ['weatherStats_neu', 'Wetter_aktuell_Monat_Jahr', 'monthlyStatsCreateApply_V1', 'writeMonthlyStats2InfluxDB_v2'];
const ADAPTER = ['influxdb.0'];             // Adapter-Instanzen, deren Fehler ebenfalls gemeldet werden

const STUFEN = {                            // welche Log-Stufen je Quelle melden
    script:  ['error', 'warn'],             // Wetter-Scripte: auch Warnungen ("Versuch fehlgeschlagen", "Influx write error", …)
    adapter: ['error'],                     // Adapter: nur Fehler
};

// Nachtruhe: Meldungen in dieser Zeit werden gesammelt und um RUHE_BIS als ein "Nachtbericht" geschickt
// (nichts geht verloren). RUHE_VON = RUHE_BIS -> keine Nachtruhe.
const RUHE_VON = 22;                        // Stunde (0–23)
const RUHE_BIS = 7;                         // Stunde (0–23)

// Meldungen, die gar nicht gemeldet werden (nur für ADAPTER). Verbindungsabbrüche zur InfluxDB sind meist kurz;
// bleibt Influx wirklich weg, scheitern die Wetter-Scripte selbst und melden das. Leeres Array = alles melden.
const IGNORIEREN_ADAPTER = [/ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENOTFOUND|EAI_AGAIN|socket hang up|timeout|connect/i];

const BUENDEL_SEK = 120;                    // Meldungen so lange sammeln, dann eine Nachricht
const SPERRE_STD  = 6;                      // gleiche Meldung frühestens nach x Stunden erneut melden
const MAX_ZEILEN  = 10;                     // max. Meldungen pro Nachricht
const MAX_LAENGE  = 300;                    // Meldungen kürzen auf x Zeichen

const DP = '0_userdata.0.Statistik.Wetter.Watchdog';
// *** Ende Einstellungen *******************************************************************************

const scriptRegex = new RegExp('script\\.js\\.(?:[^\\s:]*\\.)?(' + SCRIPTE.join('|') + ')[:\\s]');
let puffer = [];
let timer = null;
const zuletztGemeldet = {};                 // Schlüssel -> Zeitstempel

createState(DP + '.Letzte_Meldung', '', { name: 'letzte gemeldete Fehlermeldung', type: 'string', role: 'text', read: true, write: false });
createState(DP + '.Letzte_Meldung_Zeit', 0, { name: 'Zeitpunkt der letzten Meldung', type: 'number', role: 'value.time', read: true, write: false });
createState(DP + '.Anzahl_heute', 0, { name: 'Anzahl gemeldeter Fehler heute', type: 'number', role: 'value', read: true, write: false });
createState(DP + '.Test', false, { name: 'Testnachricht senden', type: 'boolean', role: 'button', read: true, write: true });

function quelleVon(data) {
    if (ADAPTER.includes(data.from)) {
        if (!STUFEN.adapter.includes(data.severity)) { return null; }
        if (IGNORIEREN_ADAPTER.some(re => re.test(data.message || ''))) { return null; }
        return data.from;
    }
    const m = scriptRegex.exec(data.message || '');
    if (m && STUFEN.script.includes(data.severity)) { return m[1]; }
    return null;
}

onLog('error', logEmpfangen);
onLog('warn',  logEmpfangen);

function logEmpfangen(data) {
    const quelle = quelleVon(data);
    if (!quelle) { return; }

    // Text ohne Präfix "script.js.xxx.Name:" und ohne Zahlen als Schlüssel (sonst wäre jede Meldung "neu")
    let text = String(data.message).replace(/^.*?script\.js\.\S+?:\s*/, '').trim();
    if (text.length > MAX_LAENGE) { text = text.substring(0, MAX_LAENGE) + ' …'; }
    const schluessel = quelle + '|' + text.replace(/\d+/g, '#');

    const jetzt = Date.now();
    if (zuletztGemeldet[schluessel] && jetzt - zuletztGemeldet[schluessel] < SPERRE_STD * 3600 * 1000) { return; }
    zuletztGemeldet[schluessel] = jetzt;

    puffer.push({ zeit: data.ts || jetzt, quelle, stufe: data.severity, text });
    if (istRuhezeit()) { return; }          // wird um RUHE_BIS als Nachtbericht verschickt
    if (!timer) { timer = setTimeout(senden, BUENDEL_SEK * 1000); }
}

function istRuhezeit() {
    if (RUHE_VON === RUHE_BIS) { return false; }
    const h = new Date().getHours();
    return RUHE_VON > RUHE_BIS ? (h >= RUHE_VON || h < RUHE_BIS)     // über Mitternacht, z. B. 22–7
                               : (h >= RUHE_VON && h < RUHE_BIS);
}

function senden(praefix) {
    timer = null;
    if (!puffer.length) { return; }
    const eintraege = puffer.splice(0, puffer.length);
    const fehler = eintraege.filter(e => e.stufe === 'error').length;

    const zeilen = eintraege.slice(0, MAX_ZEILEN).map(e =>
        `${formatDate(new Date(e.zeit), 'hh:mm')} ${e.stufe === 'error' ? '❌' : '⚠️'} ${e.quelle}: ${e.text}`);
    if (eintraege.length > MAX_ZEILEN) { zeilen.push(`… und ${eintraege.length - MAX_ZEILEN} weitere (siehe Log)`); }

    const titel = `Wetterstatistik${praefix ? ' ' + praefix : ''}: ${fehler ? fehler + ' Fehler' : ''}${fehler && eintraege.length > fehler ? ', ' : ''}` +
                  `${eintraege.length > fehler ? (eintraege.length - fehler) + ' Warnung(en)' : ''}`;
    nachricht(titel, zeilen.join('\n'), fehler > 0);

    const letzte = eintraege[eintraege.length - 1];
    setState(DP + '.Letzte_Meldung', `${letzte.quelle}: ${letzte.text}`, true);
    setState(DP + '.Letzte_Meldung_Zeit', letzte.zeit, true);
    setState(DP + '.Anzahl_heute', (getState(DP + '.Anzahl_heute').val || 0) + eintraege.length, true);
}

function nachricht(titel, text, wichtig) {
    switch (KANAL) {
        case 'telegram': {
            // bewusst ohne Markdown: Log-Texte enthalten "_" (z. B. weatherStats_neu) -> würde Formatierung zerschießen
            const msg = { text: `${titel}\n${text}` };
            if (TELEGRAM_USER) { msg.user = TELEGRAM_USER; }
            sendTo(TELEGRAM_INSTANZ, 'send', msg);
            break;
        }
        case 'pushover':
            sendTo(PUSHOVER_INSTANZ, 'send', { title: titel, message: text, priority: wichtig ? 1 : 0 });
            break;
        default:
            break;
    }
    console.log(`[Watchdog] ${titel}\n${text}`);   // bewusst log, nicht warn/error
}

// Test: Datenpunkt Watchdog.Test auf true setzen -> Testnachricht (egal ob mit oder ohne "Bestätigt"/ack)
on({ id: DP + '.Test', val: true }, () => {
    nachricht('Wetterstatistik: Test', 'Watchdog läuft, Benachrichtigung funktioniert ✅', false);
    setState(DP + '.Test', false, true);
});

// Nachtbericht: in der Ruhezeit gesammelte Meldungen am Ende der Ruhezeit verschicken
if (RUHE_VON !== RUHE_BIS) {
    schedule(`0 ${RUHE_BIS} * * *`, () => { if (timer) { clearTimeout(timer); } senden('(Nachtbericht)'); });
}

// Tageszähler um Mitternacht zurücksetzen
schedule('0 0 * * *', () => setState(DP + '.Anzahl_heute', 0, true));

console.log(`Wetter_Watchdog gestartet (Kanal: ${KANAL}, Scripte: ${SCRIPTE.join(', ')}, Adapter: ${ADAPTER.join(', ')})`);
