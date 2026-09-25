# dwdbar für Windows 11

Native Wetter- & Sensor-App für die Windows 11 Taskbar und den Infobereich (System Tray).

## Features
- **Duale Anzeige-Modi (in Einstellungen wählbar):**
  1. **System Tray (Infobereich unten rechts):** 100% robust bei Remote Desktop (RDP) und Multi-Monitor-Setups. Klick öffnet das Windows 11 Flyout.
  2. **Taskbar-Overlay (unten links):** Permanentes Widget direkt in der Taskleiste. Automatisches Ausblenden bei Vollbildanwendungen (YouTube, Games, Präsentationen).
- **Popup-Menü (Flyout):**
  - Aktuelles Wetter (DWD oder Home Assistant)
  - "Heute" (10-Stunden-Vorhersage in 2h-Schritten mit Min/Max-Extremwerten)
  - 5-Tage-Vorhersage (ab morgigem Tag)
  - Quellenangaben (`Quelle: DWD` / `Quelle: HA`)
- **Portabel & Firmen-PC-tauglich:** Läuft komplett ohne Admin-Rechte als portable `.exe`.

## Build
```cmd
dotnet publish -c Release -r win-x64 --self-contained
```
