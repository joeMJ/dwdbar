/**
 * prefs.js - Libadwaita / GTK4 Einstellungsdialog für dwdbar (GNOME 46 - 50)
 */

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';

export default class DwdBarPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        // ==========================================
        // Seite 1: DWD & Anzeige
        // ==========================================
        const pageDisplay = new Adw.PreferencesPage({
            title: 'DWD & Anzeige',
            icon_name: 'weather-few-clouds-symbolic',
        });
        window.add(pageDisplay);

        // Gruppe: Panel & Darstellung
        const groupPanel = new Adw.PreferencesGroup({
            title: 'Panel-Leiste',
            description: 'Konfiguration der Anzeige in der oberen GNOME-Leiste',
        });
        pageDisplay.add(groupPanel);

        // Position Dropdown
        const positionRow = new Adw.ComboRow({
            title: 'Position im Panel',
            subtitle: 'Wähle den Anzeigeort in der oberen Leiste',
            model: new Gtk.StringList({
                strings: ['Mitte (neben Datum/Uhrzeit)', 'Rechts (neben Quick Settings)'],
            }),
        });
        const currentPos = settings.get_string('panel-position');
        positionRow.selected = currentPos === 'right' ? 1 : 0;
        positionRow.connect('notify::selected', () => {
            settings.set_string('panel-position', positionRow.selected === 1 ? 'right' : 'center');
        });
        groupPanel.add(positionRow);

        // Luftfeuchte im Panel
        const humRow = new Adw.SwitchRow({
            title: 'Luftfeuchte im Panel anzeigen',
            subtitle: 'Zeigt relative Feuchtigkeit (z.B. 48%) direkt in der Leiste',
        });
        settings.bind('show-humidity-in-panel', humRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        groupPanel.add(humRow);

        // Taupunkt im Panel
        const dpRow = new Adw.SwitchRow({
            title: 'Taupunkt im Panel anzeigen',
            subtitle: 'Zeigt berechneten Taupunkt (z.B. Td 8,2 °C) direkt in der Leiste',
        });
        settings.bind('show-dewpoint-in-panel', dpRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        groupPanel.add(dpRow);

        // Aktualisierungsintervall
        const intervalRow = new Adw.SpinRow({
            title: 'Aktualisierungsintervall',
            subtitle: 'Häufigkeit der Datenabfrage in Minuten',
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 60,
                step_increment: 1,
                page_increment: 5,
                value: settings.get_int('refresh-interval'),
            }),
        });
        settings.bind('refresh-interval', intervalRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        groupPanel.add(intervalRow);

        // Gruppe: DWD Wetterdienst
        const groupDwd = new Adw.PreferencesGroup({
            title: 'DWD Wetterdaten',
            description: 'Standort- und Stationsangaben für die direkte DWD/Bright-Sky Abfrage',
        });
        pageDisplay.add(groupDwd);

        const stationNameRow = new Adw.EntryRow({
            title: 'Stationsname (Anzeige)',
        });
        settings.bind('dwd-station-name', stationNameRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        groupDwd.add(stationNameRow);

        const stationIdRow = new Adw.EntryRow({
            title: 'DWD / WMO Stations-ID',
        });
        settings.bind('dwd-station-id', stationIdRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        groupDwd.add(stationIdRow);

        const latRow = new Adw.EntryRow({
            title: 'Breitengrad (Latitude)',
            text: String(settings.get_double('dwd-latitude')),
        });
        latRow.connect('changed', () => {
            const val = parseFloat(latRow.text);
            if (!isNaN(val)) settings.set_double('dwd-latitude', val);
        });
        groupDwd.add(latRow);

        const lonRow = new Adw.EntryRow({
            title: 'Längengrad (Longitude)',
            text: String(settings.get_double('dwd-longitude')),
        });
        lonRow.connect('changed', () => {
            const val = parseFloat(lonRow.text);
            if (!isNaN(val)) settings.set_double('dwd-longitude', val);
        });
        groupDwd.add(lonRow);

        // ==========================================
        // Seite 2: Home Assistant
        // ==========================================
        const pageHa = new Adw.PreferencesPage({
            title: 'Home Assistant',
            icon_name: 'network-server-symbolic',
        });
        window.add(pageHa);

        const groupHaConn = new Adw.PreferencesGroup({
            title: 'Home Assistant Verbindung',
            description: 'REST-API Abfrage lokaler Sensoren (unterstützt HTTPS hinter NGINX)',
        });
        pageHa.add(groupHaConn);

        const haEnableRow = new Adw.SwitchRow({
            title: 'Home Assistant Integration aktivieren',
            subtitle: 'Liefert Live-Werte für Temperatur und Feuchte von lokalen Sensoren',
        });
        settings.bind('ha-enabled', haEnableRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        groupHaConn.add(haEnableRow);

        const haUrlRow = new Adw.EntryRow({
            title: 'Basis-URL',
        });
        settings.bind('ha-base-url', haUrlRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        groupHaConn.add(haUrlRow);

        const haTokenRow = new Adw.PasswordEntryRow({
            title: 'Long-Lived Access Token',
        });
        settings.bind('ha-token', haTokenRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        groupHaConn.add(haTokenRow);

        const groupHaSensors = new Adw.PreferencesGroup({
            title: 'Entitäten',
            description: 'IDs der Sensoren in Home Assistant',
        });
        pageHa.add(groupHaSensors);

        const haTempRow = new Adw.EntryRow({
            title: 'Temperatur Sensor Entität',
        });
        settings.bind('ha-temp-entity', haTempRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        groupHaSensors.add(haTempRow);

        const haHumRow = new Adw.EntryRow({
            title: 'Luftfeuchte Sensor Entität',
        });
        settings.bind('ha-humidity-entity', haHumRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        groupHaSensors.add(haHumRow);

        // ==========================================
        // Seite 3: Updates
        // ==========================================
        const pageUpdate = new Adw.PreferencesPage({
            title: 'Updates',
            icon_name: 'software-update-available-symbolic',
        });
        window.add(pageUpdate);

        const groupUpdate = new Adw.PreferencesGroup({
            title: 'Git Aktualitätsprüfung',
            description: 'Prüfung auf neue Versionen über Git (Gitea / GitHub Mirror)',
        });
        pageUpdate.add(groupUpdate);

        const updateEnableRow = new Adw.SwitchRow({
            title: 'Automatische Versionsprüfung',
            subtitle: 'Prüft regelmäßig, ob im Git-Repository ein Update vorliegt',
        });
        settings.bind('update-check-enabled', updateEnableRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        groupUpdate.add(updateEnableRow);

        const gitUrlRow = new Adw.EntryRow({
            title: 'Git Repository URL',
        });
        settings.bind('git-update-url', gitUrlRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        groupUpdate.add(gitUrlRow);

        const gitRawUrlRow = new Adw.EntryRow({
            title: 'Raw Metadata URL (Versionsabgleich)',
        });
        settings.bind('git-raw-metadata-url', gitRawUrlRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        groupUpdate.add(gitRawUrlRow);

        const infoRow = new Adw.ActionRow({
            title: `Installierte Version: v${this.metadata.version || 1}`,
            subtitle: 'Aktualisierung via Terminal: ./update.sh oder ./install.sh --update',
        });
        groupUpdate.add(infoRow);
    }
}
