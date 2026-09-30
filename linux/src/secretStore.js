/**
 * secretStore.js - Home-Assistant-Token im GNOME-Schlüsselbund (libsecret / Secret Service)
 *
 * Das Token liegt verschlüsselt im Login-Schlüsselbund statt im Klartext in dconf.
 * Sichtbar/löschbar in „Passwörter und Verschlüsselung“ (Seahorse) unter
 * „dwdbar – Home Assistant Token“.
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
