/**
 * extension.js - Haupteinstiegspunkt für dwdbar (GNOME 46 - 50)
 */

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import { DwdIndicator } from './src/indicator.js';
import { HaClient } from './src/haClient.js';
import { DwdClient } from './src/dwdClient.js';
import { UpdateChecker } from './src/updater.js';
import { calculateDewPoint } from './src/dewpoint.js';
import { lookupHaToken, migrateLegacyHaToken } from './src/secretStore.js';

export default class DwdBarExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._cancellable = new Gio.Cancellable();

        this._haClient = new HaClient();
        this._dwdClient = new DwdClient();
        this._updateChecker = new UpdateChecker(this.metadata.version || 1);

        this._lastUpdateStatus = null;
        this._lastDwdData = null;
        this._lastDwdTimestamp = null;
        this._lastHaData = null;
        this._lastHaTimestamp = null;
        this._isOffline = false;
        this._haConnected = false;

        this._timeoutId = null;
        this._retryTimeoutId = null;
        this._resumeTimeoutId = null;
        this._networkMonitor = null;
        this._netChangedId = null;
        this._sleepSignalId = null;

        this._createIndicator();

        // Klartext-Token aus dconf einmalig in den Schlüsselbund verschieben
        migrateLegacyHaToken(this._settings, this._cancellable).catch(e => {
            if (!this._cancellable?.is_cancelled())
                console.warn(`[dwdbar] Token-Migration in den Schlüsselbund fehlgeschlagen: ${e.message}`);
        });

        // Einstellungen überwachen
        this._settingsSignals = [];
        this._settingsSignals.push(
            this._settings.connect('changed::panel-position', () => {
                this._repositionIndicator();
            })
        );
        this._settingsSignals.push(
            this._settings.connect('changed::refresh-interval', () => {
                this._restartTimer();
            })
        );
        this._settingsSignals.push(
            this._settings.connect('changed', () => {
                this.refreshData();
            })
        );

        // Netzwerküberwachung (NetworkManager / Gio.NetworkMonitor)
        this._setupNetworkMonitor();

        // Standby/Resume-Erkennung (systemd logind PrepareForSleep)
        this._setupSleepMonitor();

        // Timer starten
        this._restartTimer();

        // Sofortige Datenabfrage
        this.refreshData();
    }

    disable() {
        if (this._cancellable) {
            this._cancellable.cancel();
            this._cancellable = null;
        }

        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = null;
        }

        if (this._retryTimeoutId) {
            GLib.Source.remove(this._retryTimeoutId);
            this._retryTimeoutId = null;
        }

        if (this._resumeTimeoutId) {
            GLib.Source.remove(this._resumeTimeoutId);
            this._resumeTimeoutId = null;
        }

        if (this._netChangedId && this._networkMonitor) {
            this._networkMonitor.disconnect(this._netChangedId);
            this._netChangedId = null;
        }
        this._networkMonitor = null;

        if (this._sleepSignalId) {
            Gio.DBus.system.signal_unsubscribe(this._sleepSignalId);
            this._sleepSignalId = null;
        }

        if (this._settingsSignals && this._settings) {
            for (const id of this._settingsSignals) {
                this._settings.disconnect(id);
            }
            this._settingsSignals = [];
        }

        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        this._haClient = null;
        this._dwdClient = null;
        this._updateChecker = null;
        this._settings = null;
    }

    _setupNetworkMonitor() {
        try {
            this._networkMonitor = Gio.NetworkMonitor.get_default();
            if (this._networkMonitor) {
                this._netChangedId = this._networkMonitor.connect('network-changed', (monitor, available) => {
                    if (available) {
                        // Sobald Netzwerk wieder verfügbar ist:
                        const isStale = !this._lastDwdTimestamp || (Date.now() - this._lastDwdTimestamp.getTime() > 3 * 60 * 1000);
                        if (this._isOffline || !this._lastDwdData || isStale) {
                            if (this._resumeTimeoutId) {
                                GLib.Source.remove(this._resumeTimeoutId);
                                this._resumeTimeoutId = null;
                            }
                            // 3 Sekunden Verzögerung für DNS/Routing
                            this._resumeTimeoutId = GLib.timeout_add_seconds(
                                GLib.PRIORITY_DEFAULT,
                                3,
                                () => {
                                    this._resumeTimeoutId = null;
                                    this.refreshData();
                                    return GLib.SOURCE_REMOVE;
                                }
                            );
                        }
                    }
                });
            }
        } catch (e) {
            console.warn(`[dwdbar] Failed to initialize NetworkMonitor: ${e.message}`);
        }
    }

    _setupSleepMonitor() {
        try {
            this._sleepSignalId = Gio.DBus.system.signal_subscribe(
                'org.freedesktop.login1',
                'org.freedesktop.login1.Manager',
                'PrepareForSleep',
                '/org/freedesktop/login1',
                null,
                Gio.DBusSignalFlags.NONE,
                (conn, sender, path, iface, signal, params) => {
                    try {
                        const [aboutToSuspend] = params.recursiveUnpack();
                        if (aboutToSuspend) {
                            // System geht in den Standby
                            if (this._retryTimeoutId) {
                                GLib.Source.remove(this._retryTimeoutId);
                                this._retryTimeoutId = null;
                            }
                            if (this._resumeTimeoutId) {
                                GLib.Source.remove(this._resumeTimeoutId);
                                this._resumeTimeoutId = null;
                            }
                        } else {
                            // System wacht aus dem Standby auf
                            this._restartTimer();

                            if (this._resumeTimeoutId) {
                                GLib.Source.remove(this._resumeTimeoutId);
                                this._resumeTimeoutId = null;
                            }
                            // 6 Sekunden warten, bis WLAN & IP stabil verbunden sind
                            this._resumeTimeoutId = GLib.timeout_add_seconds(
                                GLib.PRIORITY_DEFAULT,
                                6,
                                () => {
                                    this._resumeTimeoutId = null;
                                    this.refreshData();
                                    return GLib.SOURCE_REMOVE;
                                }
                            );
                        }
                    } catch (err) {
                        console.warn(`[dwdbar] Error in PrepareForSleep signal callback: ${err.message}`);
                    }
                }
            );
        } catch (e) {
            console.warn(`[dwdbar] Failed to subscribe to PrepareForSleep: ${e.message}`);
        }
    }

    _createIndicator() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        this._indicator = new DwdIndicator(this);
        const position = this._settings.get_string('panel-position') || 'center';
        
        // 1 = Index, position = 'center' oder 'right'
        Main.panel.addToStatusArea(this.uuid, this._indicator, 1, position);
    }

    _repositionIndicator() {
        this._createIndicator();
        this._applyDataToUI();
    }

    _restartTimer() {
        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = null;
        }

        const intervalMinutes = Math.max(1, this._settings.get_int('refresh-interval'));
        const intervalSeconds = intervalMinutes * 60;

        this._timeoutId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            intervalSeconds,
            () => {
                this.refreshData();
                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    _scheduleRetry(seconds = 20) {
        if (this._retryTimeoutId) {
            GLib.Source.remove(this._retryTimeoutId);
            this._retryTimeoutId = null;
        }

        this._retryTimeoutId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            seconds,
            () => {
                this._retryTimeoutId = null;
                this.refreshData();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    /**
     * HA-Token aus dem Schlüsselbund; solange die Migration noch nicht gelaufen
     * ist, Fallback auf den alten dconf-Wert.
     */
    async _getHaToken() {
        try {
            const token = await lookupHaToken(this._cancellable);
            if (token)
                return token;
        } catch (e) {
            if (!this._cancellable?.is_cancelled())
                console.warn(`[dwdbar] Schlüsselbund nicht lesbar: ${e.message}`);
        }
        return this._settings?.get_string('ha-token') ?? '';
    }

    async refreshData() {
        if (!this._settings || !this._indicator) return;

        if (this._retryTimeoutId) {
            GLib.Source.remove(this._retryTimeoutId);
            this._retryTimeoutId = null;
        }

        const haEnabled = this._settings.get_boolean('ha-enabled');
        const haBaseUrl = this._settings.get_string('ha-base-url');
        const haTempEntity = this._settings.get_string('ha-temp-entity');
        const haHumEntity = this._settings.get_string('ha-humidity-entity');

        const dwdLat = this._settings.get_double('dwd-latitude');
        const dwdLon = this._settings.get_double('dwd-longitude');
        const dwdStationId = this._settings.get_string('dwd-station-id');

        const updateEnabled = this._settings.get_boolean('update-check-enabled');
        const updateUrl = this._settings.get_string('git-raw-metadata-url');

        try {
            const haToken = haEnabled ? await this._getHaToken() : '';
            if (!this._settings || !this._indicator) return;

            // Asynchrone Abfragen parallel starten
            const haPromise = haEnabled
                ? this._haClient.fetchSensorValues(haBaseUrl, haToken, haTempEntity, haHumEntity, this._cancellable)
                : Promise.resolve({ temp: null, humidity: null });

            const dwdPromise = this._dwdClient.fetchWeatherData(dwdLat, dwdLon, dwdStationId, this._cancellable);

            const updatePromise = updateEnabled
                ? this._updateChecker.checkForUpdates(updateUrl, this._cancellable)
                : Promise.resolve(null);

            const [haData, dwdData, updateStatus] = await Promise.all([
                haPromise,
                dwdPromise,
                updatePromise
            ]);

            const dwdSuccess = (dwdData !== null && dwdData !== undefined);
            const haHasValues = haData && (haData.temp !== null || haData.humidity !== null);

            // DWD-Daten nur aktualisieren, wenn neue gültige Daten empfangen wurden
            // (Cache beibehalten, falls offline!)
            if (dwdSuccess) {
                this._lastDwdData = dwdData;
                this._lastDwdTimestamp = new Date();
                this._isOffline = false;
            } else {
                this._isOffline = true;
                this._scheduleRetry(20);
            }

            // Home Assistant Daten behandeln (Cache beibehalten, falls Verbindung fehlschlägt)
            if (haHasValues) {
                this._lastHaData = haData;
                this._lastHaTimestamp = new Date();
                this._haConnected = true;
            } else if (haEnabled) {
                this._haConnected = false;
                if (!this._lastHaData) {
                    this._scheduleRetry(20);
                }
            }

            if (updateStatus) {
                this._lastUpdateStatus = updateStatus;
            }

            this._applyDataToUI();
        } catch (e) {
            console.warn(`[dwdbar] Error in refreshData: ${e.message}`);
            this._isOffline = true;
            this._scheduleRetry(20);
            this._applyDataToUI();
        }
    }

    _applyDataToUI() {
        if (!this._indicator) return;

        // Taupunkt berechnen
        // Falls HA-Sensoren Werte liefern, diese nutzen; sonst DWD
        const temp = this._lastHaData?.temp ?? this._lastDwdData?.temperature ?? null;
        const hum = this._lastHaData?.humidity ?? this._lastDwdData?.humidity ?? null;
        const dewPoint = calculateDewPoint(temp, hum);

        this._indicator.updateUI({
            dwdData: this._lastDwdData,
            haData: this._lastHaData,
            dewPoint: dewPoint,
            updateStatus: this._lastUpdateStatus,
            isOffline: this._isOffline,
            haConnected: this._haConnected,
            lastTimestamp: this._lastDwdTimestamp || this._lastHaTimestamp,
        });
    }
}
