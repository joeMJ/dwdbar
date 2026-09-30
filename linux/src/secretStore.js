/**
 * secretStore.js - Home-Assistant-Token im GNOME-Schlüsselbund (libsecret / Secret Service)
 *
 * Das Token liegt verschlüsselt im Login-Schlüsselbund statt im Klartext in dconf.
 * Sichtbar/löschbar in „Passwörter und Verschlüsselung“ (Seahorse) unter
 * „dwdbar – Home Assistant Token“.
 *
 * WICHTIG: Im GNOME-Shell-Prozess (extension.js) nur die *NoPrompt-Funktionen
 * verwenden. Die übrigen können bei gesperrtem Schlüsselbund einen
 * Entsperr-Dialog auslösen – das hat GNOME Shell zum Absturz gebracht
 * (free(): invalid pointer, z. B. nach Login per FIDO-Stick). Sie sind nur für
 * prefs.js (eigener Prozess) gedacht.
 */

import Secret from 'gi://Secret';

const SCHEMA = new Secret.Schema(
    'org.gnome.shell.extensions.dwdbar',
    Secret.SchemaFlags.NONE,
    { 'key': Secret.SchemaAttributeType.STRING }
);
const ATTRIBUTES = { 'key': 'ha-token' };
const LABEL = 'dwdbar – Home Assistant Token';

/**
 * Liest das Token aus dem Schlüsselbund.
 * @param {Gio.Cancellable} [cancellable=null]
 * @returns {Promise<string|null>} Token oder null, wenn keins hinterlegt ist
 */
export function lookupHaToken(cancellable = null) {
    return new Promise((resolve, reject) => {
        Secret.password_lookup(SCHEMA, ATTRIBUTES, cancellable, (_src, res) => {
            try {
                resolve(Secret.password_lookup_finish(res) || null);
            } catch (e) {
                reject(e);
            }
        });
    });
}

/**
 * Speichert das Token im Login-Schlüsselbund (überschreibt ein vorhandenes).
 * @param {string} token
 * @param {Gio.Cancellable} [cancellable=null]
 * @returns {Promise<boolean>}
 */
export function storeHaToken(token, cancellable = null) {
    return new Promise((resolve, reject) => {
        Secret.password_store(SCHEMA, ATTRIBUTES, Secret.COLLECTION_DEFAULT,
            LABEL, token, cancellable, (_src, res) => {
                try {
                    resolve(Secret.password_store_finish(res));
                } catch (e) {
                    reject(e);
                }
            });
    });
}

/**
 * Entfernt das Token aus dem Schlüsselbund.
 * @param {Gio.Cancellable} [cancellable=null]
 * @returns {Promise<boolean>} true, wenn ein Eintrag gelöscht wurde
 */
export function clearHaToken(cancellable = null) {
    return new Promise((resolve, reject) => {
        Secret.password_clear(SCHEMA, ATTRIBUTES, cancellable, (_src, res) => {
            try {
                resolve(Secret.password_clear_finish(res));
            } catch (e) {
                reject(e);
            }
        });
    });
}

/**
 * Einmalige Migration: Klartext-Token aus dconf (`ha-token`) in den Schlüsselbund
 * verschieben und danach aus dconf löschen. Bei Fehlern bleibt dconf unverändert.
 * @param {Gio.Settings} settings
 * @param {Gio.Cancellable} [cancellable=null]
 * @returns {Promise<boolean>} true, wenn migriert wurde
 */
export async function migrateLegacyHaToken(settings, cancellable = null) {
    const legacy = settings.get_string('ha-token');
    if (!legacy)
        return false;

    await storeHaToken(legacy, cancellable);
    const check = await lookupHaToken(cancellable);
    if (check !== legacy)
        throw new Error('Token im Schlüsselbund nach dem Speichern nicht lesbar');

    settings.reset('ha-token');
    console.log('[dwdbar] HA-Token aus dconf in den Schlüsselbund migriert.');
    return true;
}

// ---------------------------------------------------------------------------
// Varianten ohne Entsperr-Dialog – für den GNOME-Shell-Prozess
// ---------------------------------------------------------------------------

function getService(cancellable) {
    return new Promise((resolve, reject) => {
        Secret.Service.get(Secret.ServiceFlags.NONE, cancellable, (_src, res) => {
            try {
                resolve(Secret.Service.get_finish(res));
            } catch (e) {
                reject(e);
            }
        });
    });
}

function searchItems(service, cancellable) {
    // Bewusst OHNE Secret.SearchFlags.UNLOCK: gesperrte Einträge werden nur
    // gemeldet, nie entsperrt – es erscheint kein Dialog.
    return new Promise((resolve, reject) => {
        service.search(SCHEMA, ATTRIBUTES,
            Secret.SearchFlags.ALL | Secret.SearchFlags.LOAD_SECRETS,
            cancellable, (_src, res) => {
                try {
                    resolve(service.search_finish(res) ?? []);
                } catch (e) {
                    reject(e);
                }
            });
    });
}

function getDefaultCollection(service, cancellable) {
    return new Promise((resolve, reject) => {
        Secret.Collection.for_alias(service, 'default', Secret.CollectionFlags.NONE,
            cancellable, (_src, res) => {
                try {
                    resolve(Secret.Collection.for_alias_finish(res));
                } catch (e) {
                    reject(e);
                }
            });
    });
}

/**
 * Liest das Token, ohne jemals einen Entsperr-Dialog auszulösen.
 * @param {Gio.Cancellable} [cancellable=null]
 * @returns {Promise<{token: string|null, locked: boolean}>}
 *   locked = true: Eintrag vorhanden, aber Schlüsselbund gesperrt
 */
export async function lookupHaTokenNoPrompt(cancellable = null) {
    const service = await getService(cancellable);
    const items = await searchItems(service, cancellable);
    if (items.length === 0)
        return { token: null, locked: false };

    const unlocked = items.find(item => !item.locked);
    if (!unlocked)
        return { token: null, locked: true };

    return { token: unlocked.get_secret()?.get_text() || null, locked: false };
}

/**
 * Migration wie migrateLegacyHaToken(), aber nur bei bereits entsperrtem
 * Standard-Schlüsselbund – sonst wird sie übersprungen (kein Dialog).
 * @param {Gio.Settings} settings
 * @param {Gio.Cancellable} [cancellable=null]
 * @returns {Promise<boolean>} true, wenn migriert wurde
 */
export async function migrateLegacyHaTokenNoPrompt(settings, cancellable = null) {
    const legacy = settings.get_string('ha-token');
    if (!legacy)
        return false;

    const service = await getService(cancellable);
    const collection = await getDefaultCollection(service, cancellable);
    if (!collection || collection.locked)
        return false;

    await storeHaToken(legacy, cancellable);
    const { token } = await lookupHaTokenNoPrompt(cancellable);
    if (token !== legacy)
        throw new Error('Token im Schlüsselbund nach dem Speichern nicht lesbar');

    settings.reset('ha-token');
    console.log('[dwdbar] HA-Token aus dconf in den Schlüsselbund migriert.');
    return true;
}
