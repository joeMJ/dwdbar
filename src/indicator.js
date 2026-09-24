/**
 * indicator.js - Panel Button & Popup-Menü UI für dwdbar
 */

import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { formatValue } from './dewpoint.js';

export const DwdIndicator = GObject.registerClass(
class DwdIndicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.5, 'DwdBar Weather Indicator', false);

        this._extension = extension;
        this._settings = extension.getSettings();

        // 1. Panel Box (Icon + Messwerte)
        this._panelBox = new St.BoxLayout({
            style_class: 'dwdbar-panel-box',
            reactive: true,
            can_focus: true,
            track_hover: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._panelIcon = new St.Icon({
            icon_name: 'weather-few-clouds-symbolic',
            style_class: 'system-status-icon dwdbar-panel-icon',
        });
        this._panelBox.add_child(this._panelIcon);

        this._panelLabel = new St.Label({
            text: '...',
            style_class: 'dwdbar-panel-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._panelBox.add_child(this._panelLabel);

        this.add_child(this._panelBox);

        // 2. Popup Menü Aufbau
        this._buildMenu();
    }

    _buildMenu() {
        this.menu.box.add_style_class_name('dwdbar-menu');

        // Sektion: Hauptkombination
        this._mainSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._mainSection);

        // Container für gesamten Content
        this._contentBox = new St.BoxLayout({
            vertical: true,
            style_class: 'dwdbar-content-box',
        });
        this._mainSection.actor.add_child(this._contentBox);

        // Update-Banner (wird bei verfügbarem Update eingeblendet)
        this._updateBanner = new St.BoxLayout({
            style_class: 'dwdbar-update-banner',
            visible: false,
        });
        const updateIcon = new St.Icon({
            icon_name: 'software-update-available-symbolic',
            style_class: 'dwdbar-update-icon',
        });
        this._updateLabel = new St.Label({
            text: 'Update verfügbar!',
            style_class: 'dwdbar-update-text',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._updateBanner.add_child(updateIcon);
        this._updateBanner.add_child(this._updateLabel);
        this._contentBox.add_child(this._updateBanner);

        // A. Header Card (Aktuelles Wetter & Station)
        this._headerCard = new St.BoxLayout({
            style_class: 'dwdbar-card dwdbar-header-card',
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._headerIcon = new St.Icon({
            icon_name: 'weather-few-clouds-symbolic',
            icon_size: 48,
            style_class: 'dwdbar-header-icon',
        });
        this._headerCard.add_child(this._headerIcon);

        const headerInfoBox = new St.BoxLayout({
            vertical: true,
            style_class: 'dwdbar-header-info',
            x_expand: true,
        });

        this._headerConditionLabel = new St.Label({
            text: 'Lade Wetterdaten...',
            style_class: 'dwdbar-condition-title',
        });
        headerInfoBox.add_child(this._headerConditionLabel);

        this._headerStationLabel = new St.Label({
            text: '',
            style_class: 'dwdbar-station-subtitle',
        });
        headerInfoBox.add_child(this._headerStationLabel);
        this._headerCard.add_child(headerInfoBox);

        const headerTempBox = new St.BoxLayout({
            vertical: true,
            style_class: 'dwdbar-header-temp-box',
            x_align: Clutter.ActorAlign.END,
        });

        this._headerTempLabel = new St.Label({
            text: '--,- °C',
            style_class: 'dwdbar-big-temp',
            x_align: Clutter.ActorAlign.END,
        });
        headerTempBox.add_child(this._headerTempLabel);

        this._headerMinMaxLabel = new St.Label({
            text: '--,- °C / --,- °C',
            style_class: 'dwdbar-minmax-temp',
            x_align: Clutter.ActorAlign.END,
        });
        headerTempBox.add_child(this._headerMinMaxLabel);
        this._headerCard.add_child(headerTempBox);

        this._contentBox.add_child(this._headerCard);

        // Trennlinie
        this._contentBox.add_child(new PopupMenu.PopupSeparatorMenuItem());

        // B. 10-Stunden-Vorhersage (2h-Schritte)
        const hourlyTitleBox = new St.BoxLayout({
            style_class: 'dwdbar-section-title-box',
        });
        hourlyTitleBox.add_child(new St.Label({
            text: '10-Stunden-Vorhersage (2h-Schritte)',
            style_class: 'dwdbar-section-title',
        }));
        this._contentBox.add_child(hourlyTitleBox);

        this._hourlyForecastBox = new St.BoxLayout({
            style_class: 'dwdbar-hourly-box',
            x_expand: true,
        });
        this._contentBox.add_child(this._hourlyForecastBox);

        // Trennlinie
        this._contentBox.add_child(new PopupMenu.PopupSeparatorMenuItem());

        // C. 5-Tage-Vorhersage
        const dailyTitleBox = new St.BoxLayout({
            style_class: 'dwdbar-section-title-box',
        });
        dailyTitleBox.add_child(new St.Label({
            text: '5-Tage-Vorhersage',
            style_class: 'dwdbar-section-title',
        }));
        this._contentBox.add_child(dailyTitleBox);

        this._dailyForecastBox = new St.BoxLayout({
            style_class: 'dwdbar-daily-box',
            x_expand: true,
        });
        this._contentBox.add_child(this._dailyForecastBox);

        // Trennlinie
        this._contentBox.add_child(new PopupMenu.PopupSeparatorMenuItem());

        // D. Footer (Stand & Buttons)
        this._footerBox = new St.BoxLayout({
            style_class: 'dwdbar-footer-box',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._footerStatusLabel = new St.Label({
            text: 'Initialisiere...',
            style_class: 'dwdbar-footer-text',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._footerBox.add_child(this._footerStatusLabel);

        // Refresh Button
        const refreshBtn = new St.Button({
            style_class: 'dwdbar-icon-button button',
            can_focus: true,
            child: new St.Icon({
                icon_name: 'view-refresh-symbolic',
                icon_size: 16,
            }),
        });
        refreshBtn.connect('clicked', () => {
            this._extension.refreshData();
        });
        this._footerBox.add_child(refreshBtn);

        // Settings Button
        const settingsBtn = new St.Button({
            style_class: 'dwdbar-icon-button button',
            can_focus: true,
            child: new St.Icon({
                icon_name: 'emblem-system-symbolic',
                icon_size: 16,
            }),
        });
        settingsBtn.connect('clicked', () => {
            this.menu.close();
            this._extension.openPreferences();
        });
        this._footerBox.add_child(settingsBtn);

        this._contentBox.add_child(this._footerBox);
    }

    /**
     * Aktualisiert die UI mit den neuesten Sensor- und DWD-Wetterdaten.
     */
    updateUI({ dwdData, haData, dewPoint, updateStatus }) {
        // 1. Panel-Text zusammenbauen
        // Priorität bei Temperatur & Feuchte: Home Assistant (falls konfiguriert/vorhanden), sonst DWD
        const displayTemp = haData?.temp ?? dwdData?.temperature ?? null;
        const displayHum = haData?.humidity ?? dwdData?.humidity ?? null;
        const displayDp = dewPoint ?? dwdData?.dewPoint ?? null;

        // Icon aktualisieren
        const iconName = dwdData?.icon || 'weather-few-clouds-symbolic';
        this._panelIcon.icon_name = iconName;

        const showHum = this._settings.get_boolean('show-humidity-in-panel');
        const showDp = this._settings.get_boolean('show-dewpoint-in-panel');

        const parts = [];
        if (displayTemp !== null) {
            parts.push(formatValue(displayTemp, '°C', 1));
        }
        if (showHum && displayHum !== null) {
            parts.push(formatValue(displayHum, '%', 0));
        }
        if (showDp && displayDp !== null) {
            parts.push(`Td ${formatValue(displayDp, '°C', 1)}`);
        }

        this._panelLabel.text = parts.length > 0 ? parts.join('   ') : 'dwdbar';

        // 2. Popup Header
        this._headerIcon.icon_name = iconName;
        this._headerConditionLabel.text = dwdData?.conditionText || 'Aktuelles Wetter';
        
        const stationNamePref = this._settings.get_string('dwd-station-name');
        this._headerStationLabel.text = stationNamePref || dwdData?.stationName || 'DWD Station';

        this._headerTempLabel.text = displayTemp !== null ? formatValue(displayTemp, '°C', 1) : '--,- °C';
        
        if (dwdData && dwdData.todayMax !== null && dwdData.todayMin !== null) {
            this._headerMinMaxLabel.text = `${formatValue(dwdData.todayMax, '°C', 1)} / ${formatValue(dwdData.todayMin, '°C', 1)}`;
        } else {
            this._headerMinMaxLabel.text = '--,- °C / --,- °C';
        }

        // 3. 8-Stunden-Vorhersage Spalten rendern
        this._hourlyForecastBox.destroy_all_children();
        if (dwdData?.hourlyForecast && dwdData.hourlyForecast.length > 0) {
            for (const h of dwdData.hourlyForecast) {
                const col = new St.BoxLayout({
                    vertical: true,
                    style_class: 'dwdbar-col',
                    x_expand: true,
                    x_align: Clutter.ActorAlign.CENTER,
                });

                col.add_child(new St.Label({
                    text: h.timeLabel,
                    style_class: 'dwdbar-col-time',
                    x_align: Clutter.ActorAlign.CENTER,
                }));

                col.add_child(new St.Icon({
                    icon_name: h.icon,
                    icon_size: 24,
                    style_class: 'dwdbar-col-icon',
                    x_align: Clutter.ActorAlign.CENTER,
                }));

                col.add_child(new St.Label({
                    text: formatValue(h.temperature, '°', 1),
                    style_class: 'dwdbar-col-temp',
                    x_align: Clutter.ActorAlign.CENTER,
                }));

                col.add_child(new St.Label({
                    text: formatValue(h.humidity, '%', 0),
                    style_class: 'dwdbar-col-hum',
                    x_align: Clutter.ActorAlign.CENTER,
                }));

                col.add_child(new St.Label({
                    text: `Td ${formatValue(h.dewPoint, '°', 1)}`,
                    style_class: 'dwdbar-col-dp',
                    x_align: Clutter.ActorAlign.CENTER,
                }));

                this._hourlyForecastBox.add_child(col);
            }
        }

        // 4. 5-Tage-Vorhersage Spalten rendern
        this._dailyForecastBox.destroy_all_children();
        if (dwdData?.dailyForecast && dwdData.dailyForecast.length > 0) {
            for (const d of dwdData.dailyForecast) {
                const col = new St.BoxLayout({
                    vertical: true,
                    style_class: 'dwdbar-col',
                    x_expand: true,
                    x_align: Clutter.ActorAlign.CENTER,
                });

                col.add_child(new St.Label({
                    text: d.weekday,
                    style_class: 'dwdbar-col-day',
                    x_align: Clutter.ActorAlign.CENTER,
                }));

                col.add_child(new St.Icon({
                    icon_name: d.icon,
                    icon_size: 28,
                    style_class: 'dwdbar-col-icon',
                    x_align: Clutter.ActorAlign.CENTER,
                }));

                col.add_child(new St.Label({
                    text: formatValue(d.maxTemp, '°', 1),
                    style_class: 'dwdbar-col-max',
                    x_align: Clutter.ActorAlign.CENTER,
                }));

                col.add_child(new St.Label({
                    text: formatValue(d.minTemp, '°', 1),
                    style_class: 'dwdbar-col-min',
                    x_align: Clutter.ActorAlign.CENTER,
                }));

                col.add_child(new St.Label({
                    text: formatValue(d.humidity, '%', 0),
                    style_class: 'dwdbar-col-hum',
                    x_align: Clutter.ActorAlign.CENTER,
                }));

                col.add_child(new St.Label({
                    text: `Td ${formatValue(d.dewPoint, '°', 1)}`,
                    style_class: 'dwdbar-col-dp',
                    x_align: Clutter.ActorAlign.CENTER,
                }));

                this._dailyForecastBox.add_child(col);
            }
        }

        // 5. Footer Stand
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        let statusMsg = `Stand: ${timeStr} Uhr`;
        if (haData?.temp !== null && haData?.temp !== undefined) {
            statusMsg += ' • HA verbunden';
        }
        this._footerStatusLabel.text = statusMsg;

        // 6. Update-Banner prüfen
        if (updateStatus?.updateAvailable) {
            this._updateBanner.visible = true;
            this._updateLabel.text = `Update v${updateStatus.remoteVersion} verfügbar! (install.sh --update)`;
        } else {
            this._updateBanner.visible = false;
        }
    }
});
