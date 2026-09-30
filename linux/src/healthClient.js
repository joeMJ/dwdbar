/**
 * healthClient.js - Pollenflug, UV-Index und amtliche Warnungen
 *
 * Quellen:
 *  - DWD Pollenflug-Gefahrenindex (opendata.dwd.de, täglich ~11 Uhr, heute/morgen/übermorgen)
 *  - DWD UV-Gefahrenindex (opendata.dwd.de, täglich ~7:30 Uhr, 38 Orte, heute/morgen/übermorgen)
 *  - DWD-Warnungen über Bright Sky /alerts (amtliche Warnungen für den Standort)
 */

import Soup from 'gi://Soup?version=3.0';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

try {
    Gio._promisify(Soup.Session.prototype, 'send_and_read_async', 'send_and_read_finish');
} catch (e) {
    // Bereits promisified
}

const POLLEN_URL = 'https://opendata.dwd.de/climate_environment/health/alerts/s31fg.json';
const UV_URL = 'https://opendata.dwd.de/climate_environment/health/alerts/uvi.json';
const ALERTS_URL = 'https://api.brightsky.dev/alerts';

/** Pollenarten in der Reihenfolge der Blühsaison: [Schlüssel im DWD-JSON, Anzeigename] */
export const POLLEN_TYPES = [
    ['Hasel', 'Hasel'],
    ['Erle', 'Erle'],
    ['Esche', 'Esche'],
    ['Birke', 'Birke'],
    ['Graeser', 'Gräser'],
    ['Roggen', 'Roggen'],
    ['Beifuss', 'Beifuß'],
    ['Ambrosia', 'Ambrosia'],
];

/** Pollen-Teilregionen des DWD: [Schlüssel "region:teilregion", Anzeigename] */
export const POLLEN_REGIONS = [
    ['10:11', 'Schleswig-Holstein/Hamburg – Inseln und Marschen'],
    ['10:12', 'Schleswig-Holstein/Hamburg – Geest'],
    ['20:-1', 'Mecklenburg-Vorpommern'],
    ['30:31', 'Niedersachsen/Bremen – Westl. Niedersachsen/Bremen'],
    ['30:32', 'Niedersachsen/Bremen – Östl. Niedersachsen'],
    ['40:41', 'Nordrhein-Westfalen – Rhein.-Westfäl. Tiefland'],
    ['40:42', 'Nordrhein-Westfalen – Ostwestfalen'],
    ['40:43', 'Nordrhein-Westfalen – Mittelgebirge NRW'],
    ['50:-1', 'Brandenburg und Berlin'],
    ['60:61', 'Sachsen-Anhalt – Tiefland'],
    ['60:62', 'Sachsen-Anhalt – Harz'],
    ['70:71', 'Thüringen – Tiefland'],
    ['70:72', 'Thüringen – Mittelgebirge'],
    ['80:81', 'Sachsen – Tiefland'],
    ['80:82', 'Sachsen – Mittelgebirge'],
    ['90:91', 'Hessen – Nordhessen und hess. Mittelgebirge'],
    ['90:92', 'Hessen – Rhein-Main'],
    ['100:101', 'Rheinland-Pfalz/Saarland – Rhein, Pfalz, Nahe und Mosel'],
    ['100:102', 'Rheinland-Pfalz/Saarland – Mittelgebirge'],
    ['100:103', 'Rheinland-Pfalz/Saarland – Saarland'],
    ['110:111', 'Baden-Württemberg – Oberrhein und unteres Neckartal'],
    ['110:112', 'Baden-Württemberg – Hohenlohe/mittl. Neckar/Oberschwaben'],
    ['110:113', 'Baden-Württemberg – Mittelgebirge'],
    ['120:121', 'Bayern – Allgäu/Oberbayern/Bay. Wald'],
    ['120:122', 'Bayern – Donauniederungen'],
    ['120:123', 'Bayern – nördl. der Donau (ohne Bay. Wald, Mainfranken)'],
    ['120:124', 'Bayern – Mainfranken'],
];

/** Orte des DWD-UV-Gefahrenindex */
export const UV_CITIES = [
    'Arkona', 'Berlin', 'Bonn', 'Bremen', 'Cottbus', 'Dresden', 'Düsseldorf',
    'Frankfurt/Main', 'Freiburg', 'Großer Arber', 'Hahn', 'Hamburg', 'Hannover',
    'Kahler Asten', 'Kassel', 'Kiel', 'Konstanz', 'Leipzig', 'List auf Sylt',
    'Magdeburg', 'Marienleuchte', 'München', 'Neubrandenburg', 'Norderney',
    'Nürnberg', 'Osnabrück', 'Regensburg', 'Rostock', 'Sankt Peter-Ording',
    'Seehausen', 'Stuttgart', 'Ulm', 'Waren', 'Weimar', 'Weinbiet', 'Wernigerode',
    'Würzburg', 'Zugspitze',
];

const DAY_KEYS = ['today', 'tomorrow', 'dayafter_to'];

/** DWD-Pollenwert ("0", "0-1", …, "3", "-1") → Zahl 0…3 in Halbschritten oder null */
export function parsePollenLevel(value) {
    if (value === undefined || value === null || value === '' || value === '-1')
        return null;
    const parts = String(value).split('-').map(Number);
    if (parts.some(isNaN))
        return null;
    return parts.length === 2 ? (parts[0] + parts[1]) / 2 : parts[0];
}

/** Lokaler Tagesschlüssel YYYY-MM-DD */
export function localDayKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Ordnet die Werte heute/morgen/übermorgen eines Bulletins (Ausgabetag issueKey)
 * lokalen Kalendertagen zu. Vor der täglichen Aktualisierung ist das Bulletin
 * von gestern – dessen "tomorrow" ist dann unser heute.
 * @returns {Map<string, any>} Tagesschlüssel → Wert
 */
function mapDays(issueKey, valuesByDayKey) {
    const result = new Map();
    const [y, m, d] = issueKey.split('-').map(Number);
    DAY_KEYS.forEach((key, i) => {
        if (valuesByDayKey[key] === undefined)
            return;
        result.set(localDayKey(new Date(y, m - 1, d + i, 12)), valuesByDayKey[key]);
    });
    return result;
}

export class HealthClient {
    constructor() {
        this._session = new Soup.Session({ timeout: 10 });
        this._session.user_agent = 'dwdbar-gnome-extension (https://github.com/joeMJ/dwdbar)';
    }

    async _getJson(url, cancellable) {
        const message = new Soup.Message({
            method: 'GET',
            uri: GLib.Uri.parse(url, GLib.UriFlags.ENCODED),
        });
        const bytes = await this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, cancellable);
        if (message.get_status() !== Soup.Status.OK)
            throw new Error(`HTTP ${message.get_status()} bei ${url}`);
        return JSON.parse(new TextDecoder('utf-8').decode(bytes.toArray()));
    }

    /**
     * Pollenflug-Gefahrenindex für eine Teilregion.
     * @param {string} regionKey - "region_id:partregion_id", z. B. "40:41"
     * @returns {Promise<{regionName: string, days: Map<string, Object<string, number|null>>}|null>}
     *   days: Tagesschlüssel → { Pollenart: Stufe 0…3 }
     */
    async fetchPollen(regionKey, cancellable = null) {
        const data = await this._getJson(POLLEN_URL, cancellable);
        const [regionId, partregionId] = regionKey.split(':').map(Number);
        const region = data.content?.find(r => r.region_id === regionId && r.partregion_id === partregionId);
        if (!region)
            return null;

        // "last_update": "2026-09-30 11:00 Uhr"
        const issueKey = String(data.last_update ?? '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(issueKey))
            return null;

        const days = new Map();
        for (const [type] of POLLEN_TYPES) {
            const values = region.Pollen?.[type];
            if (!values)
                continue;
            for (const [dayKey, raw] of mapDays(issueKey, values)) {
                if (!days.has(dayKey))
                    days.set(dayKey, {});
                days.get(dayKey)[type] = parsePollenLevel(raw);
            }
        }
        return {
            regionName: region.partregion_name || region.region_name,
            days,
        };
    }

    /**
     * UV-Gefahrenindex für einen Ort.
     * @returns {Promise<{city: string, days: Map<string, number>}|null>}
     */
    async fetchUv(city, cancellable = null) {
        const data = await this._getJson(UV_URL, cancellable);
        const entry = data.content?.find(c => c.city === city);
        const issueKey = String(data.forecast_day ?? '').slice(0, 10);
        if (!entry || !/^\d{4}-\d{2}-\d{2}$/.test(issueKey))
            return null;
        return { city, days: mapDays(issueKey, entry.forecast ?? {}) };
    }

    /**
     * Aktuell gültige amtliche DWD-Warnungen für die Koordinaten.
     * @returns {Promise<Array<{event: string, headline: string, severity: string, onset: Date|null, expires: Date|null}>>}
     */
    async fetchAlerts(lat, lon, cancellable = null) {
        const data = await this._getJson(`${ALERTS_URL}?lat=${lat}&lon=${lon}`, cancellable);
        const now = Date.now();
        return (data.alerts ?? [])
            .map(a => ({
                event: a.event_de || a.event_en || '',
                headline: a.headline_de || a.headline_en || '',
                severity: a.severity || 'minor',
                onset: a.onset ? new Date(a.onset) : (a.effective ? new Date(a.effective) : null),
                expires: a.expires ? new Date(a.expires) : null,
            }))
            .filter(a => !a.expires || a.expires.getTime() > now);
    }
}
