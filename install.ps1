# Instala el tema en Windows (PowerShell). Requiere Spicetify ya instalado.
#   .\install.ps1            -> esquema oscuro
#   .\install.ps1 light      -> esquema claro
param([string]$Scheme = "dark")
if (-not (Get-Command spicetify -ErrorAction SilentlyContinue)) {
    Write-Host "Spicetify no está instalado: https://spicetify.app"; exit 1
}
$cfgDir = Split-Path (spicetify -c)
$dest = Join-Path $cfgDir "Themes\caelestia"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item -Force (Join-Path $PSScriptRoot "caelestia\*") $dest
spicetify config current_theme caelestia color_scheme $Scheme inject_theme_js 1 inject_css 1 replace_colors 1
spicetify apply
Write-Host "Listo. Para cambiar: spicetify config color_scheme light|dark ; spicetify apply"
