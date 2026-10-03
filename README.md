# Caelestia for Spicetify

A Spotify theme where the panels float as rounded islands and **the only color comes from the song that's playing**.

> [!IMPORTANT]
> This is a theme for **[Spicetify](https://spicetify.app)**, not a standalone app. Install Spicetify first and run `spicetify apply` once; then install the theme below.

![Artist page](screenshots/artist.png)
![Lyrics](screenshots/lyrics.png)

## Design

- **Islands.** Library, main view and right panel float over the background with concentric corners (28 → 16 → 8 px). The top bar is three pills: navigation, search, profile. The player is a floating glass dock.
- **The cover is the palette.** Everything else is neutral gray, so the album art sets the mood: it fills the background (blurred) and tints the accent.
- **Less chrome.** No scrollbars, no focus rings, no boxes around lists. Buttons that aren't needed all the time appear on hover.

## How the dynamic accent works

When a song starts, the cover is drawn into a tiny 24×24 canvas. Each colored pixel votes for its hue, weighted by how saturated it is; grays, blacks and whites don't vote. The winning hue is clamped in saturation and lightness so it always reads against the background, and it fades in over ~1.4 s. Grayscale covers fall back to the scheme's own accent.

That color drives the play button, progress bar, active lyric, highlights and the tint of the glass.

## How the lyrics work

- **On time.** Spotify highlights each line 0.1–0.9 s late. The theme ignores that and follows the song's clock, so each line lights up when it's sung.
- **Word by word.** Best timing source first:
  1. Real word timings from Netease, split into approximate syllables. *This sends the song title and artist to Spicetify's public CORS proxy.*
  2. Spotify's own syllable timings, when it provides them.
  3. Otherwise the line's time is spread across its words (an estimate).
- **Motion.** The word being sung lifts slightly; lines fade by distance, and the view scrolls smoothly to the current line.

## Install

**Linux / macOS**
```bash
git clone https://github.com/iaguito22/spicetify-caelestia
cd spicetify-caelestia
./install.sh
```

**Windows** (PowerShell, no git needed)
```powershell
iwr -useb https://raw.githubusercontent.com/iaguito22/spicetify-caelestia/main/install.ps1 | iex
```
Or download the ZIP (Code → Download ZIP) and double-click `install.bat`.

It installs in dark mode. For light: `spicetify config color_scheme light`, then `spicetify apply`.

**[Caelestia shell](https://github.com/caelestia-dots/shell) users:** set `color_scheme = caelestia`. The shell rewrites the colors on every scheme change and the theme follows, light/dark included.

## Status

| | |
|---|---|
| Linux, Spotify 1.2.96 | Built and tested here |
| Windows, Spotify 1.3.1 | Tested ([#3](https://github.com/iaguito22/spicetify-caelestia/issues/3)) |
| macOS | Untested |

Spotify renames its CSS classes between versions; lyrics and side panels break first. If something looks off, open an issue with a screenshot.

MIT license.

---

## En español

Tema de [Spicetify](https://spicetify.app) (hace falta tenerlo instalado): paneles flotantes como islas y **el único color sale de la portada que suena**. Fondo con la portada difuminada, acento sacado de sus colores, letra sincronizada con el reloj de la canción y animada palabra a palabra. Instalación: los comandos de arriba. Probado en Linux (1.2.96) y Windows (1.3.1).
