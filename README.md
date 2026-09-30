# dwdbar - Multi-Platform Weather & Climate Bar

> [!WARNING]
> **Privates Hobbyprojekt – nicht gepflegt / unmaintained.**
> Dieses Repository ist für meinen eigenen Gebrauch gedacht und wird nur aus Bequemlichkeit öffentlich bereitgestellt.
>
> * **Keine Unterstützung:** Issues und Pull Requests werden nicht bearbeitet, Feature-Wünsche nicht umgesetzt. Bitte keine Issues eröffnen.
> * **Keine Garantie:** Bereitstellung „wie besehen“, ohne jede Gewährleistung und Haftung. Nutzung auf eigenes Risiko.
> * **Eigene Umgebung:** Entwickelt und getestet nur auf meinen eigenen Ubuntu-Rechnern (24.04 / 26.04, GNOME 46–50). Auf anderen Systemen kann es fehlschlagen. Windows- und macOS-Varianten existieren bisher nur als Planung.
> * **Zugangsdaten & Netzwerk:** Die Extension läuft mit den Rechten deiner GNOME-Sitzung. Ein optionales Home-Assistant-Token wird **unverschlüsselt** in GSettings/dconf gespeichert. Sie ruft regelmäßig die Bright Sky API, bei der Stationssuche OpenStreetMap Nominatim, deine Home-Assistant-Instanz und für die Update-Prüfung eine entfernte `metadata.json` ab. **Lies den Code, bevor du ihn installierst.**
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
  * **Heute:** 10-Stunden-Vorhersage (+2h, +4h, +6h, +8h, +10h) mit Tages-Höchst- und Tiefstwerten (`Max ... / Min ...`) und Quellenangabe.
  * **5-Tage-Vorhersage:** Vorhersage der kommenden 5 Tage (ab morgigem Tag) mit Min/Max, Feuchte, Taupunkt und Quellenangabe.
  * **Footer:** Zeitstempel des letzten erfolgreichen Abrufs (`Stand: HH:MM Uhr`), Verbindungsstatus und Schnellaktionen.

---

## Schnellstart Linux (Ubuntu / GNOME)

```bash
git clone gitea@192.168.10.179:joe/krefeld-dwdbar.git
cd krefeld-dwdbar
./install.sh
```

* **Update:** `./update.sh`
* **Deinstallation:** `./uninstall.sh`
* **Einstellungen:** `gnome-extensions prefs dwdbar@krefeld.local` (oder über das Zahnrad im Popup)

---

## Schnellstart Windows 11

Siehe Dokumentation in [`windows/README.md`](windows/README.md).
Kompilierbar als portable `.exe` ohne Administratorrechte:
```cmd
cd windows
dotnet publish -c Release -r win-x64 --self-contained
```
