// Daily Weather Statistics Writer
// Writes monthly + yearly running values once per day at 01:05

const axios = require('axios').default;

const influxDbInstance = 'influxdb.0';
const token = 'N-aPZgG2tvrEaIjdOrVvU8Efo66UDYcQQ6S_Dqh-2VAIMsJLjXDJvKHa0TBJa0nIiI2-EYmfpPm3WSBgIyq89w==';

const MEASUREMENT_MONTH = 'weather_monthly_running';
const MEASUREMENT_YEAR  = 'weather_yearly_running';

// ==========================
// Templates
// ==========================

const MONTH_TEMPLATE = {
    '0_userdata.0.Statistik.Wetter.aktueller_Monat.Eistage': 'Eistage',
    '0_userdata.0.Statistik.Wetter.aktueller_Monat.Frost_Tage': 'Frosttage',
    '0_userdata.0.Statistik.Wetter.aktueller_Monat.Sommertage': 'Sommertage',
    '0_userdata.0.Statistik.Wetter.aktueller_Monat.Tropennaechte': 'Tropennaechte',
    '0_userdata.0.Statistik.Wetter.aktueller_Monat.Wuestentage': 'Wuestentage',
    '0_userdata.0.Statistik.Wetter.aktueller_Monat.heisse_Tage': 'HeisseTage',
    '0_userdata.0.Statistik.Wetter.aktueller_Monat.kalte_Tage': 'KalteTage',
    '0_userdata.0.Statistik.Wetter.aktueller_Monat.sehr_kalte_Tage': 'SehrKalteTage',
    '0_userdata.0.Statistik.Wetter.aktueller_Monat.warme_Tage': 'WarmeTage',
    '0_userdata.0.Statistik.Wetter.aktueller_Monat.Regenmenge_Monat': 'RegenmengeMonat',
    '0_userdata.0.Statistik.Wetter.aktueller_Monat.Max_Regenmenge': 'MaxRegenmengeTag',
    '0_userdata.0.Statistik.Wetter.aktueller_Monat.Regentage': 'Regentage',
    '0_userdata.0.Statistik.Wetter.aktueller_Monat.Temperatur_Durchschnitt': 'Temperatur_Durchschnitt',
    '0_userdata.0.Statistik.Wetter.aktueller_Monat.Hoechstwert': 'Temperatur_Max',
    '0_userdata.0.Statistik.Wetter.aktueller_Monat.Tiefstwert': 'Temperatur_Min',
    '0_userdata.0.Statistik.Wetter.aktueller_Monat.Max_Windboee': 'Windboee_Max'
};

const YEAR_TEMPLATE = {
    '0_userdata.0.Statistik.Wetter.Jahreswerte.Gradtage_Eistage': 'Eistage',
    '0_userdata.0.Statistik.Wetter.Jahreswerte.Gradtage_Frosttage': 'Frosttage',
    '0_userdata.0.Statistik.Wetter.Jahreswerte.Gradtage_Sommertage': 'Sommertage',
    '0_userdata.0.Statistik.Wetter.Jahreswerte.Gradtage_Tropennaechte': 'Tropennaechte',
    '0_userdata.0.Statistik.Wetter.Jahreswerte.Gradtage_Wuestentage': 'Wuestentage',
    '0_userdata.0.Statistik.Wetter.Jahreswerte.Gradtage_heisseTage': 'HeisseTage',
    '0_userdata.0.Statistik.Wetter.Jahreswerte.Gradtage_kalteTage': 'KalteTage',
    '0_userdata.0.Statistik.Wetter.Jahreswerte.Gradtage_sehrkalteTage': 'SehrKalteTage',
    '0_userdata.0.Statistik.Wetter.Jahreswerte.Gradtage_warmeTage': 'WarmeTage',
    '0_userdata.0.Statistik.Wetter.Jahreswerte.Regenmengemonat': 'RegenmengeMonat',
    '0_userdata.0.Statistik.Wetter.Jahreswerte.Regenmengetag': 'MaxRegenmengeTag',
    '0_userdata.0.WetterstationFroggit.Regen_Jahr': 'RegenmengeJahr',
    '0_userdata.0.Statistik.Wetter.Jahreswerte.Regentage': 'Regentage',
    '0_userdata.0.Statistik.Wetter.Jahreswerte.Temperatur_Durchschnitt': 'Temperatur_Durchschnitt',
    '0_userdata.0.Statistik.Wetter.Jahreswerte.Temperatur_Hoechstwert': 'Temperatur_Max',
    '0_userdata.0.Statistik.Wetter.Jahreswerte.Temperatur_Tiefstwert': 'Temperatur_Min',
    '0_userdata.0.Statistik.Wetter.Jahreswerte.Temperatur_Min_Max': 'Temperatur_Min_Max',
    '0_userdata.0.Statistik.Wetter.Jahreswerte.Temperatur_Max_Min': 'Temperatur_Max_Min',
    '0_userdata.0.Statistik.Wetter.Jahreswerte.Temperatur_Durchschnitt_Tag_Max': 'Temperatur_Durchschnitt_Tag_Max',
    '0_userdata.0.Statistik.Wetter.Jahreswerte.Temperatur_Durchschnitt_Tag_Min': 'Temperatur_Durchschnitt_Tag_Min',
    '0_userdata.0.Statistik.Wetter.Jahreswerte.Trockenperiode':'Trockenperiode_Jahr',
    '0_userdata.0.Statistik.Wetter.Info.Trockenperiode_aktuell':'Trockenperiode_Aktuell',
    '0_userdata.0.Statistik.Wetter.Jahreswerte.Windboee_max': 'Windboee_Max'
};

// ==========================
// Helper
// ==========================

async function buildLine(measurement, template) {
    const fields = [];

    for (const [id, field] of Object.entries(template)) {
        const state = await getStateAsync(id);
        if (state && !isNaN(state.val)) {
            fields.push(`${field}=${state.val}`);
        }
    }

    if (!fields.length) return null;
    return `${measurement} ${fields.join(',')}`;
}

// ==========================
// Main Writer
// ==========================

async function writeMonthlyAndYearlyStats() {
    const cfg = await getObjectAsync(`system.adapter.${influxDbInstance}`);

    const url = `${cfg.native.protocol}://${cfg.native.host}:${cfg.native.port}/api/v2/write`;
    const params = `?bucket=${cfg.native.dbname}&org=${cfg.native.organization}`;

    const lines = [];

    const monthLine = await buildLine(MEASUREMENT_MONTH, MONTH_TEMPLATE);
    if (monthLine) lines.push(monthLine);

    const yearLine = await buildLine(MEASUREMENT_YEAR, YEAR_TEMPLATE);
    if (yearLine) lines.push(yearLine);

    if (!lines.length) {
        console.warn('No weather statistics to write.');
        return;
    }

    await axios.post(url + params, lines.join('\n'), {
        headers: {
            'Content-Type': 'text/plain',
            'Authorization': `Token ${token}`
        }
    });

    console.log('Daily weather statistics written:', lines.join(' | '));
}

// ==========================
// Schedule
// ==========================

schedule('5 1 * * *', writeMonthlyAndYearlyStats);
