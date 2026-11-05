// Daily Weather Statistics Writer – v0.3 über global/influx
// Writes monthly + yearly running values once per day at 01:05
// Benötigt das globale Script mit influxWrite() (muss true/false zurückgeben!)

const MEASUREMENT_MONTH = 'weather_monthly_running';
const MEASUREMENT_YEAR  = 'weather_yearly_running';
const RETRY_MIN = 10;   // Wiederholung nach 10 Min, max. 3 Versuche

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
    '0_userdata.0.Statistik.Wetter.Jahreswerte.Trockenperiode': 'Trockenperiode_Jahr',
    '0_userdata.0.Statistik.Wetter.Info.Trockenperiode_aktuell': 'Trockenperiode_Aktuell',
    '0_userdata.0.Statistik.Wetter.Jahreswerte.Windboee_max': 'Windboee_Max'
};

async function buildLine(measurement, template) {
    const fields = [];
    for (const [id, field] of Object.entries(template)) {
        const state = await getStateAsync(id);
        if (!state || state.val === null || state.val === '') continue;
        const v = Number(state.val);
        if (Number.isFinite(v)) fields.push(`${field}=${v}`);
    }
    return fields.length ? `${measurement} ${fields.join(',')}` : null;
}

async function writeMonthlyAndYearlyStats(attempt = 1) {
    const lines = [
        await buildLine(MEASUREMENT_MONTH, MONTH_TEMPLATE),
        await buildLine(MEASUREMENT_YEAR, YEAR_TEMPLATE),
    ].filter(Boolean);

    if (!lines.length) {
        console.warn('No weather statistics to write.');
        return;
    }

    const ok = await influxWrite(lines.join('\n'), 'weather_stats');
    if (ok) {
        // ioBroker-console.log gibt nur das 1. Argument aus -> Text zusammensetzen
        console.log(`Daily weather statistics written (${lines.map(l => l.split(/[ ,]/)[0]).join(', ')})`);
    } else if (attempt < 3) {
        console.warn(`Weather statistics: Versuch ${attempt} fehlgeschlagen, neuer Versuch in ${RETRY_MIN} Min`);
        setTimeout(() => writeMonthlyAndYearlyStats(attempt + 1), RETRY_MIN * 60 * 1000);
    } else {
        console.error('Weather statistics: nach 3 Versuchen nicht geschrieben');
    }
}

schedule('5 1 * * *', () => writeMonthlyAndYearlyStats());
