



# Caelestia for Spicetify

A Spotify theme where the panels float as rounded islands and **the only color comes from the song that's playing**.

> [!IMPORTANT]
> This is a theme for **[Spicetify](https://spicetify.app)**, not a standalone app. Install Spicetify first and run `spicetify apply` once; then install the theme below.

*[Leer en español ↓](#-en-español)*


https://github.com/user-attachments/assets/fe99c5d0-3b18-4ddb-965a-6d041ead1b8b


## What changes compared to Spotify

**Look**
- The panels float as rounded islands over the blurred cover of the song that's playing.
- The only color is the song's: the play button, progress bar, current lyric and highlights take the main color of the cover, and change with every song.
- The player is a floating liquid glass dock, and the top bar is three pills: navigation, search and profile.
- No scrollbars, focus outlines or boxes around lists. Buttons you don't need all the time show up on hover.
- Light and dark mode. With [Caelestia shell](https://github.com/caelestia-dots/shell), it follows the shell's colors.

<p align="center">
  <img src="screenshots/home.webp" width="49%" alt="Home">
  <img src="screenshots/artist.webp" width="49%" alt="Artist page">
</p>

![Playlist, with the accent taken from the song playing](screenshots/playlist.webp)

**Lyrics**
- Each line lights up right when it's sung (Spotify's are up to a second late).
- Word by word, and letter by letter on many songs.
- Backing vocals go on their own smaller line under the main vocal, and stay lit for as long as they're sung.
- Japanese, Chinese, Korean and Cyrillic lyrics show their romanization under each line.

<p align="center">
  <img src="screenshots/demo-lyrics.webp" width="35%" alt="Karaoke lyrics: Korean line with its romanization and the backing vocals underneath">
  <img src="screenshots/lyrics-romanization.webp" width="63%" alt="Japanese lyrics with romanization">
</p>

**Fullscreen**
- With the lyrics open, fullscreen shows them across the whole screen over the blurred cover, with the artwork, title and progress on the left. Songs without lyrics show the artwork centered.
- The artwork pulses to the beat and tilts towards the mouse. The player and cursor hide when the mouse stops.
- Entering and leaving, the artwork flies between the player and the screen.
- Ambient mode: around a Canvas or music video, the background takes on its colors, like YouTube's.

![Ambient mode around a music video](screenshots/demo-ambient.webp)

> [!NOTE]
> For word timings and romanization, the song's title, artist, album and duration are sent to lyricsplus and Netease, and the lyric lines to Google Translate.

> [!TIP]
> The theme already has its own synced, word-by-word lyrics. If you use a lyrics extension or custom app (like lyrics-plus or Beautiful Lyrics), you can remove it.

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

**White background, fixed green text or a moon button?** Another theme from Marketplace (e.g. *Default Dynamic*) is still installed and paints its own colors over these. The theme removes them, but uninstall it anyway: Marketplace → Installed → Remove.

**[Caelestia shell](https://github.com/caelestia-dots/shell) users:** set `color_scheme = caelestia`. The shell rewrites the colors on every scheme change and the theme follows, light/dark included.

## Status

| | |
|---|---|
| Linux, Spotify 1.2.96 | Built and tested here |
| Windows, Spotify 1.3.1 | Tested ([#3](https://github.com/iaguito22/spicetify-caelestia/issues/3)) |
| Windows, Spotify 1.3.3 | Supported, being tested ([#6](https://github.com/iaguito22/spicetify-caelestia/issues/6), [#10](https://github.com/iaguito22/spicetify-caelestia/issues/10)) |
| macOS | Untested |

Spotify renames its CSS classes between versions; lyrics and side panels break first. If something looks off, open an issue with a screenshot.

MIT license.

<br>

---
---

<br>

# 🇪🇸 En español

Un tema para Spotify con los paneles flotando como islas redondeadas, en el que **el único color lo pone la canción que está sonando**.


https://github.com/user-attachments/assets/fe99c5d0-3b18-4ddb-965a-6d041ead1b8b


> [!IMPORTANT]
> Esto es un tema para **[Spicetify](https://spicetify.app)**, no una aplicación aparte. Primero instala Spicetify y ejecuta `spicetify apply` una vez; luego instala el tema siguiendo los pasos de abajo.

## Qué cambia respecto a Spotify

**Aspecto**
- Los paneles flotan como islas redondeadas sobre la portada difuminada de la canción que suena.
- El único color es el de la canción: el botón de reproducir, la barra de progreso, la línea de la letra que se canta y los resaltados toman el color principal de la portada, y cambian con cada canción.
- El reproductor es un dock de liquid glass flotante, y la barra de arriba son tres píldoras: navegación, búsqueda y perfil.
- Sin barras de scroll, sin contornos de foco y sin recuadros alrededor de las listas. Los botones que no se usan todo el rato aparecen al pasar el ratón.
- Modo claro y oscuro. Con [Caelestia shell](https://github.com/caelestia-dots/shell), sigue los colores del shell.

<p align="center">
  <img src="screenshots/home.webp" width="49%" alt="Inicio">
  <img src="screenshots/artist.webp" width="49%" alt="Página de artista">
</p>

![Playlist, con el acento sacado de la canción que suena](screenshots/playlist.webp)

**Letra**
- Cada línea se ilumina justo cuando se canta (la de Spotify va hasta un segundo tarde).
- Palabra a palabra, y letra a letra en muchas canciones.
- Los coros van en su propia fila, más pequeña, debajo de la voz, y siguen encendidos mientras suenan.
- Las letras en japonés, chino, coreano y cirílico llevan su romanización debajo de cada línea.

<p align="center">
  <img src="screenshots/demo-lyrics.webp" width="35%" alt="Letra karaoke: línea en coreano con su romanización y los coros debajo">
  <img src="screenshots/lyrics-romanization.webp" width="63%" alt="Letra en japonés con romanización">
</p>

**Pantalla completa**
- Con la letra abierta, la pantalla completa la muestra a toda pantalla sobre la portada difuminada, con la carátula, el título y el progreso a la izquierda. Si la canción no tiene letra, la carátula sale centrada.
- La carátula late con los beats y se inclina hacia el ratón. El reproductor y el cursor se esconden cuando dejas de mover el ratón.
- Al entrar y al salir, la carátula vuela entre el reproductor y la pantalla.
- Modo ambiente: alrededor de un Canvas o un videoclip, el fondo toma sus colores, como en YouTube.

![Modo ambiente alrededor de un videoclip](screenshots/demo-ambient.webp)

> [!NOTE]
> Para los tiempos por palabra y la romanización, se envían el título, el artista, el álbum y la duración de la canción a lyricsplus y Netease, y las líneas de la letra a Google Translate.

> [!TIP]
> El tema ya trae su propia letra sincronizada palabra a palabra. Si usas alguna extensión o app de letras (como lyrics-plus o Beautiful Lyrics), puedes quitarla.

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

**¿Fondo blanco, texto verde fijo o un botón de luna?** Sigue instalado otro tema de Marketplace (p. ej. *Default Dynamic*) que pinta sus colores encima. El tema los quita, pero desinstálalo igualmente: Marketplace → Instalados → Eliminar.

**Si usas [Caelestia shell](https://github.com/caelestia-dots/shell):** pon `color_scheme = caelestia`. El shell reescribe los colores cada vez que cambias de esquema y el tema se adapta solo, también al pasar de claro a oscuro.

## Estado

| | |
|---|---|
| Linux, Spotify 1.2.96 | Desarrollado y probado aquí |
| Windows, Spotify 1.3.1 | Probado ([#3](https://github.com/iaguito22/spicetify-caelestia/issues/3)) |
| Windows, Spotify 1.3.3 | Compatible, en pruebas ([#6](https://github.com/iaguito22/spicetify-caelestia/issues/6), [#10](https://github.com/iaguito22/spicetify-caelestia/issues/10)) |
| macOS | Sin probar |

Spotify cambia los nombres de sus clases CSS de una versión a otra, y lo primero que suele romperse es la letra y los paneles laterales. Si ves algo raro, abre un issue con una captura.

Licencia MIT.
