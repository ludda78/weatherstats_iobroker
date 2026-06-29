// ============================================================
//  Einmalig ausführen: Historischer Backfill Temperatur-Extremwerte
//  Schreibt Jahreswerte und All-Time-Rekordwerte für:
//    - Temperatur_Min_Max  (warmste Nacht:  höchster Tagesteifwert)
//    - Temperatur_Max_Min  (kältester Tag:  niedrigster Tageshöchstwert)
//    - Temperatur_Durchschnitt_Tag_Max  (heißester Durchschnittstag)
//    - Temperatur_Durchschnitt_Tag_Min  (kältester Durchschnittstag)
//
//  Nach dem Ausführen Script deaktivieren!
// ============================================================

const INFLUXDB_INSTANZ   = '0';
const INFLUXDB_BUCKET    = 'iobroker';
const WET_DP             = 'wetterstation';
const PRE_DP             = '0_userdata.0.Statistik.Wetter';

// Passt den All-Time-Startzeitraum an das tatsächliche Installationsdatum an:
const ALL_TIME_START_YEAR = 2020;

const monatsname = ['Januar','Februar','März','April','Mai','Juni','Juli',
                    'August','September','Oktober','November','Dezember'];

function formatRekord(val, ts) {
    // aggregateWindow markiert das ENDE des Fensters → 1 Tag abziehen
    const d = new Date(ts - 86400000);
    return `${val} °C am ${d.getDate()}. ${monatsname[d.getMonth()]} ${d.getFullYear()}`;
}

function round2(v) { return Math.round(v * 100) / 100; }

// Zeitgrenzen
const now       = new Date();
const yearStart = Math.floor(new Date(now.getFullYear(), 0, 1, 0, 0, 0).getTime() / 1000);
const nowTs     = Math.floor(now.getTime() / 1000);
const allStart  = Math.floor(new Date(ALL_TIME_START_YEAR, 0, 1, 0, 0, 0).getTime() / 1000);

// Flux-Helper
function flux(start, stop, fn, sort) {
    let q = `from(bucket:"${INFLUXDB_BUCKET}") `
          + `|> range(start:${start},stop:${stop}) `
          + `|> filter(fn:(r) => r._measurement=="${WET_DP}" and r._field=="Aussentemperatur") `
          + `|> aggregateWindow(every:1d,fn:${fn},createEmpty:false)`;
    if (sort === 'max') q += ` |> max()`;
    if (sort === 'min') q += ` |> min()`;
    if (sort === 'top') q += ` |> sort(columns:["_value"],desc:true) |> limit(n:1)`;
    if (sort === 'bot') q += ` |> sort(columns:["_value"],desc:false) |> limit(n:1)`;
    return q;
}

// 8 Queries in einem sendTo:
// [0] Jahreswert: max der Tagestiefwerte (warmste Nacht)
// [1] Jahreswert: min der Tageshöchstwerte (kältester Tag)
// [2] Jahreswert: max der Tagesdurchschnitte
// [3] Jahreswert: min der Tagesdurchschnitte
// [4] Rekord:     warmste Nacht je (mit Datum)
// [5] Rekord:     kältester Tag je (mit Datum)
// [6] Rekord:     heißester Durchschnittstag je (mit Datum)
// [7] Rekord:     kältester Durchschnittstag je (mit Datum)
const QUERY = [
    flux(yearStart, nowTs, 'min', 'max'),
    flux(yearStart, nowTs, 'max', 'min'),
    flux(yearStart, nowTs, 'mean', 'max'),
    flux(yearStart, nowTs, 'mean', 'min'),
    flux(allStart,  nowTs, 'min', 'top'),
    flux(allStart,  nowTs, 'max', 'bot'),
    flux(allStart,  nowTs, 'mean', 'top'),
    flux(allStart,  nowTs, 'mean', 'bot'),
].join('; ');

console.log('[Backfill] Starte historischen Backfill der Temperatur-Extremwerte...');
console.log('[Backfill] Jahresbeginn:', new Date(yearStart * 1000).toLocaleDateString('de-DE'));
console.log('[Backfill] All-Time ab:', new Date(allStart * 1000).toLocaleDateString('de-DE'));

sendTo('influxdb.' + INFLUXDB_INSTANZ, 'query', QUERY, function(result) {
    if (result.error) {
        console.error('[Backfill] Fehler: ' + result.error);
        return;
    }

    function v(idx) { return (result.result[idx] && result.result[idx][0]) ? result.result[idx][0]._value : null; }
    function t(idx) { return (result.result[idx] && result.result[idx][0]) ? result.result[idx][0].ts    : null; }

    // ── Jahreswerte ──────────────────────────────────────────
    const minMaxYear = v(0);
    const maxMinYear = v(1);
    const avgMaxYear = v(2);
    const avgMinYear = v(3);

    if (minMaxYear !== null) {
        setState(PRE_DP + '.Jahreswerte.Temperatur_Min_Max',            round2(minMaxYear), true);
        console.log('[Backfill] Temperatur_Min_Max  (Jahr): ' + round2(minMaxYear) + ' °C');
    }
    if (maxMinYear !== null) {
        setState(PRE_DP + '.Jahreswerte.Temperatur_Max_Min',            round2(maxMinYear), true);
        console.log('[Backfill] Temperatur_Max_Min  (Jahr): ' + round2(maxMinYear) + ' °C');
    }
    if (avgMaxYear !== null) {
        setState(PRE_DP + '.Jahreswerte.Temperatur_Durchschnitt_Tag_Max', round2(avgMaxYear), true);
        console.log('[Backfill] Temp_Durchschnitt_Tag_Max (Jahr): ' + round2(avgMaxYear) + ' °C');
    }
    if (avgMinYear !== null) {
        setState(PRE_DP + '.Jahreswerte.Temperatur_Durchschnitt_Tag_Min', round2(avgMinYear), true);
        console.log('[Backfill] Temp_Durchschnitt_Tag_Min (Jahr): ' + round2(avgMinYear) + ' °C');
    }

    // ── Rekordwerte ───────────────────────────────────────────
    const minMaxRecVal = v(4); const minMaxRecTs = t(4);
    const maxMinRecVal = v(5); const maxMinRecTs = t(5);
    const avgMaxRecVal = v(6); const avgMaxRecTs = t(6);
    const avgMinRecVal = v(7); const avgMinRecTs = t(7);

    if (minMaxRecVal !== null) {
        setState(PRE_DP + '.Rekordwerte.value.Temp_Min_Max', round2(minMaxRecVal), true);
        setState(PRE_DP + '.Rekordwerte.Temp_Min_Max', formatRekord(round2(minMaxRecVal), minMaxRecTs), true);
        console.log('[Backfill] Rekord Temp_Min_Max: ' + formatRekord(round2(minMaxRecVal), minMaxRecTs));
    }
    if (maxMinRecVal !== null) {
        setState(PRE_DP + '.Rekordwerte.value.Temp_Max_Min', round2(maxMinRecVal), true);
        setState(PRE_DP + '.Rekordwerte.Temp_Max_Min', formatRekord(round2(maxMinRecVal), maxMinRecTs), true);
        console.log('[Backfill] Rekord Temp_Max_Min: ' + formatRekord(round2(maxMinRecVal), maxMinRecTs));
    }
    if (avgMaxRecVal !== null) {
        setState(PRE_DP + '.Rekordwerte.value.Temp_Durchschnitt_Tag_Max', round2(avgMaxRecVal), true);
        setState(PRE_DP + '.Rekordwerte.Temp_Durchschnitt_Tag_Max', formatRekord(round2(avgMaxRecVal), avgMaxRecTs), true);
        console.log('[Backfill] Rekord Temp_Durchschnitt_Tag_Max: ' + formatRekord(round2(avgMaxRecVal), avgMaxRecTs));
    }
    if (avgMinRecVal !== null) {
        setState(PRE_DP + '.Rekordwerte.value.Temp_Durchschnitt_Tag_Min', round2(avgMinRecVal), true);
        setState(PRE_DP + '.Rekordwerte.Temp_Durchschnitt_Tag_Min', formatRekord(round2(avgMinRecVal), avgMinRecTs), true);
        console.log('[Backfill] Rekord Temp_Durchschnitt_Tag_Min: ' + formatRekord(round2(avgMinRecVal), avgMinRecTs));
    }

    console.log('[Backfill] Abgeschlossen. Script jetzt deaktivieren!');
});
