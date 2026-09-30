/**
 * hints.js - Hinweistexte (Warnungen, Regen, Pollen, UV) und Pollen-Darstellung
 *
 * Reine Funktionen ohne GNOME-Abhängigkeiten – außerhalb der Shell testbar.
 */

import { POLLEN_TYPES, localDayKey } from './healthClient.js';

const SEVERITY_RANK = { extreme: 3, severe: 2, moderate: 1, minor: 0 };

/** Maximal angezeigte Hinweise im Popup */
export const MAX_HINTS = 2;

/** Farben der „Ampel“: Punkt 1 grün, 2 gelb, 3 rot; leere Punkte grau (in hell und dunkel lesbar) */
const DOT_COLORS = ['#2ec27e', '#e5a50a', '#e01b24'];
const DOT_EMPTY_COLOR = '#9a9996';

/** Stufe 0…3 als Pango-Markup mit Ampelfarben, z. B. 1.5 → grün ●, gelb ◐, grau ○ */
export function pollenDotsMarkup(level) {
    if (level === null || level === undefined)
        return '–';
    let markup = '';
    for (let i = 1; i <= 3; i++) {
        if (level >= i)
            markup += `<span foreground="${DOT_COLORS[i - 1]}">●</span>`;
        else if (level >= i - 0.5)
            markup += `<span foreground="${DOT_COLORS[i - 1]}">◐</span>`;
        else
            markup += `<span foreground="${DOT_EMPTY_COLOR}">○</span>`;
    }
    return markup;
}

/** Belastungsstufe im Dativ nach DWD-Legende: „mit einer … Belastung“ */
function pollenStrengthText(level) {
    if (level >= 3)
        return 'hohen';
    if (level >= 2.5)
        return 'mittleren bis hohen';
    if (level >= 2)
        return 'mittleren';
    if (level >= 1.5)
        return 'geringen bis mittleren';
    if (level >= 1)
        return 'geringen';
    return 'keinen bis geringen';
}

function joinGerman(items) {
    if (items.length <= 1)
        return items.join('');
    return `${items.slice(0, -1).join(', ')} und ${items[items.length - 1]}`;
}

/** „einer mittleren Belastung durch Gräser und einer geringen Belastung durch Birke“ */
function pollenLoadPhrase(active) {
    const byLevel = new Map();
    for (const p of active) {
        if (!byLevel.has(p.level))
            byLevel.set(p.level, []);
        byLevel.get(p.level).push(p.name);
    }
    return joinGerman([...byLevel.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([level, names]) => `einer ${pollenStrengthText(level)} Belastung durch ${joinGerman(names)}`));
}

/**
 * Pollenausblick für morgen und übermorgen als Satz, z. B.
 * „Morgen ist mit einer mittleren Belastung durch Gräser zu rechnen, übermorgen mit einer
 * geringen Belastung durch Gräser und Birke.“ – null, wenn keine Daten vorliegen.
 */
export function pollenOutlookText(pollen, selectedTypes, now = new Date()) {
    const days = [
        ['Morgen', 'morgen', 1],
        ['Übermorgen', 'übermorgen', 2],
    ].map(([label, lower, offset]) => {
        const key = localDayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 12));
        return { label, lower, ...pollenForDay(pollen, key, selectedTypes) };
    }).filter(d => d.max !== null);

    if (days.length === 0)
        return null;

    const loaded = days.filter(d => d.active.length > 0);
    const free = days.filter(d => d.active.length === 0);

    if (loaded.length === 0) {
        const when = days.length === 2 ? 'Morgen und übermorgen' : days[0].label;
        return `${when} ist keine Pollenbelastung zu erwarten.`;
    }

    const [first, ...rest] = loaded;
    let text = `${first.label} ist mit ${pollenLoadPhrase(first.active)} zu rechnen`;
    for (const d of rest)
        text += `, ${d.lower} mit ${pollenLoadPhrase(d.active)}`;
    text += '.';
    for (const d of free)
        text += ` ${d.label} ist keine Pollenbelastung zu erwarten.`;
    return text;
}

/**
 * Pollenwerte eines Tages, gefiltert auf die gewählten Arten.
 * @returns {{max: number|null, active: Array<{type: string, name: string, level: number}>}}
 */
export function pollenForDay(pollen, dayKey, selectedTypes) {
    const values = pollen?.days?.get(dayKey);
    if (!values)
        return { max: null, active: [] };
    const active = POLLEN_TYPES
        .filter(([type]) => selectedTypes.includes(type))
        .map(([type, name]) => ({ type, name, level: values[type] }))
        .filter(p => p.level !== null && p.level !== undefined);
    const max = active.length > 0 ? Math.max(...active.map(p => p.level)) : null;
    return { max, active: active.filter(p => p.level > 0).sort((a, b) => b.level - a.level) };
}

function hourText(date) {
    return `${String(date.getHours()).padStart(2, '0')} Uhr`;
}

function rainHint(rainOutlook, threshold, now) {
    const next = (rainOutlook ?? []).find(r =>
        r.probability !== null && r.probability >= threshold &&
        (r.precipitation === null || r.precipitation >= 0.1));
    if (!next)
        return null;

    const minutes = Math.round((next.time.getTime() - now.getTime()) / 60000);
    const hours = Math.round(minutes / 60);
    const todayKey = localDayKey(now);
    const pct = `(${Math.round(next.probability)} %)`;
    let text;
    if (minutes <= 45)
        text = `In Kürze ist mit Regen zu rechnen ${pct}.`;
    else if (hours <= 1)
        text = `In etwa 1 Stunde ist mit Regen zu rechnen ${pct}.`;
    else if (hours <= 3)
        text = `In etwa ${hours} Stunden ist mit Regen zu rechnen ${pct}.`;
    else if (localDayKey(next.time) === todayKey)
        text = `Heute ab etwa ${hourText(next.time)} ist mit Regen zu rechnen ${pct}.`;
    else if (next.time.getHours() < 6)
        text = `In der Nacht ab etwa ${hourText(next.time)} ist mit Regen zu rechnen ${pct}.`;
    else
        text = `Morgen früh ab etwa ${hourText(next.time)} ist mit Regen zu rechnen ${pct}.`;

    return { level: 'info', icon: 'weather-showers-symbolic', text, source: 'DWD' };
}

function pollenHint(pollen, selectedTypes, now) {
    const today = localDayKey(now);
    const tomorrow = localDayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12));
    for (const [dayKey, label] of [[today, 'Heute'], [tomorrow, 'Morgen']]) {
        const { max, active } = pollenForDay(pollen, dayKey, selectedTypes);
        if (max === null || max < 2)
            continue;
        const names = active.filter(p => p.level >= 2).map(p => p.name).join(', ');
        return {
            level: max >= 3 ? 'warning' : 'info',
            icon: 'face-sick-symbolic',
            text: `${label} ist mit einer ${pollenStrengthText(max)} Pollenbelastung zu rechnen (${names}).`,
            source: 'DWD',
        };
    }
    return null;
}

function uvHint(uv, now) {
    // Nach 16 Uhr ist die UV-Belastung des Tages vorbei – dann auf morgen schauen
    const useTomorrow = now.getHours() >= 16;
    const day = useTomorrow ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12) : now;
    const value = uv?.days?.get(localDayKey(day));
    if (value === undefined || value === null || value < 6)
        return null;
    const strength = value >= 11 ? 'extremer' : value >= 8 ? 'sehr hoher' : 'hoher';
    return {
        level: value >= 8 ? 'warning' : 'info',
        icon: 'weather-clear-symbolic',
        text: `${useTomorrow ? 'Morgen' : 'Heute'} ${strength} UV-Index (${value}) – Sonnenschutz empfohlen.`,
        source: 'DWD',
    };
}

function alertHints(alerts) {
    return (alerts ?? [])
        .slice()
        .sort((a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0))
        .map(a => ({
            level: (SEVERITY_RANK[a.severity] ?? 0) >= 2 ? 'severe' : (SEVERITY_RANK[a.severity] ?? 0) === 1 ? 'warning' : 'info',
            icon: 'dialog-warning-symbolic',
            text: a.headline || a.event,
            source: 'DWD-Warnung',
        }));
}

/**
 * Baut die Hinweise für das Popup, nach Dringlichkeit sortiert.
 * @param {object} p
 * @param {object} p.dwdData - Ergebnis von DwdClient (für rainOutlook)
 * @param {object|null} p.pollen - Ergebnis von HealthClient.fetchPollen
 * @param {object|null} p.uv - Ergebnis von HealthClient.fetchUv
 * @param {Array|null} p.alerts - Ergebnis von HealthClient.fetchAlerts
 * @param {object} p.options - { warnings, rain, pollen, uv, rainThreshold, pollenTypes }
 * @param {Date} [p.now]
 * @returns {Array<{level: string, icon: string, text: string, source: string}>}
 */
export function buildHints({ dwdData, pollen, uv, alerts, options, now = new Date() }) {
    const hints = [];
    if (options.warnings)
        hints.push(...alertHints(alerts));
    if (options.rain) {
        const h = rainHint(dwdData?.rainOutlook, options.rainThreshold, now);
        if (h)
            hints.push(h);
    }
    if (options.pollen) {
        const h = pollenHint(pollen, options.pollenTypes, now);
        if (h)
            hints.push(h);
    }
    if (options.uv) {
        const h = uvHint(uv, now);
        if (h)
            hints.push(h);
    }
    return hints.slice(0, MAX_HINTS);
}
