/**
 * dwdClient.js - DWD Open Data / Bright Sky API Client
 */

import Soup from 'gi://Soup?version=3.0';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import { calculateDewPoint } from './dewpoint.js';

export function mapBrightSkyIcon(iconName) {
    switch (iconName) {
        case 'clear-day':
            return 'weather-clear-symbolic';
        case 'clear-night':
            return 'weather-clear-night-symbolic';
        case 'partly-cloudy-day':
            return 'weather-few-clouds-symbolic';
        case 'partly-cloudy-night':
            return 'weather-few-clouds-night-symbolic';
        case 'cloudy':
            return 'weather-overcast-symbolic';
        case 'rain':
            return 'weather-showers-symbolic';
        case 'sleet':
            return 'weather-snow-symbolic';
        case 'snow':
            return 'weather-snow-symbolic';
        case 'wind':
            return 'weather-windy-symbolic';
        case 'fog':
            return 'weather-fog-symbolic';
        case 'thunderstorm':
            return 'weather-storm-symbolic';
        case 'hail':
            return 'weather-storm-symbolic';
        default:
            return 'weather-few-clouds-symbolic';
    }
}

export function getConditionDescription(iconName, condition) {
    switch (iconName) {
        case 'clear-day':
            return 'Sonnig';
        case 'clear-night':
            return 'Klar';
        case 'partly-cloudy-day':
        case 'partly-cloudy-night':
            return 'Teilweise bewölkt';
        case 'cloudy':
            return 'Bewölkt';
        case 'fog':
            return 'Neblig';
        case 'rain':
            return 'Regen';
        case 'sleet':
            return 'Schneeregen';
        case 'snow':
            return 'Schneefall';
        case 'wind':
            return 'Windig';
        case 'thunderstorm':
            return 'Gewitter';
        case 'hail':
            return 'Hagelschauer';
        default:
            if (condition === 'dry') return 'Trocken';
            if (condition === 'rain') return 'Regen';
            return 'Teilweise bewölkt';
    }
}

export class DwdClient {
    constructor() {
        this._session = new Soup.Session({
            timeout: 12,
        });
    }

    /**
     * Führt einen HTTP-GET Request gegen Bright Sky aus und parst das JSON.
     * @private
     */
    async _sendWeatherRequest(url, cancellable = null) {
        try {
            const uri = GLib.Uri.parse(url, GLib.UriFlags.NONE);
            const message = new Soup.Message({
                method: 'GET',
                uri: uri,
            });

            const bytes = await this._session.send_and_read_async(
                message,
                GLib.PRIORITY_DEFAULT,
                cancellable
            );

            if (message.get_status() !== Soup.Status.OK) {
                return null;
            }

            const text = new TextDecoder('utf-8').decode(bytes.toArray());
            return JSON.parse(text);
        } catch (e) {
            return null;
        }
    }

    /**
     * Ruft aktuelle DWD-Wetterdaten sowie 8h- und 5-Tage-Vorhersagen ab.
     * Fällt automatisch auf Koordinaten zurück, falls die Stations-ID fehlschlägt.
     * 
     * @param {number} lat - Breitengrad
     * @param {number} lon - Längengrad
     * @param {string} stationId - Optional DWD/WMO Stations-ID
     * @param {Gio.Cancellable} [cancellable=null]
     * @returns {Promise<object|null>}
     */
    async fetchWeatherData(lat, lon, stationId = '', cancellable = null) {
        try {
            const now = new Date();
            const startDateStr = now.toISOString().slice(0, 10);
            
            // 5 Tage voraus
            const endDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
            const endDateStr = endDate.toISOString().slice(0, 10);

            let data = null;

            // 1. Falls Stations-ID gesetzt: Versuche Abfrage mit Stationskennung
            if (stationId && stationId.trim() !== '') {
                const sId = encodeURIComponent(stationId.trim());
                const stationUrl = `https://api.brightsky.dev/weather?date=${startDateStr}&last_date=${endDateStr}&wmo_station_id=${sId}`;
                data = await this._sendWeatherRequest(stationUrl, cancellable);

                // Falls wmo_station_id fehlschlug, versuche dwd_station_id
                if (!data || !data.weather || data.weather.length === 0) {
                    const dwdStationUrl = `https://api.brightsky.dev/weather?date=${startDateStr}&last_date=${endDateStr}&dwd_station_id=${sId}`;
                    data = await this._sendWeatherRequest(dwdStationUrl, cancellable);
                }
            }

            // 2. Automatischer Fallback auf Koordinaten, falls Stations-ID keine Daten liefert
            if (!data || !data.weather || data.weather.length === 0) {
                if (lat !== null && lon !== null && !isNaN(lat) && !isNaN(lon)) {
                    const coordUrl = `https://api.brightsky.dev/weather?date=${startDateStr}&last_date=${endDateStr}&lat=${lat}&lon=${lon}`;
                    data = await this._sendWeatherRequest(coordUrl, cancellable);
                }
            }

            if (!data || !data.weather || data.weather.length === 0) {
                console.warn('[dwdbar] DWD Bright Sky: Keine Wetterdaten für Station/Koordinaten gefunden.');
                return null;
            }

            return this._processWeatherData(data, now);
        } catch (e) {
            if (!cancellable || !cancellable.is_cancelled()) {
                console.warn(`[dwdbar] Error fetching DWD weather data: ${e.message}`);
            }
            return null;
        }
    }

    /**
     * Sucht DWD-Stationen in der Umgebung anhand eines Ortsnamens, einer PLZ oder Koordinaten.
     * 
     * @param {string} query - Suchtext (Ort, PLZ)
     * @param {number|null} [lat=null] - Breitengrad (optional)
     * @param {number|null} [lon=null] - Längengrad (optional)
     * @param {Gio.Cancellable} [cancellable=null]
     * @returns {Promise<{resolvedName: string, lat: number, lon: number, stations: Array}|null>}
     */
    async searchStations(query, lat = null, lon = null, cancellable = null) {
        let searchLat = lat;
        let searchLon = lon;
        let resolvedName = query ? query.trim() : '';

        // 1. Geocoding falls Ortsname oder PLZ angegeben
        if (query && query.trim() !== '') {
            try {
                const geoUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query.trim())}&format=json&countrycodes=de&limit=1`;
                const geoUri = GLib.Uri.parse(geoUrl, GLib.UriFlags.NONE);
                const geoMsg = new Soup.Message({
                    method: 'GET',
                    uri: geoUri,
                });
                geoMsg.request_headers.append('User-Agent', 'dwdbar-gnome-extension/1.0');

                const geoBytes = await this._session.send_and_read_async(
                    geoMsg,
                    GLib.PRIORITY_DEFAULT,
                    cancellable
                );

                if (geoMsg.get_status() === Soup.Status.OK) {
                    const geoText = new TextDecoder('utf-8').decode(geoBytes.toArray());
                    const geoData = JSON.parse(geoText);
                    if (geoData && geoData.length > 0) {
                        searchLat = parseFloat(geoData[0].lat);
                        searchLon = parseFloat(geoData[0].lon);
                        resolvedName = geoData[0].display_name.split(',')[0].trim();
                    }
                }
            } catch (e) {
                console.warn(`[dwdbar] Geocoding fehlgeschlagen: ${e.message}`);
            }
        }

        if (searchLat === null || searchLon === null || isNaN(searchLat) || isNaN(searchLon)) {
            return null;
        }

        // 2. Bright Sky Sources für die Koordinaten abrufen
        try {
            const sourcesUrl = `https://api.brightsky.dev/sources?lat=${searchLat}&lon=${searchLon}`;
            const sourcesData = await this._sendWeatherRequest(sourcesUrl, cancellable);

            if (!sourcesData || !sourcesData.sources || sourcesData.sources.length === 0) {
                return null;
            }

            const candidateStations = [];
            const seenNames = new Set();

            for (const s of sourcesData.sources) {
                if (s.observation_type === 'forecast' || s.observation_type === 'current' || s.observation_type === 'synop') {
                    const normName = s.station_name.toUpperCase();
                    if (!seenNames.has(normName)) {
                        seenNames.add(normName);
                        
                        // Schönerer Anzeigename
                        const titleName = s.station_name.split(' ')
                            .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                            .join(' ');

                        candidateStations.push({
                            rawName: s.station_name,
                            displayName: titleName,
                            wmoStationId: s.wmo_station_id || '',
                            dwdStationId: s.dwd_station_id || '',
                            stationId: s.wmo_station_id || s.dwd_station_id || '',
                            lat: s.lat,
                            lon: s.lon,
                            distanceKm: (s.distance / 1000).toFixed(1),
                            type: s.observation_type,
                        });
                    }
                }

                if (candidateStations.length >= 6) {
                    break;
                }
            }

            return {
                resolvedName: resolvedName || 'Gefundener Standort',
                lat: searchLat,
                lon: searchLon,
                stations: candidateStations,
            };
        } catch (e) {
            console.warn(`[dwdbar] Sources-Abfrage fehlgeschlagen: ${e.message}`);
            return null;
        }
    }

    _processWeatherData(data, now) {
        const records = data.weather;
        const nowTs = now.getTime();

        // Nächsten aktuellen Datensatz finden (zeitlich am nächsten)
        let currentRecord = records[0];
        let minDiff = Infinity;
        for (const rec of records) {
            const recTime = new Date(rec.timestamp).getTime();
            const diff = Math.abs(recTime - nowTs);
            if (diff < minDiff) {
                minDiff = diff;
                currentRecord = rec;
            }
        }

        // Stationsname ermitteln
        let stationName = 'DWD Station';
        if (data.sources && data.sources.length > 0) {
            stationName = data.sources[0].station_name || stationName;
        }

        // 1. Tages-Höchst- und Tiefstwert für heute ermitteln
        const todayStr = now.toISOString().slice(0, 10);
        let todayMin = Infinity;
        let todayMax = -Infinity;
        for (const rec of records) {
            if (rec.timestamp.startsWith(todayStr) && rec.temperature !== null) {
                if (rec.temperature < todayMin) todayMin = rec.temperature;
                if (rec.temperature > todayMax) todayMax = rec.temperature;
            }
        }
        if (todayMin === Infinity) todayMin = currentRecord.temperature ?? 10;
        if (todayMax === -Infinity) todayMax = currentRecord.temperature ?? 20;

        // 2. Stundenvorhersage (8 Stunden in 2-Stunden-Schritten: +2h, +4h, +6h, +8h)
        const hourlyForecast = [];
        const targetOffsetsHours = [2, 4, 6, 8];
        
        for (const offset of targetOffsetsHours) {
            const targetTime = nowTs + offset * 60 * 60 * 1000;
            let closestRec = null;
            let closestDiff = Infinity;

            for (const rec of records) {
                const recTime = new Date(rec.timestamp).getTime();
                const diff = Math.abs(recTime - targetTime);
                if (diff < closestDiff) {
                    closestDiff = diff;
                    closestRec = rec;
                }
            }

            if (closestRec) {
                const targetDate = new Date(closestRec.timestamp);
                const hours = String(targetDate.getHours()).padStart(2, '0');
                const timeLabel = `${hours}:00`;
                
                const temp = closestRec.temperature;
                const humidity = closestRec.relative_humidity;
                const dewPoint = closestRec.dew_point ?? calculateDewPoint(temp, humidity);

                hourlyForecast.push({
                    timeLabel: timeLabel,
                    offsetHours: offset,
                    icon: mapBrightSkyIcon(closestRec.icon),
                    rawIcon: closestRec.icon,
                    temperature: temp !== null ? Math.round(temp * 10) / 10 : null,
                    humidity: humidity !== null ? Math.round(humidity) : null,
                    dewPoint: dewPoint !== null ? Math.round(dewPoint * 10) / 10 : null,
                    condition: closestRec.condition,
                });
            }
        }

        // 3. 5-Tage-Vorhersage (Gruppierung nach Tagen)
        const dailyGroups = new Map();
        for (const rec of records) {
            const dayKey = rec.timestamp.slice(0, 10);
            if (!dailyGroups.has(dayKey)) {
                dailyGroups.set(dayKey, []);
            }
            dailyGroups.get(dayKey).push(rec);
        }

        const weekdayNames = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
        const dailyForecast = [];
        let countDays = 0;

        for (const [dayKey, dayRecords] of dailyGroups.entries()) {
            if (countDays >= 5) break;

            const dateObj = new Date(dayKey + 'T12:00:00Z');
            const weekday = weekdayNames[dateObj.getDay()];

            let minT = Infinity;
            let maxT = -Infinity;
            let sumHum = 0;
            let humCount = 0;
            let middayRecord = dayRecords[Math.floor(dayRecords.length / 2)];

            // Suche Repräsentant um die Mittagszeit (ca. 12-14 Uhr)
            for (const r of dayRecords) {
                if (r.temperature !== null) {
                    if (r.temperature < minT) minT = r.temperature;
                    if (r.temperature > maxT) maxT = r.temperature;
                }
                if (r.relative_humidity !== null) {
                    sumHum += r.relative_humidity;
                    humCount++;
                }
                const hour = new Date(r.timestamp).getUTCHours();
                if (hour >= 11 && hour <= 14) {
                    middayRecord = r;
                }
            }

            const avgHum = humCount > 0 ? Math.round(sumHum / humCount) : (middayRecord.relative_humidity ?? 60);
            const repTemp = (maxT !== -Infinity && minT !== Infinity) ? (maxT + minT) / 2 : (middayRecord.temperature ?? 15);
            const calculatedDp = calculateDewPoint(repTemp, avgHum);

            dailyForecast.push({
                date: dayKey,
                weekday: weekday,
                icon: mapBrightSkyIcon(middayRecord.icon),
                rawIcon: middayRecord.icon,
                minTemp: minT !== Infinity ? Math.round(minT * 10) / 10 : null,
                maxTemp: maxT !== -Infinity ? Math.round(maxT * 10) / 10 : null,
                humidity: avgHum,
                dewPoint: middayRecord.dew_point ?? calculatedDp,
            });

            countDays++;
        }

        // Aktueller Zustand
        const currentTemp = currentRecord.temperature !== null ? Math.round(currentRecord.temperature * 10) / 10 : null;
        const currentHum = currentRecord.relative_humidity !== null ? Math.round(currentRecord.relative_humidity) : null;
        const currentDp = currentRecord.dew_point ?? calculateDewPoint(currentTemp, currentHum);

        return {
            stationName: stationName,
            conditionText: getConditionDescription(currentRecord.icon, currentRecord.condition),
            icon: mapBrightSkyIcon(currentRecord.icon),
            rawIcon: currentRecord.icon,
            temperature: currentTemp,
            humidity: currentHum,
            dewPoint: currentDp !== null ? Math.round(currentDp * 10) / 10 : null,
            todayMin: Math.round(todayMin * 10) / 10,
            todayMax: Math.round(todayMax * 10) / 10,
            hourlyForecast: hourlyForecast,
            dailyForecast: dailyForecast,
            timestamp: currentRecord.timestamp,
        };
    }
}
