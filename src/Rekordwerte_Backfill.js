// ============================================================
//  Einmalig ausführen: Historischer Backfill Rekordwerte
//  Schreibt All-Time-Rekordwerte (Wert + formatierter Datumsstring) für:
//    - Temp_Max                (höchste je gemessene Tagestemperatur)
//    - Temp_Min                (niedrigste je gemessene Tagestemperatur)
//    - Regenmengetag           (höchste je gemessene Regenmenge an einem Tag)
//    - Windboee                (stärkste je gemessene Windböe)
//    - Regenmengemonat         (höchste je gemessene Regenmenge eines Monats)
//
//  Nach dem Ausführen Script deaktivieren!
// ============================================================

const INFLUXDB_INSTANZ   = '0';
const INFLUXDB_BUCKET    = 'iobroker';
const WET_DP             = 'wetterstation';
const PRE_DP             = '0_userdata.0.Statistik.Wetter';

const ALL_TIME_START_YEAR = 2020;

const monatsname = ['Januar','Februar','März','April','Mai','Juni','Juli',
                    'August','September','Oktober','November','Dezember'];

function round2(v) { return Math.round(v * 100) / 100; }

// Für Tages-Rekorde: aggregateWindow markiert das ENDE des Fensters → 1 Tag abziehen
function formatTag(val, ts, unit) {
    const d = new Date(ts - 86400000);
    return `${val} ${unit} am ${d.getDate()}. ${monatsname[d.getMonth()]} ${d.getFullYear()}`;
}

// Für Monats-Rekorde: aggregateWindow(1mo) Ende = 1. des Folgemonats → 1 Tag abziehen = letzter Tag des Monats
function formatMonat(val, ts, unit) {
    const d = new Date(ts - 86400000);
    return `${val} ${unit} im ${monatsname[d.getMonth()]} ${d.getFullYear()}`;
}

const now      = new Date();
const nowTs    = Math.floor(now.getTime() / 1000);
const allStart = Math.floor(new Date(ALL_TIME_START_YEAR, 0, 1, 0, 0, 0).getTime() / 1000);

function fluxTemp(fn, sort) {
    let q = `from(bucket:"${INFLUXDB_BUCKET}") `
          + `|> range(start:${allStart},stop:${nowTs}) `
          + `|> filter(fn:(r) => r._measurement=="${WET_DP}" and r._field=="Aussentemperatur") `
          + `|> aggregateWindow(every:1d,fn:${fn},createEmpty:false)`;
    if (sort === 'top') q += ` |> sort(columns:["_value"],desc:true) |> limit(n:1)`;
    if (sort === 'bot') q += ` |> sort(columns:["_value"],desc:false) |> limit(n:1)`;
    return q;
}

function fluxField(field, sort) {
    let q = `from(bucket:"${INFLUXDB_BUCKET}") `
          + `|> range(start:${allStart},stop:${nowTs}) `
          + `|> filter(fn:(r) => r._measurement=="${WET_DP}" and r._field=="${field}") `
          + `|> aggregateWindow(every:1d,fn:max,createEmpty:false)`;
    if (sort === 'top') q += ` |> sort(columns:["_value"],desc:true) |> limit(n:1)`;
    return q;
}

function fluxMonthlyRain() {
    // Tageswert = letzter Wert des Tages (Regen_Tag ist kumulative Tagessumme)
    // → aggregateWindow(1d, max) ergibt Tagessumme, dann monatlich summieren
    return `from(bucket:"${INFLUXDB_BUCKET}") `
         + `|> range(start:${allStart},stop:${nowTs}) `
         + `|> filter(fn:(r) => r._measurement=="${WET_DP}" and r._field=="Regen_Tag") `
         + `|> aggregateWindow(every:1d,fn:max,createEmpty:false) `
         + `|> aggregateWindow(every:1mo,fn:sum,createEmpty:false) `
         + `|> sort(columns:["_value"],desc:true) |> limit(n:1)`;
}

// 5 Queries:
// [0] Temp_Max        – höchste Tagestemperatur aller Zeiten
// [1] Temp_Min        – niedrigste Tagestemperatur aller Zeiten
// [2] Regenmengetag   – höchste Tagessumme Regen
// [3] Windboee        – stärkste Windböe
// [4] Regenmengemonat – regenreichster Monat
const QUERY = [
    fluxTemp('max', 'top'),
    fluxTemp('min', 'bot'),
    fluxField('Regen_Tag', 'top'),
    fluxField('Wind_max', 'top'),
    fluxMonthlyRain(),
].join('; ');

console.log('[Backfill] Starte Backfill der Rekordwerte...');
console.log('[Backfill] All-Time ab:', new Date(allStart * 1000).toLocaleDateString('de-DE'));

sendTo('influxdb.' + INFLUXDB_INSTANZ, 'query', QUERY, function(result) {
    if (result.error) {
        console.error('[Backfill] Fehler: ' + result.error);
        return;
    }

    function v(idx) { return (result.result[idx] && result.result[idx][0]) ? result.result[idx][0]._value : null; }
    function t(idx) { return (result.result[idx] && result.result[idx][0]) ? result.result[idx][0].ts    : null; }

    const tempMaxVal  = v(0); const tempMaxTs  = t(0);
    const tempMinVal  = v(1); const tempMinTs  = t(1);
    const regenTagVal = v(2); const regenTagTs = t(2);
    const windVal     = v(3); const windTs     = t(3);
    const regenMonVal = v(4); const regenMonTs = t(4);

    if (tempMaxVal !== null) {
        const str = formatTag(round2(tempMaxVal), tempMaxTs, '°C');
        setState(PRE_DP + '.Rekordwerte.value.Temp_Max', round2(tempMaxVal), true);
        setState(PRE_DP + '.Rekordwerte.Temperatur_Spitzenhoechstwert', str, true);
        console.log('[Backfill] Temp_Max: ' + str);
    }

    if (tempMinVal !== null) {
        const str = formatTag(round2(tempMinVal), tempMinTs, '°C');
        setState(PRE_DP + '.Rekordwerte.value.Temp_Min', round2(tempMinVal), true);
        setState(PRE_DP + '.Rekordwerte.Temperatur_Spitzentiefstwert', str, true);
        console.log('[Backfill] Temp_Min: ' + str);
    }

    if (regenTagVal !== null) {
        const str = formatTag(round2(regenTagVal), regenTagTs, 'l/m²');
        setState(PRE_DP + '.Rekordwerte.value.Regenmengetag', round2(regenTagVal), true);
        setState(PRE_DP + '.Rekordwerte.Regenmengetag', str, true);
        console.log('[Backfill] Regenmengetag: ' + str);
    }

    if (windVal !== null) {
        const str = formatTag(round2(windVal), windTs, 'km/h');
        setState(PRE_DP + '.Rekordwerte.value.Windboee', round2(windVal), true);
        setState(PRE_DP + '.Rekordwerte.Windboee', str, true);
        console.log('[Backfill] Windboee: ' + str);
    }

    if (regenMonVal !== null) {
        const str = formatMonat(round2(regenMonVal), regenMonTs, 'l/m²');
        setState(PRE_DP + '.Rekordwerte.value.Regenmengemonat', round2(regenMonVal), true);
        setState(PRE_DP + '.Rekordwerte.Regenmengemonat', str, true);
        console.log('[Backfill] Regenmengemonat: ' + str);
    }

    console.log('[Backfill] Abgeschlossen. Script jetzt deaktivieren!');
});
