/**
 * indicator.js - Panel Button & Popup-Menü UI für dwdbar
 */

import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Pango from 'gi://Pango';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { formatValue, calculateDewPoint } from './dewpoint.js';
import { localDayKey } from './healthClient.js';
import { pollenDotsMarkup, pollenForDay, pollenOutlookText } from './hints.js';

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

        // Luftfeuchte und Taupunkt der Hauptquelle (z.B. "57 %   Td 9,0 °C")
        this._headerSubValuesLabel = new St.Label({
            text: '',
            style_class: 'dwdbar-header-subvalues',
            x_align: Clutter.ActorAlign.END,
        });
        headerTempBox.add_child(this._headerSubValuesLabel);

        // Quellenhinweis unter der Temperatur (z.B. "Quelle: HA" oder "Quelle: DWD")
        this._headerSourceBadge = new St.Label({
            text: '',
            style_class: 'dwdbar-source-badge',
            x_align: Clutter.ActorAlign.END,
        });
        headerTempBox.add_child(this._headerSourceBadge);
        this._headerCard.add_child(headerTempBox);

        this._contentBox.add_child(this._headerCard);

        // A2. Alternativquelle-Anzeige (DWD vs. HA)
        this._altSourceCard = new St.BoxLayout({
            style_class: 'dwdbar-alt-source-card',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
            visible: false,
        });

        this._altSourceIcon = new St.Icon({
            icon_name: 'network-server-symbolic',
            icon_size: 16,
            style_class: 'dwdbar-alt-source-icon',
        });
        this._altSourceCard.add_child(this._altSourceIcon);

        const altInfoBox = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            style_class: 'dwdbar-alt-info-box',
        });

        this._altSourceTitle = new St.Label({
            text: 'Alternativquelle:',
            style_class: 'dwdbar-alt-source-title',
        });
        this._altSourceTitle.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        altInfoBox.add_child(this._altSourceTitle);

        this._altSourceValues = new St.Label({
            text: '--,- °C   -- %   Td --,- °C',
            style_class: 'dwdbar-alt-source-values',
        });
        this._altSourceValues.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        altInfoBox.add_child(this._altSourceValues);

        this._altSourceCard.add_child(altInfoBox);
        this._contentBox.add_child(this._altSourceCard);

        // A3. Pollenflug heute (Arten mit Belastung, Ampelpunkte)
        this._pollenTodayLabel = new St.Label({
            text: '',
            style_class: 'dwdbar-pollen-today',
            x_expand: true,
            visible: false,
        });
        this._pollenTodayLabel.clutter_text.line_wrap = true;
        this._pollenTodayLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        this._contentBox.add_child(this._pollenTodayLabel);

        // A4. Hinweise (Warnungen, Regen, Pollen, UV) – nur sichtbar, wenn vorhanden
        this._hintsBox = new St.BoxLayout({
            vertical: true,
            style_class: 'dwdbar-hints-box',
            x_expand: true,
            visible: false,
        });
        this._contentBox.add_child(this._hintsBox);

        // Trennlinie
        this._contentBox.add_child(new PopupMenu.PopupSeparatorMenuItem());

        // B. Heute (10-Stunden-Vorhersage & Min/Max)
        const hourlyTitleBox = new St.BoxLayout({
            style_class: 'dwdbar-section-title-box',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        const hourlyLabel = new St.Label({
            text: 'Heute',
            style_class: 'dwdbar-section-title',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        hourlyLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        hourlyLabel.clutter_text.line_wrap = false;
        hourlyTitleBox.add_child(hourlyLabel);

        this._minMaxValues = new St.Label({
            text: '--,- °C / --,- °C',
            style_class: 'dwdbar-section-minmax',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._minMaxValues.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        hourlyTitleBox.add_child(this._minMaxValues);

        this._contentBox.add_child(hourlyTitleBox);

        this._hourlyForecastBox = new St.BoxLayout({
            style_class: 'dwdbar-hourly-box',
            x_expand: true,
        });
        this._contentBox.add_child(this._hourlyForecastBox);

        const hourlySourceLabel = new St.Label({
            text: 'Quelle: DWD',
            style_class: 'dwdbar-section-source-badge',
            x_expand: true,
            x_align: Clutter.ActorAlign.END,
        });
        this._contentBox.add_child(hourlySourceLabel);

        // Trennlinie
        this._contentBox.add_child(new PopupMenu.PopupSeparatorMenuItem());

        // C. 5-Tage-Vorhersage (5 Spalten)
        const dailyTitleBox = new St.BoxLayout({
            style_class: 'dwdbar-section-title-box',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        const dailyLabel = new St.Label({
            text: '5-Tage-Vorhersage',
            style_class: 'dwdbar-section-title',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        dailyLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        dailyLabel.clutter_text.line_wrap = false;
        dailyTitleBox.add_child(dailyLabel);
        this._contentBox.add_child(dailyTitleBox);

        this._dailyForecastBox = new St.BoxLayout({
            style_class: 'dwdbar-daily-box',
            x_expand: true,
        });
        this._contentBox.add_child(this._dailyForecastBox);

        // Pollenausblick morgen/übermorgen als Satz (DWD liefert nur diese zwei Tage)
        this._pollenOutlookLabel = new St.Label({
            text: '',
            style_class: 'dwdbar-pollen-outlook',
            x_expand: true,
            visible: false,
        });
        this._pollenOutlookLabel.clutter_text.line_wrap = true;
        this._pollenOutlookLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        this._contentBox.add_child(this._pollenOutlookLabel);

        const dailySourceLabel = new St.Label({
            text: 'Quelle: DWD',
            style_class: 'dwdbar-section-source-badge',
            x_expand: true,
            x_align: Clutter.ActorAlign.END,
        });
        this._contentBox.add_child(dailySourceLabel);

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
            this._footerStatusLabel.text = 'Aktualisiere...';
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
    /** Kleine Zeile „Regen-Icon 70 %“ für eine Vorhersagespalte */
    _makeRainRow(probability) {
        const box = new St.BoxLayout({
            style_class: 'dwdbar-col-rain-box',
            x_align: Clutter.ActorAlign.CENTER,
        });
        box.add_child(new St.Icon({
            icon_name: 'weather-showers-symbolic',
            icon_size: 11,
            style_class: 'dwdbar-col-rain-icon',
            y_align: Clutter.ActorAlign.CENTER,
        }));
        box.add_child(new St.Label({
            text: probability !== null && probability !== undefined ? `${Math.round(probability)} %` : '-- %',
            style_class: 'dwdbar-col-rain',
            y_align: Clutter.ActorAlign.CENTER,
        }));
        return box;
    }

    _updateHints(hints) {
        this._hintsBox.destroy_all_children();
        for (const hint of hints) {
            const row = new St.BoxLayout({
                style_class: `dwdbar-hint dwdbar-hint-${hint.level}`,
                x_expand: true,
            });
            row.add_child(new St.Icon({
                icon_name: hint.icon,
                icon_size: 16,
                style_class: 'dwdbar-hint-icon',
                y_align: Clutter.ActorAlign.CENTER,
            }));
            const label = new St.Label({
                text: hint.text,
                style_class: 'dwdbar-hint-text',
                x_expand: true,
                y_align: Clutter.ActorAlign.CENTER,
            });
            label.clutter_text.line_wrap = true;
            label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
            row.add_child(label);
            row.add_child(new St.Label({
                text: hint.source,
                style_class: 'dwdbar-hint-source',
                y_align: Clutter.ActorAlign.END,
            }));
            this._hintsBox.add_child(row);
        }
        this._hintsBox.visible = hints.length > 0;
    }

    _updatePollen(pollen, pollenTypes) {
        if (!pollen) {
            this._pollenTodayLabel.visible = false;
            this._pollenOutlookLabel.visible = false;
            return;
        }
        const { max, active } = pollenForDay(pollen, localDayKey(new Date()), pollenTypes);
        let markup;
        if (max === null)
            markup = 'Pollen heute: keine Daten';
        else if (active.length === 0)
            markup = 'Pollen heute: keine Belastung';
        else
            markup = `Pollen heute:  ${active.map(p => `${p.name} ${pollenDotsMarkup(p.level)}`).join('    ')}`;
        this._pollenTodayLabel.clutter_text.set_markup(markup);
        this._pollenTodayLabel.visible = true;

        const outlook = pollenOutlookText(pollen, pollenTypes);
        this._pollenOutlookLabel.text = outlook ? `Pollen: ${outlook}` : '';
        this._pollenOutlookLabel.visible = !!outlook;
    }

    updateUI({ dwdData, haData, dewPoint, updateStatus, isOffline = false, haConnected = false, haKeyringLocked = false, hints = [], pollen = null, pollenTypes = [], lastTimestamp = null }) {
        const showRain = this._settings.get_boolean('show-rain-probability');

        // Konfigurierte Datenquellen abrufen
        const panelSource = this._settings.get_string('panel-data-source') || 'ha';
        const popupSource = this._settings.get_string('popup-data-source') || 'ha';
        const showAltSource = this._settings.get_boolean('show-alternative-source');

        // Home Assistant Werte
        const haTemp = haData?.temp ?? null;
        const haHum = haData?.humidity ?? null;
        const haDp = haTemp !== null && haHum !== null ? calculateDewPoint(haTemp, haHum) : dewPoint;

        // DWD Werte
        const dwdTemp = dwdData?.temperature ?? null;
        const dwdHum = dwdData?.humidity ?? null;
        const dwdDp = dwdData?.dewPoint ?? (dwdTemp !== null && dwdHum !== null ? calculateDewPoint(dwdTemp, dwdHum) : null);

        // 1. Panel-Bar Werte ermitteln
        let panelTemp, panelHum, panelDp;
        if (panelSource === 'dwd' || haTemp === null) {
            panelTemp = dwdTemp;
            panelHum = dwdHum;
            panelDp = dwdDp;
        } else {
            panelTemp = haTemp;
            panelHum = haHum;
            panelDp = haDp;
        }

        // Wolken-/Wettericon immer vom DWD
        const iconName = dwdData?.icon || 'weather-few-clouds-symbolic';
        this._panelIcon.icon_name = iconName;

        const showHum = this._settings.get_boolean('show-humidity-in-panel');
        const showDp = this._settings.get_boolean('show-dewpoint-in-panel');

        const parts = [];
        if (panelTemp !== null) {
            parts.push(formatValue(panelTemp, '°C', 1));
        }
        if (showHum && panelHum !== null) {
            parts.push(formatValue(panelHum, '%', 0));
        }
        if (showDp && panelDp !== null) {
            parts.push(`Td ${formatValue(panelDp, '°C', 1)}`);
        }

        this._panelLabel.text = parts.length > 0 ? parts.join('   ') : 'dwdbar';

        // 2. Popup Header (Hauptfeld)
        this._headerIcon.icon_name = iconName;
        this._headerConditionLabel.text = dwdData?.conditionText || (isOffline ? 'Verbindung getrennt' : 'Aktuelles Wetter');
        
        const stationNamePref = this._settings.get_string('dwd-station-name');
        const stationDisplayName = stationNamePref || dwdData?.stationName || 'DWD Station';
        this._headerStationLabel.text = stationDisplayName;

        let mainTemp, mainHum, mainDp, mainSourceText;
        let altTemp, altHum, altDp, altSourceText, altIcon;

        if (popupSource === 'dwd' || haTemp === null) {
            // Hauptfeld zeigt DWD
            mainTemp = dwdTemp;
            mainHum = dwdHum;
            mainDp = dwdDp;
            mainSourceText = 'Quelle: DWD';

            altTemp = haTemp;
            altHum = haHum;
            altDp = haDp;
            altSourceText = 'Home Assistant';
            altIcon = 'network-server-symbolic';
        } else {
            // Hauptfeld zeigt Home Assistant
            mainTemp = haTemp;
            mainHum = haHum;
            mainDp = haDp;
            mainSourceText = 'Quelle: HA';

            altTemp = dwdTemp;
            altHum = dwdHum;
            altDp = dwdDp;
            altSourceText = `DWD (${stationDisplayName})`;
            altIcon = 'weather-few-clouds-symbolic';
        }

        // 1. Hauptfeld: Temperatur, Feuchte/Taupunkt und Quelle
        this._headerTempLabel.text = mainTemp !== null ? formatValue(mainTemp, '°C', 1) : '--,- °C';

        if (mainHum !== null && mainDp !== null) {
            this._headerSubValuesLabel.text = `${formatValue(mainHum, '%', 0)}   Td ${formatValue(mainDp, '°C', 1)}`;
            this._headerSubValuesLabel.visible = true;
        } else if (mainHum !== null) {
            this._headerSubValuesLabel.text = `${formatValue(mainHum, '%', 0)}`;
            this._headerSubValuesLabel.visible = true;
        } else {
            this._headerSubValuesLabel.text = '';
            this._headerSubValuesLabel.visible = false;
        }

        this._headerSourceBadge.text = mainSourceText;
        
        // 2. Max / Min (DWD) für Heute
        if (dwdData && dwdData.todayMax !== null && dwdData.todayMin !== null) {
            this._minMaxValues.text = `Max ${formatValue(dwdData.todayMax, '°C', 1)} / Min ${formatValue(dwdData.todayMin, '°C', 1)}`;
            this._minMaxValues.visible = true;
        } else if (!this._minMaxValues.text || this._minMaxValues.text.includes('--')) {
            this._minMaxValues.text = '';
            this._minMaxValues.visible = false;
        }

        // 3. Alternativquelle anzeigen (falls aktiviert und Werte vorhanden)
        if (showAltSource && altTemp !== null) {
            this._altSourceCard.visible = true;
            this._altSourceIcon.icon_name = altIcon;
            this._altSourceTitle.text = `Alternativquelle: ${altSourceText}`;
            this._altSourceValues.text = `${formatValue(altTemp, '°C', 1)}   ${formatValue(altHum, '%', 0)}   Td ${formatValue(altDp, '°C', 1)}`;
        } else {
            this._altSourceCard.visible = false;
        }

        // 4. 10-Stunden-Vorhersage Spalten rendern (5 Spalten)
        if (dwdData?.hourlyForecast && dwdData.hourlyForecast.length > 0) {
            this._hourlyForecastBox.destroy_all_children();
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

                if (showRain)
                    col.add_child(this._makeRainRow(h.precipitationProbability));

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
        } else if (this._hourlyForecastBox.get_n_children() === 0) {
            const emptyLabel = new St.Label({
                text: 'Keine Vorhersagedaten verfügbar (Offline)',
                style_class: 'dwdbar-empty-placeholder',
                x_align: Clutter.ActorAlign.CENTER,
            });
            this._hourlyForecastBox.add_child(emptyLabel);
        }

        // 5. 5-Tage-Vorhersage Spalten rendern (5 Spalten)
        if (dwdData?.dailyForecast && dwdData.dailyForecast.length > 0) {
            this._dailyForecastBox.destroy_all_children();
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

                if (showRain)
                    col.add_child(this._makeRainRow(d.precipitationProbability));

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
        } else if (this._dailyForecastBox.get_n_children() === 0) {
            const emptyLabel = new St.Label({
                text: 'Keine Vorhersagedaten verfügbar (Offline)',
                style_class: 'dwdbar-empty-placeholder',
                x_align: Clutter.ActorAlign.CENTER,
            });
            this._dailyForecastBox.add_child(emptyLabel);
        }

        // 5b. Hinweise und Pollen heute
        this._updateHints(hints);
        this._updatePollen(pollen, pollenTypes);

        // 6. Footer Stand
        let statusMsg = '';
        if (lastTimestamp instanceof Date) {
            const timeStr = `${String(lastTimestamp.getHours()).padStart(2, '0')}:${String(lastTimestamp.getMinutes()).padStart(2, '0')}`;
            statusMsg = `Stand: ${timeStr} Uhr`;
        } else {
            statusMsg = 'Stand: Initialisiere...';
        }

        if (isOffline) {
            statusMsg += ' (Offline)';
        }

        const haEnabled = this._settings.get_boolean('ha-enabled');
        if (haEnabled) {
            if (haConnected) {
                statusMsg += ' • HA';
            } else if (haKeyringLocked) {
                statusMsg += ' • HA: Schlüsselbund gesperrt';
            } else {
                statusMsg += ' • HA offline';
            }
        }
        this._footerStatusLabel.text = statusMsg;

        // 7. Update-Banner prüfen
        if (updateStatus?.updateAvailable) {
            this._updateBanner.visible = true;
            this._updateLabel.text = `Update v${updateStatus.remoteVersionName ?? updateStatus.remoteVersion} verfügbar – „Jetzt aktualisieren“ in den Einstellungen`;
        } else {
            this._updateBanner.visible = false;
        }
    }
});
