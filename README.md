# Caelestia for Spicetify

Floating "island" panels, an ambient background and accent color taken from the current cover, and a liquid-glass player dock. Dark and light.

![Artist page](screenshots/artist.png)
![Playlist](screenshots/playlist.png)
![Lyrics](screenshots/lyrics.png)

## What it does

- **Islands:** library, main view and right sidebar float as rounded panels with concentric corners (28 → 16 → 8 px). Three floating pills on top: navigation, search, profile.
- **Ambient background:** the cover of the current song, blurred, crossfades behind everything.
- **Dynamic accent:** the accent color (play button, progress, highlights, glass tint) is picked from the cover and eases between songs.
- **Player dock:** a floating liquid-glass bar. The progress bar is the bottom edge of the dock and grows on hover.
- **Playlist header:** cover, title and controls integrated in one header; column header turns into glass only when it sticks.
- **Lyrics:** big type, active line in the accent color, lines blur by distance, edge fade. Word-by-word fill, best source first: real word timings from Netease (via Spicetify's public CORS proxy, so the song title and artist are sent to it) with each word split into approximate syllables; Spotify's syllables if it ever sends them; otherwise the line time is split between its words (an estimate); otherwise Spotify's normal lyrics. The syllable (or word) being sung lifts and swells slightly; the lyrics open and close with a staggered blur-in/out, and the lyrics button now always closes them.
- **Search:** the dropdown is a glass panel that grows out of the pill with a soft spring, rows cascade in, and it folds back into the pill when it closes; no double focus ring and glass-chip shortcuts.
- **Narrow windows:** the top bar becomes a three-column grid (search shrinks instead of overlapping, the profile pill fits its content) and the floating dock keeps a fixed size (760 px) and floats, centered on the window.
- **Side panels:** opening, closing or collapsing the library and the right panel slides the columns sideways. Spotify itself takes ~1–2 s to re-lay-out after a panel change, so the slide waits until it settles and then runs smoothly. The toggle buttons get a round halo on hover.
- **No scrollbars.** Dark and light follow the color scheme.

## Install

Requires [Spicetify](https://spicetify.app) already installed and applied to Spotify.

**Linux / macOS**
```bash
git clone https://github.com/iaguito22/spicetify-caelestia
cd spicetify-caelestia
./install.sh
```

**Windows** (no git needed, and Windows' script blocking doesn't apply): in PowerShell,
```powershell
iwr -useb https://raw.githubusercontent.com/iaguito22/spicetify-caelestia/main/install.ps1 | iex
```
Or download the ZIP from GitHub (Code → Download ZIP), unzip it and double-click `install.bat`. If Windows blocks it, right-click → Properties → Unblock, or run `powershell -ExecutionPolicy Bypass -File .\install.ps1`.

Manual: copy `caelestia/` to `<spicetify config dir>/Themes/caelestia/` (`spicetify -c` prints the config path), then

```
spicetify config current_theme caelestia color_scheme dark inject_theme_js 1 inject_css 1 replace_colors 1
spicetify apply
```

Switch mode any time: `spicetify config color_scheme light` (or `dark`), then `spicetify apply`.

## Caelestia shell users

If you use the [Caelestia](https://github.com/caelestia-dots/shell) shell, its scheme generator overwrites `color.ini` (scheme name `caelestia`) whenever you change scheme, and the theme follows it, light/dark included. Set `color_scheme = caelestia`.

## Status and limits

- Built and tested on **Linux (Arch, Hyprland) with Spotify 1.2.96**. Spotify's class names change between versions; lyrics and the right sidebar break first.
- **Windows was checked from a user screenshot (issue #1); macOS is untested.** The theme reserves room for the native window controls (top-right on Windows, top-left on macOS), but the sizes are a guess. Please open an issue with a screenshot if something overlaps.
- On Linux the native "···" window menu at the top-left can't be removed from CSS; the navigation pill leaves room for it.
- Light mode: tested on playlist, artist, search, home and lyrics. Context menus and albums weren't checked.

## License

MIT

---

## En español

Tema de Spicetify con paneles flotantes, fondo ambiental y acento sacados de la portada, y un reproductor flotante de cristal líquido. Claro y oscuro.

Instalación: con Spicetify instalado, `./install.sh` (Linux/macOS) o, en Windows, la línea de PowerShell de arriba o `install.bat` del ZIP (sin git). Para cambiar de modo: `spicetify config color_scheme light` (o `dark`) y `spicetify apply`.

Probado en Linux con Spotify 1.2.96. **Windows se ajustó a partir de capturas (issue #1); macOS no está probado**; si algo se solapa con los controles de la ventana, abre un issue con una captura.
