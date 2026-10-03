# Instala el tema en Windows (PowerShell). Requiere Spicetify ya instalado. No necesita git.
#
#   Una línea, sin descargar nada (no le afecta el bloqueo de scripts):
#     iwr -useb https://raw.githubusercontent.com/iaguito22/spicetify-caelestia/main/install.ps1 | iex
#
#   Desde el ZIP descargado: doble clic en install.bat.
#   Siempre arranca en oscuro; para el claro: spicetify config color_scheme light ; spicetify apply
$Scheme = "dark"
$ErrorActionPreference = "Stop"

if (-not (Get-Command spicetify -ErrorAction SilentlyContinue)) {
    Write-Host "Spicetify no está instalado. Instálalo con:"
    Write-Host "  iwr -useb https://raw.githubusercontent.com/spicetify/cli/main/install.ps1 | iex"
    exit 1
}

# Los archivos: junto al script si es un ZIP/clon; si no, se bajan de GitHub
$files = "color.ini", "theme.js", "user.css"
$local = if ($PSScriptRoot) { Join-Path $PSScriptRoot "caelestia" } else { "" }
$cfgDir = Split-Path (spicetify -c)
$dest = Join-Path $cfgDir "Themes\caelestia"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
foreach ($f in $files) {
    if ($local -and (Test-Path (Join-Path $local $f))) {
        Copy-Item -Force (Join-Path $local $f) $dest
    } else {
        Invoke-WebRequest -UseBasicParsing "https://raw.githubusercontent.com/iaguito22/spicetify-caelestia/main/caelestia/$f" -OutFile (Join-Path $dest $f)
    }
}

spicetify config current_theme caelestia color_scheme $Scheme inject_theme_js 1 inject_css 1 replace_colors 1
spicetify apply
Write-Host "Listo (oscuro). Para el modo claro: spicetify config color_scheme light ; spicetify apply"
