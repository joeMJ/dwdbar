/**
 * prefs.js - Libadwaita / GTK4 Einstellungsdialog für dwdbar (GNOME 46 - 50)
 */

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { DwdClient } from './src/dwdClient.js';
import { lookupHaToken, storeHaToken, clearHaToken, migrateLegacyHaToken } from './src/secretStore.js';

export default class DwdBarPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const dwdClient = new DwdClient();

        // ==========================================
        // Seite 1: DWD & Anzeige
        // ==========================================
        const pageDisplay = new Adw.PreferencesPage({
            title: 'DWD & Anzeige',
            icon_name: 'weather-few-clouds-symbolic',
        });
        window.add(pageDisplay);

        // Gruppe 1: Panel & Darstellung
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

        // Gruppe 2: Datenquellen (DWD vs. Home Assistant)
        const groupSources = new Adw.PreferencesGroup({
            title: 'Datenquellen (DWD & Home Assistant)',
            description: 'Zuordnung der Messwerte für Menüleiste und Vorhersagefenster',
        });
        pageDisplay.add(groupSources);

        // 1. Menu Bar Datenquelle
        const panelSourceRow = new Adw.ComboRow({
            title: 'Menu Bar zeigt Daten aus',
            subtitle: 'Wähle die primäre Datenquelle für die obere Leiste',
            model: new Gtk.StringList({
                strings: ['Home Assistant', 'DWD Wetterdienst'],
            }),
        });
        const currentPanelSource = settings.get_string('panel-data-source');
        panelSourceRow.selected = currentPanelSource === 'dwd' ? 1 : 0;
        panelSourceRow.connect('notify::selected', () => {
            settings.set_string('panel-data-source', panelSourceRow.selected === 1 ? 'dwd' : 'ha');
        });
        groupSources.add(panelSourceRow);

        // 2. Hauptfeld Datenquelle (Popup)
        const popupSourceRow = new Adw.ComboRow({
            title: 'Hauptfeld zeigt Daten aus',
            subtitle: 'Wolkensymbole stammen stets vom DWD (Quelle DWD oder HA)',
            model: new Gtk.StringList({
                strings: ['Home Assistant', 'DWD Wetterdienst'],
            }),
        });
        const currentPopupSource = settings.get_string('popup-data-source');
        popupSourceRow.selected = currentPopupSource === 'dwd' ? 1 : 0;
        popupSourceRow.connect('notify::selected', () => {
            settings.set_string('popup-data-source', popupSourceRow.selected === 1 ? 'dwd' : 'ha');
        });
        groupSources.add(popupSourceRow);

        // 3. Alternativquelle anzeigen
        const altSourceRow = new Adw.SwitchRow({
            title: 'Alternativquelle anzeigen (DWD oder HA)',
            subtitle: 'Zeigt Temperatur, Feuchte und Taupunkt der jeweils anderen Quelle',
        });
        settings.bind('show-alternative-source', altSourceRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        groupSources.add(altSourceRow);

        // Dynamische Aktualisierung bei externer Änderung & Sensitivität je nach Home Assistant Status
        settings.connect('changed::panel-data-source', () => {
            const val = settings.get_string('panel-data-source');
            const targetIdx = val === 'dwd' ? 1 : 0;
            if (panelSourceRow.selected !== targetIdx) {
                panelSourceRow.selected = targetIdx;
            }
        });

        settings.connect('changed::popup-data-source', () => {
            const val = settings.get_string('popup-data-source');
            const targetIdx = val === 'dwd' ? 1 : 0;
            if (popupSourceRow.selected !== targetIdx) {
                popupSourceRow.selected = targetIdx;
            }
        });

        const updateSourceSensitivity = () => {
            const haEnabled = settings.get_boolean('ha-enabled');
            if (!haEnabled) {
                panelSourceRow.sensitive = false;
                panelSourceRow.subtitle = 'Home Assistant ist nicht aktiviert (nur DWD verfügbar)';
                popupSourceRow.sensitive = false;
                popupSourceRow.subtitle = 'Home Assistant ist nicht aktiviert (nur DWD verfügbar)';
                altSourceRow.sensitive = false;
                altSourceRow.subtitle = 'Home Assistant ist nicht aktiviert (keine Alternativquelle vorhanden)';
            } else {
                panelSourceRow.sensitive = true;
                panelSourceRow.subtitle = 'Wähle die primäre Datenquelle für die obere Leiste';
                popupSourceRow.sensitive = true;
                popupSourceRow.subtitle = 'Wolkensymbole stammen stets vom DWD (Quelle DWD oder HA)';
                altSourceRow.sensitive = true;
                altSourceRow.subtitle = 'Zeigt Temperatur, Feuchte und Taupunkt der jeweils anderen Quelle';
            }
        };

        updateSourceSensitivity();
        settings.connect('changed::ha-enabled', updateSourceSensitivity);

        // Gruppe 3: Stationsfinder (Automatische Suche)
        const groupFinder = new Adw.PreferencesGroup({
            title: 'DWD Stationsfinder',
            description: 'Finde automatisch die passenden DWD-Stationen mit Messwerten und Vorhersage',
        });
        pageDisplay.add(groupFinder);

        const searchEntryRow = new Adw.EntryRow({
            title: 'Ort oder Postleitzahl',
            text: settings.get_string('dwd-station-name') || '',
        });
        groupFinder.add(searchEntryRow);

        const searchBtnRow = new Adw.ActionRow({
            title: 'Stationen in der Umgebung suchen',
            subtitle: 'Sucht offizielle DWD-Stationen im Umkreis des Ortes',
        });

        const searchBtn = new Gtk.Button({
            label: 'Stationen suchen',
            valign: Gtk.Align.CENTER,
            css_classes: ['suggested-action'],
        });
        searchBtnRow.add_suffix(searchBtn);
        groupFinder.add(searchBtnRow);

        // Gruppe 3: Gefundene Stationen (dynamisch)
        const groupResults = new Adw.PreferencesGroup({
            title: 'Suchergebnisse',
            description: 'Klicke auf Übernehmen, um die Station einzustellen',
            visible: false,
        });
        pageDisplay.add(groupResults);

        // Gruppe 4: Manuelle DWD Wetterdaten
        const groupDwd = new Adw.PreferencesGroup({
            title: 'Aktuelle Station & Koordinaten',
            description: 'Manuelle Feinjustierung der Stations- und Standortangaben',
        });
        pageDisplay.add(groupDwd);

        const stationNameRow = new Adw.EntryRow({
            title: 'Stationsname (Anzeige)',
        });
        settings.bind('dwd-station-name', stationNameRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        groupDwd.add(stationNameRow);

        const stationIdRow = new Adw.EntryRow({
            title: 'DWD / WMO Stations-ID (optional)',
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

        // Suchlogik implementieren
        let currentResultRows = [];
        const performSearch = () => {
            const query = searchEntryRow.text ? searchEntryRow.text.trim() : '';
            const currentLat = settings.get_double('dwd-latitude');
            const currentLon = settings.get_double('dwd-longitude');

            searchBtn.sensitive = false;
            searchBtn.label = 'Suche...';

            (async () => {
                // Alte Zeilen entfernen
                for (const row of currentResultRows) {
                    groupResults.remove(row);
                }
                currentResultRows = [];

                const res = await dwdClient.searchStations(query, currentLat, currentLon);

                searchBtn.sensitive = true;
                searchBtn.label = 'Stationen suchen';

                if (!res || !res.stations || res.stations.length === 0) {
                    groupResults.visible = true;
                    groupResults.description = 'Keine DWD-Stationen für diese Suche gefunden.';
                    const emptyRow = new Adw.ActionRow({
                        title: 'Keine Treffer',
                        subtitle: 'Bitte prüfe den Ortsnamen oder die Postleitzahl.',
                    });
                    groupResults.add(emptyRow);
                    currentResultRows.push(emptyRow);
                    return;
                }

                groupResults.visible = true;
                groupResults.description = `Gefundener Ort: ${res.resolvedName} (${res.lat.toFixed(4)}, ${res.lon.toFixed(4)})`;

                for (const station of res.stations) {
                    const row = new Adw.ActionRow({
                        title: `${station.displayName}`,
                        subtitle: `DWD ID: ${station.stationId || 'Koordinaten-Lookup'} • Entfernung: ${station.distanceKm} km`,
                    });

                    const applyBtn = new Gtk.Button({
                        label: 'Übernehmen',
                        valign: Gtk.Align.CENTER,
                        css_classes: ['pill'],
                    });

                    applyBtn.connect('clicked', () => {
                        const newName = res.resolvedName || station.displayName;
                        settings.set_string('dwd-station-name', newName);
                        settings.set_string('dwd-station-id', station.wmoStationId || station.dwdStationId || '');
                        settings.set_double('dwd-latitude', station.lat);
                        settings.set_double('dwd-longitude', station.lon);

                        // Eingabefelder aktualisieren
                        stationNameRow.text = newName;
                        stationIdRow.text = station.wmoStationId || station.dwdStationId || '';
                        latRow.text = String(station.lat);
                        lonRow.text = String(station.lon);

                        applyBtn.label = '✓ Aktiv';
                        applyBtn.sensitive = false;
                    });

                    row.add_suffix(applyBtn);
                    groupResults.add(row);
                    currentResultRows.push(row);
                }
            })().catch(err => {
                console.error(`[dwdbar] Fehler bei Stationssuche: ${err.message}`);
                searchBtn.sensitive = true;
                searchBtn.label = 'Stationen suchen';
            });
        };

        searchBtn.connect('clicked', performSearch);
        searchEntryRow.connect('apply', performSearch);
        searchEntryRow.connect('entry-activated', performSearch);

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

        // Token liegt im GNOME-Schlüsselbund, nicht in dconf
        const haTokenRow = new Adw.PasswordEntryRow({
            title: 'Long-Lived Access Token',
            show_apply_button: true,
        });
        groupHaConn.add(haTokenRow);

        const haTokenInfoRow = new Adw.ActionRow({
            title: 'Token-Speicherort',
            subtitle: 'GNOME-Schlüsselbund – wird geladen …',
        });
        groupHaConn.add(haTokenInfoRow);

        let storedToken = null;

        migrateLegacyHaToken(settings)
            .catch(e => console.warn(`[dwdbar] Token-Migration fehlgeschlagen: ${e.message}`))
            .then(() => lookupHaToken())
            .then(token => {
                storedToken = token ?? '';
                haTokenRow.text = storedToken;
                haTokenInfoRow.subtitle = token
                    ? 'Im GNOME-Schlüsselbund hinterlegt (verschlüsselt)'
                    : 'Kein Token hinterlegt';
            })
            .catch(e => {
                haTokenInfoRow.subtitle = `Schlüsselbund nicht erreichbar: ${e.message}`;
            });

        const saveToken = async () => {
            const token = haTokenRow.text.trim();
            if (storedToken === null || token === storedToken)
                return;
            try {
                if (token)
                    await storeHaToken(token);
                else
                    await clearHaToken();
                storedToken = token;
                settings.set_int('ha-token-revision', settings.get_int('ha-token-revision') + 1);
                haTokenInfoRow.subtitle = token
                    ? 'Im GNOME-Schlüsselbund gespeichert (verschlüsselt)'
                    : 'Token aus dem Schlüsselbund entfernt';
            } catch (e) {
                haTokenInfoRow.subtitle = `Speichern fehlgeschlagen: ${e.message}`;
            }
        };
        haTokenRow.connect('apply', saveToken);
        haTokenRow.connect('entry-activated', saveToken);
        window.connect('close-request', () => {
            saveToken();
            return false;
        });

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
            description: 'Prüfung auf neue Versionen über GitHub (github.com/joeMJ/dwdbar)',
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

        const updateCommand = 'curl -fsSL https://raw.githubusercontent.com/joeMJ/dwdbar/main/install.sh | bash';
        const versionName = this.metadata['version-name'] ?? String(this.metadata.version || 1);

        const infoRow = new Adw.ActionRow({
            title: `Installierte Version: v${versionName}`,
            subtitle: `Aktualisieren im Terminal: ${updateCommand}`,
            subtitle_selectable: true,
        });
        const updateBtn = new Gtk.Button({
            label: 'Jetzt aktualisieren',
            valign: Gtk.Align.CENTER,
            css_classes: ['suggested-action'],
        });
        updateBtn.connect('clicked', () => {
            const error = launchInTerminal(
                `${updateCommand}; echo; read -r -p 'Fertig – danach ab- und wieder anmelden. Enter schließt das Fenster.'`);
            if (error)
                infoRow.subtitle = `${error} – bitte manuell ausführen: ${updateCommand}`;
        });
        infoRow.add_suffix(updateBtn);
        groupUpdate.add(infoRow);
    }
}

/**
 * Startet einen Befehl in einem Terminalfenster (bevorzugt das Standard-Terminal
 * über xdg-terminal-exec, sonst Ptyxis, GNOME Terminal, x-terminal-emulator).
 * @param {string} command - Shell-Befehl für bash -c
 * @returns {string|null} Fehlermeldung oder null bei Erfolg
 */
function launchInTerminal(command) {
    const candidates = [
        ['xdg-terminal-exec', []],
        ['ptyxis', ['--']],
        ['gnome-terminal', ['--']],
        ['x-terminal-emulator', ['-e']],
    ];
    for (const [program, prefix] of candidates) {
        const path = GLib.find_program_in_path(program);
        if (!path)
            continue;
        try {
            Gio.Subprocess.new([path, ...prefix, 'bash', '-c', command], Gio.SubprocessFlags.NONE);
            return null;
        } catch (e) {
            console.warn(`[dwdbar] ${program} konnte nicht gestartet werden: ${e.message}`);
        }
    }
    return 'Kein Terminal gefunden';
}
