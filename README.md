# dwdbar - GNOME Shell Extension

> **Wetter- & Raumklima-Integration für die obere GNOME-Leiste mit Taupunktberechnung**  
> Kompatibel mit **Ubuntu 24.04 LTS (GNOME 46)** bis **Ubuntu 26.04 LTS (GNOME 50)**.

---

## Funktionen

* **Panel-Statusleiste (Top Bar):**
  * Platzierung frei wählbar: **Zentriert** neben Datum & Uhrzeit oder **rechts** neben Netzwerk/Quick Settings.
  * Dynamisches Wetterzustands-Icon (Sonnig, Bewölkt, Regen, Gewitter etc.).
  * Lesbare Werte für:
    * **Temperatur** (°C) (bevorzugt aus lokaler Home Assistant Sensor-Entität).
    * **Relative Luftfeuchtigkeit** (%) (aus Home Assistant Sensor-Entität).
    * **Berechneter Taupunkt** (°C) via Magnus-Tetens-Formel.

* **Popup-Menü (bei Klick auf das Bar-Icon):**
  * **Aktuelles Wetter:** Großes Zustandsicon, Wetterbeschreibung (z.B. *„Teilweise bewölkt“*), Stationsname (z.B. *„Düsseldorf (DUS)“*), aktuelle Temperatur und Tages-Min/Max-Spanne.
  * **8-Stunden-Vorhersage:** In 2-Stunden-Schritten (+2h, +4h, +6h, +8h) mit Wettericon, Temperatur, relativer Feuchte und berechnetem Taupunkt.
  * **5-Tage-Vorhersage:** Wochentage (z.B. *Do, Fr, Sa, So, Mo*) mit Wettericon, Max-/Min-Temperatur sowie Luftfeuchte und Taupunkt unter jedem Tag.

* **Datenquellen:**
  * **Home Assistant:** Direkte REST-API (`/api/states/<entity_id>`) hinter NGINX Reverse Proxy via HTTPS mit Long-Lived Access Token.
  * **DWD (Deutscher Wetterdienst):** Direkte Abfrage (Bright Sky / DWD Open Data) per WMO/DWD-Stations-ID oder Geo-Koordinaten.

* **Aktualitätsprüfung & Updates:**
  * Regelmäßige Prüfung auf neue Versionen im konfigurierten Git-Repository (Gitea / GitHub Mirror).
  * Statusanzeige im Popup-Menü bei Verfügbarkeit neuer Releases.
  * Skriptgestütztes Update via `./update.sh`.

* **100% Benutzerkontext:**
  * Läuft vollständig unter `~/.local/share/gnome-shell/extensions/dwdbar@krefeld.local`.
  * Kein `sudo` oder Root-Rechte erforderlich.

---

## Installation & Schnellstart

### 1. Repository klonen & installieren
```bash
git clone gitea@192.168.10.179:joe/krefeld-dwdbar.git
cd krefeld-dwdbar
./install.sh
```

### 2. Extension aktivieren & laden
Unter Wayland kann die Extension per GNOME Extensions App oder Befehl aktiviert werden:
```bash
gnome-extensions enable dwdbar@krefeld.local
```

### 3. Einstellungen öffnen
```bash
gnome-extensions prefs dwdbar@krefeld.local
```
*(Oder im Popup-Menü auf das Zahnrad-Symbol klicken)*

---

## Konfiguration

Im Einstellungsdialog (`prefs.js`) können folgende Parameter angepasst werden:

### DWD & Anzeige
* **Position:** Mitte (`center`) neben Datum/Uhrzeit oder Rechts (`right`).
* **Stations-ID / Koordinaten:** Standardmäßig auf Düsseldorf (DUS / WMO 10400, Lat 51.2895, Lon 6.7668) voreingestellt.
* **Aktualisierungsintervall:** 1 bis 60 Minuten (Standard: 10 Min).

### Home Assistant (optional für lokale Sensorwerte)
* **Basis-URL:** z.B. `https://ha.meinedomain.de` (hinter NGINX Reverse Proxy).
* **Long-Lived Access Token:** Erstellt im HA-Benutzerprofil unter *Sicherheit -> Langlebige Zugriffs-Token*.
* **Temperatur-Entität:** z.B. `sensor.aussentemperatur` oder `sensor.wohnzimmer_temperatur`.
* **Luftfeuchte-Entität:** z.B. `sensor.aussenfeuchtigkeit` oder `sensor.wohnzimmer_luftfeuchtigkeit`.

---

## Aktualisierung (Update)

Um die Extension auf den neuesten Stand aus dem Git-Repository zu bringen:
```bash
./update.sh
```
*(bzw. `./install.sh --update`)*

---

## Rückstandslose Deinstallation

Um die Extension, Schemas und Konfigurationen vollständig zu entfernen:
```bash
./uninstall.sh
```
*(bzw. `./install.sh --uninstall`)*

---

## Lizenz
Entwickelt für das Krefeld-Projekt. Open Source unter MIT-Lizenz.
