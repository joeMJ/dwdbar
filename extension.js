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

export default class DwdBarExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._cancellable = new Gio.Cancellable();

        this._haClient = new HaClient();
        this._dwdClient = new DwdClient();
        this._updateChecker = new UpdateChecker(this.metadata.version || 1);

        this._lastUpdateStatus = null;
        this._lastDwdData = null;
        this._lastHaData = null;

        this._createIndicator();

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

    async refreshData() {
        if (!this._settings || !this._indicator) return;

        const haEnabled = this._settings.get_boolean('ha-enabled');
        const haBaseUrl = this._settings.get_string('ha-base-url');
        const haToken = this._settings.get_string('ha-token');
        const haTempEntity = this._settings.get_string('ha-temp-entity');
        const haHumEntity = this._settings.get_string('ha-humidity-entity');

        const dwdLat = this._settings.get_double('dwd-latitude');
        const dwdLon = this._settings.get_double('dwd-longitude');
        const dwdStationId = this._settings.get_string('dwd-station-id');

        const updateEnabled = this._settings.get_boolean('update-check-enabled');
        const updateUrl = this._settings.get_string('git-raw-metadata-url');

        try {
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

            this._lastHaData = haData;
            this._lastDwdData = dwdData;
            if (updateStatus) {
                this._lastUpdateStatus = updateStatus;
            }

            this._applyDataToUI();
        } catch (e) {
            console.warn(`[dwdbar] Error in refreshData: ${e.message}`);
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
        });
    }
}
