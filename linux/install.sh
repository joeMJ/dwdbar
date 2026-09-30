#!/usr/bin/env bash
# ==============================================================================
# install.sh - Installer & Manager für dwdbar GNOME Shell Extension
# Führt alle Schritte im reinen Anwenderkontext (ohne sudo) aus.
# ==============================================================================

set -e

EXTENSION_UUID="dwdbar@krefeld.local"
TARGET_DIR="${HOME}/.local/share/gnome-shell/extensions/${EXTENSION_UUID}"
DESKTOP_DIR="${HOME}/.local/share/applications"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

print_info() {
    echo -e "\033[1;34m[INFO]\033[0m $1"
}

print_success() {
    echo -e "\033[1;32m[OK]\033[0m $1"
}

print_error() {
    echo -e "\033[1;31m[FEHLER]\033[0m $1"
}

# Hilfe
show_help() {
    echo "Verwendung: $0 [OPTION]"
    echo ""
    echo "Optionen:"
    echo "  --install     (Standard) Installiert und aktiviert die Extension im User-Verzeichnis"
    echo "  --update      Im Git-Klon: git pull + Installation; sonst Installation des geladenen Stands"
    echo "  --uninstall   Entfernt die Extension und alle zugehörigen Daten restlos"
    echo "  --help        Zeigt diese Hilfe an"
    exit 0
}

# Deinstallation
do_uninstall() {
    print_info "Starte rückstandslose Deinstallation von ${EXTENSION_UUID}..."
    
    if command -v gnome-extensions &>/dev/null; then
        print_info "Deaktiviere Extension..."
        gnome-extensions disable "${EXTENSION_UUID}" 2>/dev/null || true
    fi

    # GSettings Schema zurücksetzen
    if command -v gsettings &>/dev/null; then
        print_info "Setze GSettings-Werte zurück..."
        gsettings reset-recursively org.gnome.shell.extensions.dwdbar 2>/dev/null || true

        # Aus enabled-extensions entfernen
        CURRENT_EXTENSIONS=$(gsettings get org.gnome.shell enabled-extensions 2>/dev/null || echo "[]")
        if [[ "$CURRENT_EXTENSIONS" == *"'${EXTENSION_UUID}'"* ]]; then
            UPDATED_EXTENSIONS=$(echo "$CURRENT_EXTENSIONS" | sed -E "s/, '${EXTENSION_UUID}'|'${EXTENSION_UUID}', |'${EXTENSION_UUID}'//g")
            gsettings set org.gnome.shell enabled-extensions "$UPDATED_EXTENSIONS" 2>/dev/null || true
        fi
    fi

    # Startverknüpfung (.desktop) entfernen
    if [ -f "${DESKTOP_DIR}/dwdbar.desktop" ]; then
        print_info "Entferne Startverknüpfung: ${DESKTOP_DIR}/dwdbar.desktop..."
        rm -f "${DESKTOP_DIR}/dwdbar.desktop"
        command -v update-desktop-database &>/dev/null && update-desktop-database "${DESKTOP_DIR}" 2>/dev/null || true
    fi

    # Zielverzeichnis löschen
    if [ -d "${TARGET_DIR}" ]; then
        print_info "Entferne Verzeichnis: ${TARGET_DIR}..."
        rm -rf "${TARGET_DIR}"
    fi

    print_success "Deinstallation abgeschlossen! Die Extension wurde restlos entfernt."
    exit 0
}

# Update
do_update() {
    print_info "Prüfe auf Updates via Git..."
    if [ -d "${SCRIPT_DIR}/../.git" ]; then
        cd "${SCRIPT_DIR}/.."
        git pull || {
            print_error "Git Pull fehlgeschlagen. Bitte Netzwerkverbindung oder Remote prüfen."
            exit 1
        }
        cd "${SCRIPT_DIR}"
    elif [ -d "${SCRIPT_DIR}/.git" ]; then
        cd "${SCRIPT_DIR}"
        git pull || {
            print_error "Git Pull fehlgeschlagen. Bitte Netzwerkverbindung oder Remote prüfen."
            exit 1
        }
    else
        print_info "Kein Git-Klon – installiere den heruntergeladenen Stand."
    fi
    do_install
    print_success "Update erfolgreich abgeschlossen!"
    exit 0
}

# Installation
do_install() {
    print_info "Installiere ${EXTENSION_UUID} für Benutzer: ${USER}..."

    # Voraussetzungen prüfen
    if ! command -v glib-compile-schemas &>/dev/null; then
        print_error "glib-compile-schemas ist nicht installiert. (apt install libglib2.0-bin)"
        exit 1
    fi

    # libsecret (GNOME-Schlüsselbund für das HA-Token)
    if ! ls /usr/lib/*/girepository-1.0/Secret-1.typelib /usr/lib/girepository-1.0/Secret-1.typelib &>/dev/null; then
        print_error "libsecret-Typelib fehlt – das HA-Token kann nicht im Schlüsselbund gespeichert werden. (apt install gir1.2-secret-1)"
    fi

    # Schemas kompilieren
    print_info "Kompiliere GSettings-Schemas..."
    glib-compile-schemas "${SCRIPT_DIR}/schemas/"

    # Zielordner anlegen
    mkdir -p "${TARGET_DIR}"

    # Dateien kopieren
    print_info "Kopiere Extension-Dateien nach ${TARGET_DIR}..."
    cp -r "${SCRIPT_DIR}/metadata.json" "${TARGET_DIR}/"
    cp -r "${SCRIPT_DIR}/extension.js" "${TARGET_DIR}/"
    cp -r "${SCRIPT_DIR}/prefs.js" "${TARGET_DIR}/"
    cp -r "${SCRIPT_DIR}/stylesheet.css" "${TARGET_DIR}/"
    cp -r "${SCRIPT_DIR}/src" "${TARGET_DIR}/"
    cp -r "${SCRIPT_DIR}/schemas" "${TARGET_DIR}/"

    if [ -d "${SCRIPT_DIR}/icons" ]; then
        cp -r "${SCRIPT_DIR}/icons" "${TARGET_DIR}/"
    fi

    # Schemas im Zielordner sicherstellen
    glib-compile-schemas "${TARGET_DIR}/schemas/"

    # Extension in enabled-extensions aufnehmen
    if command -v gsettings &>/dev/null; then
        CURRENT_EXTENSIONS=$(gsettings get org.gnome.shell enabled-extensions 2>/dev/null || echo "[]")
        if [[ "$CURRENT_EXTENSIONS" != *"'${EXTENSION_UUID}'"* ]]; then
            if [ "$CURRENT_EXTENSIONS" = "@as []" ] || [ "$CURRENT_EXTENSIONS" = "[]" ]; then
                gsettings set org.gnome.shell enabled-extensions "['${EXTENSION_UUID}']" 2>/dev/null || true
            else
                UPDATED_EXTENSIONS=$(echo "$CURRENT_EXTENSIONS" | sed "s/]$/, '${EXTENSION_UUID}']/")
                gsettings set org.gnome.shell enabled-extensions "$UPDATED_EXTENSIONS" 2>/dev/null || true
            fi
        fi
    fi

    # Extension aktivieren via CLI falls verfügbar
    if command -v gnome-extensions &>/dev/null; then
        print_info "Aktiviere Extension in GNOME Shell..."
        gnome-extensions enable "${EXTENSION_UUID}" 2>/dev/null || true
    fi

    # Startverknüpfung (.desktop) anlegen
    if [ -f "${SCRIPT_DIR}/dwdbar.desktop" ]; then
        print_info "Installiere Startverknüpfung nach ${DESKTOP_DIR}/dwdbar.desktop..."
        mkdir -p "${DESKTOP_DIR}"
        cp "${SCRIPT_DIR}/dwdbar.desktop" "${DESKTOP_DIR}/"
        command -v update-desktop-database &>/dev/null && update-desktop-database "${DESKTOP_DIR}" 2>/dev/null || true
    fi

    print_success "Installation erfolgreich abgeschlossen!"
    print_info "WICHTIGER HINWEIS (GNOME Wayland):"
    print_info "  GNOME Shell lädt neu installierte Erweiterungen auf Wayland erst beim Sitzungsstart."
    print_info "  Bitte einmal ABMELDEN und wieder ANMELDEN (oder System neu starten)!"
    print_info "  Danach ist das Icon in der oberen Leiste aktiv und die Startverknüpfung nutzbar."
}

# Parameter verarbeiten
case "$1" in
    --uninstall|-u)
        do_uninstall
        ;;
    --update)
        do_update
        ;;
    --help|-h)
        show_help
        ;;
    --install|"")
        do_install
        ;;
    *)
        print_error "Unbekannte Option: $1"
        show_help
        ;;
esac
