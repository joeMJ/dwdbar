# dwdbar - Multi-Platform Weather & Climate Bar

> [!WARNING]
> **Privates Hobbyprojekt – nicht gepflegt / unmaintained.**
> Dieses Repository ist für meinen eigenen Gebrauch gedacht und wird nur aus Bequemlichkeit öffentlich bereitgestellt.
>
> * **Keine Unterstützung:** Issues und Pull Requests werden nicht bearbeitet, Feature-Wünsche nicht umgesetzt. Bitte keine Issues eröffnen.
> * **Keine Garantie:** Bereitstellung „wie besehen“, ohne jede Gewährleistung und Haftung. Nutzung auf eigenes Risiko.
> * **Eigene Umgebung:** Entwickelt und getestet nur auf meinen eigenen Ubuntu-Rechnern (24.04 / 26.04, GNOME 46–50). Auf anderen Systemen kann es fehlschlagen. Windows- und macOS-Varianten existieren bisher nur als Planung.
> * **Zugangsdaten & Netzwerk:** Die Extension läuft mit den Rechten deiner GNOME-Sitzung. Ein optionales Home-Assistant-Token wird im GNOME-Schlüsselbund (libsecret) gespeichert – verschlüsselt, solange du abgemeldet bist; während der Sitzung können Programme deines Benutzers es lesen. Verwende am besten ein Token eines eigenen HA-Benutzers ohne Administratorrechte. Sie ruft regelmäßig die Bright Sky API, DWD Open Data (Pollenflug, UV-Index), bei der Stationssuche OpenStreetMap Nominatim, deine Home-Assistant-Instanz und für die Update-Prüfung eine entfernte `metadata.json` ab. **Lies den Code, bevor du ihn installierst.**
> * **Keine Updates zugesichert:** Es kann jederzeit ohne Ankündigung Änderungen, Brüche oder die Löschung des Repos geben. Gern selbst forken und anpassen.
>
> *Private hobby project, unmaintained, provided as-is. No support, no issues, no warranty. Fork it if you like.*

> **Wetter- & Raumklima-Integration für Linux (GNOME Shell), Windows 11 und macOS mit präziser Taupunktberechnung**

---

## Plattform-Übersicht

| Plattform | Status | Verzeichnis | Tech Stack |
| :--- | :--- | :--- | :--- |
| **Linux (GNOME Shell)** | Aktiv (v3) | [`linux/`](linux/) | GNOME Shell 46–50 ESM, Libsoup 3.0, GTK4/Adw |
| **Windows 11** | In Entwicklung | [`windows/`](windows/) | C# / .NET 9 WPF, Win32 / Mica, Taskbar & System Tray |
| **macOS** | Vorbereitet | [`macos/`](macos/) | Swift / SwiftUI `MenuBarExtra` |

---

## Funktionen

* **Statusleiste (Panel / Taskbar / Tray):**
  * Wetterzustands-Icon (Klar, Bewölkt, Regen, Gewitter etc.).
  * **Temperatur** (°C) (wahlweise DWD oder Home Assistant Sensor).
  * **Relative Luftfeuchtigkeit** (%) (aus Sensor oder DWD MOSMIX berechnet).
  * **Berechneter Taupunkt** (°C) via bidirektionaler Magnus-Tetens-Formel.

* **Popup-Kachel (bei Klick auf das Bar-Icon):**
  * **Aktuelles Wetter:** Großes Zustandsicon, Wetterlage, Stationsname, Temperatur & Quelle.
  * **Alternativquelle (optional):** Zeigt die zweite Quelle (z. B. DWD vs. HA) parallel an.
  * **Hinweise:** Höchstens zwei farbig hinterlegte Hinweise, nach Dringlichkeit: amtliche DWD-Warnungen (Unwetter, Gewitter, Hitze, Frost …), bevorstehender Regen bis morgen Mittag („In etwa 1 Stunde ist mit Regen zu rechnen“), Pollenbelastung und hoher UV-Index. Jede Art einzeln abschaltbar.
  * **Heute:** 10-Stunden-Vorhersage (+2h, +4h, +6h, +8h, +10h) mit Tages-Höchst- und Tiefstwerten (`Max ... / Min ...`), Regenwahrscheinlichkeit pro Stunde, Pollenflug heute (Arten mit Belastung, Stufe 0–3) und Quellenangabe.
  * **5-Tage-Vorhersage:** Vorhersage der kommenden 5 Tage (ab morgigem Tag) mit Min/Max, höchster Regenwahrscheinlichkeit des Tages, Pollenbelastung (morgen und übermorgen), Feuchte, Taupunkt und Quellenangabe.
  * **Footer:** Zeitstempel des letzten erfolgreichen Abrufs (`Stand: HH:MM Uhr`), Verbindungsstatus und Schnellaktionen.

* **Datenquellen:** Datenbasis Deutscher Wetterdienst – Beobachtungen, MOSMIX-Vorhersage und amtliche Warnungen über [Bright Sky](https://brightsky.dev), Pollenflug- und UV-Gefahrenindex direkt von [DWD Open Data](https://opendata.dwd.de/climate_environment/health/alerts/); Stationssuche über OpenStreetMap Nominatim; optional Home Assistant. Eine Übersicht steht in den Einstellungen unter *Datenquellen*. dwdbar ist kein Angebot des DWD.

---

## Installation Linux (Ubuntu / GNOME)

**Voraussetzungen:** Ubuntu 24.04 – 26.04 (GNOME 46–50), `curl`, `tar` und `glib-compile-schemas` (Paket `libglib2.0-bin`, auf Ubuntu vorinstalliert). Kein `sudo` nötig – alles läuft im eigenen Benutzerkonto.

### Installieren

```bash
curl -fsSL https://raw.githubusercontent.com/joeMJ/dwdbar/main/install.sh | bash
```

Das Skript lädt den aktuellen Stand per HTTPS von GitHub in ein temporäres Verzeichnis, installiert die Extension nach `~/.local/share/gnome-shell/extensions/` und räumt danach auf.

> [!NOTE]
> Unter Wayland lädt GNOME Shell neue oder aktualisierte Extensions erst nach dem **Ab- und wieder Anmelden**.

### Aktualisieren

Denselben Befehl erneut ausführen oder in den Einstellungen unter *Updates* auf **Jetzt aktualisieren** klicken – die Einstellungen (Station, Home Assistant usw.) bleiben erhalten. Liegt eine neue Version vor, zeigt das Popup einen Hinweis.

```bash
curl -fsSL https://raw.githubusercontent.com/joeMJ/dwdbar/main/install.sh | bash
```

### Deinstallieren

```bash
curl -fsSL https://raw.githubusercontent.com/joeMJ/dwdbar/main/install.sh | bash -s -- --uninstall
```

Entfernt die Extension, alle Einstellungen und das Home-Assistant-Token aus dem Schlüsselbund. (Über den Extension-Manager deinstalliert, bleiben Einstellungen und Token erhalten.)

### Erst ansehen, dann ausführen

```bash
curl -fsSLO https://raw.githubusercontent.com/joeMJ/dwdbar/main/install.sh
less install.sh
bash install.sh
```

### Einstellungen

Über das Zahnrad im Popup oder:

```bash
gnome-extensions prefs dwdbar@johnlose.de
```

### Alternative: Git-Klon (für Entwicklung)

```bash
git clone https://github.com/joeMJ/dwdbar.git
cd dwdbar
./install.sh
```

Update mit `./update.sh` (führt `git pull` aus), Deinstallation mit `./uninstall.sh`.

---

## Schnellstart Windows 11

Siehe Dokumentation in [`windows/README.md`](windows/README.md).
Kompilierbar als portable `.exe` ohne Administratorrechte:
```cmd
cd windows
dotnet publish -c Release -r win-x64 --self-contained
```
