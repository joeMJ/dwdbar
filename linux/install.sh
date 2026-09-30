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

# Startverknüpfung aus früheren Versionen (bis v6.2) entfernen
remove_desktop_entry() {
    if [ -f "${DESKTOP_DIR}/dwdbar.desktop" ]; then
        print_info "Entferne Startverknüpfung: ${DESKTOP_DIR}/dwdbar.desktop..."
        rm -f "${DESKTOP_DIR}/dwdbar.desktop"
        command -v update-desktop-database &>/dev/null && update-desktop-database "${DESKTOP_DIR}" 2>/dev/null || true
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

    remove_desktop_entry

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

    # Schemas prüfen (ohne in das Quellverzeichnis zu schreiben)
    print_info "Prüfe GSettings-Schemas..."
    glib-compile-schemas --strict --dry-run "${SCRIPT_DIR}/schemas/"

    # Alte Installation unter früherer UUID entfernen
    remove_legacy_extensions

    # WICHTIG: Dateien der laufenden Extension nie an Ort und Stelle überschreiben.
    # GNOME Shell hält schemas/gschemas.compiled per mmap geöffnet; überschreibt cp diese
    # Datei, bricht die laufende Shell beim nächsten Lesen einer Einstellung hart ab.
    # Deshalb in ein Zwischenverzeichnis installieren und das ganze Verzeichnis austauschen.
    # Das Zwischenverzeichnis liegt im selben Dateisystem (mv = atomares Umbenennen),
    # aber bewusst nicht in extensions/, sonst liest GNOME es als Extension ein.
    mkdir -p "${EXTENSIONS_DIR}"
    local staging old_dir
    staging="$(mktemp -d "${EXTENSIONS_DIR}/../.dwdbar-install.XXXXXX")"
    old_dir="${staging}.alt"

    print_info "Bereite Extension-Dateien vor..."
    cp -r "${SCRIPT_DIR}/metadata.json" "${staging}/"
    cp -r "${SCRIPT_DIR}/extension.js" "${staging}/"
    cp -r "${SCRIPT_DIR}/prefs.js" "${staging}/"
    # Stylesheets: GNOME Shell lädt je nach Farbschema stylesheet-light.css bzw.
    # stylesheet-dark.css (Fallback stylesheet.css) – nur eine Datei, daher vollständig
    cp "${SCRIPT_DIR}/stylesheet.css" "${staging}/stylesheet.css"
    cp "${SCRIPT_DIR}/stylesheet.css" "${staging}/stylesheet-dark.css"
    cat "${SCRIPT_DIR}/stylesheet.css" "${SCRIPT_DIR}/theme-light.css" > "${staging}/stylesheet-light.css"
    cp -r "${SCRIPT_DIR}/src" "${staging}/"
    if [ -d "${SCRIPT_DIR}/icons" ]; then
        cp -r "${SCRIPT_DIR}/icons" "${staging}/"
    fi

    # Nur die Schema-Quellen kopieren, kompiliert wird frisch im Zwischenverzeichnis
    mkdir -p "${staging}/schemas"
    cp "${SCRIPT_DIR}"/schemas/*.gschema.xml "${staging}/schemas/"
    if ! glib-compile-schemas --strict "${staging}/schemas/"; then
        rm -rf "${staging}"
        print_error "GSettings-Schemas konnten nicht kompiliert werden."
        exit 1
    fi
    chmod 755 "${staging}"

    # Austauschen (Umbenennen im selben Dateisystem, die alte Installation bleibt unberührt)
    print_info "Installiere nach ${TARGET_DIR}..."
    if [ -d "${TARGET_DIR}" ]; then
        mv "${TARGET_DIR}" "${old_dir}"
    fi
    if ! mv "${staging}" "${TARGET_DIR}"; then
        [ -d "${old_dir}" ] && mv "${old_dir}" "${TARGET_DIR}"
        rm -rf "${staging}"
        print_error "Installation fehlgeschlagen – vorherige Version wiederhergestellt."
        exit 1
    fi
    rm -rf "${old_dir}"

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

    # Keine Startverknüpfung mehr (seit v6.3) – Einstellungen über das Zahnrad im Popup
    remove_desktop_entry

    print_success "Installation erfolgreich abgeschlossen!"
    print_info "WICHTIGER HINWEIS (GNOME Wayland):"
    print_info "  GNOME Shell lädt neu installierte Erweiterungen auf Wayland erst beim Sitzungsstart."
    print_info "  Bitte einmal ABMELDEN und wieder ANMELDEN (oder System neu starten)!"
    print_info "  Danach ist das Icon in der oberen Leiste aktiv."
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
