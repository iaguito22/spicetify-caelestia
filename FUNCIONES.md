# Funciones del tema: todo lo que cambia respecto a Spotify

Lista completa de lo que el tema hace distinto de Spotify, para que **no se pierda nada al actualizar
Spotify** (o al tocar el código). Úsala como lista de comprobación: tras una actualización, recorre cada
apartado y mira la columna «Cómo comprobarlo».

- **Dónde**: sección de `caelestia/user.css` (buscar `   N. `) o función de `caelestia/theme.js`
  (buscar `// ---- `).
- Si algo falla en Spotify 1.3+ (Windows), lo normal es que falte un **alias** de clase: ver
  `MANTENIMIENTO.md`, sección 4.

---

## 1. Aspecto general

| Función | Dónde | Cómo comprobarlo |
|---|---|---|
| Paneles como **islas flotantes** redondeadas (radio 28) con 16 px de hueco entre ellas | CSS 1, 2 | Los tres paneles se ven separados, con esquinas curvas |
| **Fondo con la carátula** de la canción, desenfocada, con viñeta hacia los bordes; cambia con un fundido al cambiar de canción | CSS 1 · `ensureBackdrop`, `update` | Cambiar de canción: el fondo cambia suave |
| **Acento = color dominante de la carátula** (`--cs-accent`, animado): play, progreso, letra activa, resaltados | CSS 0 · `pickAccent`, `setAccent` | Una portada roja tiñe el play y la barra de rojo; una casi gris deja el acento gris (por diseño) |
| Color de **selección de texto** con el acento (lo escribe el JS, no el CSS: con `var()` encarecía cada layout un 25 %) | `setAccent` (`<style id=cs-selection>`) | Seleccionar texto: fondo teñido del acento |
| Mismo **velo del acento** en los tres paneles | CSS 13 | Los paneles laterales llevan el mismo tinte que el central |
| **Sin barras de scroll** (rueda y arrastre siguen funcionando) | CSS 0, 9 | No se ven barras en ninguna lista |
| **Sin anillos de foco** (ni el amarillo ni halos) | CSS 9 | Clic en un botón: no queda aro |
| Sin **fondos dobles**: los botones dentro de una píldora o panel no llevan caja | CSS 12 | |
| **Menús contextuales y tooltips** de cristal redondeado | CSS 8, 13 | Clic derecho en una canción |
| **Avisos** (notistack) separados del borde y con cristal | CSS 13 | |
| **Modo claro**: textos que Spotify fija en blanco sobre foto se corrigen | CSS 17 · `syncMode` (`data-cs-mode`) | `caelestia scheme set -m light` |
| Esquema de colores de **Caelestia** (`color.ini` lo regenera el shell; el CSS solo usa `--spice-*`) | `color.ini` | Cambiar de esquema en el shell |
| **Controles de ventana** según el sistema (Windows: hueco para minimizar/cerrar; macOS: semáforo) | CSS 18 · `data-cs-os` | |
| Si otro tema mete colores por JS (Marketplace, Default Dynamic), se **retiran** y se avisa en consola | `evictForeign` | |

## 2. Barra superior

| Función | Dónde | Cómo comprobarlo |
|---|---|---|
| **Tres píldoras sueltas** (navegación, búsqueda centrada en la ventana, perfil), sin barra | CSS 10 | |
| Hueco a la izquierda para los **«···» nativos** de la ventana (no se pueden quitar desde el tema) | CSS 13 | Los tres puntos no pisan la píldora |
| La **X de borrar** la búsqueda solo aparece si hay texto | CSS 13 · `tagSearchEmpty` (`data-cs-empty`) | Escribir y borrar en el buscador |
| **Desplegable de búsqueda** de cristal que nace de la píldora y **se pliega hacia ella** al cerrarse | CSS 10 · `searchGhost` | Abrir y cerrar el buscador |

## 3. Dock (reproductor)

| Función | Dónde | Cómo comprobarlo |
|---|---|---|
| **Dock flotante** de cristal *liquid glass* (tinte, filo y brillo del acento), concéntrico con el panel central | CSS 11, 14, 15 | |
| **Progreso = borde inferior** del dock, fino; los tiempos salen al pasar el ratón | CSS 11, 15 | |
| Carátula del dock 60×60 con un solo radio | CSS 21 | |
| Solo título y artista (sin las líneas extra de versiones nuevas), sin mini-reproductor ni «Audio sin pérdida» | CSS 11, 13 | |
| En ventanas estrechas el dock **conserva su tamaño y flota** sobre los paneles | `dockLayout` (`data-cs-dock-float`) | Estrechar la ventana |
| **«Reproduciendo en …»**: en vez de la franja azul, etiqueta compacta «● dispositivo» junto a los controles | CSS 22 · `data-dev` | Reproducir en el móvil |

## 4. Paneles laterales

| Función | Dónde | Cómo comprobarlo |
|---|---|---|
| **Animación al abrir/cerrar/contraer** un panel (el panel se desliza de verdad) — solo Spotify < 1.3.2 (en 1.3.2+ cerraba la app, issue #7) | CSS 10 · `watchSides` (`data-cs-anim`) | Contraer la biblioteca |
| **Biblioteca contraída**: columna de iconos centrada de 72 px | CSS 20 · `data-cs-lib-min` | |
| **Asas en el hueco entre paneles**: todo el hueco sirve para cambiar el ancho; al pasar el ratón sale una **píldora vertical** | CSS 28 · `gapEl`, `gapPlace`, `liveDrag` | Pasar el ratón por el hueco y arrastrar |
| Cambio de ancho **en vivo**, sin el salto inicial (el ratón está en el hueco, no en el borde); va igual o algo mejor que sin el tema | `liveDrag` | Arrastrar el hueco y la barra original |
| La barra original de Spotify sin la **línea** que pinta al pasar el ratón | CSS 10 | |
| Al arrastrar, las secciones de Inicio que no se ven no se recolocan | `dragSkip` · CSS 27 (`data-cs-skip`) | |
| Doble clic en el hueco = doble clic en la barra de Spotify | `gapEl` | |

## 5. Listas, playlists, álbumes, Inicio

| Función | Dónde | Cómo comprobarlo |
|---|---|---|
| **Playlist/álbum en una sola superficie**: sin cajas, velo del acento en el panel, controles subidos a la cabecera bajo el título | CSS 5 · `tagHas` (`data-cs-entity`) | Abrir una playlist |
| Play siempre de 56 px alineado con la portada; se aclara con el acento al pasar el ratón | CSS 5 | |
| Sin «···» de la fila de acciones ni «Descubrir» | CSS 5 | |
| **Filas tipo IDE**: hover con borde suave, marca de la fila activa sin desplazar el contenido (también en la biblioteca) | CSS 6 | |
| Cabecera de columnas de **cristal solo cuando está pegada** arriba; título fijo y cabecera forman una barra | CSS 13 · `syncStuck` (`data-cs-stuck`) | Hacer scroll en una playlist |
| «Fecha en la que se añadió» → **«Añadido»** | `relabel` | |
| Chips de playlists propias (Añadir / Mezcla / Nombre) alineados bajo el play | CSS 23+ | Abrir una playlist tuya |
| Anillo verde fijo del play en listas mezcladas → gris; separador doble «• •» oculto | CSS 23+ | |
| **Animación al cambiar de página**: la página entra deslizándose cuando Spotify ya la ha montado | CSS 23 · `onRoute`/`onMount` (`data-cs-in`) | Ir de una playlist a otra |
| Degradado de Inicio y su cabecera fija quitados (1.3) | CSS 5 · `data-cs-home` | |
| Barra de chips de Inicio pegada arriba | CSS 13 | |
| Cabeceras con foto (artista) que se desvanecen hacia abajo | CSS 13 | Abrir un artista |
| **Marketplace**: pestañas en píldora, cabecera de cristal, tarjetas concéntricas | CSS 19 | |

## 6. Panel derecho (Sonando)

| Función | Dónde | Cómo comprobarlo |
|---|---|---|
| Panel translúcido; con **Canvas/vídeo** la cabecera flota sobre él con degradado | CSS 3, 23+ | Canción con Canvas |
| Velo oscuro de Spotify sobre el Canvas aligerado (se veía oscurísimo) | CSS 23+ | |
| Sin las líneas duras donde acababan los degradados opacos de Spotify | CSS 23+ | |
| Título de «Sonando» en una línea con «…» y todo el ancho; botones de la cabecera solo al pasar el ratón | CSS 22 | |
| Spinner oculto de Spotify que giraba siempre, parado | CSS 23+ | |

## 7. Letra

| Función | Dónde | Cómo comprobarlo |
|---|---|---|
| Sin la caja de color de Spotify; **tipografía grande**, línea activa con el acento, las demás apagadas según la distancia | CSS 16 | Abrir la letra |
| **Letra guiada por el reloj** de la canción (Spotify marca la activa hasta 1 s tarde) | `lyricsTick`, `clockSetup` (`data-cs-clock`, `data-cs-d`) | La línea se enciende justo al cantarse |
| **Palabra a palabra** y **letra a letra** con tiempos reales (lyricsplus → Apple Music; Netease de reserva) o estimados | `lyricsPlusWords`, `neteaseWords`, `buildLine` | |
| Cada letra **sube y crece** al cantarse; relevo entre frases sin hueco | CSS 16 | |
| **Scroll suave** propio de la letra (en la GPU), en el mismo tiempo que el cambio de frase | `smoothCenter` | |
| **Coros** (lo que va entre paréntesis) en su propia fila, más pequeños, con sus tiempos; siguen encendidos mientras suenan | `bvText`, `bvEnd` · CSS 16 | Canción con coros |
| **Romanización** de japonés, chino, coreano (Google) y cirílico (tabla local), rellenándose con la voz | `romanize`, `romLine` · CSS 16 | Canción en coreano/japonés |
| Entrada de la letra en cascada; cierre animado; el botón de cerrar vuelve a la última página | CSS 16 · `lyricsBack`, `closeLyrics` | |
| Botón **«Sincronizar»** de cristal por encima del dock | CSS 25 | Desplazar la letra a mano |
| Letra en Spotify 1.3 (clases ofuscadas): se reconoce por la forma y se etiqueta | `tagLyrics13` | |
| **Clic derecho sobre la letra** (en ventana y a pantalla completa): Romanización, **Traducción** (al idioma de Spotify), Coros, **Tamaño** (5 pasos), **Sincronía** ±0,25 s por canción, Copiar letra | CSS 26 · `lyrMenuFill`, `translate`, `OPT` (localStorage `cs-lyrics-opts`) | Clic derecho en la letra |

## 8. Pantalla completa con letra

| Función | Dónde | Cómo comprobarlo |
|---|---|---|
| La letra ocupa la pantalla sobre el fondo de la carátula, con **portada, título, artista y barra de progreso** a la izquierda | CSS 25 · `fsLyrics`, `fsArt`, `fsProg` | Letra abierta + botón de pantalla completa del dock |
| Sin letra disponible: portada, título y barra centrados | `fsNoLyrics` (`data-cs-fsnolyr`) | |
| La portada **late con los beats** | `fsBeatLoad`, `fsBeatTick` | |
| **Transición**: la carátula vuela (FLIP) del dock al centro y a su sitio, bajo un velo | `fsVeil`, `flyCover` | Entrar y salir |
| En reposo se esconden el dock y el cursor | CSS 25 (`data-cs-idle`) | No mover el ratón 3 s |

## 9. Vista cine («Sonando» a pantalla completa, sin letra)

| Función | Dónde | Cómo comprobarlo |
|---|---|---|
| **Isla de cristal** como el resto (Spotify la pinta opaca), con las cuatro esquinas curvas a 16 px de los bordes | CSS 24 | Botón de pantalla completa del dock |
| **Portada grande centrada** con título y artista debajo | CSS 24 · `cineTitle` (`data-cs-cinebox`) | |
| **Barra de progreso** bajo el título, con el ancho de la portada (solo a pantalla completa) | `cineProg` | |
| **Inclinación 3D** de la portada hacia el ratón, con brillo | CSS 25 · `tiltApply` | |
| **Modo ambiente** con Canvas: los colores del vídeo alrededor (como YouTube) | CSS 23+ · `ambient` | Canción con Canvas |
| Vídeo (videoclip) redondeado, sin bandas, centrado; ventana y pantalla completa | CSS 24 | «Cambiar a vídeo» |
| Con **Canvas**: miniatura y título abajo a la izquierda (en reposo), con barra y tiempos debajo | CSS 24 · `cineTitle` (`data-mode="canvas"`) | Canción con Canvas, sin mover el ratón |
| **Clic derecho, con portada**: Título y artista, Barra de progreso, Tiempos, Inclinación, Tamaño de portada (4) | `cineMenuFill` · `OPT.cine` | Clic derecho en la vista |
| **Clic derecho, con Canvas** (configuración **independiente**, también el tamaño): Título y artista, Barra, Tiempos, **Barra centrada** (abajo en el centro), Inclinación, Tamaño (Pequeño / Normal / Grande; Grande ocupa casi toda la altura y no admite la barra centrada) | `cineMenuFill`, `cineCenterBar` · `OPT.canvas` | Clic derecho con Canvas |
| Arreglos de estados atascados de Spotify (vista que se reabre sola al quitar la letra, panel central oculto tras salir, dock que no vuelve) | `cineReopened`, `cineUnstick`, `cineWake`, `cineSkip` | |
| Botones de letra y salir a pantalla completa arriba repiten los del dock | `cineDup` | |

## 10. Rendimiento (no se ve, pero se nota)

| Función | Dónde |
|---|---|
| Nada de `X:has(…) Y` (con el `:has` fuera del sujeto): cada uno recalculaba media página con cualquier cambio. Se sustituyen por atributos que pone el JS | `tagHas`, `markAll`, `lyrNoClock` |
| `content-visibility` en la lista de la biblioteca y el panel derecho (no se recalculan con cada frase de la letra) | CSS 27 |
| Sin el `will-change` de Spotify en imágenes, botones y rejillas del buscador (cientos de capas: cualquier animación recolocaba todas) | CSS 27 |
| El bucle de la letra en pausa mira 4 veces por segundo en vez de 120 | `lyricsTick` |
| Los ResizeObserver usan el tamaño que reciben, sin volver a medir (arranque más rápido) | `dockLayout`, `watchSides` |
| `::selection` sin `var()` (lo escribe el JS) | `setAccent` |
| La animación de cambio de página arranca cuando la página ya está montada | `onMount` |
| La letra solo escribe animaciones CSS al trocear la línea, nunca en cada fotograma | `buildLine` |

## 11. Spotify 1.3+ (Windows)

Spotify 1.3.2+ ofusca muchas clases. El tema **les vuelve a poner las de 1.2** (alias) para que el CSS
funcione igual: `tagRootLayout`, `INNER_ALIASES`/`tagInner`, `tagTrackList`, `tagLyrics13`, `tagCine`.
Solo se aplican si `needAliases()` (versión ≥ 1.3.2). Ver `MANTENIMIENTO.md`.

---

### Al añadir una función

Añádela aquí, en su apartado, con dónde está y cómo comprobarla.
