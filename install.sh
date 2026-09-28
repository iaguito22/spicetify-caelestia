#!/usr/bin/env bash
# Instala el tema en Linux/macOS. Requiere Spicetify ya instalado.
set -euo pipefail
command -v spicetify >/dev/null || { echo "Spicetify no está instalado: https://spicetify.app"; exit 1; }
SCHEME="${1:-dark}"   # dark | light
CFG_DIR="$(dirname "$(spicetify -c)")"
DEST="$CFG_DIR/Themes/caelestia"
mkdir -p "$DEST"
cp "$(dirname "$0")"/caelestia/{user.css,theme.js,color.ini} "$DEST/"
spicetify config current_theme caelestia color_scheme "$SCHEME" inject_theme_js 1 inject_css 1 replace_colors 1
spicetify apply
echo "Listo. Para cambiar a claro/oscuro: spicetify config color_scheme light|dark && spicetify apply"
