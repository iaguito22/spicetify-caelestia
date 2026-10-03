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
  3. Otherwise an estimate: words move at a singing pace and the last one is held until the next line, since singers usually stretch it.
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

Un tema de Spotify en el que los paneles flotan como islas redondeadas y **el único color sale de la canción que suena**.

> [!IMPORTANT]
> Es un tema para **[Spicetify](https://spicetify.app)**, no una aplicación independiente. Instala primero Spicetify y ejecuta `spicetify apply` una vez; después instala el tema como se explica abajo.

### Diseño

- **Islas.** La biblioteca, la vista central y el panel derecho flotan sobre el fondo con esquinas concéntricas (28 → 16 → 8 px). La barra superior son tres píldoras: navegación, búsqueda y perfil. El reproductor es un dock de cristal flotante.
- **La portada es la paleta.** Todo lo demás es gris neutro, así que la carátula marca el ambiente: llena el fondo (difuminada) y tiñe el acento.
- **Menos adornos.** Sin barras de desplazamiento, sin anillos de foco y sin cajas alrededor de las listas. Los botones que no hacen falta siempre aparecen al pasar el ratón.

### Cómo funciona el acento dinámico

Cuando empieza una canción, la portada se dibuja en un lienzo diminuto de 24×24. Cada píxel con color vota por su tono, con más peso cuanto más saturado está; los grises, negros y blancos no votan. El tono ganador se limita en saturación y luminosidad para que siempre se lea sobre el fondo, y aparece con un fundido de ~1,4 s. Las portadas en escala de grises usan el acento del propio esquema.

Ese color mueve el botón de reproducir, la barra de progreso, la línea activa de la letra, los resaltados y el tinte del cristal.

### Cómo funciona la letra

- **A tiempo.** Spotify resalta cada línea entre 0,1 y 0,9 s tarde. El tema lo ignora y sigue el reloj de la canción, así que cada línea se enciende cuando se canta.
- **Palabra a palabra.** Primero la mejor fuente de tiempos:
  1. Tiempos reales por palabra de Netease, partidos en sílabas aproximadas. *Esto envía el título y el artista de la canción al proxy CORS público de Spicetify.*
  2. Los tiempos por sílaba de Spotify, cuando los da.
  3. Si no, una estimación: las palabras van a ritmo de canto y la última se alarga hasta la línea siguiente, porque los cantantes suelen estirarla.
- **Movimiento.** La palabra que se canta se eleva un poco; las líneas se apagan según su distancia y la vista se desplaza suavemente hasta la línea actual.

### Instalación

**Linux / macOS**
```bash
git clone https://github.com/iaguito22/spicetify-caelestia
cd spicetify-caelestia
./install.sh
```

**Windows** (PowerShell, no hace falta git)
```powershell
iwr -useb https://raw.githubusercontent.com/iaguito22/spicetify-caelestia/main/install.ps1 | iex
```
O descarga el ZIP (Code → Download ZIP) y haz doble clic en `install.bat`.

Se instala en modo oscuro. Para el claro: `spicetify config color_scheme light` y después `spicetify apply`.

**Usuarios de [Caelestia shell](https://github.com/caelestia-dots/shell):** poned `color_scheme = caelestia`. El shell reescribe los colores en cada cambio de esquema y el tema lo sigue, claro/oscuro incluido.

### Estado

| | |
|---|---|
| Linux, Spotify 1.2.96 | Hecho y probado aquí |
| Windows, Spotify 1.3.1 | Probado ([#3](https://github.com/iaguito22/spicetify-caelestia/issues/3)) |
| macOS | Sin probar |

Spotify renombra sus clases CSS entre versiones; lo primero que se rompe es la letra y los paneles laterales. Si algo se ve mal, abre un issue con una captura.

Licencia MIT.
