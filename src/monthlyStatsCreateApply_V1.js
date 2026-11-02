// Anlegen der Datenpunkte der Monatswerte nachdem die MonatsStatistik als JSON Object erzeugt wurde
// Läuft am 1. jedes Monats um 01:05 Uhr: liest Data.<Jahr>.<MM> (JSON aus weatherStats) und
// schreibt die Einzelwerte nach Data.<Jahr>.<Monatsname>.<DP>
// Von Hand nachholen: unten monatswerteAnlegen(); einfügen, Script starten, Zeile wieder löschen
// (nur im Folgemonat möglich, der Vormonat wird aus dem aktuellen Datum bestimmt)
const monatswerteAnlegen = async () => {
    console.log('Script gestartet: Datenpunkte für aktuellen Monat anlegen und befüllen');

    const now = new Date();
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthYear = lastMonthDate.getFullYear();
    const lastMonth = lastMonthDate.getMonth(); // 0-11
    const lastMonthPadded = (lastMonth + 1).toString().padStart(2, '0');
    const lastMonthName = lastMonthDate.toLocaleString('de-DE', { month: 'long' });

    const basePath = `0_userdata.0.Statistik.Wetter.Data.${lastMonthYear}.${lastMonthName}`;
    const sourcePath = `0_userdata.0.Statistik.Wetter.Data.${lastMonthYear}.${lastMonthPadded}`;

    const dataPoints = {
        'Tiefstwert': {"type":"number","name":"Tiefstwert","unit":"°C","role":"value.temperature"},
        'Hoechstwert': {"type":"number","name":"Hoechstwert","unit":"°C","role":"value.temperature"},
        'Temp_Durchschnitt': {"type":"number","name":"Temp_Durchschnitt","unit":"°C","role":"value.temperature"},
        'Max_Windboee': {"type":"number","name":"Max_Windboee","unit":"km/h","role":"value.wind"},
        'Max_Regenmenge': {"type":"number","name":"Max_Regenmenge","unit":"mm/m²","role":"value.regen"},
        'Regenmenge_Monat': {"type":"number","name":"Regenmenge_Monat","unit":"mm/m²","role":"value.regen"},
        'warme_Tage': {"type":"number","name":"warme_Tage","unit":"Tage","role":"value.day"},
        'Sommertage': {"type":"number","name":"Sommertage","unit":"Tage","role":"value.day"},
        'heisse_Tage': {"type":"number","name":"heisse_Tage","unit":"Tage","role":"value.day"},
        'Frost_Tage': {"type":"number","name":"Frost_Tage","unit":"Tage","role":"value.day"},
        'kalte_Tage': {"type":"number","name":"kalte_Tage","unit":"Tage","role":"value.day"},
        'Eistage': {"type":"number","name":"Eistage","unit":"Tage","role":"value.day"},
        'sehr_kalte_Tage': {"type":"number","name":"sehr_kalte_Tage","unit":"Tage","role":"value.day"},
        'Wuestentage': {"type":"number","name":"Wuestentage","unit":"Tage","role":"value.day"},
        'Tropennaechte': {"type":"number","name":"Tropennaechte","unit":"Tage","role":"value.day"},
        'Regentage': {"type":"number","name":"Regentage","unit":"Tage","role":"value.day"}
    };

    let sourceJson = {};
    try {
        const sourceState = await getStateAsync(sourcePath);
        sourceJson = sourceState && sourceState.val ? JSON.parse(sourceState.val) : {};
    } catch (err) {
        console.warn(`Keine oder ungültige JSON-Quelle unter ${sourcePath}:`, err.message);
    }

    for (const [dp, common] of Object.entries(dataPoints)) {
        const id = `${basePath}.${dp}`;
        const value = sourceJson?.[0]?.[dp];

        try {
            const obj = await getObjectAsync(id);
            if (!obj) {
                await createStateAsync(id, 0, common);
                console.log(`Datenpunkt erstellt: ${id}`);
            }

            if (value !== undefined && !isNaN(parseFloat(value))) {
                const floatVal = parseFloat(value);
                await setStateAsync(id, floatVal, true);
                console.log(`Datenpunkt befüllt: ${id} = ${floatVal}`);
            } else {
                console.log(`Kein Wert zum Setzen für: ${id}`);
            }
        } catch (error) {
            console.error(`Fehler bei ${id}:`, error.message);
        }
    }

    console.log('Script beendet');
};

schedule('5 1 1 * *', monatswerteAnlegen);
