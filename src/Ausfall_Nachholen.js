// ============================================================
//  Einmalig ausführen: Ausgefallene Tagesläufe von weatherStats nachholen
//
//  Hintergrund: Seit dem Update des influxdb-Adapters auf 5.x schlug die
//  Multi-Query ("...; from(...)") mit "invalid statement: ," fehl. main()
//  brach jeden Tag ab -> aktueller_Monat, Jahreswerte, Rekordwerte wurden
//  nicht mehr fortgeschrieben, am Monatsersten wurde der Monat weder
//  gespeichert (Data.JJJJ.MM) noch zurückgesetzt.
//
//  Das Script spielt jeden fehlenden Tag (ab dem letzten erfolgreichen Lauf
//  bis einschließlich gestern) in der Reihenfolge nach, wie main() es getan
//  hätte. Bei Monatswechsel wird der Vormonat gespeichert und zurückgesetzt.
//
//  WICHTIG:
//   - VOR dem nächsten regulären Lauf von weatherStats (01:03 Uhr) ausführen,
//     sonst landet der nächste Tag noch im alten Monat.
//   - Erst DRY_RUN = true (nur Log-Ausgabe), dann DRY_RUN = false.
//   - Nicht nachholbar: Sonnenschein/Solarenergie der ausgefallenen Tage
//     (stehen nur als VorTag-DP im Broker), Trockenperiode (setzt der
//     nächste reguläre Lauf korrekt).
//   - Nach dem Ausführen Script deaktivieren!
//
//  InfluxDB (weather_monthly_running / weather_yearly_running):
//   Die im Ausfallzeitraum täglich geschriebenen Punkte enthalten veraltete
//   Werte (und je 3 Stück wg. Retry-Fehlalarm). Sie werden gelöscht und pro
//   Tag durch einen Punkt mit Zeitstempel <Folgetag> 01:05 ersetzt.
//   Benötigt das globale Influx-Script (influxWrite, getInfluxCfg, INFLUX_TOKEN).
//   RegenmengeJahr und Trockenperiode_* werden dabei nicht nachgeschrieben.
// ============================================================

const DRY_RUN            = true;

const INFLUXDB_INSTANZ   = '0';
const INFLUXDB_BUCKET    = 'iobroker';
const WET_DP             = 'wetterstation';
const PRE_DP             = '0_userdata.0.Statistik.Wetter';
const REKORDWERTE_AUSGABEFORMAT = "[WERT] am [TAG] [MONAT] [JAHR]";   // wie in weatherStats

// Optional fest vorgeben (z.B. new Date(2026, 9, 25) für 25.10.2026), sonst automatisch
const ERSTER_FEHLTAG     = null;

const INFLUX_NACHSCHREIBEN = true;
const MEASUREMENT_MONTH  = 'weather_monthly_running';
const MEASUREMENT_YEAR   = 'weather_yearly_running';

// DP (relativ zu PRE_DP) -> Influx-Feld, wie in Wetter_aktuell_Monat_Jahr.js
const MONTH_FIELDS = {
    'aktueller_Monat.Eistage': 'Eistage', 'aktueller_Monat.Frost_Tage': 'Frosttage', 'aktueller_Monat.Sommertage': 'Sommertage',
    'aktueller_Monat.Tropennaechte': 'Tropennaechte', 'aktueller_Monat.Wuestentage': 'Wuestentage', 'aktueller_Monat.heisse_Tage': 'HeisseTage',
    'aktueller_Monat.kalte_Tage': 'KalteTage', 'aktueller_Monat.sehr_kalte_Tage': 'SehrKalteTage', 'aktueller_Monat.warme_Tage': 'WarmeTage',
    'aktueller_Monat.Regenmenge_Monat': 'RegenmengeMonat', 'aktueller_Monat.Max_Regenmenge': 'MaxRegenmengeTag', 'aktueller_Monat.Regentage': 'Regentage',
    'aktueller_Monat.Temperatur_Durchschnitt': 'Temperatur_Durchschnitt', 'aktueller_Monat.Hoechstwert': 'Temperatur_Max',
    'aktueller_Monat.Tiefstwert': 'Temperatur_Min', 'aktueller_Monat.Max_Windboee': 'Windboee_Max'
};
const YEAR_FIELDS = {
    'Jahreswerte.Gradtage_Eistage': 'Eistage', 'Jahreswerte.Gradtage_Frosttage': 'Frosttage', 'Jahreswerte.Gradtage_Sommertage': 'Sommertage',
    'Jahreswerte.Gradtage_Tropennaechte': 'Tropennaechte', 'Jahreswerte.Gradtage_Wuestentage': 'Wuestentage', 'Jahreswerte.Gradtage_heisseTage': 'HeisseTage',
    'Jahreswerte.Gradtage_kalteTage': 'KalteTage', 'Jahreswerte.Gradtage_sehrkalteTage': 'SehrKalteTage', 'Jahreswerte.Gradtage_warmeTage': 'WarmeTage',
    'Jahreswerte.Regenmengemonat': 'RegenmengeMonat', 'Jahreswerte.Regenmengetag': 'MaxRegenmengeTag', 'Jahreswerte.Regentage': 'Regentage',
    'Jahreswerte.Temperatur_Durchschnitt': 'Temperatur_Durchschnitt', 'Jahreswerte.Temperatur_Hoechstwert': 'Temperatur_Max',
    'Jahreswerte.Temperatur_Tiefstwert': 'Temperatur_Min', 'Jahreswerte.Temperatur_Min_Max': 'Temperatur_Min_Max',
    'Jahreswerte.Temperatur_Max_Min': 'Temperatur_Max_Min', 'Jahreswerte.Temperatur_Durchschnitt_Tag_Max': 'Temperatur_Durchschnitt_Tag_Max',
    'Jahreswerte.Temperatur_Durchschnitt_Tag_Min': 'Temperatur_Durchschnitt_Tag_Min', 'Jahreswerte.Windboee_max': 'Windboee_Max'
};

const monatsname      = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const monatsname_kurz = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

function pad(n) { return n < 10 ? '0' + n : String(n); }
function round2(v) { return Math.round(v * 100) / 100; }
function tagStr(d) { return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear(); }

function get(id) { return getState(PRE_DP + '.' + id).val; }
function set(id, val) {
    if (DRY_RUN) { console.log('[Nachholen][DRY] ' + id + ' = ' + JSON.stringify(val)); return; }
    setState(PRE_DP + '.' + id, val, true);
}
// Im DRY_RUN werden Werte nicht geschrieben -> Zwischenstände lokal halten
const cache = {};
function g(id) { return (id in cache) ? cache[id] : get(id); }
function s(id, val) { cache[id] = val; set(id, val); }

function influxQuery(query) {
    return new Promise((resolve, reject) => {
        sendTo('influxdb.' + INFLUXDB_INSTANZ, 'query', query, function (res) {
            if (res.error) { reject(res.error); return; }
            let rows = res.result || [];
            resolve((rows.length && Array.isArray(rows[0])) ? rows[0] : rows);
        });
    });
}

function fluxFeld(start, end, feld) {
    return 'from(bucket: "' + INFLUXDB_BUCKET + '") |> range(start: ' + (start / 1000) + ', stop: ' + (end / 1000) + ')'
         + ' |> filter(fn: (r) => r._measurement == "' + WET_DP + '") |> filter(fn: (r) => r._field == "' + feld + '")';
}

function formatRekord(wert, unit, datum) {
    let txt = REKORDWERTE_AUSGABEFORMAT
        .replace('[WERT]', wert + ' ' + (unit || ''))
        .replace('[TAG]', datum.getDate())
        .replace('[MONAT_ZAHL]', pad(datum.getMonth() + 1))
        .replace('[MONAT_KURZ]', monatsname_kurz[datum.getMonth()])
        .replace('[MONAT]', monatsname[datum.getMonth()])
        .replace('[JAHR]', datum.getFullYear());
    if (txt.search('Tage') != -1 && wert == 1) { txt = txt.replace('Tage', 'Tag'); }
    return txt;
}

// höher/niedriger als bisheriger Rekord -> Wert + Text mit Datum des Messtags setzen
function rekord(valueDp, textDp, wert, datum, groesser) {
    const alt = g('Rekordwerte.value.' + valueDp);
    if (groesser ? alt <= wert : alt >= wert) {
        const unit = getObject(PRE_DP + '.Rekordwerte.value.' + valueDp).common.unit;
        s('Rekordwerte.value.' + valueDp, wert);
        s('Rekordwerte.' + textDp, formatRekord(wert, unit, datum));
    }
}

// Line-Protocol aus den aktuellen (Zwischen-)Werten, Zeitstempel in ns
function influxZeile(measurement, felder, tsMs) {
    const f = Object.entries(felder)
        .map(([dp, feld]) => [feld, Number(g(dp))])
        .filter(([, v]) => Number.isFinite(v))
        .map(([feld, v]) => feld + '=' + v)
        .join(',');
    return f ? measurement + ' ' + f + ' ' + tsMs + '000000' : null;
}

// Punkte eines Zeitraums löschen (Influx v2 Delete-API)
async function influxLoeschen(startMs, stopMs, measurements) {
    const axios = require('axios');
    const cfg = await getInfluxCfg();
    for (const m of measurements) {
        await axios.post(cfg.url + '/api/v2/delete',
            { start: new Date(startMs).toISOString(), stop: new Date(stopMs).toISOString(), predicate: '_measurement="' + m + '"' },
            { params: { bucket: cfg.bucket, org: cfg.org },
              headers: { 'Content-Type': 'application/json', Authorization: 'Token ' + INFLUX_TOKEN }, timeout: 30000 });
        console.log('[Nachholen] Influx: ' + m + ' gelöscht von ' + new Date(startMs).toLocaleString('de-DE') + ' bis ' + new Date(stopMs).toLocaleString('de-DE'));
    }
}

// Monat sichern + zurücksetzen (wie speichern_Monat() in weatherStats)
function monatSpeichern(jahr, monat) {
    const regenMonat = g('aktueller_Monat.Regenmenge_Monat');
    const sonneMonat = g('aktueller_Monat.Sonnenscheindauer');
    const solarMonat = g('aktueller_Monat.Solarenergie');
    if (g('Jahreswerte.Regenmengemonat') <= regenMonat)        { s('Jahreswerte.Regenmengemonat', regenMonat); }
    if (g('Jahreswerte.Sonnenschein_Max_Monat') <= sonneMonat) { s('Jahreswerte.Sonnenschein_Max_Monat', sonneMonat); }
    if (g('Jahreswerte.Solarenergie_Max_Monat') <= solarMonat) { s('Jahreswerte.Solarenergie_Max_Monat', solarMonat); }

    const summary = [{
        "Tiefstwert": g('aktueller_Monat.Tiefstwert'), "Hoechstwert": g('aktueller_Monat.Hoechstwert'),
        "Temp_Durchschnitt": g('aktueller_Monat.Temperatur_Durchschnitt'), "Max_Windboee": g('aktueller_Monat.Max_Windboee'),
        "Max_Regenmenge": g('aktueller_Monat.Max_Regenmenge'), "Regenmenge_Monat": regenMonat,
        "warme_Tage": g('aktueller_Monat.warme_Tage'), "Sommertage": g('aktueller_Monat.Sommertage'),
        "heisse_Tage": g('aktueller_Monat.heisse_Tage'), "Frost_Tage": g('aktueller_Monat.Frost_Tage'),
        "kalte_Tage": g('aktueller_Monat.kalte_Tage'), "Eistage": g('aktueller_Monat.Eistage'),
        "sehr_kalte_Tage": g('aktueller_Monat.sehr_kalte_Tage'), "Wuestentage": g('aktueller_Monat.Wuestentage'),
        "Tropennaechte": g('aktueller_Monat.Tropennaechte'), "Regentage": g('aktueller_Monat.Regentage'),
        "Sonnenscheindauer_Monat": sonneMonat, "Solarenergie_Monat": solarMonat
    }];
    const dp = PRE_DP + '.Data.' + jahr + '.' + pad(monat + 1);
    console.log('[Nachholen] Monatsstatistik ' + monatsname[monat] + ' ' + jahr + ': ' + JSON.stringify(summary));
    if (!DRY_RUN) {
        createState(dp, '', { name: "Monatsstatistik für " + monatsname[monat] + ' ' + jahr, type: "string", role: "json" },
            () => { setState(dp, JSON.stringify(summary), true); });
    }

    // Reset: Min/Max/Durchschnitt werden vom ersten Tag des neuen Monats überschrieben
    for (const dpName of ['Max_Windboee','Max_Regenmenge','Regenmenge_Monat','warme_Tage','Sommertage','heisse_Tage','Frost_Tage',
                          'kalte_Tage','Eistage','sehr_kalte_Tage','Wuestentage','Tropennaechte','Regentage','Sonnenscheindauer','Solarenergie']) {
        s('aktueller_Monat.' + dpName, 0);
    }
}

// einen Messtag verarbeiten (Logik wie main() in weatherStats)
async function tagVerarbeiten(tag) {
    const start = new Date(tag.getFullYear(), tag.getMonth(), tag.getDate(), 0, 0, 0).getTime();
    const end   = new Date(tag.getFullYear(), tag.getMonth(), tag.getDate(), 23, 59, 59).getTime();

    const tempRows  = await influxQuery(fluxFeld(start, end, 'Aussentemperatur'));
    const windRows  = await influxQuery(fluxFeld(start, end, 'Wind_max'));
    const regenRows = await influxQuery(fluxFeld(start + 72000, end, 'Regen_Tag'));

    if (!tempRows.length) {
        console.error('[Nachholen] ' + tagStr(tag) + ': keine Temperaturdaten - Tag übersprungen!');
        return false;
    }
    const temps = tempRows.map(r => r._value);
    const Tiefstwert  = Math.min(...temps);
    const Hoechstwert = Math.max(...temps);

    // zeitgewichteter Tagesdurchschnitt
    let sum = 0, dauer = 0;
    for (let i = 0; i < tempRows.length; i++) {
        const bis = (i < tempRows.length - 1) ? tempRows[i + 1].ts : end;
        const d = (bis - tempRows[i].ts) / 1000;
        sum += tempRows[i]._value * d; dauer += d;
    }
    const Temp_Durchschnitt = Number((sum / dauer).toFixed(2));
    const Max_Windboee   = windRows.length ? Math.max(...windRows.map(r => r._value)) : 0;
    const Max_Regenmenge = regenRows.length ? regenRows[regenRows.length - 1]._value : 0;

    console.log('[Nachholen] ' + tagStr(tag) + ': Min ' + Tiefstwert + ' / Max ' + Hoechstwert + ' / Ø ' + Temp_Durchschnitt
              + ' / Böe ' + Max_Windboee + ' / Regen ' + Max_Regenmenge + ' (' + temps.length + ' Messwerte)');

    // VorTag
    s('VorTag.Temperatur_Tiefstwert', Tiefstwert);
    s('VorTag.Temperatur_Hoechstwert', Hoechstwert);
    s('VorTag.Temperatur_Durchschnitt', Temp_Durchschnitt);
    s('VorTag.Regenmenge', Max_Regenmenge);
    s('VorTag.Windboee_max', Max_Windboee);

    // aktueller Monat
    const tagImMonat = tag.getDate();
    if (tagImMonat === 1) {
        s('aktueller_Monat.Tiefstwert', Tiefstwert);
        s('aktueller_Monat.Hoechstwert', Hoechstwert);
        s('aktueller_Monat.Temperatur_Durchschnitt', Temp_Durchschnitt);
    } else {
        if (g('aktueller_Monat.Tiefstwert')  > Tiefstwert)  { s('aktueller_Monat.Tiefstwert', Tiefstwert); }
        if (g('aktueller_Monat.Hoechstwert') < Hoechstwert) { s('aktueller_Monat.Hoechstwert', Hoechstwert); }
        s('aktueller_Monat.Temperatur_Durchschnitt',
          Math.round(((g('aktueller_Monat.Temperatur_Durchschnitt') * (tagImMonat - 1) + Temp_Durchschnitt) / tagImMonat) * 100) / 100);
    }
    if (g('aktueller_Monat.Max_Windboee')   < Max_Windboee)   { s('aktueller_Monat.Max_Windboee', Max_Windboee); }
    if (g('aktueller_Monat.Max_Regenmenge') < Max_Regenmenge) { s('aktueller_Monat.Max_Regenmenge', Max_Regenmenge); }
    if (Max_Regenmenge > 0) { s('aktueller_Monat.Regenmenge_Monat', Number((g('aktueller_Monat.Regenmenge_Monat') + Max_Regenmenge).toFixed(2))); }

    // Gradtage: [Bedingung, DP Monat, DP Jahr]
    const zaehler = [
        [Hoechstwert > 20,   'warme_Tage',      'Gradtage_warmeTage'],
        [Hoechstwert > 25,   'Sommertage',      'Gradtage_Sommertage'],
        [Hoechstwert > 30,   'heisse_Tage',     'Gradtage_heisseTage'],
        [Tiefstwert < 0,     'Frost_Tage',      'Gradtage_Frosttage'],
        [Hoechstwert < 10,   'kalte_Tage',      'Gradtage_kalteTage'],
        [Hoechstwert < 0,    'Eistage',         'Gradtage_Eistage'],
        [Tiefstwert < -10,   'sehr_kalte_Tage', 'Gradtage_sehrkalteTage'],
        [Hoechstwert >= 35,  'Wuestentage',     'Gradtage_Wuestentage'],
        [Tiefstwert >= 20,   'Tropennaechte',   'Gradtage_Tropennaechte'],
        [regenRows.length > 0 && Max_Regenmenge >= 0.1, 'Regentage', 'Regentage'],
    ];
    for (const [bedingung, dpMonat, dpJahr] of zaehler) {
        if (bedingung) {
            s('aktueller_Monat.' + dpMonat, g('aktueller_Monat.' + dpMonat) + 1);
            s('Jahreswerte.' + dpJahr, g('Jahreswerte.' + dpJahr) + 1);
        }
    }

    // Jahreswerte
    if (g('Jahreswerte.Temperatur_Hoechstwert') < Hoechstwert)                { s('Jahreswerte.Temperatur_Hoechstwert', Hoechstwert); }
    if (g('Jahreswerte.Temperatur_Tiefstwert') > Tiefstwert)                  { s('Jahreswerte.Temperatur_Tiefstwert', Tiefstwert); }
    if (g('Jahreswerte.Temperatur_Min_Max') < Tiefstwert)                     { s('Jahreswerte.Temperatur_Min_Max', Tiefstwert); }
    if (g('Jahreswerte.Temperatur_Max_Min') > Hoechstwert)                    { s('Jahreswerte.Temperatur_Max_Min', Hoechstwert); }
    if (g('Jahreswerte.Temperatur_Durchschnitt_Tag_Max') < Temp_Durchschnitt) { s('Jahreswerte.Temperatur_Durchschnitt_Tag_Max', Temp_Durchschnitt); }
    if (g('Jahreswerte.Temperatur_Durchschnitt_Tag_Min') > Temp_Durchschnitt) { s('Jahreswerte.Temperatur_Durchschnitt_Tag_Min', Temp_Durchschnitt); }
    const tag_des_jahres = Math.round((start - new Date(tag.getFullYear(), 0, 1).getTime()) / 86400000) + 1;
    if (tag_des_jahres === 1) {
        s('Jahreswerte.Temperatur_Durchschnitt', Temp_Durchschnitt);
    } else {
        s('Jahreswerte.Temperatur_Durchschnitt',
          Math.round(((g('Jahreswerte.Temperatur_Durchschnitt') * (tag_des_jahres - 1) + Temp_Durchschnitt) / tag_des_jahres) * 100) / 100);
    }
    if (g('Jahreswerte.Regenmengetag') < Max_Regenmenge) { s('Jahreswerte.Regenmengetag', Max_Regenmenge); }
    if (g('Jahreswerte.Windboee_max') <= Max_Windboee)   { s('Jahreswerte.Windboee_max', Max_Windboee); }

    // Rekordwerte (Datum = Messtag)
    rekord('Temp_Max',                  'Temperatur_Spitzenhoechstwert', Hoechstwert,       tag, true);
    rekord('Temp_Min',                  'Temperatur_Spitzentiefstwert',  Tiefstwert,        tag, false);
    rekord('Temp_Min_Max',              'Temp_Min_Max',                  Tiefstwert,        tag, true);
    rekord('Temp_Max_Min',              'Temp_Max_Min',                  Hoechstwert,       tag, false);
    rekord('Temp_Durchschnitt_Tag_Max', 'Temp_Durchschnitt_Tag_Max',     Temp_Durchschnitt, tag, true);
    rekord('Temp_Durchschnitt_Tag_Min', 'Temp_Durchschnitt_Tag_Min',     Temp_Durchschnitt, tag, false);
    rekord('Regenmengetag',             'Regenmengetag',                 Max_Regenmenge,    tag, true);
    rekord('Regenmengemonat',           'Regenmengemonat',               g('aktueller_Monat.Regenmenge_Monat'), tag, true);
    rekord('Windboee',                  'Windboee',                      Max_Windboee,      tag, true);
    return true;
}

async function nachholen() {
    const heute = new Date(); heute.setHours(0, 0, 0, 0);

    // letzter erfolgreicher Lauf = Zeitstempel VorTag.Temperatur_Durchschnitt (wird bei jedem Lauf gesetzt);
    // dieser Lauf hat den Vortag verarbeitet -> erster fehlender Messtag = Tag des letzten Laufs
    let ersterTag = ERSTER_FEHLTAG;
    if (!ersterTag) {
        const letzterLauf = new Date(getState(PRE_DP + '.VorTag.Temperatur_Durchschnitt').ts);
        console.log('[Nachholen] letzter erfolgreicher Lauf: ' + letzterLauf.toLocaleString('de-DE'));
        ersterTag = new Date(letzterLauf.getFullYear(), letzterLauf.getMonth(), letzterLauf.getDate());
    }
    if (ersterTag >= heute) {
        console.log('[Nachholen] Nichts nachzuholen (letzter Lauf war heute).');
        return;
    }
    if (ersterTag.getFullYear() !== new Date(heute.getTime() - 86400000).getFullYear()) {
        console.error('[Nachholen] Jahreswechsel im Ausfallzeitraum wird nicht unterstützt - abgebrochen.');
        return;
    }
    console.log('[Nachholen] Hole nach: ' + tagStr(ersterTag) + ' bis ' + tagStr(new Date(heute.getTime() - 86400000))
              + (DRY_RUN ? ' (DRY_RUN - es wird nichts geschrieben)' : ''));

    const influxZeilen = [], monatsersten = [];
    for (let tag = new Date(ersterTag); tag < heute; tag.setDate(tag.getDate() + 1)) {
        // Monatswechsel: Vormonat sichern + zurücksetzen, bevor der 1. verarbeitet wird
        if (tag.getDate() === 1) {
            const vormonat = new Date(tag.getFullYear(), tag.getMonth() - 1, 1);
            monatSpeichern(vormonat.getFullYear(), vormonat.getMonth());
            monatsersten.push(new Date(tag));
        }
        if (await tagVerarbeiten(new Date(tag))) {
            // Stand nach diesem Tag = was der Writer am Folgetag um 01:05 geschrieben hätte
            const ts = new Date(tag.getFullYear(), tag.getMonth(), tag.getDate() + 1, 1, 5, 0).getTime();
            influxZeilen.push(influxZeile(MEASUREMENT_MONTH, MONTH_FIELDS, ts), influxZeile(MEASUREMENT_YEAR, YEAR_FIELDS, ts));
        }
    }

    if (INFLUX_NACHSCHREIBEN) {
        const zeilen = influxZeilen.filter(Boolean);
        const loeschStart = new Date(ersterTag.getFullYear(), ersterTag.getMonth(), ersterTag.getDate() + 1).getTime();
        // writeMonthlyStats2InfluxDB_v2 hat am Monatsersten (01:48 + 2 Retries) leere Monatswerte (0) nach
        // wetterstatistik_<Jahr> geschrieben -> diese Punkte löschen; danach den Writer von Hand neu starten
        const nullFenster = monatsersten.map(t => {
            const vormonatJahr = new Date(t.getFullYear(), t.getMonth() - 1, 1).getFullYear();
            return [new Date(t.getFullYear(), t.getMonth(), 1, 1, 40).getTime(), new Date(t.getFullYear(), t.getMonth(), 1, 2, 30).getTime(),
                    'wetterstatistik_' + vormonatJahr];
        });
        if (DRY_RUN) {
            console.log('[Nachholen][DRY] Influx: würde ' + MEASUREMENT_MONTH + '/' + MEASUREMENT_YEAR + ' ab '
                      + new Date(loeschStart).toLocaleString('de-DE') + ' löschen und schreiben:\n' + zeilen.join('\n'));
            nullFenster.forEach(([a, b, m]) => console.log('[Nachholen][DRY] Influx: würde ' + m + ' von '
                      + new Date(a).toLocaleString('de-DE') + ' bis ' + new Date(b).toLocaleString('de-DE') + ' löschen'));
        } else if (typeof influxWrite !== 'function') {
            console.error('[Nachholen] influxWrite() nicht gefunden (globales Influx-Script aktiv?) - Influx nicht nachgeschrieben.');
        } else {
            await influxLoeschen(loeschStart, Date.now(), [MEASUREMENT_MONTH, MEASUREMENT_YEAR]);
            const ok = await influxWrite(zeilen.join('\n'), 'Nachholen');
            console.log('[Nachholen] Influx: ' + zeilen.length + ' Punkte ' + (ok ? 'geschrieben' : 'NICHT geschrieben (siehe Warnung oben)'));
            for (const [a, b, m] of nullFenster) { await influxLoeschen(a, b, [m]); }
            if (nullFenster.length) {
                console.log('[Nachholen] Jetzt monthlyStatsCreateApply_V1 und danach writeMonthlyStats2InfluxDB_v2 einmal von Hand ausführen.');
            }
        }
    }

    // Vorjahresmonat für den aktuellen Monat (einfacher Weg über gespeicherte Monatsdaten)
    const vjDp = PRE_DP + '.Data.' + (heute.getFullYear() - 1) + '.' + pad(heute.getMonth() + 1);
    if (existsState(vjDp)) {
        JSON.parse(getState(vjDp).val).forEach(obj => Object.keys(obj).forEach(key => {
            set('Vorjahres_Monat.' + (key == 'Temp_Durchschnitt' ? 'Temperatur_Durchschnitt' : key), obj[key]);
        }));
    } else {
        console.warn('[Nachholen] ' + vjDp + ' fehlt - Vorjahres_Monat bitte prüfen (wird sonst erst am nächsten Monatsersten neu berechnet).');
    }

    console.log('[Nachholen] Fertig.' + (DRY_RUN ? ' Werte prüfen, dann DRY_RUN = false setzen und erneut starten.' : ' Script jetzt deaktivieren!'));
}

nachholen().catch(err => console.error('[Nachholen] Fehler: ' + err));
