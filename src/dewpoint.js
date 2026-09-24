/**
 * dewpoint.js - Berechnung des Taupunkts und der relativen Feuchte mittels Magnus-Tetens-Formel
 */

/**
 * Berechnet den Taupunkt (in °C) aus Temperatur (°C) und relativer Feuchte (%).
 * 
 * @param {number} temp - Temperatur in °C
 * @param {number} humidity - Relative Luftfeuchtigkeit in % (0 - 100)
 * @returns {number|null} Berechneter Taupunkt in °C (auf 1 Nachkommastelle gerundet) oder null bei ungültigen Eingaben
 */
export function calculateDewPoint(temp, humidity) {
    if (temp === null || temp === undefined || isNaN(temp) ||
        humidity === null || humidity === undefined || isNaN(humidity)) {
        return null;
    }

    const t = Number(temp);
    let rh = Number(humidity);

    // Feuchtegrenzen absichern
    if (rh <= 0) rh = 0.1;
    if (rh > 100) rh = 100;

    // Magnus-Parameter nach DIN 4108 / DWD
    // Für T >= 0 °C: a = 17.27, b = 237.7
    // Für T < 0 °C: a = 21.875, b = 265.5
    const a = t >= 0 ? 17.27 : 21.875;
    const b = t >= 0 ? 237.7 : 265.5;

    const alpha = ((a * t) / (b + t)) + Math.log(rh / 100);
    const denominator = a - alpha;

    if (denominator === 0) {
        return null;
    }

    const dewPoint = (b * alpha) / denominator;
    return Math.round(dewPoint * 10) / 10;
}

/**
 * Berechnet die relative Luftfeuchtigkeit (%) aus Temperatur (°C) und Taupunkt (°C).
 * Ermöglicht die Ermittlung der Luftfeuchte bei DWD-Vorhersagen, welche Temperatur und Taupunkt liefern.
 * 
 * @param {number} temp - Temperatur in °C
 * @param {number} dewPoint - Taupunkt in °C
 * @returns {number|null} Berechnete relative Feuchte in % (ganzzahlig gerundet) oder null bei ungültigen Eingaben
 */
export function calculateRelativeHumidity(temp, dewPoint) {
    if (temp === null || temp === undefined || isNaN(temp) ||
        dewPoint === null || dewPoint === undefined || isNaN(dewPoint)) {
        return null;
    }

    const t = Number(temp);
    const td = Number(dewPoint);

    const a = t >= 0 ? 17.27 : 21.875;
    const b = t >= 0 ? 237.7 : 265.5;

    const exponent = ((a * td) / (b + td)) - ((a * t) / (b + t));
    let rh = 100 * Math.exp(exponent);

    if (rh < 0) rh = 0;
    if (rh > 100) rh = 100;

    return Math.round(rh);
}

/**
 * Formatiert einen numerischen Wert im deutschen Format mit Komma und Einheit.
 * 
 * @param {number|null} value - Numerischer Wert
 * @param {string} unit - Einheit (z.B. "°C" oder "%")
 * @param {number} decimals - Nachkommastellen (Standard: 1)
 * @returns {string} Formatierte Zeichenkette (z.B. "17,4 °C")
 */
export function formatValue(value, unit = '', decimals = 1) {
    if (value === null || value === undefined || isNaN(value)) {
        return `--${unit ? ' ' + unit : ''}`;
    }
    const fixed = Number(value).toFixed(decimals);
    const localized = fixed.replace('.', ',');
    return unit ? `${localized} ${unit}` : localized;
}
