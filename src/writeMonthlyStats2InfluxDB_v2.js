// v0.2 – über global/influx
// Wetter-Statistik des Vormonats einmal in InfluxDB schreiben
// Läuft am 1. jedes Monats um 01:48 Uhr (nach monthlyStatsCreateApply_V1)
// Von Hand nachholen: unten writeMonthlyStats(); einfügen, Script starten, Zeile wieder löschen
// (nur im Folgemonat möglich, der Vormonat wird aus dem aktuellen Datum bestimmt)

const RETRY_MIN = 10;

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
                'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

const rawTemplate = {
    'Eistage': 'Eistage',
    'Frost_Tage': 'Frosttage',
    'Sommertage': 'Sommertage',
    'Tropennaechte': 'Tropennaechte',
    'Wuestentage': 'Wuestentage',
    'heisse_Tage': 'heisseTage',
    'kalte_Tage': 'kalteTage',
    'sehr_kalte_Tage': 'sehrkalteTage',
    'warme_Tage': 'warmeTage',
    'Regenmenge_Monat': 'RegenmengeMonat',
    'Max_Regenmenge': 'RegenmengeTag',
    'Regentage': 'Regentage',
    'Temp_Durchschnitt': 'Temperatur_Durchschnitt',
    'Hoechstwert': 'Temperatur_Hoechstwert',
    'Tiefstwert': 'Temperatur_Tiefstwert',
    'Max_Windboee': 'Windboee_Max'
};

async function writeMonthlyStats(attempt = 1) {
    // Vormonat bestimmen
    const now = new Date();
    const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const year = last.getFullYear();
    const monthName = MONTHS[last.getMonth()];

    const measurement = `wetterstatistik_${year}`;
    const basePath = `0_userdata.0.Statistik.Wetter.Data.${year}.${monthName}`;

    const fields = [];
    for (const [dpName, baseKey] of Object.entries(rawTemplate)) {
        const state = await getStateAsync(`${basePath}.${dpName}`);
        if (!state || state.val === null || state.val === '') continue;
        const v = Number(state.val);
        if (Number.isFinite(v)) fields.push(`${baseKey}_${monthName}_${year}=${v}`);
    }

    if (!fields.length) {
        console.warn(`Keine Monatsdaten für ${monthName} ${year} gefunden`);
        return;
    }

    const ok = await influxWrite(`${measurement} ${fields.join(',')}`, 'wetter_monat');
    if (ok) {
        console.log(`Monatsdaten ${monthName} ${year} geschrieben (${fields.length} Werte)`);
    } else if (attempt < 3) {
        setTimeout(() => writeMonthlyStats(attempt + 1), RETRY_MIN * 60 * 1000);
    } else {
        console.error(`Monatsdaten ${monthName} ${year}: nach 3 Versuchen nicht geschrieben`);
    }
}

schedule('48 1 1 * *', () => writeMonthlyStats());
