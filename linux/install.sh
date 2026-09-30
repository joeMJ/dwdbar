#!/usr/bin/env bash
# ==============================================================================
# install.sh - Installer & Manager für dwdbar GNOME Shell Extension
# Führt alle Schritte im reinen Anwenderkontext (ohne sudo) aus.
# ==============================================================================

set -e

EXTENSION_UUID="dwdbar@johnlose.de"
# Frühere UUIDs – werden bei Installation/Deinstallation abgeräumt
LEGACY_UUIDS=("dwdbar@krefeld.local")
EXTENSIONS_DIR="${HOME}/.local/share/gnome-shell/extensions"
TARGET_DIR="${EXTENSIONS_DIR}/${EXTENSION_UUID}"
DESKTOP_DIR="${HOME}/.local/share/applications"
DCONF_PATH="/org/gnome/shell/extensions/dwdbar/"
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

# Extension deaktivieren, aus enabled-extensions austragen und Verzeichnis löschen
remove_extension() {
    local uuid="$1"
    local dir="${EXTENSIONS_DIR}/${uuid}"

    if command -v gnome-extensions &>/dev/null; then
        gnome-extensions disable "${uuid}" 2>/dev/null || true
    fi

    if command -v gsettings &>/dev/null; then
        local current updated
        current=$(gsettings get org.gnome.shell enabled-extensions 2>/dev/null || echo "[]")
        if [[ "${current}" == *"'${uuid}'"* ]]; then
            updated=$(echo "${current}" | sed -E "s/, '${uuid}'|'${uuid}', |'${uuid}'//g")
            gsettings set org.gnome.shell enabled-extensions "${updated}" 2>/dev/null || true
        fi
    fi

    if [ -d "${dir}" ]; then
        print_info "Entferne Verzeichnis: ${dir}..."
        rm -rf "${dir}"
    fi
}

# Frühere Installationen unter alter UUID abräumen (Einstellungen bleiben erhalten)
remove_legacy_extensions() {
    local uuid
    for uuid in "${LEGACY_UUIDS[@]}"; do
        if [ -d "${EXTENSIONS_DIR}/${uuid}" ]; then
            print_info "Entferne alte Installation ${uuid} (neue UUID: ${EXTENSION_UUID})..."
            remove_extension "${uuid}"
        fi
    done
}

# HA-Token aus dem GNOME-Schlüsselbund löschen (kann bei gesperrtem Schlüsselbund nach dem Passwort fragen)
clear_keyring_token() {
    if ! command -v gjs &>/dev/null; then
        print_error "gjs nicht gefunden – bitte „dwdbar – Home Assistant Token“ manuell in „Passwörter und Verschlüsselung“ löschen."
        return
    fi
    local result
    result=$(gjs -c "
        imports.gi.versions.Secret = '1';
        const Secret = imports.gi.Secret;
        const schema = new Secret.Schema('org.gnome.shell.extensions.dwdbar', Secret.SchemaFlags.NONE,
            { 'key': Secret.SchemaAttributeType.STRING });
        print(Secret.password_clear_sync(schema, { 'key': 'ha-token' }, null) ? 'geloescht' : 'keiner');
    " 2>/dev/null || echo "fehler")
    case "${result}" in
        geloescht) print_info "HA-Token aus dem Schlüsselbund gelöscht." ;;
        keiner)    print_info "Kein HA-Token im Schlüsselbund vorhanden." ;;
        *)         print_error "Schlüsselbund-Eintrag konnte nicht gelöscht werden – bitte „dwdbar – Home Assistant Token“ manuell in „Passwörter und Verschlüsselung“ löschen." ;;
    esac
}

# Hilfe
show_help() {
    echo "Verwendung: $0 [OPTION]"
    echo ""
    echo "Optionen:"
    echo "  --install     (Standard) Installiert und aktiviert die Extension im User-Verzeichnis"
    echo "  --update      Im Git-Klon: git pull + Installation; sonst Installation des geladenen Stands"
    echo "  --uninstall   Entfernt Extension, Einstellungen (dconf) und HA-Token (Schlüsselbund)"
    echo "  --help        Zeigt diese Hilfe an"
    exit 0
}

# Deinstallation
do_uninstall() {
    print_info "Starte rückstandslose Deinstallation von ${EXTENSION_UUID}..."

    remove_extension "${EXTENSION_UUID}"
    remove_legacy_extensions

    # Einstellungen löschen – direkt per dconf, da das Schema nur im
    # Extension-Verzeichnis liegt und gsettings es nicht findet
    if command -v dconf &>/dev/null; then
        print_info "Lösche Einstellungen (${DCONF_PATH})..."
        dconf reset -f "${DCONF_PATH}" 2>/dev/null || true
    fi

    clear_keyring_token

    # Startverknüpfung (.desktop) entfernen
    if [ -f "${DESKTOP_DIR}/dwdbar.desktop" ]; then
        print_info "Entferne Startverknüpfung: ${DESKTOP_DIR}/dwdbar.desktop..."
        rm -f "${DESKTOP_DIR}/dwdbar.desktop"
        command -v update-desktop-database &>/dev/null && update-desktop-database "${DESKTOP_DIR}" 2>/dev/null || true
    fi

    print_success "Deinstallation abgeschlossen! Extension, Einstellungen und HA-Token wurden entfernt."
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
    local secret_found=0 typelib
    for typelib in /usr/lib/*/girepository-1.0/Secret-1.typelib /usr/lib/girepository-1.0/Secret-1.typelib /usr/lib64/girepository-1.0/Secret-1.typelib; do
        [ -f "${typelib}" ] && secret_found=1
    done
    if [ "${secret_found}" -eq 0 ]; then
        print_error "libsecret-Typelib fehlt – das HA-Token kann nicht im Schlüsselbund gespeichert werden. (apt install gir1.2-secret-1)"
    fi

    # Schemas kompilieren
    print_info "Kompiliere GSettings-Schemas..."
    glib-compile-schemas "${SCRIPT_DIR}/schemas/"

    # Alte Installation unter früherer UUID entfernen
    remove_legacy_extensions

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
