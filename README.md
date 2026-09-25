# dwdbar - Multi-Platform Weather & Climate Bar

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
