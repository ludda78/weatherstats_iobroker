// Globales Script (JavaScript-Adapter -> "global"): gemeinsame InfluxDB-Schreibfunktionen
// Wird von Wetter_aktuell_Monat_Jahr.js, writeMonthlyStats2InfluxDB_v2.js und Ausfall_Nachholen.js genutzt.
// Nach Änderungen die JavaScript-Instanz neu starten, damit alle Scripte die neue Version laden.

const INFLUX_INSTANCE = 'influxdb.0';
const INFLUX_TOKEN    = 'DEIN_INFLUX_TOKEN';   // Token mit Schreibrecht auf den Bucket (nicht ins Repo committen!)

let influxCfg  = null;
let influxDown = false;

async function getInfluxCfg() {
    if (!influxCfg) {
        const n = (await getObjectAsync(`system.adapter.${INFLUX_INSTANCE}`)).native;
        influxCfg = {
            url:    `${n.protocol}://${n.host}:${n.port}`,
            org:    n.organization,
            bucket: n.dbname,
        };
    }
    return influxCfg;
}

// Gibt true zurück, wenn geschrieben wurde, sonst false
async function influxWrite(data, quelle = 'influx', bucket = null) {
    const axios = require('axios');
    try {
        const cfg = await getInfluxCfg();
        await axios.post(`${cfg.url}/api/v2/write`, data, {
            params:  { bucket: bucket || cfg.bucket, org: cfg.org },
            headers: { 'Content-Type': 'text/plain', Authorization: `Token ${INFLUX_TOKEN}` },
            timeout: 10000,
        });
        if (influxDown) {
            log(`[${quelle}] InfluxDB wieder erreichbar`, 'info');
            influxDown = false;
        }
        return true;
    } catch (e) {
        if (!influxDown) {
            log(`[${quelle}] Influx write error: ${e.code || e.response?.status || ''} ${e.message}`, 'warn');
            influxDown = true;
        }
        return false;
    }
}

// Generischer Logger: schreibt alle Werte aus template als ein Measurement.
// intervalMs = 0 → bei jeder Änderung schreiben, sonst gesammelt im Intervall
async function influxLogger(measurement, template, intervalMs = 0) {
    const values = {};
    let dirty = false, writing = false;

    const flush = async () => {
        if (!dirty || writing) return;
        const fields = Object.entries(values)
            .filter(([, v]) => Number.isFinite(v))
            .map(([k, v]) => `${k}=${v}`)
            .join(',');
        if (!fields) return;
        dirty = false;
        writing = true;
        try {
            await influxWrite(`${measurement} ${fields}`, measurement);
        } finally {
            writing = false;
            if (dirty && !intervalMs) flush();   // Änderung während des Schreibens nachholen
        }
    };

    for (const [id, key] of Object.entries(template)) {
        const st = await getStateAsync(id);
        const v = st ? Number(st.val) : NaN;
        if (Number.isFinite(v)) values[key] = v;
    }

    on({ id: Object.keys(template), change: 'ne' }, (obj) => {
        const v = Number(obj.state.val);
        if (!Number.isFinite(v)) return;
        values[template[obj.id]] = v;
        dirty = true;
        if (!intervalMs) flush();
    });

    if (intervalMs) setInterval(flush, intervalMs);
    dirty = true;
    flush();
    log(`[${measurement}] Logging gestartet: ${Object.keys(template).length} Werte, ${intervalMs ? intervalMs / 1000 + ' s' : 'bei Änderung'}`);
}

// String-Logger: schreibt Textwerte als String-Felder
async function influxStringLogger(measurement, template, bucket = null) {
    const values = {};
    const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ');

    const write = async () => {
        const fields = Object.entries(values)
            .filter(([, v]) => typeof v === 'string' && v !== '' && isNaN(Number(v)))
            .map(([k, v]) => `${k}="${esc(v)}"`)
            .join(',');
        if (fields) await influxWrite(`${measurement} ${fields}`, measurement, bucket);
    };

    for (const [id, key] of Object.entries(template)) {
        const st = await getStateAsync(id);
        if (st) values[key] = st.val;
    }

    on({ id: Object.keys(template), change: 'ne' }, async (obj) => {
        values[template[obj.id]] = obj.state.val;
        await write();
    });

    log(`[${measurement}] String-Logging gestartet: ${Object.keys(template).length} Werte`);
}
