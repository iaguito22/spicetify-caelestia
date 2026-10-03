# Caelestia for Spicetify

A Spotify theme where the panels float as rounded islands and **the only color comes from the song that's playing**.

> [!IMPORTANT]
> This is a theme for **[Spicetify](https://spicetify.app)**, not a standalone app. Install Spicetify first and run `spicetify apply` once; then install the theme below.

*[Leer en español ↓](#-en-español)*

## Design

- **Islands.** Library, main view and right panel float over the background with concentric corners (28 → 16 → 8 px). The top bar is three pills: navigation, search, profile. The player is a floating glass dock.
- **The cover is the palette.** Everything else is neutral gray, so the album art sets the mood: it fills the background (blurred) and tints the accent.
- **Less chrome.** No scrollbars, no focus rings, no boxes around lists. Buttons that aren't needed all the time appear on hover.

![Artist page](screenshots/artist.png)

## How the dynamic accent works

When a song starts, the cover is drawn into a tiny 24×24 canvas. Each colored pixel votes for its hue, weighted by how saturated it is; grays, blacks and whites don't vote. The winning hue is clamped in saturation and lightness so it always reads against the background, and it fades in over ~1.4 s. Grayscale covers fall back to the scheme's own accent.

That color drives the play button, progress bar, active lyric, highlights and the tint of the glass.

![Playlist tinted by its cover](screenshots/playlist.png)

## How the lyrics work

- **On time.** Spotify highlights each line 0.1–0.9 s late. The theme ignores that and follows the song's clock, so each line lights up when it's sung.
- **Word by word.** Best timing source first:
  1. Real word timings from Netease, split into approximate syllables. *This sends the song title and artist to Spicetify's public CORS proxy.*
  2. Spotify's own syllable timings, when it provides them.
  3. Otherwise an estimate: words move at a singing pace and the last one is held until the next line, since singers usually stretch it.
- **Motion.** The word being sung lifts slightly; lines fade by distance, and the view scrolls smoothly to the current line.

![Lyrics, filling word by word](screenshots/lyrics.png)

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

<br>

---
---

<br>

# 🇪🇸 En español

Un tema para Spotify con los paneles flotando como islas redondeadas, en el que **el único color lo pone la canción que está sonando**.

> [!IMPORTANT]
> Esto es un tema para **[Spicetify](https://spicetify.app)**, no una aplicación aparte. Primero instala Spicetify y ejecuta `spicetify apply` una vez; luego instala el tema siguiendo los pasos de abajo.

## Diseño

- **Islas.** La biblioteca, la vista principal y el panel derecho flotan sobre el fondo, con esquinas concéntricas (28 → 16 → 8 px). Arriba hay tres píldoras: navegación, búsqueda y perfil. El reproductor es un dock de cristal que flota sobre todo lo demás.
- **La portada manda.** El resto de la interfaz es gris neutro, así que es la carátula la que pone el ambiente: ocupa el fondo, desenfocada, y de ella sale el color de acento.
- **Nada que sobre.** Sin barras de scroll, sin contornos de foco y sin recuadros alrededor de las listas. Los botones que no se usan todo el rato aparecen al pasar el ratón por encima.

![Página de artista](screenshots/artist.png)

## Cómo se elige el color de acento

Al empezar cada canción, la portada se pinta en un lienzo diminuto de 24×24 píxeles. Cada píxel con color vota por su tono, y cuanto más saturado está, más pesa su voto; los grises, los negros y los blancos no cuentan. Al tono ganador se le ajustan la saturación y la luminosidad para que siempre se vea bien sobre el fondo, y entra con una transición de 1,4 s más o menos. Si la portada es en blanco y negro, se usa el acento del propio esquema de colores.

Ese color es el del botón de reproducir, la barra de progreso, la línea de la letra que se está cantando, los resaltados y el tinte del cristal.

![Playlist teñida con el color de su portada](screenshots/playlist.png)

## Cómo funciona la letra

- **Sincronizada de verdad.** Spotify marca cada línea con entre 0,1 y 0,9 s de retraso. El tema no le hace caso y se guía por el tiempo de la canción, así que cada línea se ilumina justo cuando se canta.
- **Palabra a palabra.** Usa la mejor fuente de tiempos que encuentre, por este orden:
  1. Los tiempos reales de cada palabra que da Netease, divididos en sílabas aproximadas. *Para eso se envían el título y el artista de la canción al proxy CORS público de Spicetify.*
  2. Los tiempos por sílaba de Spotify, cuando los tiene.
  3. Si no hay ninguno, los calcula: las palabras avanzan al ritmo normal del canto y la última se alarga hasta la línea siguiente, porque es la que los cantantes suelen estirar.
- **Animación.** La palabra que se está cantando se eleva un poco, las líneas se van apagando cuanto más lejos están, y la vista se desplaza con suavidad hasta la línea actual.

![Letra iluminándose palabra a palabra](screenshots/lyrics.png)

## Instalación

**Linux / macOS**
```bash
git clone https://github.com/iaguito22/spicetify-caelestia
cd spicetify-caelestia
./install.sh
```

**Windows** (en PowerShell; no necesitas git)
```powershell
iwr -useb https://raw.githubusercontent.com/iaguito22/spicetify-caelestia/main/install.ps1 | iex
```
También puedes descargar el ZIP (Code → Download ZIP) y abrir `install.bat` con doble clic.

Se instala en modo oscuro. Si lo prefieres claro: `spicetify config color_scheme light` y luego `spicetify apply`.

**Si usas [Caelestia shell](https://github.com/caelestia-dots/shell):** pon `color_scheme = caelestia`. El shell reescribe los colores cada vez que cambias de esquema y el tema se adapta solo, también al pasar de claro a oscuro.

## Estado

| | |
|---|---|
| Linux, Spotify 1.2.96 | Desarrollado y probado aquí |
| Windows, Spotify 1.3.1 | Probado ([#3](https://github.com/iaguito22/spicetify-caelestia/issues/3)) |
| macOS | Sin probar |

Spotify cambia los nombres de sus clases CSS de una versión a otra, y lo primero que suele romperse es la letra y los paneles laterales. Si ves algo raro, abre un issue con una captura.

Licencia MIT.
