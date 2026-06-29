// ============================================================
//  Einmalig ausführen: Historischer Backfill Rekordwerte
//  Schreibt All-Time-Rekordwerte (Wert + formatierter Datumsstring) für:
//    - Temp_Max                (höchste je gemessene Tagestemperatur)
//    - Temp_Min                (niedrigste je gemessene Tagestemperatur)
//    - Regenmengetag           (höchste je gemessene Regenmenge an einem Tag)
//    - Windboee                (stärkste je gemessene Windböe)
//    - Regenmengemonat         (höchste je gemessene Regenmenge eines Monats)
//
//  Überschreibt nur, wenn der InfluxDB-Wert besser als der aktuelle ioBroker-Wert ist.
//  Keine Zugangsdaten nötig – sendTo nutzt die Verbindung des InfluxDB-Adapters.
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

    function update(dpValue, dpString, influxVal, influxTs, unit, isMax, formatFn) {
        if (influxVal === null) return;
        const current = getState(PRE_DP + '.Rekordwerte.value.' + dpValue).val;
        const isBetter = isMax ? (influxVal > current) : (influxVal < current);
        const val = round2(influxVal);
        const str = formatFn(val, influxTs, unit);
        if (isBetter) {
            setState(PRE_DP + '.Rekordwerte.value.' + dpValue, val, true);
            setState(PRE_DP + '.Rekordwerte.' + dpString, str, true);
            console.log('[Backfill] NEU ' + dpValue + ': ' + str + ' (bisher: ' + current + ')');
        } else {
            console.log('[Backfill] KEIN UPDATE ' + dpValue + ': InfluxDB=' + val + ', ioBroker=' + current + ' → kein neuer Rekord');
        }
    }

    update('Temp_Max',        'Temperatur_Spitzenhoechstwert', tempMaxVal,  tempMaxTs,  '°C',   true,  formatTag);
    update('Temp_Min',        'Temperatur_Spitzentiefstwert',  tempMinVal,  tempMinTs,  '°C',   false, formatTag);
    update('Regenmengetag',   'Regenmengetag',                 regenTagVal, regenTagTs, 'l/m²', true,  formatTag);
    update('Windboee',        'Windboee',                      windVal,     windTs,     'km/h', true,  formatTag);
    update('Regenmengemonat', 'Regenmengemonat',               regenMonVal, regenMonTs, 'l/m²', true,  formatMonat);

    console.log('[Backfill] Abgeschlossen. Script jetzt deaktivieren!');
});
