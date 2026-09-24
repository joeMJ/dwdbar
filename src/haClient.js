/**
 * haClient.js - Home Assistant REST-API Client (HTTPS hinter NGINX / Bearer Token)
 */

import Soup from 'gi://Soup?version=3.0';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

export class HaClient {
    constructor() {
        this._session = new Soup.Session({
            timeout: 10,
        });
    }

    /**
     * Ruft den Zustand einer Entität von Home Assistant ab.
     * 
     * @param {string} baseUrl - z.B. "https://ha.domain.local"
     * @param {string} token - Long-Lived Access Token
     * @param {string} entityId - z.B. "sensor.outdoor_temperature"
     * @param {Gio.Cancellable} [cancellable=null]
     * @returns {Promise<{state: number|null, rawState: string, unit: string, friendlyName: string}|null>}
     */
    async fetchEntityState(baseUrl, token, entityId, cancellable = null) {
        if (!baseUrl || !entityId) {
            return null;
        }

        const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
        const url = `${cleanBaseUrl}/api/states/${encodeURIComponent(entityId)}`;

        try {
            const uri = GLib.Uri.parse(url, GLib.UriFlags.NONE);
            const message = new Soup.Message({
                method: 'GET',
                uri: uri,
            });

            if (token) {
                message.request_headers.append('Authorization', `Bearer ${token}`);
            }
            message.request_headers.append('Content-Type', 'application/json');

            const bytes = await this._session.send_and_read_async(
                message,
                GLib.PRIORITY_DEFAULT,
                cancellable
            );

            const status = message.get_status();
            if (status !== Soup.Status.OK) {
                console.warn(`[dwdbar] Home Assistant Request failed for ${entityId}: HTTP ${status}`);
                return null;
            }

            const text = new TextDecoder('utf-8').decode(bytes.toArray());
            const data = JSON.parse(text);

            const rawVal = data.state;
            const numVal = parseFloat(rawVal);
            const unit = data.attributes?.unit_of_measurement || '';
            const friendlyName = data.attributes?.friendly_name || entityId;

            return {
                state: isNaN(numVal) ? null : numVal,
                rawState: rawVal,
                unit: unit,
                friendlyName: friendlyName,
            };
        } catch (e) {
            if (!cancellable || !cancellable.is_cancelled()) {
                console.warn(`[dwdbar] Error querying Home Assistant entity ${entityId}: ${e.message}`);
            }
            return null;
        }
    }

    /**
     * Ruft gleichzeitig Temperatur und relative Feuchte ab.
     * 
     * @param {string} baseUrl
     * @param {string} token
     * @param {string} tempEntity
     * @param {string} humidityEntity
     * @param {Gio.Cancellable} [cancellable=null]
     * @returns {Promise<{temp: number|null, humidity: number|null}>}
     */
    async fetchSensorValues(baseUrl, token, tempEntity, humidityEntity, cancellable = null) {
        if (!baseUrl || (!tempEntity && !humidityEntity)) {
            return { temp: null, humidity: null };
        }

        const [tempRes, humRes] = await Promise.all([
            tempEntity ? this.fetchEntityState(baseUrl, token, tempEntity, cancellable) : Promise.resolve(null),
            humidityEntity ? this.fetchEntityState(baseUrl, token, humidityEntity, cancellable) : Promise.resolve(null)
        ]);

        return {
            temp: tempRes?.state ?? null,
            humidity: humRes?.state ?? null
        };
    }
}
