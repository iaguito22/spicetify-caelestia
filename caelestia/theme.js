(function CaelestiaDynamicBackdrop() {
    const FADE_MS = 1200;
    let root = null;
    let layers = [];      // dos capas alternas: la visible y la que entra
    let active = 0;
    let lastSrc = "";
    let token = 0;        // descarta cargas obsoletas si cambia la canción rápido
    let baseAccent = null; // el botón del esquema de Caelestia: vuelve a él si la portada es gris

    function ensureBackdrop() {
        root = root && root.isConnected ? root : null;
        if (root) return root;
        const host = document.querySelector(".Root__top-container");
        if (!host) return null;
        root = document.getElementById("caelestia-dynamic-bg");
        if (!root) {
            root = document.createElement("div");
            root.id = "caelestia-dynamic-bg";
            root.innerHTML = `
                <div class="caelestia-bg-image"></div>
                <div class="caelestia-bg-image"></div>
                <div class="caelestia-bg-overlay"></div>`;
            host.prepend(root);
        }
        layers = [...root.querySelectorAll(".caelestia-bg-image")];
        lastSrc = "";
        return root;
    }

    // Marca el modo claro/oscuro a partir del fondo real que pone Caelestia
    // (no de prefers-color-scheme, que no sigue al esquema del shell).
    function syncMode() {
        const rgb = getComputedStyle(document.documentElement)
            .getPropertyValue("--spice-rgb-main").split(",").map(Number);
        if (rgb.length < 3 || rgb.some(Number.isNaN)) return;
        const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
        document.documentElement.dataset.csMode = lum > 0.55 ? "light" : "dark";
    }

    // Color dominante de la carátula: matiz medio ponderado por saturación, con
    // saturación y luminosidad acotadas para que siempre contraste con el fondo.
    function pickAccent(img) {
        const N = 24;
        const cv = document.createElement("canvas");
        cv.width = cv.height = N;
        const cx = cv.getContext("2d", { willReadFrequently: true });
        cx.drawImage(img, 0, 0, N, N);
        const px = cx.getImageData(0, 0, N, N).data;
        let sx = 0, sy = 0, sat = 0, w = 0;
        for (let i = 0; i < px.length; i += 4) {
            const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
            const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
            if (d < 0.08 || l < 0.1 || l > 0.93) continue; // grises, negros y blancos no cuentan
            const s = d / (1 - Math.abs(2 * l - 1));
            let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
            h *= Math.PI / 3;
            const wt = s * s * (1 - Math.abs(2 * l - 1));
            sx += Math.cos(h) * wt; sy += Math.sin(h) * wt; sat += s * wt; w += wt;
        }
        if (w < N * N * 0.02) return null; // portada casi en escala de grises
        const hue = ((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360;
        const s = Math.min(0.85, Math.max(0.5, (sat / w) * 1.15));
        const light = document.documentElement.dataset.csMode === "light";
        return `hsl(${hue.toFixed(0)} ${(s * 100).toFixed(0)}% ${light ? 40 : 70}%)`;
    }

    function setAccent(color) {
        document.documentElement.style.setProperty("--cs-accent", color || baseAccent);
    }

    function coverUrl(track) {
        const m = track && track.metadata;
        if (!m) return null;
        // image_url (300px) basta: se desenfoca 60px y pesa menos que xlarge
        const uri = m.image_url || m.image_large_url || m.image_xlarge_url;
        if (!uri) return null;
        if (uri.startsWith("spotify:image:")) return "https://i.scdn.co/image/" + uri.slice(14);
        return uri.startsWith("http") ? uri : null; // spotify:localfileimage etc. → sin fondo
    }

    function update() {
        if (!ensureBackdrop()) return;
        const src = coverUrl(Spicetify.Player.data && Spicetify.Player.data.item);
        if (src === lastSrc) return;
        lastSrc = src || "";
        const mine = ++token;

        if (!src) { layers.forEach(l => l.classList.remove("is-on")); setAccent(null); return; }

        // Precarga: el fundido empieza cuando la imagen ya está decodificada.
        // Con CORS para poder leer los píxeles; si el CDN lo niega, se carga sin él.
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onerror = () => {
            if (img.crossOrigin && mine === token) { img.crossOrigin = null; img.src = src; setAccent(null); }
        };
        img.onload = () => {
            if (mine !== token) return;
            if (img.crossOrigin) { try { setAccent(pickAccent(img)); } catch (e) { setAccent(null); } }
            const next = layers[1 - active];
            const prev = layers[active];
            next.style.backgroundImage = `url("${src}")`;
            requestAnimationFrame(() => {
                next.classList.add("is-on");
                setTimeout(() => { if (mine === token) prev.classList.remove("is-on"); }, FADE_MS);
                active = 1 - active;
            });
        };
        img.src = src;
    }

    // "Fecha en la que se añadió" no cabe en su columna: se acorta a "Añadido"
    let relabelQueued = false;
    function relabel() {
        relabelQueued = false;
        document.querySelectorAll(".main-trackList-trackListHeaderRow span, .main-trackList-trackListHeaderRow button").forEach((el) => {
            if (el.children.length === 0 && /^Fecha en la que se a[ñn]adi/i.test(el.textContent.trim())) el.textContent = "Añadido";
        });
    }
    function queueRelabel() {
        if (relabelQueued) return;
        relabelQueued = true;
        setTimeout(relabel, 150);
    }

    // ---- Letra palabra a palabra -------------------------------------------
    // Spotify solo sincroniza por líneas. Se intenta, por este orden:
    //  1. tiempos reales por palabra de lyricsplus (Apple Music) o, si no, de
    //     Netease (proxy CORS de Spicetify), con cada palabra partida en letras;
    //  2. sílabas de Spotify (`syllables`), si algún día las envía;
    //  3. el tiempo de la línea repartido entre sus palabras según su longitud;
    //  4. sin tiempos, la letra normal de Spotify.
    const lyr = { id: "", lines: null, rom: null };
    const lyrCache = new Map();
    let lyrRaf = 0;

    // ---- Desplazamiento suave de la letra --------------------------------------
    // Spotify centra la frase activa con scrollIntoView({behavior:"smooth"}): dura ~150 ms y
    // se ve como un salto. Aquí se sustituye, solo para las frases, por una animación propia
    // que arranca en el acto y frena suave, en el mismo tiempo y curva que el resaltado de
    // la frase (CSS): la nueva llega al centro mientras se enciende y la vista no se mueve.
    // (Antes arrancaba despacio y duraba más: la vista saltaba a la línea de abajo y luego
    // el scroll se la llevaba hacia arriba.)
    const nativeSIV = Element.prototype.scrollIntoView;
    let lyrScroll = { raf: 0, anim: null, wrap: null };
    let lyrDur = 620;
    // Duración del paso a la frase i: una fracción de lo que dura esa frase (letra rápida → paso
    // rápido; lenta → pausado), entre 420 y 1000 ms
    function setLyrDur(i) {
        const L = lyr.lines;
        const g = L && i >= 0 && i + 1 < L.length ? L[i + 1].t - L[i].t : 2600;
        const d = Math.round(Math.max(420, Math.min(1000, g * 0.3)));
        // en el contenedor de la letra, no en <html>: ahí recalculaba el estilo de toda la página
        // (~2000 elementos) justo en el fotograma en que arranca el cambio de frase
        const box = document.querySelector(".lyrics-lyrics-container");
        if (d !== lyrDur || (box && box.__lyrDur !== d)) {
            lyrDur = d;
            if (box) { box.style.setProperty("--cs-lyr-dur", d + "ms"); box.__lyrDur = d; }
        }
    }
    // Centra una frase con la animación propia (sobre el ancestro que hace scroll)
    function smoothCenter(line, instant) {
        let sc = line.parentElement;
        while (sc && !(sc.scrollHeight > sc.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
        if (!sc) return false;
        // se mide sin la animación en curso (lo que le quedaba se suma al nuevo desplazamiento)
        const off = stopScroll(true), r = line.getBoundingClientRect(), s = sc.getBoundingClientRect();
        // la frase activa crece 3% (transform): se centra su caja sin escalar
        const to = Math.max(0, Math.min(sc.scrollHeight - sc.clientHeight,
            sc.scrollTop + (r.top + r.height / 2) - (s.top + s.height / 2)));
        const wrap = line.parentElement, d = to - sc.scrollTop + off;
        if (Math.abs(d) < 1 || instant) { if (off || instant) sc.scrollTop = to; return true; }
        // En la GPU: un solo salto de scroll y la lista vuelve a su sitio con un transform
        // compensado (escribir scrollTop en cada fotograma forzaba un layout por fotograma)
        sc.scrollTop = to;
        // misma duración que el relevo de la frase (--cs-lyr-dur), algo más si el salto es largo
        const dur = lyrDur + (Math.abs(d) > 400 ? 200 : 0);
        const anim = wrap.animate([{ transform: `translate3d(0,${d}px,0)` }, { transform: "translate3d(0,0,0)" }],
            { duration: dur, easing: "cubic-bezier(0.25, 1, 0.5, 1)" }); // ≈ easeOutQuart
        Object.assign(lyrScroll, { anim, wrap, raf: 1 });
        anim.onfinish = () => { if (lyrScroll.anim === anim) Object.assign(lyrScroll, { anim: null, wrap: null, raf: 0 }); };
        return true;
    }
    // Para la animación del scroll donde va. Devuelve el desplazamiento que le quedaba (px);
    // sin `keep`, lo pasa al scroll para que la vista no salte
    function stopScroll(keep) {
        const { anim, wrap } = lyrScroll;
        if (!anim) return 0;
        const m = /matrix(?:3d)?\(([^)]+)\)/.exec(getComputedStyle(wrap).transform);
        const v = m ? m[1].split(",").map(Number) : [];
        const off = v.length === 16 ? v[13] : v.length === 6 ? v[5] : 0;
        anim.cancel();
        Object.assign(lyrScroll, { anim: null, wrap: null, raf: 0 });
        if (!keep && off) {
            let sc = wrap.parentElement;
            while (sc && !(sc.scrollHeight > sc.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
            if (sc) sc.scrollTop -= off;
        }
        return off;
    }
    Element.prototype.scrollIntoView = function (opts) {
        if (!(this.classList && this.classList.contains("lyrics-lyricsContent-lyric")) ||
            !opts || typeof opts !== "object" || opts.behavior !== "smooth" || opts.block !== "center") {
            return nativeSIV.apply(this, arguments);
        }
        // Con el reloj del tema la frase ya se ha centrado a su hora; Spotify llama tarde (y
        // solo si el seguimiento está activo): se reactiva el seguimiento y, si no hay una
        // animación en curso, se centra la frase actual del reloj
        if (clk.on) {
            clk.follow = true;
            const cur = clk.els && clk.els[clk.cur + clk.off];
            if (!lyrScroll.raf && cur) smoothCenter(cur);
            return;
        }
        if (!smoothCenter(this)) return nativeSIV.apply(this, arguments);
    };

    async function loadLyrics() {
        const item = Spicetify.Player.data && Spicetify.Player.data.item;
        const id = item && /^spotify:track:/.test(item.uri || "") ? item.uri.split(":")[2] : "";
        if (id === lyr.id) return;
        lyr.id = id;
        lyr.lines = null;
        lyr.rom = null;
        if (!id) return;
        if (lyrCache.has(id)) {
            lyr.lines = lyrCache.get(id);
            lyr.rom = romCache.get(id) || null;
            // la romanización falló la otra vez (red, límite de Google): se reintenta
            if (lyr.lines && !romCache.has(id)) romanize(id, lyr.lines.map((l) => l.text), "");
            return;
        }
        let lines = null, lang = "";
        try {
            const r = await Spicetify.CosmosAsync.get(
                `https://spclient.wg.spotify.com/color-lyrics/v2/track/${id}?format=json&vocalRemoval=false&market=from_token`);
            const L = r && r.lyrics;
            lang = (L && L.language) || "";
            if (L && /SYNCED/.test(L.syncType) && Array.isArray(L.lines)) {
                lines = L.lines.map((l) => ({
                    t: +l.startTimeMs, end: +l.endTimeMs || 0, text: l.words || "",
                    syl: (l.syllables || []).map((s) => ({ t: +s.startTimeMs, n: +s.numChars })),
                }));
            }
        } catch (e) { if (e && e.status !== 404) return; } // sin red: no se cachea, se reintenta
        lyrCache.set(id, lines);
        if (lyr.id === id) lyr.lines = lines;
        if (lines) romanize(id, lines.map((l) => l.text), lang);
        if (lines && !(await lyricsPlusWords(lines, item))) await neteaseWords(lines, item);
    }

    // ---- Romanización: japonés, chino y coreano (Google Translate, una petición por canción)
    // y cirílico (tabla local). Va bajo cada línea con un ::after (data-cs-rom en la línea): el
    // texto de la línea no cambia y la sincronización (findOff) no se entera.
    const romCache = new Map();
    const CJK_RE = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uac00-\ud7af\u1100-\u11ff]/, CYR_RE = /[\u0400-\u04ff]/;
    const CYR = { а: "a", б: "b", в: "v", г: "g", ґ: "g", д: "d", е: "e", ё: "yo", є: "ye", ж: "zh", з: "z", и: "i", і: "i", ї: "yi",
        й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts",
        ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" };
    const cyrLatin = (t) => Array.from(t).map((c) => {
        const l = c.toLowerCase(), r = CYR[l];
        if (r === undefined) return c;
        return c !== l && r ? r[0].toUpperCase() + r.slice(1) : r;
    }).join("");
    // clave de una línea que no cambia al pasar los coros a su fila (ver bvText)
    const romKey = (t) => { const sp = splitBv(t || ""); return norm(sp.main) + "|" + norm(sp.bv); };
    async function romanize(id, texts, lang) {
        if (romCache.has(id)) return;
        // se romaniza solo la voz (sin los coros entre paréntesis: van en su fila y salían repetidos,
        // y Google destroza el inglés: "the mūn"); una línea entera de coro, entera
        const src = (t) => splitBv(t).main || t;
        const uniq = [...new Set(texts.map((t) => t.trim()).filter((t) => CJK_RE.test(src(t)) || CYR_RE.test(src(t))))];
        if (!uniq.length) return void romCache.set(id, null);
        const m = new Map();
        for (const t of uniq) if (!CJK_RE.test(src(t))) m.set(romKey(t), cyrLatin(src(t)));
        const cjk = uniq.filter((t) => CJK_RE.test(src(t)));
        const sl = /^(ja|zh|ko)/.test(lang || "") ? lang : "auto";
        try {
            // de 25 en 25 líneas, separadas por " | " (sobrevive a la romanización; "\n" no)
            for (let i = 0; i < cjk.length; i += 25) {
                const part = cjk.slice(i, i + 25), q = part.map((t) => src(t).replace(/\|/g, " ")).join(" | ");
                const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
                let j;
                try {
                    j = await (await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=en&dt=rm&q=${encodeURIComponent(q)}`, { signal: ctl.signal })).json();
                } finally { clearTimeout(to); }
                const out = ((j && j[0]) || []).map((x) => (x && x[3]) || "").join("").split(/\s*\|\s*/);
                if (out.length !== part.length) continue; // no casa línea a línea: mejor nada
                part.forEach((t, k) => { const r = out[k].trim(); if (r) m.set(romKey(t), r[0].toLowerCase() + r.slice(1)); });
            }
        } catch (e) { return; } // sin red: se reintenta la próxima vez que suene
        romCache.set(id, m.size ? m : null);
        if (lyr.id === id) lyr.rom = m.size ? m : null;
    }
    // si la línea tiene fila de coros, la romanización va al principio de esa fila (::before):
    // pegada a la voz y con el coro debajo (data-cs-romrow oculta el ::after de la línea)
    function romLine(line, text) {
        const r = lyr.rom && lyr.rom.get(romKey(text));
        if (r) { if (line.getAttribute("data-cs-rom") !== r) line.setAttribute("data-cs-rom", r); }
        else if (line.hasAttribute("data-cs-rom")) line.removeAttribute("data-cs-rom");
        const row = line.querySelector(":scope > .lyrics-lyricsContent-text > .cs-bvrow");
        if (row) {
            if (r) { if (row.getAttribute("data-cs-rom") !== r) row.setAttribute("data-cs-rom", r); }
            else if (row.hasAttribute("data-cs-rom")) row.removeAttribute("data-cs-rom");
        }
        const rr = !!(r && row);
        if (line.hasAttribute("data-cs-romrow") !== rr) line.toggleAttribute("data-cs-romrow", rr);
    }

    // ---- Tiempos reales por palabra (Netease, formato yrc) ------------------
    const PROXY = "https://cors-proxy.spicetify.app/";
    const norm = (t) => (t.toLowerCase().match(/[\p{L}\p{N}]/gu) || []).join("");
    const isAlnum = (c) => /[\p{L}\p{N}]/u.test(c);

    async function neteaseJson(url) {
        const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 7000);
        try { return await (await fetch(PROXY + url, { signal: ctl.signal })).json(); }
        finally { clearTimeout(to); }
    }

    // `[ini,dur](ini,dur,0)palabra (ini,dur,0)otra ...` → [{t, d, words:[{t,d,tx}]}]
    function parseYrc(src) {
        const out = [];
        for (const raw of src.split("\n")) {
            const m = /^\[(\d+),(\d+)\](.*)$/.exec(raw);
            if (!m) continue;
            const parts = m[3].split(/\((\d+),(\d+),-?\d+\)/), words = [];
            for (let k = 1; k + 2 < parts.length; k += 3) {
                words.push({ t: +parts[k], d: +parts[k + 1], tx: parts[k + 2] });
            }
            if (words.length) out.push({ t: +m[1], d: +m[2], words });
        }
        return out;
    }

    // Reparte el texto de Spotify entre las palabras de Netease (mismas letras)
    function alignWords(text, words) {
        const chars = Array.from(text), out = [];
        let pos = 0;
        for (const w of words) {
            const n = Array.from(norm(w.tx)).length;
            if (!n) continue;
            let end = pos, seen = 0;
            while (end < chars.length && seen < n) { if (isAlnum(chars[end])) seen++; end++; }
            while (end < chars.length && !/\s/.test(chars[end]) && !isAlnum(chars[end])) end++;
            out.push({ t: w.t, d: Math.max(60, w.d), tx: chars.slice(pos, end).join("") });
            pos = end;
        }
        if (out.length) out[out.length - 1].tx += chars.slice(pos).join("");
        return out;
    }

    // "a (b) c (d)" → voz principal "a c" y coros "(b) (d)"
    function splitBv(text) {
        const bv = [];
        const main = text.replace(/[(（][^()（）]*[)）]/g, (g) => (bv.push(g), " ")).replace(/\s+/g, " ").trim();
        return { main, bv: bv.join(" ") };
    }
    // Pone a cada línea de Spotify los tiempos por palabra de la línea externa con el mismo
    // texto (la más cercana en el tiempo). Devuelve false si casan menos de la mitad.
    // Si la externa trae los coros aparte (c.bg, lyricsplus), voz y coros se casan por separado
    // (sirve en cualquier orden) y el coro guarda sus tiempos en ln.bw: suena a la vez que la voz.
    function applyWords(lines, nl) {
        const jn = (ws) => norm(ws.map((w) => w.tx).join(""));
        const keys = nl.map((c) => ({ all: jn(c.words), main: c.bg ? jn(c.main) : "", bg: c.bg ? jn(c.bg) : "" }));
        const pairs = [];
        let total = 0;
        for (const ln of lines) {
            const key = norm(ln.text);
            if (!key) continue;
            total++;
            const sp = splitBv(ln.text), km = sp.bv ? norm(sp.main) : "", kb = sp.bv ? norm(sp.bv) : "";
            let bl = null, bt = 6000, how = "";
            nl.forEach((c, k) => {
                const dt = Math.abs(c.t - ln.t), K = keys[k];
                if (dt >= bt) return;
                const h = K.all === key ? "all" : km && kb && K.main === km && K.bg === kb ? "split" : K.main === key ? "main" : "";
                if (h) { bl = c; bt = dt; how = h; }
            });
            if (bl) pairs.push([ln, bl, how, sp]);
        }
        if (!total || pairs.length / total < 0.5) return false;
        const diffs = pairs.map(([a, b]) => b.t - a.t).sort((x, y) => x - y);
        const med = diffs[diffs.length >> 1], shift = Math.abs(med) > 700 ? med : 0;
        const sh = (w) => w.map((x) => ({ t: x.t - shift, d: x.d, tx: x.tx }));
        for (const [ln, c, how, sp] of pairs) {
            const w = how === "split" ? alignWords(sp.main, c.main) : alignWords(ln.text, how === "main" ? c.main : c.words);
            if (!w.length) continue;
            ln.w = sh(w);
            delete ln.bw;
            if (how === "split") { const b = alignWords(sp.bv, c.bg); if (b.length) ln.bw = sh(b); }
        }
        return true;
    }

    // ---- Tiempos por palabra de lyricsplus (letra de Apple Music, sin proxy) ---
    // Netease bloquea con captcha las búsquedas que salen de Spotify (oct. 2026): queda de reserva
    const LP_HOSTS = ["lyricsplus.prjktla.workers.dev", "lyricsplus.binimum.org"], lpDown = new Set();
    async function lyricsPlusWords(lines, item) {
        try {
            const name = item.name || "", artist = (item.artists || []).map((a) => a.name).join(", ");
            const album = (item.album && item.album.name) || "", dur = item.duration && item.duration.milliseconds;
            const q = `title=${encodeURIComponent(name)}&artist=${encodeURIComponent(artist)}&album=${encodeURIComponent(album)}` +
                (dur ? `&duration=${Math.round(dur / 1000)}` : "");
            let d;
            // el servidor principal agota su cupo diario (429) y entonces se prueba el espejo; el que
            // falla se salta el resto de la sesión
            for (const host of LP_HOSTS) {
                if (lpDown.has(host)) continue;
                const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
                try {
                    const res = await fetch(`https://${host}/v2/lyrics/get?${q}`, { signal: ctl.signal });
                    if (res.status === 404) return false; // no la tiene: el espejo tampoco
                    if (!res.ok) { lpDown.add(host); continue; }
                    // el JSON llega comprimido en gzip sin Content-Encoding: se descomprime a mano
                    const buf = await res.arrayBuffer();
                    const gz = new Uint8Array(buf, 0, 2);
                    const raw = gz[0] === 0x1f && gz[1] === 0x8b
                        ? new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))) : new Response(buf);
                    d = await raw.json();
                    break;
                } catch (e) { lpDown.add(host); }
                finally { clearTimeout(to); }
            }
            if (!d || !Array.isArray(d.lyrics) || !/word|syllable/i.test(d.type || "")) return false;
            // voz y coros por separado (con sus tiempos: pueden solaparse); Spotify a veces no trae los coros
            const nl = [];
            const ws = (arr) => arr.map((x) => ({ t: +x.time, d: +x.duration, tx: x.text }));
            for (const l of d.lyrics) {
                const syl = (l.syllabus || []).filter((x) => x.text);
                if (!syl.length) continue;
                const bg = syl.filter((x) => x.isBackground), c = { t: +l.time, d: +l.duration, words: ws(syl) };
                if (bg.length) { c.main = ws(syl.filter((x) => !x.isBackground)); c.bg = ws(bg); }
                nl.push(c);
            }
            return applyWords(lines, nl);
        } catch (e) { return false; }
    }

    async function neteaseWords(lines, item) {
        if (lines.nx) return;
        try {
            const name = item.name || "", artist = (item.artists && item.artists[0] && item.artists[0].name) || "";
            const dur = item.duration && item.duration.milliseconds;
            const q = await neteaseJson(`https://music.163.com/api/search/get?type=1&limit=8&s=${encodeURIComponent(name + " " + artist)}`);
            const songs = (q.result && q.result.songs) || [];
            const nn = norm(name), na = norm(artist);
            let best = null, bd = 1e9;
            for (const s of songs) {
                const sn = norm(s.name), d = Math.abs((s.duration || 0) - (dur || 0));
                const sameName = sn === nn || sn.startsWith(nn) || nn.startsWith(sn);
                const sameArtist = s.artists.some((a) => { const x = norm(a.name); return x && (na.includes(x) || x.includes(na)); });
                if (sameName && sameArtist && d < bd) { best = s; bd = d; }
            }
            if (!best || bd > 2500) return void (lines.nx = true);
            const r = await neteaseJson(`https://music.163.com/api/song/lyric?id=${best.id}&lv=1&kv=1&tv=-1&yv=1`);
            const nl = parseYrc((r.yrc && r.yrc.lyric) || "");
            if (!nl.length) return void (lines.nx = true);
            applyWords(lines, nl);
            lines.nx = true;
        } catch (e) { /* sin red o proxy caído: se queda el reparto estimado */ }
    }

    // ---- Palabra con tiempo real → letra a letra ----------------------------
    // El relleno avanza letra a letra (los signos pesan poco) y, si la palabra se alarga, la
    // última letra se queda con el resto. Cada letra sube al alcanzarla y la palabra entera
    // baja junta al terminar (`hold`): una ola que recorre la palabra.
    function wordUnits(w) {
        const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(w.tx), core = m[2], end = w.t + w.d;
        const chars = Array.from(core);
        if (chars.length < 2 || /[぀-ヿ㐀-鿿가-힯]/.test(core)) return [{ text: w.tx, start: w.t, end, wd: w.d }];
        const weights = chars.map((c) => (/[\p{L}\p{N}]/u.test(c) ? 1 : 0.3));
        if (w.d > 800) weights[weights.length - 1] *= 1 + Math.min(2.5, (w.d - 800) / 600);
        const sum = weights.reduce((x, y) => x + y, 0);
        let acc = 0;
        return chars.map((c, k) => {
            const start = w.t + w.d * (acc / sum);
            acc += weights[k];
            return {
                text: (k === 0 ? m[1] : "") + c + (k === chars.length - 1 ? m[3] : ""),
                syl: true, start, end: w.t + w.d * (acc / sum), hold: end, wd: w.d,
            };
        });
    }

    // Trozos con su intervalo [start, end) en ms: sílabas reales o palabras repartidas
    function lineUnits(i) {
        const L = lyr.lines, ln = L[i], text = ln.text;
        const next = i + 1 < L.length ? L[i + 1].t : ln.t + 4000;
        if (ln.w) {
            // una palabra puede venir en varias sílabas (sin espacio entre ellas): baja junta y crece por su duración total
            const units = (ws) => {
                const u = ws.flatMap(wordUnits);
                for (let i = 0; i < u.length;) {
                    let j = i + 1;
                    while (j < u.length && !/^\s/.test(u[j].text) && !/\s$/.test(u[j - 1].text)) j++;
                    const hold = Math.max(...u.slice(i, j).map((x) => x.end)), wd = hold - u[i].start;
                    for (let k = i; k < j; k++) { u[k].hold = hold; u[k].wd = wd; }
                    i = j;
                }
                return u;
            };
            // coros con tiempos propios (ln.bw): detrás de la voz, en su fila
            return ln.bw ? units(ln.w).concat(units(ln.bw).map((x) => ((x.bv = true), x))) : units(ln.w);
        }
        if (ln.syl.length && Math.abs(ln.syl.reduce((a, s) => a + s.n, 0) - text.trim().length) <= 2) {
            const off = ln.syl[0].t < ln.t - 1 ? ln.t : 0;
            const last = ln.syl[ln.syl.length - 1];
            const stop = ln.end > last.t + off ? ln.end : Math.min(next, last.t + off + 700);
            let pos = 0;
            return ln.syl.map((s, k) => {
                const piece = k === ln.syl.length - 1 ? text.slice(pos) : text.slice(pos, pos + s.n);
                pos += s.n;
                return { text: piece, syl: true, start: s.t + off, end: k + 1 < ln.syl.length ? ln.syl[k + 1].t + off : stop };
            });
        }
        const cjk = !/\s/.test(text) && /[぀-ヿ㐀-鿿가-힯]/.test(text);
        // japonés y chino van letra a letra aunque la línea lleve espacios (p. ej. un coro en inglés
        // entre paréntesis): si no, toda la frase era un solo trozo y no se animaba
        const toks = cjk ? Array.from(text) : text.split(/(\s+)/).flatMap((w) =>
            /[぀-ヿ㐀-鿿]/.test(w) ? w.match(/[぀-ヿ㐀-鿿]|[^぀-ヿ㐀-鿿]+/g) : [w]);
        // Coros entre paréntesis en una línea con voz: no le quitan tiempo a la voz; cada grupo
        // arranca al acabar la palabra que tiene delante y suena a la vez que lo que sigue
        const inBv = [];
        if (/[(（]/.test(text) && splitBv(text).main) {
            let depth = 0;
            for (const w of toks) {
                const o = (w.match(/[(（]/g) || []).length, c = (w.match(/[)）]/g) || []).length;
                inBv.push(w.trim() !== "" && (depth > 0 || o > 0));
                depth = Math.max(0, depth + o - c);
            }
        }
        // Las palabras van a ritmo de canto (~60 ms por letra) y la última se alarga: es la que
        // el cantante suele estirar hasta la respiración antes de la frase siguiente
        const words = toks.filter((w, i) => w.trim() && !inBv[i]), U = 60;
        const units = words.map((w) => Array.from(w).length + 2);
        const lastU = units.pop() || 0, bodyU = units.reduce((a, u) => a + u, 0);
        const room = Math.max(300, next - ln.t - Math.min(450, (next - ln.t) * 0.12)); // hasta la respiración
        let k = U, hold = lastU * U; // ms por unidad en el cuerpo y duración de la última
        if ((bodyU + lastU) * U >= room) k = room / (bodyU + lastU), hold = lastU * k; // no cabe: todo a escala
        else {
            const free = room - (bodyU + lastU) * U;
            const slow = Math.min(free * 0.3, bodyU * U * 0.5); // frase lenta: el cuerpo se relaja un poco
            k = U + (bodyU ? slow / bodyU : 0);
            hold = Math.min(lastU * U + free - slow, lastU * U + 2600); // el resto, a la última (con tope)
        }
        let acc = ln.t, wi = 0, bvAt = ln.t, sung = ln.t;
        return toks.map((w, i) => {
            if (!w.trim()) return { text: w };
            if (inBv[i]) {
                const start = bvAt, n = Array.from(w).length + 2;
                bvAt += n * U;
                return { text: w, start, end: bvAt, bv: true };
            }
            const start = acc;
            sung = start + Math.min(wi < units.length ? units[wi] * k : hold, (Array.from(w).length + 2) * U);
            acc += wi < units.length ? units[wi] * k : hold;
            wi++;
            bvAt = sung;
            return { text: w, start, end: acc };
        });
    }

    // ---- Coros: lo que va entre paréntesis ------------------------------------
    // Más pequeño y más tenue que la voz principal, sin los paréntesis (siguen en el DOM, ocultos:
    // el texto de la línea no cambia y findOff sigue casando). Una línea entera entre paréntesis
    // es una línea de coro (data-cs-bvl). Spotify recrea el texto de las líneas que cambian de
    // estado: bvScan las repasa (cuesta comparar un string por línea).
    const BV_RE = /[()（）]/;
    // texto con los paréntesis en `.cs-par` (ocultos por CSS)
    function parText(node, text) {
        for (const part of text.split(/([()（）])/)) {
            if (!part) continue;
            if (BV_RE.test(part)) {
                const p = document.createElement("span");
                p.className = "cs-par";
                p.textContent = part;
                node.append(p);
            } else node.append(part);
        }
    }
    function bvLine(line, text) {
        const t = text.trim(), whole = /^(?:[(（][^()（）]*[)）][\s.,!?…]*)+$/.test(t);
        if (whole !== line.hasAttribute("data-cs-bvl")) line.toggleAttribute("data-cs-bvl", whole);
    }
    function bvText(el) {
        const text = el.textContent;
        // React puede reescribir solo el nodo de texto (mismo div, mismo texto): entonces faltan los spans
        if (el.__bv === text && (el.firstElementChild || !BV_RE.test(text) || el.__bvPlain === text)) return;
        el.__bv = text;
        const line = el.parentElement;
        if (line) bvLine(line, text);
        if (el.querySelector(".cs-w") || !BV_RE.test(text)) return;
        // en una línea con voz, los coros van debajo, en su fila (.cs-bvrow); una línea entera de coro, tal cual
        const whole = !splitBv(text).main, frag = document.createDocumentFragment(), row = document.createElement("span");
        row.className = "cs-bvrow";
        let depth = 0, cur = null;
        for (const part of text.split(/([()（）])/)) {
            if (!part) continue;
            if (/[(（]/.test(part)) depth++;
            if (depth > 0) {
                if (!cur) {
                    cur = document.createElement("span");
                    cur.className = "cs-bv";
                    if (whole) frag.append(cur);
                    else { if (row.firstChild) row.append(" "); row.append(cur); }
                }
                parText(cur, part);
            } else { cur = null; frag.append(part); }
            if (/[)）]/.test(part)) { depth = Math.max(0, depth - 1); if (!depth) cur = null; }
        }
        // sin ningún "(" (p. ej. un ")" suelto) no hay coro: no se toca el DOM, o el observador
        // volvería a llamar aquí sin fin
        if (!frag.querySelector(".cs-bv") && !row.firstChild) { el.__bvPlain = text; return; }
        el.textContent = "";
        el.append(frag);
        if (row.firstChild) el.append(row);
        el.__bv = el.textContent;
        if (line && row.firstChild) romLine(line, text);
    }
    function bvScan(box) {
        for (const el of box.querySelectorAll(".lyrics-lyricsContent-lyric > .lyrics-lyricsContent-text")) {
            bvText(el);
            if (lyr.rom || el.parentElement.hasAttribute("data-cs-rom")) romLine(el.parentElement, el.textContent);
        }
    }

    // Cada palabra va en un `.cs-g` (no se parte) y cada letra/sílaba en un `.cs-w` (se rellena y crece al cantarse)
    // El relleno (--p) y el salto de cada trozo son animaciones CSS con su retardo calculado aquí,
    // una vez: escribir --p en cada fotograma era una mutación de `style` dentro del scroll y
    // OverlayScrollbars (Spotify) respondía a cada una con un layout forzado (≈25% de CPU).
    function buildLine(el, idx, t) {
        const units = lineUnits(idx), timed = [];
        // [voz, coros]: los coros van a su fila salvo en una línea entera de coro
        const whole = !splitBv(lyr.lines[idx].text).main;
        const sinks = [{ frag: document.createDocumentFragment(), group: null }, { frag: document.createDocumentFragment(), group: null }];
        let depth = 0;
        for (const u of units) {
            // dentro de paréntesis (coro): se mira antes de contar los de este trozo
            const opens = (u.text.match(/[(（]/g) || []).length, closes = (u.text.match(/[)）]/g) || []).length;
            const bv = !!u.bv || depth > 0 || opens > 0;
            depth = Math.max(0, depth + opens - closes);
            const S = sinks[bv && !whole ? 1 : 0];
            // un grupo nuevo en la fila de coros va separado del anterior
            if (S === sinks[1] && opens && S.frag.childNodes.length) { S.group = null; S.frag.append(" "); }
            const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(u.text);
            if (!m[2] || u.start === undefined) { S.group = null; S.frag.append(u.text); continue; }
            // un trozo que solo es "(" o ")" (letra a letra) no lleva animación: va oculto
            if (/^[()（）]+$/.test(m[2])) {
                if (m[1]) { S.group = null; S.frag.append(m[1]); }
                parText(S.group || S.frag, m[2]);
                if (m[3]) { S.group = null; S.frag.append(m[3]); }
                continue;
            }
            if (m[1]) { S.group = null; S.frag.append(m[1]); }
            const sp = document.createElement("span");
            sp.className = bv ? "cs-w cs-bv" : "cs-w";
            if (BV_RE.test(m[2])) parText(sp, m[2]); else sp.textContent = m[2];
            if (!(u.syl && S.group)) {
                S.group = document.createElement("span");
                S.group.className = "cs-g";
                S.frag.append(S.group);
            }
            S.group.append(sp);
            sp.style.setProperty("--sw", Math.min(0.085, 0.032 + (u.wd || u.end - u.start) / 1000 * 0.03).toFixed(3));
            sp.style.setProperty("--f0", Math.round(u.start - t) + "ms");
            sp.style.setProperty("--fd", Math.max(1, Math.round(u.end - u.start)) + "ms");
            sp.style.setProperty("--h0", Math.round((u.hold || u.end) - t) + "ms");
            // la subida no puede durar más que la palabra: si no, la bajada arrancaba desde arriba de golpe
            sp.style.setProperty("--ud", Math.round(Math.max(120, Math.min(420, (u.hold || u.end) - u.start))) + "ms");
            if (m[3]) { S.group = null; S.frag.append(m[3]); }
            else if (!u.syl) S.group = null;
            timed.push(sp);
        }
        el.textContent = "";
        el.append(sinks[0].frag);
        if (sinks[1].frag.childNodes.length) {
            const row = document.createElement("span");
            row.className = "cs-bvrow";
            row.append(sinks[1].frag);
            el.append(row);
        }
        el.__cs = { idx, timed, real: !!lyr.lines[idx].w };
        el.__bv = el.textContent;
        const line = el.parentElement;
        if (line) {
            bvLine(line, el.__bv);
            romLine(line, el.__bv);
            // la romanización (::after) se rellena a la vez que la voz: de la primera a la última sílaba;
            // data-cs-rt alterna a/b para que la animación vuelva a empezar al reconstruir la línea
            const vo = units.filter((u) => u.start !== undefined && !u.bv && u.text.trim());
            if (vo.length) {
                const s0 = Math.min(...vo.map((u) => u.start)), s1 = Math.max(...vo.map((u) => u.end));
                line.style.setProperty("--cs-r0", Math.round(s0 - t) + "ms");
                line.style.setProperty("--cs-rd", Math.max(1, Math.round(s1 - s0)) + "ms");
                line.setAttribute("data-cs-rt", line.getAttribute("data-cs-rt") === "a" ? "b" : "a");
            }
        }
    }

    // Coros que siguen sonando cuando ya empieza la frase siguiente: hasta cuándo suena la fila de
    // coros de la línea i (0 si no tiene). La línea anterior lleva data-cs-bvhold mientras tanto
    // y su fila sigue encendida (la voz se apaga como siempre).
    const bvEnds = new Map();
    function bvEnd(i) {
        const k = lyr.id + ":" + i;
        if (bvEnds.has(k)) return bvEnds.get(k);
        let end = 0;
        if (lyr.lines && lyr.lines[i] && BV_RE.test(lyr.lines[i].text + (lyr.lines[i].bw ? "(" : "")) && splitBv(lyr.lines[i].text).main) {
            let depth = 0;
            for (const u of lineUnits(i)) {
                const opens = (u.text.match(/[(（]/g) || []).length, closes = (u.text.match(/[)）]/g) || []).length;
                const bv = !!u.bv || depth > 0 || opens > 0;
                depth = Math.max(0, depth + opens - closes);
                if (bv && u.end !== undefined && u.text.trim()) end = Math.max(end, u.hold || u.end);
            }
        }
        bvEnds.set(k, end);
        return end;
    }

    // ---- Frase actual por el reloj de la canción -----------------------------
    // Spotify marca la activa 250-400 ms tarde (hasta 1 s tras un ♪): aquí se calcula con
    // el progreso y cada línea lleva data-cs-d (distancia a la actual; ver el CSS)
    const clk = { on: false, box: null, wrap: null, els: null, off: 0, id: "", cur: -2, at: 0, follow: true, mo: null, t: 0, wall: 0, playing: null, jump: false, hold: null };
    function clockOff() {
        if (!clk.on) return;
        clk.on = false;
        document.documentElement.removeAttribute("data-cs-clock");
        if (clk.mo) clk.mo.disconnect();
        clk.mo = null;
        if (clk.els) for (const e of clk.els) e.removeAttribute("data-cs-d");
        clk.box = clk.wrap = clk.els = null;
    }
    function clockMark() {
        const now = performance.now(), ad = Math.round(clk.at - now) + "ms";
        for (let j = 0; j < clk.els.length; j++) {
            const e = clk.els[j], d = j - clk.off - clk.cur;
            const v = d === 0 ? "0" : d === -1 ? "-1" : d > 0 && d < 4 ? String(d) : d < 0 ? "p" : "u";
            if (e.getAttribute("data-cs-d") === v) continue;
            // las de relevo arrancan su animación donde iba (retardo negativo): así una línea
            // que Spotify acaba de recrear continúa en vez de saltar
            if (v === "0" || v === "-1") e.style.setProperty("--cs-ad", ad);
            e.setAttribute("data-cs-d", v);
        }
    }
    // Desfase entre las líneas del DOM y las de la API (Spotify añade alguna vacía delante y,
    // en versiones con lista virtualizada, solo monta las visibles: el desfase puede ser
    // cualquiera). Se parte de las primeras líneas del DOM y se puntúa cada candidato.
    function findOff(els, L) {
        // sin los coros: en el DOM van al final de la línea (su fila), en la API en su sitio
        const key = (x) => {
            const s = (x || "").replace(/\s+/g, " ").trim();
            return s.replace(/[(（][^()（）]*[)）]/g, " ").replace(/\s+/g, " ").trim() || s;
        };
        const cand = new Set([-2, -1, 0, 1, 2, 3, 4, 5, 6]);
        for (let j = 0, n = 0; j < els.length && n < 6; j++) {
            const kj = key(els[j].textContent);
            if (!kj) continue;
            n++;
            for (let i = 0; i < L.length; i++) if (key(L[i].text) === kj) cand.add(j - i);
        }
        let best = -1, off = 0;
        for (const k of cand) {
            let m = 0;
            for (let j = 0; j < els.length; j++) {
                const l = L[j - k];
                if (l && key(els[j].textContent) === key(l.text)) m++;
            }
            if (m > best) { best = m; off = k; }
        }
        return best >= Math.min(3, L.length) && best >= Math.min(els.length, L.length) * 0.8 ? off : null;
    }
    function clockSetup(box, L) {
        const first = box.querySelector(".lyrics-lyricsContent-lyric"), wrap = first && first.parentElement;
        if (!wrap) return false;
        const els = wrap.querySelectorAll(":scope > .lyrics-lyricsContent-lyric");
        const off = findOff(els, L);
        if (off === null) return false;
        clockOff();
        Object.assign(clk, { on: true, box, wrap, els, off, id: lyr.id, cur: -2, follow: true });
        document.documentElement.setAttribute("data-cs-clock", "");
        // Spotify recrea líneas al cambiar su activa: se vuelven a marcar antes de pintarse
        // (y, si monta/desmonta líneas por virtualización, se recalcula el desfase)
        clk.mo = new MutationObserver(() => {
            clk.els = wrap.querySelectorAll(":scope > .lyrics-lyricsContent-lyric");
            const o = lyr.lines && findOff(clk.els, lyr.lines);
            if (o !== null && o !== undefined && o !== clk.off) clk.off = o;
            clockMark();
        });
        clk.mo.observe(wrap, { childList: true });
        return true;
    }
    // Rueda, arrastre o teclas sobre la letra: deja de seguir (como Spotify) hasta que
    // Spotify vuelva a pedir centrar (botón de sincronizar)
    for (const ev of ["wheel", "touchmove", "keydown"]) {
        document.addEventListener(ev, (e) => {
            if (!clk.on || (ev === "keydown" && !/Arrow|Page|Home|End|Space/.test(e.code))) return;
            if (e.target instanceof Node && clk.box && (clk.box.contains(e.target) || e.target.contains(clk.box))) {
                clk.follow = false;
                stopScroll();
            }
        }, { capture: true, passive: true });
    }

    // ---- Spotify 1.3: letra con clases ofuscadas -------------------------------------
    // Medido en Windows 1.3.1: .Root__main-view > … > div.bqlda (contenedor) > [div.nqmj (fondo),
    // div.NAOY > div.l2GQ > div (padre de las líneas) > div.rzOQ.<estado> > div._3s1D (texto)].
    // Los nombres cambian con cada versión, así que se reconocen por la forma (texto grande en
    // líneas hermanas) y se les ponen las clases de 1.2, de las que cuelga todo el tema.
    const L13 = { box: null, wrap: null, mo: null, state: null };
    function tagLine(line) {
        if (!line.classList.contains("lyrics-lyricsContent-lyric")) line.classList.add("lyrics-lyricsContent-lyric");
        const t = line.firstElementChild;
        if (t && !t.classList.contains("lyrics-lyricsContent-text")) t.classList.add("lyrics-lyricsContent-text");
        const st = L13.state;
        if (!st) return;
        const tok = [...line.classList].find((c) => c in st);
        for (const k of ["previous", "active", "upcoming"]) {
            const want = tok && st[tok] === k, has = line.classList.contains("lyrics-lyricsContent-" + k);
            if (want !== has) line.classList.toggle("lyrics-lyricsContent-" + k, want);
        }
    }
    function learnStates(wrap) {
        // clase de estado = la 2ª de cada línea; en orden: pasadas, la activa y las siguientes
        const runs = [];
        for (const l of wrap.children) {
            const tok = [...l.classList].filter((c) => !c.startsWith("lyrics-"))[1];
            if (!tok || !l.offsetHeight) continue;
            if (!runs.length || runs[runs.length - 1] !== tok) runs.push(tok);
        }
        if (runs.length === 3 && new Set(runs).size === 3) L13.state = { [runs[0]]: "previous", [runs[1]]: "active", [runs[2]]: "upcoming" };
    }
    function tagLyrics13() {
        if (L13.wrap && L13.wrap.isConnected && L13.box && L13.box.isConnected && L13.wrap.children.length) return;
        const H = Spicetify.Platform && Spicetify.Platform.History;
        if (!H || !H.location || H.location.pathname !== "/lyrics") return;
        const mv = document.querySelector(".Root__main-view");
        // una .lyrics-lyrics-container que no pusimos nosotros = Spotify 1.2 (clases reales)
        const native = mv && mv.querySelector(".lyrics-lyrics-container");
        if (!mv || (native && native !== L13.box)) return;
        let leaf = null;
        for (const e of mv.querySelectorAll("div")) {
            if (e.firstElementChild || !e.textContent.trim() || parseFloat(getComputedStyle(e).fontSize) < 28) continue;
            leaf = e; break;
        }
        const line = leaf && leaf.parentElement, wrap = line && line.parentElement;
        if (!wrap || wrap.children.length < 3) return;
        const content = wrap.parentElement, box = content && content.parentElement && content.parentElement.parentElement;
        if (!box || box === mv) return;
        // al cambiar de canción Spotify rehace las líneas (y a veces el contenedor): se vuelve a etiquetar
        if (L13.box && L13.box !== box) L13.box.classList.remove("lyrics-lyrics-container");
        L13.box = box;
        box.classList.add("lyrics-lyrics-container");
        content.classList.add("lyrics-lyrics-contentWrapper");
        for (const sib of box.children) if (!sib.contains(wrap)) sib.classList.add("lyrics-lyrics-background");
        L13.wrap = wrap;
        L13.state = null;
        learnStates(wrap);
        for (const l of wrap.children) tagLine(l);
        if (L13.mo) L13.mo.disconnect();
        // React reescribe className al cambiar de estado (y borra las nuestras): se repone antes de pintar
        L13.mo = new MutationObserver((recs) => {
            if (!L13.state) learnStates(wrap);
            for (const r of recs) {
                if (r.type === "childList") {
                    for (const n of r.addedNodes) {
                        if (n.parentElement === wrap) tagLine(n);
                        else if (n.parentElement && n.parentElement.parentElement === wrap) tagLine(n.parentElement);
                    }
                }
                else if (r.target.parentElement === wrap) tagLine(r.target);
                else if (r.target.parentElement && r.target.parentElement.parentElement === wrap) tagLine(r.target.parentElement);
            }
        });
        L13.mo.observe(wrap, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    }

    function lyricsTick() {
        lyrRaf = 0;
        const box = document.querySelector(".lyrics-lyrics-container");
        if (!box) return clockOff();
        lyrRaf = requestAnimationFrame(lyricsTick);
        if (!box.__csReady) { // fin de la entrada en cascada (820 ms + 340 ms del último retardo)
            box.__csReady = true;
            setTimeout(() => box.setAttribute("data-cs-ready", ""), 1250);
        }
        // coros (paréntesis): se repasan en cuanto Spotify toca el texto (el observador corre antes
        // de pintar: sin un fotograma con paréntesis); el repaso cada segundo es la red
        if (!box.__bvMO) {
            box.__bvMO = new MutationObserver(() => bvScan(box));
            box.__bvMO.observe(box, { childList: true, subtree: true, characterData: true });
        }
        const now = performance.now();
        if (!(now - (box.__bvAt || 0) < 1000)) { box.__bvAt = now; bvScan(box); }
        const L = lyr.lines;
        if (!L || !L.length) return clockOff();
        if (!clk.on || clk.box !== box || clk.id !== lyr.id || !clk.wrap.isConnected) {
            if (!clockSetup(box, L)) return clockOff();
        }
        const t = Spicetify.Player.getProgress();
        let cur = -1;
        while (cur + 1 < L.length && L[cur + 1].t <= t) cur++;
        if (cur !== clk.cur) {
            const step = clk.cur >= -1 && cur === clk.cur + 1; // avance normal (no salto/seek)
            clk.cur = cur;
            // tras un salto (seek, abrir la letra) no hay relevo: cada línea directa a su sitio
            clk.at = performance.now() - (step ? 0 : 5000);
            setLyrDur(cur);
            clockMark();
            const line = clk.els[cur + clk.off];
            if (clk.follow && line) smoothCenter(line);
        }
        // pausa / salto: se mira siempre (también en la intro, antes de la primera frase)
        const wall = performance.now(), playing = Spicetify.Player.isPlaying();
        // al reanudar también se rehace: entre la pausa real y la marca pasan unos fotogramas
        const resumed = playing && clk.playing === false;
        if (playing !== clk.playing) { clk.playing = playing; document.documentElement.toggleAttribute("data-cs-paused", !playing); }
        const seekd = resumed || (playing ? clk.wall && Math.abs(t - (clk.t + (wall - clk.wall))) > 350 : Math.abs(t - clk.t) > 350);
        clk.t = t; clk.wall = playing ? wall : 0;
        if (seekd) clk.jump = true; // se aplica al llegar a una frase con texto
        const prevEl = cur >= 1 && clk.els[cur - 1 + clk.off];
        if (prevEl || clk.hold) {
            const hold = prevEl && t < bvEnd(cur - 1) ? prevEl : null;
            // al acabar el coro la línea hace ahora su salida (desde el principio)
            if (clk.hold && clk.hold !== hold) { clk.hold.style.setProperty("--cs-ad", "0ms"); clk.hold.removeAttribute("data-cs-bvhold"); }
            if (hold && !hold.hasAttribute("data-cs-bvhold")) hold.setAttribute("data-cs-bvhold", "");
            clk.hold = hold;
        }
        if (cur < 0) return;
        const lineEl = clk.els[cur + clk.off];
        const el = lineEl && lineEl.querySelector(".lyrics-lyricsContent-text");
        const text = el && el.textContent.trim();
        if (!text || !/[\p{L}\p{N}]/u.test(text) || /[\u0590-\u08ff]/.test(text)) return; // ♪, vacías y RTL: tal cual
        // Salto (seek) o deriva respecto al reloj: las animaciones ya lanzadas van desfasadas → se rehacen
        const jump = clk.jump;
        clk.jump = false;
        if (jump || !el.__cs || el.__cs.idx !== cur || !el.querySelector(".cs-w") || el.__cs.real !== !!L[cur].w) buildLine(el, cur, t);
        const cs = el.__cs;
        if (jump) cs.prepped = -9;
        // La siguiente se trocea ya (sus trozos solo tienen estilo cuando es la actual): al
        // encenderse sale directamente con el relleno por palabras
        if (cs.prepped !== cur) {
            cs.prepped = cur;
            const nx = clk.els[cur + 1 + clk.off], nEl = nx && nx.querySelector(".lyrics-lyricsContent-text");
            const n = cur + 1, nt = nEl && nEl.textContent.trim();
            if (nEl && n < L.length && nt && /[\p{L}\p{N}]/u.test(nt) &&
                (jump || !(nEl.__cs && nEl.__cs.idx === n && nEl.querySelector(".cs-w")))) buildLine(nEl, n, t);
        }
    }

    // ---- Abrir y cerrar la letra ---------------------------------------------
    // El botón de Spotify cierra la letra con "atrás" en el historial: si se
    // llegó a ella sin página anterior (o la anterior es la propia letra) no
    // hace nada. Aquí se vuelve a la última página que no era la letra, y se
    // anima la salida antes de irse.
    let lastRoute = null, closing = false;
    function trackRoute() {
        const H = Spicetify.Platform && Spicetify.Platform.History;
        const l = H && H.location;
        if (l && l.pathname !== "/lyrics") lastRoute = { pathname: l.pathname, search: l.search || "", state: l.state };
    }
    function lyricsBack() {
        const H = Spicetify.Platform.History, prev = H.entries && H.entries[H.index - 1];
        if (prev && prev.pathname !== "/lyrics") H.goBack();
        else H.push(lastRoute || { pathname: "/" });
    }
    function closeLyrics() {
        const box = document.querySelector(".lyrics-lyrics-container");
        if (closing) return;
        const leave = () => { closing = false; lyricsBack(); };
        if (!box) return leave();
        closing = true;
        box.setAttribute("data-cs-out", "");
        setTimeout(leave, 380);
    }

    // ---- Búsqueda: el desplegable se pliega hacia la píldora al cerrarse ------
    // React lo desmonta al instante, así que se deja una copia que hace la salida.
    let searchH = 0; // altura del panel mientras estaba abierto
    function searchGhost(node) {
        const dd = node.id === "search-dropdown" ? node : node.querySelector && node.querySelector("#search-dropdown");
        const panel = dd && dd.querySelector(".main-actionBar-ActionBarContainer");
        const pill = document.querySelector(".main-globalNav-searchContainer");
        if (!panel || !pill || document.getElementById("search-dropdown")) return;
        const r = pill.getBoundingClientRect(), g = document.createElement("div");
        g.className = "cs-search-ghost";
        g.style.cssText = `left:${r.left}px;top:${r.bottom + 6}px;width:${r.width}px`;
        const clone = panel.cloneNode(true);
        if (searchH) clone.style.height = searchH + "px";
        g.append(clone);
        document.body.append(g);
        setTimeout(() => g.remove(), 260);
    }

    // ---- Vista cine / pantalla completa: título y artista bajo la portada -----
    // Spotify solo los enseña en el dock (que se esconde sin mover el ratón)
    function cineTitle() {
        const cover = document.querySelector(".Root__cinema-view .cover-art");
        let el = document.getElementById("cs-cine-title");
        if (!cover) return void (el && el.remove());
        const host = cover.parentElement, it = Spicetify.Player.data && Spicetify.Player.data.item;
        if (!it) return;
        if (!el || el.previousElementSibling !== host) {
            if (el) el.remove();
            el = document.createElement("div");
            el.id = "cs-cine-title";
            host.after(el);
        }
        const name = it.name || "", artists = (it.artists || []).map((a) => a.name).join(", ");
        if (el.dataset.k === name + "\n" + artists) return;
        el.dataset.k = name + "\n" + artists;
        const t = document.createElement("div"), a = document.createElement("div");
        t.className = "cs-cine-name"; t.textContent = name;
        a.className = "cs-cine-artist"; a.textContent = artists;
        el.replaceChildren(t, a);
    }

    // ---- Modo ambiente del vídeo a pantalla completa (vista cine con Canvas) -------------
    // Como el de YouTube: alrededor del vídeo, el fondo toma sus colores. Cada 100 ms se copia el
    // fotograma, estirado, a un canvas de 32×18 px (mezclado con el anterior: los colores cambian
    // suave) que el CSS amplía y difumina detrás del vídeo. Solo con vídeo sonando y la ventana visible.
    const amb = { c: null, g: null, t: 0, v: null };
    function ambDraw() {
        const v = amb.v;
        if (!v || !v.isConnected || v.readyState < 2 || v.paused || !v.videoWidth || !v.videoHeight) return;
        amb.g.drawImage(v, 0, 0, 32, 18);
    }
    // Los videoclips van con DRM (Widevine): sus fotogramas no se pueden leer (drawImage da negro).
    // Con ellos, un filtro SVG en el propio vídeo pinta debajo una copia ensanchada y difuminada:
    // lo hace el compositor, sin pasar por JS, y sigue al vídeo fotograma a fotograma.
    function ambSvg() {
        if (document.getElementById("cs-amb-svg")) return;
        const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        s.id = "cs-amb-svg";
        s.setAttribute("width", "0"); s.setAttribute("height", "0");
        s.style.position = "absolute";
        s.innerHTML = '<filter id="cs-amb-f" x="-50%" y="-70%" width="200%" height="240%" color-interpolation-filters="sRGB">' +
            '<feMorphology in="SourceGraphic" operator="dilate" radius="40" result="d"/>' +
            '<feGaussianBlur in="d" stdDeviation="110" result="b"/>' +
            '<feColorMatrix in="b" type="saturate" values="1.7" result="c"/>' +
            '<feComponentTransfer in="c" result="k"><feFuncR type="linear" slope="0.9"/><feFuncG type="linear" slope="0.9"/>' +
            '<feFuncB type="linear" slope="0.9"/><feFuncA type="linear" slope="1.3"/></feComponentTransfer>' +
            '<feMerge><feMergeNode in="k"/><feMergeNode in="SourceGraphic"/></feMerge></filter>';
        document.body.append(s);
    }
    // En Windows la pantalla solo se repinta donde cambia algo, y el resplandor llega más lejos de lo
    // que el navegador cree: el borde exterior se quedaba con los colores viejos en los cortes
    // bruscos del vídeo. Una capa casi transparente que cambia en cada fotograma obliga a repintar
    // toda la vista (#cs-amb-dmg; en Linux no hace falta).
    function ambDamage(on) {
        let d = document.getElementById("cs-amb-dmg");
        on = on && document.documentElement.dataset.csOs !== "linux";
        if (!on) return void (d && d.remove());
        if (d) return;
        d = document.createElement("div");
        d.id = "cs-amb-dmg";
        document.body.append(d);
    }
    function ambient() {
        const v = !document.hidden && document.querySelector(".Root__cinema-view video");
        ambDamage(!!(v && v.mediaKeys));
        if (v && v.mediaKeys) {
            ambSvg();
            if (!v.classList.contains("cs-amb-f")) v.classList.add("cs-amb-f");
            if (amb.t) { clearInterval(amb.t); amb.t = 0; amb.v = null; }
            if (amb.c) amb.c.remove();
            return;
        }
        const stage = v && (v.closest('.cs-cine-stage, [style*="--cinema-mode-bg-color-from"]') || v.parentElement && v.parentElement.parentElement);
        if (!v || !stage) {
            if (amb.t) { clearInterval(amb.t); amb.t = 0; amb.v = null; }
            if (amb.c) { amb.c.classList.remove("cs-on"); if (!v) amb.c.remove(); }
            return;
        }
        if (!amb.c) {
            amb.c = document.createElement("canvas");
            amb.c.id = "cs-amb";
            amb.c.width = 32; amb.c.height = 18;
            amb.g = amb.c.getContext("2d");
        }
        if (amb.c.parentElement !== stage) stage.append(amb.c);
        if (amb.v !== v) { amb.v = v; amb.g.globalAlpha = 1; ambDraw(); amb.g.globalAlpha = 0.3; }
        if (!amb.t) amb.t = setInterval(ambDraw, 100);
        requestAnimationFrame(() => amb.c && amb.c.classList.add("cs-on"));
    }

    // ---- Letra a pantalla completa ---------------------------------------------
    // Con la ventana a pantalla completa y la letra abierta (/lyrics), html[data-cs-fslyr]: la
    // letra ocupa toda la pantalla sobre el fondo de la carátula, con la portada grande, el
    // título y el artista a la izquierda (#cs-fslyr-art). Sin mover el ratón 3 s, el dock y el
    // cursor se esconden (data-cs-idle). El listener del puntero solo existe en este modo.
    let fsIdleT = 0, fsOn = false, fsChangeAt = 0;
    let fsPass = false; // el clic en el botón de pantalla completa va directo a Spotify
    const fsWake = () => {
        const root = document.documentElement;
        if (root.hasAttribute("data-cs-idle")) root.removeAttribute("data-cs-idle");
        clearTimeout(fsIdleT);
        fsIdleT = setTimeout(() => {
            // con el ratón encima del dock no se esconde
            if (fsOn && !document.querySelector(".Root__now-playing-bar:hover")) root.setAttribute("data-cs-idle", "");
        }, 3000);
    };
    function fsArt() {
        let el = document.getElementById("cs-fslyr-art");
        const top = document.querySelector(".Root__top-container");
        if (!fsOn || !top) return void (el && el.remove());
        const it = Spicetify.Player.data && Spicetify.Player.data.item;
        if (!el || el.parentElement !== top) {
            if (el) el.remove();
            el = document.createElement("div");
            el.id = "cs-fslyr-art";
            el.innerHTML = '<div class="cs-fa-tilt"><div class="cs-fa-cover"><img alt="" draggable="false"></div></div><div class="cs-fa-name"></div><div class="cs-fa-artist"></div><div class="cs-fa-prog"><i></i></div>';
            top.append(el);
        }
        const name = (it && it.name) || "", artists = ((it && it.artists) || []).map((a) => a.name).join(", ");
        const m = it && it.metadata, uri = m && (m.image_xlarge_url || m.image_large_url || m.image_url);
        const src = uri && uri.startsWith("spotify:image:") ? "https://i.scdn.co/image/" + uri.slice(14) : uri && uri.startsWith("http") ? uri : "";
        const k = name + "\n" + artists + "\n" + src;
        if (el.dataset.k === k) return;
        el.dataset.k = k;
        const img = el.querySelector("img");
        if (src && img.getAttribute("src") !== src) {
            // cambio de canción: la portada nueva entra cuando ya ha cargado
            el.classList.add("cs-fa-swap");
            const pre = new Image();
            pre.onload = pre.onerror = () => {
                if (el.dataset.k !== k) return; // ya suena otra canción
                img.src = src;
                el.classList.remove("cs-fa-swap");
            };
            pre.src = src;
        }
        el.querySelector(".cs-fa-cover").classList.toggle("cs-fa-empty", !src);
        el.querySelector(".cs-fa-name").textContent = name;
        el.querySelector(".cs-fa-artist").textContent = artists;
    }
    // Barra de progreso bajo el artista: un scaleX cada 500 ms con transición lineal (fuera del
    // scroll de la letra: no despierta a OverlayScrollbars)
    let fsProgT = 0;
    function fsProg() {
        clearTimeout(fsProgT);
        const bar = fsOn && document.querySelector("#cs-fslyr-art .cs-fa-prog i");
        if (!bar) return;
        const P = Spicetify.Player, dur = P.getDuration() || 0, t = P.getProgress() || 0;
        const p = dur ? Math.min(1, t / dur) : 0, prev = bar.__p || 0;
        // hacia atrás (seek, canción nueva) va directa; hacia delante, en línea con el tiempo
        bar.style.transition = p < prev || p - prev > 0.05 ? "none" : "";
        if (Math.abs(p - prev) > 0.0005) { bar.style.transform = `scaleX(${p.toFixed(4)})`; bar.__p = p; }
        fsNoLyrics();
        fsProgT = setTimeout(fsProg, 500);
    }

    // Sin letra (ni sincronizada ni sin sincronizar), la portada se centra como en la vista sin letra
    // (data-cs-fsnolyr). Se espera a que la búsqueda propia haya acabado y a que siga sin líneas un
    // segundo: mientras carga, o si la letra sin sincronizar tarda en pintarse, no se mueve.
    let fsNoLyrN = 0;
    function fsNoLyrics() {
        const root = document.documentElement;
        const none = fsOn && !!lyr.id && lyrCache.has(lyr.id) && !lyrCache.get(lyr.id) &&
            !document.querySelector(".Root__main-view .lyrics-lyricsContent-lyric");
        fsNoLyrN = none ? fsNoLyrN + 1 : 0;
        const on = fsNoLyrN >= 2;
        if (root.hasAttribute("data-cs-fsnolyr") !== on && (on || !none)) root.toggleAttribute("data-cs-fsnolyr", on);
    }

    // La portada late con la canción: un pulso de escala en cada beat (análisis de audio de
    // Spotify), más fuerte en el primero de cada compás y en las partes que suenan fuerte
    const fsBeat = { id: "", beats: null, t: 0 };
    async function fsBeatLoad() {
        const it = Spicetify.Player.data && Spicetify.Player.data.item, id = (it && it.uri) || "";
        if (fsBeat.id === id) return;
        fsBeat.id = id;
        fsBeat.beats = null;
        if (!/^spotify:track:/.test(id) || !Spicetify.getAudioData) return;
        try {
            const d = await Spicetify.getAudioData(id);
            if (fsBeat.id !== id || !d || !Array.isArray(d.beats)) return;
            const segs = d.segments || [], bars = new Set((d.bars || []).map((b) => Math.round(b.start * 1000)));
            const base = (d.track && d.track.loudness) || -10;
            let si = 0;
            fsBeat.beats = d.beats.filter((b) => b.confidence > 0.05).map((b) => {
                const t = Math.round(b.start * 1000);
                while (si + 1 < segs.length && segs[si + 1].start <= b.start) si++;
                const L = segs[si] ? segs[si].loudness_max : base;
                const k = Math.max(0, Math.min(1, (L - base + 8) / 12)) * (bars.has(t) ? 1 : 0.6);
                return { t, a: 0.004 + 0.016 * k, d: Math.round(b.duration * 1000) };
            });
            fsBeatTick();
        } catch (e) { /* sin análisis: la portada se queda quieta */ }
    }
    function fsBeatTick() {
        clearTimeout(fsBeat.t);
        const B = fsBeat.beats, cover = fsOn && B && document.querySelector("#cs-fslyr-art .cs-fa-cover");
        if (!cover || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        if (!Spicetify.Player.isPlaying()) return void (fsBeat.t = setTimeout(fsBeatTick, 400));
        const t = Spicetify.Player.getProgress();
        let lo = 0, hi = B.length;
        while (lo < hi) { const m = (lo + hi) >> 1; if (B[m].t <= t + 15) lo = m + 1; else hi = m; }
        const b = B[lo];
        if (!b) return void (fsBeat.t = setTimeout(fsBeatTick, 1000));
        const wait = b.t - t;
        if (wait > 1200) return void (fsBeat.t = setTimeout(fsBeatTick, 1000));
        fsBeat.t = setTimeout(() => {
            if (!fsOn) return;
            cover.animate([{ transform: "scale(1)" }, { transform: `scale(${(1 + b.a).toFixed(4)})`, offset: 0.16 }, { transform: "scale(1)" }],
                { duration: Math.max(220, Math.min(700, b.d * 0.95)), easing: "cubic-bezier(0.3, 0.7, 0.4, 1)" });
            fsBeatTick();
        }, Math.max(0, wait));
    }

    // Entrar o salir de pantalla completa recoloca toda la ventana (unos cientos de ms a
    // trompicones): un velo con el color del tema lo tapa y se retira cuando el tamaño se asienta
    let fsVeilN = 0;
    // Coreografía: al pedir el cambio, lo que hay se aparta (data-cs-fsgo: la portada y la letra se
    // encogen y se apagan) mientras entra el velo, que lleva la carátula difuminada; al retirarse el
    // velo, el modo nuevo entra (data-cs-fsin: portada, letra y dock, en cascada; data-cs-fsback:
    // la ventana normal vuelve a su tamaño)
    function coverSrc() {
        const it = Spicetify.Player.data && Spicetify.Player.data.item, m = it && it.metadata;
        const uri = m && (m.image_xlarge_url || m.image_large_url || m.image_url);
        return uri && uri.startsWith("spotify:image:") ? "https://i.scdn.co/image/" + uri.slice(14) : uri && uri.startsWith("http") ? uri : "";
    }
    let fsAnimT = 0;
    // la portada del dock (ventana normal) o la grande de la pantalla completa
    // (en la vista cine, su portada; con videoclip no hay: la carátula sale y llega al centro)
    const fsCoverEl = () => document.querySelector(fsOn ? "#cs-fslyr-art .cs-fa-cover" :
        document.querySelector(".Root__cinema-view") ? ".Root__cinema-view .cover-art" :
        ".Root__now-playing-bar .main-nowPlayingWidget-coverArt, .Root__now-playing-bar .main-coverSlotCollapsed-container");
    const rectOf = (el) => { const r = el && el.getBoundingClientRect(); return r && r.width > 4 ? { l: r.left, t: r.top, w: r.width, h: r.height } : null; };
    function centerRect() {
        const s = Math.min(innerHeight * 0.42, innerWidth * 0.34);
        return { l: (innerWidth - s) / 2, t: (innerHeight - s) / 2, w: s, h: s };
    }
    // FLIP: la caja queda en `to` y un transform la lleva desde `from`
    function flyCover(img, from, to, dur) {
        Object.assign(img.style, { left: to.l + "px", top: to.t + "px", width: to.w + "px", height: to.h + "px" });
        if (!from) return null;
        return img.animate([
            { transform: `translate(${from.l - to.l}px, ${from.t - to.t}px) scale(${from.w / to.w}, ${from.h / to.h})` },
            { transform: "none" },
        ], { duration: dur, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "backwards" });
    }
    let fsVeilBusy = false;
    // la vista cine abre y cierra con una view transition de Spotify, que se pinta por encima de
    // todo (capa superior): con el velo puesto se salta (el cambio ocurre igual, sin animación)
    if (document.startViewTransition && !document.__csVT) {
        const svt = document.startViewTransition.bind(document);
        document.__csVT = true;
        document.startViewTransition = (...a) => {
            const vt = svt(...a);
            if (fsVeilBusy) try { vt.skipTransition(); } catch (e) { /* ya terminada */ }
            return vt;
        };
    }
    function fsVeil(action) {
        const n = ++fsVeilN, root = document.documentElement;
        fsVeilBusy = true;
        setTimeout(() => { if (n === fsVeilN) fsVeilBusy = false; }, 8000);
        let v = document.getElementById("cs-fs-veil");
        if (!v) {
            v = document.createElement("div");
            v.id = "cs-fs-veil";
            v.innerHTML = '<img class="cs-veil-cover" alt="" draggable="false">';
            document.body.append(v);
        }
        const src = coverSrc(), img = v.querySelector(".cs-veil-cover");
        v.style.setProperty("--cs-veil-img", src ? `url("${src}")` : "none");
        clearTimeout(fsAnimT);
        root.removeAttribute("data-cs-fsin");
        root.removeAttribute("data-cs-fsback");
        // con el botón, la carátula vuela desde donde está (dock o pantalla completa) al centro
        // mientras la ventana se recoloca, y de ahí a su sitio en el modo nuevo
        const fly = !!(action && src && !matchMedia("(prefers-reduced-motion: reduce)").matches);
        img.getAnimations().forEach((x) => x.cancel());
        img.classList.toggle("cs-on", fly);
        if (fly) {
            if (img.getAttribute("src") !== src) img.src = src;
            const from = rectOf(fsCoverEl()), mid = centerRect();
            flyCover(img, from || mid, mid, 620);
            root.setAttribute("data-cs-fsfly", "");
            // la ventana cambia de tamaño: el centro se mueve, y la carátula lo sigue suave
            const recenter = () => {
                if (n !== fsVeilN || !img.classList.contains("cs-on")) return;
                const cur = rectOf(img);
                img.getAnimations().forEach((x) => x.cancel());
                flyCover(img, cur, centerRect(), 380);
            };
            addEventListener("resize", recenter, { once: true });
        }
        v.classList.add("cs-on");
        if (action) root.setAttribute("data-cs-fsgo", "");
        let revealed = false;
        const reveal = () => {
            if (n !== fsVeilN || revealed) return;
            revealed = true;
            fsVeilBusy = false;
            root.removeAttribute("data-cs-fsfly");
            root.setAttribute(fsOn ? "data-cs-fsin" : "data-cs-fsback", "");
            fsAnimT = setTimeout(() => { root.removeAttribute("data-cs-fsin"); root.removeAttribute("data-cs-fsback"); }, 1600);
            v.classList.remove("cs-on");
        };
        const lift = () => {
            // espera a que la recolocación acabe: 3 fotogramas rápidos seguidos (máx. 1,2 s de
            // reloj: al salir de la vista cine Spotify pasa segundos a 1–2 fps y el velo no se iría)
            let calm = 0, last = performance.now(), went = false;
            const t0 = last;
            const go = () => {
                if (n !== fsVeilN || went) return;
                went = true;
                fsLyrics();
                fsRecenter();
                root.removeAttribute("data-cs-fsgo");
                if (!fly) return void setTimeout(reveal, 16);
                // la carátula aterriza en su sitio nuevo y entonces se retira el velo
                const cur = rectOf(img), to = rectOf(fsCoverEl()) || centerRect();
                img.getAnimations().forEach((x) => x.cancel());
                const an = flyCover(img, cur, to, 520);
                if (an) { an.onfinish = reveal; setTimeout(reveal, 700); } else reveal();
            };
            const chk = (now) => {
                if (n !== fsVeilN || went) return;
                calm = now - last < 34 ? calm + 1 : 0;
                last = now;
                if (calm < 3 && now - t0 < 1200) return void requestAnimationFrame(chk);
                go();
            };
            requestAnimationFrame(chk);
            setTimeout(go, 1200);
        };
        if (!action) return lift();
        // el velo entra (220 ms) antes de pedir el cambio
        setTimeout(() => { if (n === fsVeilN) Promise.resolve().then(action).catch(() => {}).finally(lift); }, 230);
    }

    // ---- Carátula que se inclina hacia el ratón (pantalla completa) ---------------------------
    // La de la letra a pantalla completa y la de la vista cine: gira hasta 9° hacia la esquina que
    // tiene el ratón, con un brillo que lo sigue; al salir vuelve suave a su sitio.
    const TILT_SEL = "#cs-fslyr-art .cs-fa-tilt, .Root__cinema-view .cover-art";
    let tiltEl = null, tiltRaf = 0, tiltEv = null;
    function tiltApply() {
        tiltRaf = 0;
        const e = tiltEv, el = tiltEl;
        if (!el || !e) return;
        const r = el.getBoundingClientRect();
        const x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
        const y = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
        el.style.setProperty("--tx", x.toFixed(3));
        el.style.setProperty("--ty", y.toFixed(3));
    }
    function tiltLeave() {
        if (!tiltEl) return;
        tiltEl.removeAttribute("data-cs-tilt");
        tiltEl.style.setProperty("--tx", "0");
        tiltEl.style.setProperty("--ty", "0");
        tiltEl = null;
    }
    document.addEventListener("pointermove", (e) => {
        const el = e.target instanceof Element && e.target.closest(TILT_SEL);
        if (el !== tiltEl) { tiltLeave(); if (el) { tiltEl = el; el.setAttribute("data-cs-tilt", ""); } }
        if (!el) return;
        tiltEv = e;
        if (!tiltRaf) tiltRaf = requestAnimationFrame(tiltApply);
    }, { capture: true, passive: true });
    document.documentElement.addEventListener("mouseleave", tiltLeave);

    // la letra cambia de tamaño al entrar y salir: la frase actual vuelve al centro, sin animación
    function fsRecenter() {
        const line = clk.on && clk.follow && clk.els && clk.els[clk.cur + clk.off];
        if (line) smoothCenter(line, true);
    }

    function fsLyrics() {
        const root = document.documentElement, H = Spicetify.Platform && Spicetify.Platform.History;
        const on = !!document.fullscreenElement && !!(H && H.location && H.location.pathname === "/lyrics") &&
            !document.querySelector(".Root__cinema-view");
        if (on !== fsOn) {
            fsOn = on;
            root.toggleAttribute("data-cs-fslyr", on);
            // el botón del dock sale de pantalla completa en este modo (el icono cambia por CSS)
            const fb = document.querySelector('.Root__now-playing-bar [data-testid="fullscreen-mode-button"]');
            if (fb) {
                if (on) { fb.__csLabel = fb.getAttribute("aria-label"); fb.setAttribute("aria-label", "Salir de pantalla completa"); }
                else if (fb.__csLabel) fb.setAttribute("aria-label", fb.__csLabel);
            }
            if (on) {
                document.addEventListener("pointermove", fsWake, { capture: true, passive: true });
                fsWake();
                setTimeout(() => { fsProg(); fsBeatLoad(); fsBeatTick(); }, 0);
            }
            else {
                clearTimeout(fsProgT);
                clearTimeout(fsBeat.t);
                fsNoLyrN = 0;
                root.removeAttribute("data-cs-fsnolyr");
                document.removeEventListener("pointermove", fsWake, true);
                clearTimeout(fsIdleT);
                root.removeAttribute("data-cs-idle");
            }
        }
        fsArt();
    }

    // ---- Dock: en ventanas estrechas conserva su tamaño y flota sobre los paneles
    const DOCK_W = 760, DOCK_INSET = 12;
    function dockLayout() {
        const root = document.documentElement;
        const main = document.querySelector(".Root__main-view"), dock = document.querySelector(".Root__now-playing-bar");
        if (!main || !dock || root.hasAttribute("data-cs-anim")) return; // en plena animación el rect va transformado
        const vw = root.clientWidth;
        // Vista "Sonando" expandida: el panel central se oculta (display:none) y el dock, sin
        // celda de rejilla, flota centrado en la ventana
        const hidden = !main.offsetWidth;
        const m = hidden ? { left: 0, width: vw } : main.getBoundingClientRect();
        // El dock va al fondo de la celda del panel central; en Spotify 1.3.3 esa celda baja más que
        // el panel (llega al borde de la ventana) y el dock quedaba por debajo. Se sube lo que sobre.
        if (!hidden && !root.hasAttribute("data-cs-dock-float")) {
            const lift = parseFloat(root.style.getPropertyValue("--cs-dock-lift")) || 0;
            const inset = parseFloat(getComputedStyle(root).getPropertyValue("--cs-inset")) || 12;
            const next = Math.max(0, Math.round(lift + dock.getBoundingClientRect().bottom - (m.bottom - inset)));
            if (next !== lift) root.style.setProperty("--cs-dock-lift", next + "px");
        }
        if (!hidden && m.width - 2 * DOCK_INSET >= DOCK_W) return root.removeAttribute("data-cs-dock-float");
        // Expandida: el dock queda DENTRO de la vista (mismo margen que sobre el panel central),
        // no sobre su esquina redondeada ni sobre el marco de la ventana
        const top = document.querySelector(".Root__top-container"), rs = document.querySelector(".Root__right-sidebar");
        const pad = hidden && top ? parseFloat(getComputedStyle(top).paddingLeft) || 0 : 0;
        const rowBottom = hidden && rs ? rs.getBoundingClientRect().bottom : 0;
        if (hidden && rowBottom) root.style.setProperty("--cs-dock-b", root.clientHeight - rowBottom + DOCK_INSET + "px");
        else root.style.removeProperty("--cs-dock-b");
        const w = Math.min(vw - 2 * (DOCK_INSET + pad), DOCK_W);
        const x = Math.max(DOCK_INSET + pad, Math.min(vw - w - DOCK_INSET - pad, m.left + m.width / 2 - w / 2));
        root.style.setProperty("--cs-dock-w", w + "px");
        root.style.setProperty("--cs-dock-x", x + "px");
        root.setAttribute("data-cs-dock-float", "");
    }
    let dockRO = null, dockEl = null;

    // Letra en la vista "Sonando" expandida: la cabecera (título y botones) queda sobre el texto
    // que se desplaza; el contenedor con scroll lleva un desvanecido arriba (`data-cs-lyr-scroll`)
    function markLyricsScroll() {
        const lc = document.querySelector(".lyrics-lyrics-container");
        const cur = document.querySelector("[data-cs-lyr-scroll]");
        if (!lc || lc.closest(".Root__main-view")) return cur?.removeAttribute("data-cs-lyr-scroll");
        let e = lc.parentElement;
        while (e && e !== document.body) {
            const oy = getComputedStyle(e).overflowY;
            if ((oy === "auto" || oy === "scroll") && e.scrollHeight > e.clientHeight) break;
            e = e.parentElement;
        }
        if (!e || e === document.body) return cur?.removeAttribute("data-cs-lyr-scroll");
        if (cur && cur !== e) cur.removeAttribute("data-cs-lyr-scroll");
        e.setAttribute("data-cs-lyr-scroll", "");
    }

    // ---- Paneles laterales: al cambiar de ancho (abrir, cerrar, contraer) se marca
    // `data-cs-anim` un momento para que el CSS haga la animación de entrada
    const ANIM_MS = 800;
    let sideRO = null, animT = 0, animId = 0, animEnd = 0, animCount = 0;
    const sideW = {};
    const noSideAnim = () => {
        const v = window.Spicetify && Spicetify.Platform && Spicetify.Platform.version;
        const [a, b, c] = String(v || "").split(".").map(Number);
        return a > 1 || (a === 1 && (b > 3 || (b === 3 && c >= 2)));
    };
    function watchSides() {
        const nav = document.querySelector(".Root__nav-bar"), rs = document.querySelector(".Root__right-sidebar");
        if (sideRO || !nav || !rs) return;
        const width = (e) => e.getBoundingClientRect().width;
        sideW.left = width(nav);
        sideW.right = width(rs);
        // Biblioteca contraída: un atributo propio en vez de `[style*=...]`, que hacía recalcular
        // los estilos de todo el panel cada vez que Spotify tocaba su `style`
        // (en Spotify 1.3.3 la variable ya no va en el panel sino en un div vacío a su lado)
        const widthHost = [...nav.parentElement.children].find((e) => e !== nav && /--left-sidebar-width/.test(e.getAttribute("style") || ""));
        const markMin = () => nav.toggleAttribute("data-cs-lib-min",
            /--left-sidebar-width:\s*72\b/.test((nav.getAttribute("style") || "") + (widthHost ? widthHost.getAttribute("style") || "" : "")));
        markMin();
        new MutationObserver(markMin).observe(nav, { attributes: true, attributeFilter: ["style"] });
        if (widthHost) new MutationObserver(markMin).observe(widthHost, { attributes: true, attributeFilter: ["style"] });
        // Las columnas de la rejilla se fijan en el ancho anterior y se llevan al nuevo con una
        // transición CSS: el panel se desliza de verdad (a costa de que Spotify recoloque el
        // panel central en cada fotograma; el CSS lo abarata con `contain`)
        const top = document.querySelector(".Root__top-container");
        sideRO = new ResizeObserver(() => {
            const root = document.documentElement;
            if (root.hasAttribute("data-cs-anim")) return; // fotogramas de la propia animación
            const l = width(nav), r = width(rs), oldL = sideW.left, oldR = sideW.right;
            sideW.left = l;
            sideW.right = r;
            // Spotify >= 1.3.2: sin animación. Interpolar la rejilla desde JS compite con su propio
            // layout (variables --left/right-sidebar-width) y en Windows cierra la app (issue #7)
            if (noSideAnim()) return;
            // al entrar o salir de pantalla completa los anchos cambian con la ventana: sin animación
            // (con la letra a pantalla completa ni se ven, y el tween alargaba 1-2 s el tirón)
            if (fsOn || performance.now() - fsChangeAt < 2500) return;
            const dl = Math.abs(l - oldL) >= 3, dr = Math.abs(r - oldR) >= 3;
            if ((!dl && !dr) || root.hasAttribute("data-cs-drag") || !top) return;
            // Cortafuegos: si la rejilla no es la de Spotify 1.2 (p. ej. 1.3.x en Windows) o el ancho
            // final no coincide con el pedido, el observador relanzaba la animación sin parar
            // (relayout continuo → cierre de la app). Tras una animación, 1,5 s sin otra; y como
            // mucho 3 seguidas.
            const now = performance.now();
            animCount = now - animEnd < 1500 ? animCount + 1 : 0;
            if (now - animEnd < 1500 && animCount >= 1) return;
            const cs = getComputedStyle(top);
            // Solo la rejilla de 3 columnas (biblioteca | centro | derecho): con 2 (panel derecho
            // cerrado en 1.3.x) forzar tres pistas descuadra el layout
            if (cs.display !== "grid" || cs.gridTemplateColumns.split(" ").length !== 3 || l < 1 || r < 1) return;
            // Anchos finales/máximos de cada zona: su contenido se queda fijo en ellos mientras las
            // columnas se mueven, así no se recoloca en cada fotograma (la parte que sobra se recorta)
            const mv = document.querySelector(".Root__main-view .main-view-container");
            root.style.setProperty("--cs-main-w", (mv ? mv.getBoundingClientRect().width : 0) + "px");
            root.style.setProperty("--cs-nav-w", Math.max(l, oldL) + "px");
            root.style.setProperty("--cs-rs-w", Math.max(r, oldR) + "px");
            root.setAttribute("data-cs-anim", dl && dr ? "both" : dl ? "left" : "right");
            // Tween propio, un paso por fotograma pintado: el progreso sale del reloj (como una
            // transición CSS) pero no se pide otro cambio de ancho hasta que el anterior se ha
            // pintado, así Spotify no acumula recolocaciones pendientes
            const ease = (x) => 1 - Math.pow(1 - x, 3.2);
            const id = ++animId;
            let t0 = 0;
            top.style.gridTemplateColumns = `${oldL}px 1fr ${oldR}px`; // se mantiene el reparto anterior
            // Spotify tarda ~1-2 s en recolocarse tras el cambio (fotogramas de 150-400 ms): la
            // animación espera a que se calme (3 fotogramas seguidos rápidos) y entonces corre fluida
            let calm = 0, last = performance.now(), waited = 0;
            const settle = (now) => {
                if (id !== animId) return;
                calm = now - last < 34 ? calm + 1 : 0;
                waited += now - last;
                last = now;
                if (calm >= 3 || waited > 4000) { t0 = performance.now(); root.setAttribute("data-cs-go", ""); return step(); }
                requestAnimationFrame(settle);
            };
            const step = () => {
                if (id !== animId) return;
                const p = Math.min(1, (performance.now() - t0) / ANIM_MS), e = ease(p);
                top.style.gridTemplateColumns = `${oldL + (l - oldL) * e}px 1fr ${oldR + (r - oldR) * e}px`;
                if (p < 1) return requestAnimationFrame(step);
                top.style.gridTemplateColumns = "";
                animEnd = performance.now();
                sideW.left = width(nav);
                sideW.right = width(rs);
                // El atributo se quita un fotograma después: el salto al ancho nativo no relanza la animación
                requestAnimationFrame(() => {
                    root.removeAttribute("data-cs-anim");
                    root.removeAttribute("data-cs-go");
                    dockLayout();
                });
            };
            requestAnimationFrame(settle);
        });
        sideRO.observe(nav);
        sideRO.observe(rs);
    }

    function init() {
        if (!window.Spicetify || !Spicetify.Player || !Spicetify.Player.addEventListener) {
            setTimeout(init, 250);
            return;
        }
        syncMode();
        // Sistema operativo: cada uno dibuja los controles de ventana en un sitio
        const osName = String((Spicetify.Platform && Spicetify.Platform.OSName) || navigator.platform).toLowerCase();
        document.documentElement.dataset.csOs = /win/.test(osName) ? "windows" : /mac|osx|darwin/.test(osName) ? "mac" : "linux";
        const rgb = getComputedStyle(document.documentElement).getPropertyValue("--spice-rgb-button-active").trim();
        baseAccent = rgb ? `rgb(${rgb})` : "#c6c6c6";
        setAccent(null);
        // Marca si el panel central está desplazado: la cabecera de columnas solo
        // lleva fondo cuando hay contenido pasando por debajo.
        const root = document.documentElement;
        // `data-cs-stuck`: la cabecera de columnas ya está pegada bajo la barra
        // superior (antes de eso va en su sitio, sin cristal)
        let raf = 0, stickyTop = new WeakMap(), lastFade = -1, fadeEl = null;
        // Lecturas primero y escrituras solo si algo cambia: escribir una variable en <html> en cada
        // fotograma de scroll invalida el estilo de TODO el documento (y leer después fuerza el recálculo)
        function syncStuck(t) {
            raf = 0;
            const h = document.querySelector(".main-trackList-trackListHeader");
            let stuck = false;
            if (h) {
                let off = stickyTop.get(h);
                if (off === undefined) stickyTop.set(h, off = parseFloat(getComputedStyle(h).top) || 0);
                stuck = h.getBoundingClientRect().top <= t.getBoundingClientRect().top + off + 0.5;
            }
            const st = t.scrollTop;
            if (root.hasAttribute("data-cs-scrolled") !== st > 6) root.toggleAttribute("data-cs-scrolled", st > 6);
            if (root.hasAttribute("data-cs-stuck") !== stuck) root.toggleAttribute("data-cs-stuck", stuck);
            // pegada, la cabecera lleva el cristal de las dos (sube por detrás de la barra del título)
            if (stuck && h) {
                const bar = document.querySelector(".main-topBar-container"), bh = bar ? Math.round(bar.getBoundingClientRect().height) : 64;
                if (h.__csBar !== bh) { h.__csBar = bh; h.style.setProperty("--cs-bar-h", bh + "px"); }
            }
            // La foto de cabecera (artista) está fija detrás: se desvanece al desplazar. La variable
            // va solo en su contenedor y se deja de escribir una vez apagada (>260 px).
            const fade = Math.min(260, Math.round(st));
            const fe = document.querySelector(".before-scroll-node");
            if (fe && (fe !== fadeEl || fade !== lastFade)) {
                fadeEl = fe; lastFade = fade;
                fe.style.setProperty("--cs-scroll", fade);
            }
        }
        let scrollEl = null;
        document.addEventListener("scroll", (e) => {
            const t = e.target;
            if (t instanceof Element && t.closest(".Root__main-view") && !raf) {
                scrollEl = t;
                raf = requestAnimationFrame(() => syncStuck(t));
            }
        }, true);
        // al volver de la letra o de la pantalla completa Spotify repone el scroll sin evento: la
        // barra se quedaba sin fondo hasta volver a desplazar
        const resyncStuck = () => [120, 500, 1200].forEach((ms) => setTimeout(() => {
            if (!scrollEl || !scrollEl.isConnected) {
                const mv = document.querySelector(".Root__main-view");
                scrollEl = mv && [...mv.querySelectorAll(".main-view-container__scroll-node, [data-overlayscrollbars-viewport]")]
                    .find((e) => e.scrollHeight > e.clientHeight + 4) || null;
            }
            if (scrollEl && !raf) syncStuck(scrollEl);
        }, ms));
        document.addEventListener("fullscreenchange", resyncStuck);
        // Cambio de página (p. ej. de una playlist a otra): entrada animada del panel central.
        // Se ignora la letra (tiene su propia animación) y los cambios de solo query/hash.
        // Spotify sustituye el objeto History después de arrancar: se re-engancha si cambia.
        let lastPath = null, routeT = 0, boundH = null;
        const onRoute = (loc) => {
            root.removeAttribute("data-cs-scrolled"); root.removeAttribute("data-cs-stuck");
            if (fadeEl) fadeEl.style.setProperty("--cs-scroll", 0);
            lastFade = -1;
            const path = loc && loc.pathname;
            fsLyrics();
            resyncStuck();
            if (path === lastPath) return;
            const skip = path === "/lyrics" || lastPath === "/lyrics";
            lastPath = path;
            if (skip) return;
            root.removeAttribute("data-cs-route");
            void root.offsetWidth; // reinicia la animación si se navega otra vez enseguida
            root.setAttribute("data-cs-route", "");
            clearTimeout(routeT);
            routeT = setTimeout(() => root.removeAttribute("data-cs-route"), 900);
        };
        const bindHistory = () => {
            const H = Spicetify.Platform && Spicetify.Platform.History;
            if (!H || !H.listen || H === boundH) return;
            boundH = H;
            lastPath = H.location && H.location.pathname;
            H.listen(onRoute);
            H.listen(trackRoute);
        };
        bindHistory();
        new MutationObserver(queueRelabel).observe(document.body, { childList: true, subtree: true });
        new MutationObserver((muts) => {
            for (const m of muts) {
                if (!m.removedNodes.length || !(m.target instanceof Element) || !m.target.closest(".main-globalNav-searchContainer")) continue;
                for (const n of m.removedNodes) if (n.nodeType === 1) searchGhost(n);
            }
        }).observe(document.body, { childList: true, subtree: true });
        window.addEventListener("resize", dockLayout);
        document.addEventListener("pointerdown", (e) => {
            if (e.target instanceof Element && e.target.closest(".LayoutResizer__resize-bar")) document.documentElement.setAttribute("data-cs-drag", "");
        }, true);
        const endDrag = () => document.documentElement.removeAttribute("data-cs-drag");
        window.addEventListener("pointerup", endDrag, true);
        window.addEventListener("pointercancel", endDrag, true);
        document.addEventListener("pointerdown", () => {
            const sp = document.querySelector("#search-dropdown .main-actionBar-ActionBarContainer");
            if (sp) searchH = sp.getBoundingClientRect().height;
        }, true);
        trackRoute();
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const spotifyFs = (b) => { fsPass = true; try { b.click(); } finally { fsPass = false; } };
        // Pantalla completa con la letra abierta: en vez de la vista cine (que tapa la letra), la
        // ventana a pantalla completa con la letra (data-cs-fslyr); el mismo botón la cierra
        document.addEventListener("click", (e) => {
            const FSB = '[data-testid="fullscreen-mode-button"]';
            let b = e.target instanceof Element && e.target.closest(FSB);
            // la vista cine tiene su propio botón de salir arriba (sin data-testid): mismo texto que el del dock
            if (!b && e.target instanceof Element && e.target.closest(".Root__cinema-view")) {
                const c = e.target.closest("button"), d = document.querySelector(FSB);
                if (c && d && c.getAttribute("aria-label") && c.getAttribute("aria-label") === d.getAttribute("aria-label")) b = c;
            }
            const H = Spicetify.Platform.History;
            if (!b || fsPass) return;
            // espera al cambio de pantalla completa y, al salir con el botón del dock, a que se cierre
            // la vista cine: Spotify suelta primero la pantalla completa y la cierra segundos después
            // (máx. 4 s en total). El de arriba (y Esc) solo quita la pantalla completa: la vista cine
            // sigue abierta, en la ventana
            const fromTop = !!b.closest(".Root__cinema-view");
            const fsDone = () => new Promise((res) => {
                const t0 = performance.now(), leaving = !!document.fullscreenElement && !fromTop;
                const done = () => {
                    document.removeEventListener("fullscreenchange", done);
                    const poll = () => {
                        if (!leaving || !document.querySelector(".Root__cinema-view") || performance.now() - t0 > 4000) return res();
                        setTimeout(poll, 50);
                    };
                    poll();
                };
                setTimeout(() => { if (performance.now() - t0 >= 3990) done(); }, 4000);
                document.addEventListener("fullscreenchange", done);
            });
            const cine = b.closest(".Root__cinema-view") || document.querySelector(".Root__cinema-view");
            const lyrics = H.location && H.location.pathname === "/lyrics";
            e.preventDefault();
            e.stopImmediatePropagation();
            if (fsOn) { fsChangeAt = performance.now(); fsVeil(() => document.exitFullscreen()); return; }
            if (document.fullscreenElement || cine || !lyrics) {
                // la pantalla completa de Spotify (normal o vista cine), con la misma coreografía: el
                // clic llega a Spotify cuando el velo ya ha entrado (el gesto del usuario sigue valiendo)
                fsVeil(() => { const p = fsDone(); spotifyFs(b); return p; });
                return;
            }
            fsVeil(() => document.documentElement.requestFullscreen());
        }, true);
        // cierra la vista cine sin soltar la pantalla completa: en 1.2 basta con ir a otra ruta; si
        // sigue abierta (1.3), se minimiza en ventana y se vuelve a pedir la pantalla completa (el
        // gesto del clic sigue valiendo unos segundos)
        async function cineClose() {
            if (!document.querySelector(".Root__cinema-view")) return;
            const min = Spicetify.Locale && Spicetify.Locale.get("web-player.cinema-mode.minimize");
            const head = () => document.querySelector(".Root__cinema-view > div:first-child");
            const btn = (label) => label && head() && [...head().querySelectorAll("button")].find((x) => x.getAttribute("aria-label") === label);
            if (document.fullscreenElement && !btn(min)) {
                const fb = document.querySelector('.Root__now-playing-bar [data-testid="fullscreen-mode-button"]');
                const out = btn(fb && fb.getAttribute("aria-label"));
                if (out) { spotifyFs(out); await wait(500); }
            }
            const m = btn(min);
            if (m) { m.click(); await wait(400); }
            if (!document.fullscreenElement) await document.documentElement.requestFullscreen().catch(() => {});
        }
        document.addEventListener("click", (e) => {
            const b = e.target instanceof Element && e.target.closest('[data-testid="lyrics-button"]');
            const H = Spicetify.Platform.History;
            if (!b || !H.location) return;
            const cine = document.querySelector(".Root__cinema-view"), lyr = H.location.pathname === "/lyrics";
            // vista cine en ventana: el botón de Spotify abre la letra y cierra la vista
            if (cine && !document.fullscreenElement) return;
            if (!cine && !lyr) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            if (cine) {
                // a pantalla completa, la letra del tema (la de Spotify se queda dentro de la vista cine)
                fsVeil(async () => {
                    H.push("/lyrics");
                    await wait(400);
                    await cineClose();
                });
                return;
            }
            if (!fsOn) return closeLyrics();
            // letra a pantalla completa: se cierra la letra y sigue la pantalla completa, con la vista cine
            fsVeil(async () => {
                lyricsBack();
                await wait(350);
                const fb = document.querySelector('.Root__now-playing-bar [data-testid="fullscreen-mode-button"]');
                if (document.fullscreenElement && !document.querySelector(".Root__cinema-view") && fb) spotifyFs(fb);
                await wait(300);
            });
        }, true);
        // En Windows/macOS el botón de letra abría la letra a pantalla completa (vista "Sonando"
        // expandida): se lleva a la página /lyrics como en Linux. Si esa página no llega a
        // mostrar la letra, se deshace y se deja actuar al botón original.
        // En Spotify 1.3 (Windows 1.3.1) /lyrics sí monta la letra en el panel central, pero con
        // clases ofuscadas (sin .lyrics-lyrics-container): se reconoce por las líneas de letra
        // grandes. Si no aparece nada, se deshace una vez y no se vuelve a intentar.
        let lyrBypass = false, lyrPageBroken = false;
        const lyricsShown = () => {
            if (document.querySelector(".lyrics-lyrics-container")) return true;
            const mv = document.querySelector(".Root__main-view");
            if (!mv) return false;
            let n = 0;
            for (const e of mv.querySelectorAll("div, span, p")) {
                if (e.firstElementChild || !e.textContent.trim() || parseFloat(getComputedStyle(e).fontSize) < 28) continue;
                if (++n >= 3) return true;
            }
            return false;
        };
        document.addEventListener("click", (e) => {
            const b = e.target instanceof Element && e.target.closest('[data-testid="lyrics-button"]');
            const H = Spicetify.Platform.History;
            if (!b || lyrBypass || lyrPageBroken || document.documentElement.dataset.csOs === "linux" || !H.location || H.location.pathname === "/lyrics" ||
                document.querySelector(".Root__cinema-view")) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            H.push("/lyrics");
            setTimeout(() => {
                // la letra puede montarse fuera de .Root__main-view según la versión de Spotify
                if (lyricsShown() || H.location.pathname !== "/lyrics") return;
                lyrPageBroken = true;
                H.goBack();
                lyrBypass = true;
                b.click();
                lyrBypass = false;
            }, 2500);
        }, true);
        Spicetify.Player.addEventListener("songchange", update);
        Spicetify.Player.addEventListener("songchange", loadLyrics);
        Spicetify.Player.addEventListener("songchange", cineTitle);
        Spicetify.Player.addEventListener("songchange", () => { fsArt(); if (fsOn) fsBeatLoad(); });
        setInterval(ambient, 1000);
        document.addEventListener("visibilitychange", ambient);
        document.addEventListener("fullscreenchange", () => {
            fsChangeAt = performance.now();
            // cambio sin el botón (Esc, F11) con la letra o la vista cine abiertas: la misma coreografía
            // (la carátula vuela a su sitio nuevo) y el velo tapa la recolocación
            const H = Spicetify.Platform.History;
            if ((fsOn || (H.location && H.location.pathname === "/lyrics") || document.querySelector(".Root__cinema-view")) && !fsVeilBusy) fsVeil(() => {});
            setTimeout(fsLyrics, 50);
        });
        loadLyrics();
        setInterval(() => {
            const sp = document.querySelector("#search-dropdown .main-actionBar-ActionBarContainer");
            if (sp) searchH = sp.getBoundingClientRect().height;
            const mv = document.querySelector(".Root__main-view");
            watchSides();
            bindHistory();
            // "Reproduciendo en Nothing phone de user" → data-dev="Nothing phone" (la pastilla del dock)
            const cb = document.querySelector(".main-connectBar-connectBar");
            const cbBtn = cb && cb.querySelector("button");
            if (cbBtn) {
                const m = cbBtn.textContent.trim().match(/^\S+\s+\S+\s+(.+?)(?:\s+(?:de|of|von|di)\s+\S+)?$/i);
                const dev = m ? m[1] : "";
                if (dev && cbBtn.dataset.dev !== dev) { cbBtn.dataset.dev = dev; cb.dataset.dev = dev; }
                if (!dev) { cb.removeAttribute("data-dev"); cbBtn.removeAttribute("data-dev"); }
            }
            // Spotify puede sustituir el nodo (p. ej. al abrir/cerrar la letra): se re-observa y se recoloca el dock
            if (mv && mv !== dockEl) { dockRO ||= new ResizeObserver(dockLayout); dockRO.disconnect(); dockRO.observe(mv); dockEl = mv; }
            dockLayout();
            markLyricsScroll();
            loadLyrics(); // al arrancar la canción ya está cargada y no salta `songchange`
            root.toggleAttribute("data-cs-synced", !!(lyr.lines && lyr.lines.length));
            tagLyrics13();
            cineTitle();
            fsLyrics();
            if (cineEl) cineIdleCheck();
            if (!lyrRaf && document.querySelector(".lyrics-lyrics-container")) lyrRaf = requestAnimationFrame(lyricsTick);
        }, 500);
        // La UI de Spotify se monta después que Spicetify: espera al contenedor
        // y a la primera canción: al arrancar, `songchange` no salta para la ya cargada
        let tries = 0;
        (function waitReady() {
            const item = Spicetify.Player.data && Spicetify.Player.data.item;
            if (ensureBackdrop() && item) return update();
            if (++tries < 60) setTimeout(waitReady, 250);
        })();
        // Caelestia reescribe color.ini al cambiar de esquema y `spicetify watch` lo reaplica
        // Solo si cambia algo que no sea una variable propia (--cs-*): el tema escribe en el style
        // de <html> en cada cambio de frase y de página, y leer getComputedStyle ahí obligaba a
        // recalcular los estilos de toda la página (~65 ms: el tirón al cambiar de frase)
        const styleKey = () => (document.documentElement.getAttribute("style") || "").replace(/--cs-[\w-]+:[^;]*;?/g, "").trim();
        let lastStyle = styleKey();
        new MutationObserver(() => {
            const k = styleKey();
            if (k === lastStyle) return;
            lastStyle = k;
            syncMode();
        }).observe(document.documentElement, {
            attributes: true, attributeFilter: ["style"],
        });
    }

    // ---- Spotify 1.3.3+: la estructura principal sin nombres --------------------
    // Desde la 1.3.3 los paneles ya no llevan .Root__nav-bar / .Root__main-view /
    // .Root__right-sidebar / .Root__now-playing-bar (clases ofuscadas), y todo el CSS del tema
    // cuelga de ellas. Se reconocen por lo que no cambia (ids y el nombre de su área en la
    // rejilla de Spotify) y se les devuelve la clase. React reescribe `className` al volver a
    // pintar (p. ej. el panel derecho al abrir "Sonando"): un observador la repone.
    const ROOT_AREAS = { "left-sidebar": "Root__nav-bar", "main-view": "Root__main-view", "right-sidebar": "Root__right-sidebar", "now-playing-bar": "Root__now-playing-bar" };
    const rootTagged = new Set();
    let rootMO = null;
    function tagRoot(el, cls) {
        if (!el || el.classList.contains(cls)) return;
        el.classList.add(cls);
        if (rootTagged.has(el)) return;
        rootTagged.add(el);
        rootMO ||= new MutationObserver((ms) => {
            for (const m of ms) if (m.target.__csRoot && !m.target.classList.contains(m.target.__csRoot)) m.target.classList.add(m.target.__csRoot);
        });
        el.__csRoot = cls;
        rootMO.observe(el, { attributes: true, attributeFilter: ["class"] });
    }
    function tagRootLayout() {
        const top = document.querySelector(".Root__top-container");
        if (!top) return false;
        if (document.querySelector(".Root__nav-bar") && document.querySelector(".Root__main-view") &&
            document.querySelector(".Root__right-sidebar") && document.querySelector(".Root__now-playing-bar")) return true;
        tagRoot(document.getElementById("Desktop_LeftSidebar_Id"), "Root__nav-bar");
        tagRoot(document.getElementById("main-view"), "Root__main-view");
        // el área de rejilla la pone el CSS de Spotify en el propio panel (puede ir anidado en
        // envoltorios sin área); se mira hasta 3 niveles por debajo del contenedor
        const walk = (el, depth) => {
            for (const c of el.children) {
                if (c.id === "global-nav-bar" || c.classList.contains("Root__globalNav")) continue;
                const area = getComputedStyle(c).gridRowStart;
                const cls = ROOT_AREAS[area];
                if (cls && !document.querySelector("." + cls)) tagRoot(c, cls);
                else if (!cls && depth < 3) walk(c, depth + 1);
            }
        };
        walk(top, 0);
        // panel derecho sin área con nombre: el bloque a la derecha del central, a su altura
        const mv = document.querySelector(".Root__main-view");
        if (mv && !document.querySelector(".Root__right-sidebar")) {
            const m = mv.getBoundingClientRect();
            const cands = [...top.querySelectorAll(":scope > *, :scope > * > *, :scope > * > * > *")].filter((c) => {
                const r = c.getBoundingClientRect();
                return !c.contains(mv) && r.left >= m.right - 2 && Math.abs(r.top - m.top) < 24 && r.height > m.height * 0.8;
            });
            if (cands.length) tagRoot(cands[0], "Root__right-sidebar");
        }
        // dock sin área con nombre: el bloque bajo (<200 px) más alto que contiene el play global
        if (!document.querySelector(".Root__now-playing-bar")) {
            const pp = [...document.querySelectorAll('[data-testid="control-button-playpause"]')].find((b) => !b.closest("#main-view, .Root__right-sidebar"));
            let e = pp, best = null;
            while (e && e.parentElement && e.parentElement !== top && e !== document.body) {
                e = e.parentElement;
                if (e.getBoundingClientRect().height < 200) best = e;
            }
            if (best) tagRoot(best, "Root__now-playing-bar");
        }
        return !!document.querySelector(".Root__now-playing-bar");
    }
    (function waitRoot(n) {
        if (tagRootLayout() || n > 120) return;
        setTimeout(() => waitRoot(n + 1), 250);
    })(0);
    // si Spotify vuelve a montar algún panel (cambio de modo, pantalla completa), se re-etiqueta
    setInterval(tagRootLayout, 1000);

    // Lo mismo con piezas de dentro (dock, píldora de navegación, cabecera del panel derecho):
    // [selector estable, clase de siempre, (elemento) → elemento al que ponérsela]. Solo añade la
    // clase si falta; en las versiones que aún la traen no cambia nada.
    // (el contador va en una variable propia: con `n--` se gastaba en la primera llamada y el alias
    // solo funcionaba con el primer elemento; al cambiar de página ya no etiquetaba nada)
    const up = (n) => (e) => { for (let i = n; e && i > 0; i--) e = e.parentElement; return e; };
    // primer hijo, si es un div que cumple `ok`
    const firstDiv = (ok = () => true) => (e) => { const f = e.firstElementChild; return f && f.tagName === "DIV" && ok(f) ? f : null; };
    const INNER_ALIASES = [
        [".main-globalNav-historyButtonsWrapper", "main-globalNav-historyButtonsContainer", up(1)],
        // huecos que Spotify reserva para los "···" y los botones de la ventana: el tema ya deja los suyos
        [".main-globalNav-historyButtonsWrapper", "main-globalNav-historyButtonsSpacer", ":scope > div:first-child:not(.main-globalNav-historyButtons):not(:has(button))"],
        [".main-globalNav-contentRight", "main-globalNav-contentRightSpacer", ":scope > div:last-child:not(:has(button)):not(.main-actionButtons)"],
        // biblioteca
        [".Root__nav-bar > nav", "main-navBar-mainNav"],
        [".Root__nav-bar .YourLibraryX", "main-yourLibraryX-libraryContainer"],
        [".Root__nav-bar .YourLibraryX", "main-yourLibraryX-entryPoints", up(1)],
        [".main-yourLibraryX-header > div:first-child", "main-yourLibraryX-headerContent"],
        [".main-yourLibraryX-headerContent > div:first-child", "main-yourLibraryX-collapseButton"],
        [".main-yourLibraryX-libraryRootlist", "main-yourLibraryX-libraryItemContainer", up(2)],
        [".main-yourLibraryX-libraryRootlist", "main-yourLibraryX-rootListHeader", firstDiv((f) => !!f.querySelector("input"))],
        // cabecera y barra de acciones de playlist/álbum
        ['[data-testid="entity-header"]', "main-entityHeader-container"],
        ['[data-testid="entity-header"]', "main-entityHeader-containerNormal", (h) => (h.querySelector(":scope > .contentSpacing img") ? h : null)],
        // barra fija de arriba al hacer scroll (play + título)
        ['[data-testid="topbar"]', "main-topBar-background", firstDiv((f) => !f.classList.contains("contentSpacing"))],
        [".main-topBar-background > div:first-child", "main-topBar-overlay"],
        ['[data-testid="topbar"] > .contentSpacing', "main-topBar-topbarContentContainer"],
        ['[data-testid="topbar-content"]', "main-topBar-topbarContent"],
        ['[data-testid="entity-header"]', "main-entityHeader-backgroundColor", ":scope > div:not(.contentSpacing):not(:has(*))"],
        ['[data-testid="entity-header"] > .contentSpacing', "main-entityHeader-contentWrapper"],
        // en los álbumes la portada va dentro de un botón (abre la portada en grande)
        ['[data-testid="entity-header"] > .contentSpacing', "main-entityHeader-imageContainer", ":scope > :is(div, button):has(img):not(:has(h1))"],
        ['[data-testid="entity-header"] .main-entityHeader-imageContainer img', "main-entityHeader-image"],
        [".main-entityHeader-contentWrapper", "main-entityHeader-headerText", ":scope > div:has(h1)"],
        ['[data-testid="entity-header"] [data-testid="entityTitle"]', "main-entityHeader-title"],
        [".main-entityHeader-headerText > div:last-child", "main-entityHeader-metaData"],
        ['[data-testid="action-bar"]', "main-actionBar-ActionBar"],
        ['[data-testid="action-bar"]', "main-actionBar-ActionBarContainer", up(2)],
        ['[data-testid="action-bar-row"]', "main-actionBar-ActionBarRow"],
        ['[data-testid="action-bar-row"]', "main-playButton-PlayButton", ':scope > div:first-child:has(button[class*="button-primary"])'],
        // fondo de color que Spotify pone detrás de la barra: el div justo después de la cabecera, con
        // background-color en línea; en la 1.3.3, un degradado sin hijos con las variables de color de
        // la portada, junto a la cabecera (álbum) o dentro del bloque de la lista (playlist)
        ['[data-testid="entity-header"]', "main-actionBarBackground-background", (h) => {
            const next = h.nextElementSibling, st = (e) => e.getAttribute("style") || "";
            if (next && next.tagName === "DIV" && st(next).includes("background-color")) return next;
            return [...h.parentElement.children, ...(next ? next.children : [])].filter((e) =>
                e !== h && e.tagName === "DIV" && !e.firstElementChild && st(e).includes("--background-highlight"));
        }],
        // bloque de la lista de una playlist: Spotify le pone fondo gris opaco, que tapaba el velo del panel
        ['[data-testid="playlist-page"] > [data-testid="entity-header"]', "playlist-playlist-playlistContent", (h) => {
            const next = h.nextElementSibling;
            return next && next.querySelector('[data-testid="action-bar"]') ? next : null;
        }],
        // buscador: form → sección del input → píldora (con el botón de inicio) → sección
        [".Root__globalNav form:has(input)", "main-globalNav-searchInputContainer"],
        [".Root__globalNav form:has(input)", "main-globalNav-searchInputSection", up(1)],
        [".Root__globalNav form:has(input)", "main-globalNav-searchContainer", up(2)],
        [".Root__globalNav form:has(input)", "main-globalNav-searchSection", up(3)],
        [".main-globalNav-searchInputContainer input", "main-topBar-searchBar"],
        [".main-globalNav-searchInputContainer input", "x-searchInput-searchInputInput"],
        [".main-globalNav-searchInputContainer input", "main-globalNav-searchInputWrapper", up(1)],
        [".main-globalNav-searchInputWrapper", "main-globalNav-searchInputTextWrapper", ":scope > div:has(> span)"],
        [".main-globalNav-searchInputTextWrapper > span:first-child", "main-globalNav-searchInputText"],
        ['.main-globalNav-searchInputContainer [class*="form-input-icon__icon--trailing"] > div', "main-globalNav-browseButtonWrapper"],
        ['[data-testid="player-controls"]', "player-controls"],
        ['[data-testid="CoverSlotCollapsed__container"]', "main-coverSlotCollapsed-container"],
        ['[data-testid="now-playing-widget"] [data-testid="cover-art-button"]', "main-nowPlayingWidget-coverArtContainer"],
        ['[data-testid="now-playing-widget"] [data-testid="cover-art-button"]', "main-nowPlayingWidget-coverArt", ":scope > div"],
        ['[data-testid="now-playing-widget"]', "main-nowPlayingWidget-trackInfo", ":scope > div:not([data-testid]):has(a)"],
        ['[data-testid="now-playing-widget"]', "main-nowPlayingWidget-actionButtonWrapper", ":scope > div:not([data-testid]):not(:has(a)):has(button)"],
        [".main-nowPlayingWidget-trackInfo > div:first-child", "main-trackInfo-name"],
        [".main-nowPlayingWidget-trackInfo", "main-trackInfo-artists", ":scope > div:not(:first-child):has(a)"],
        [".main-trackInfo-name, .main-trackInfo-artists", "main-trackInfo-overlay", firstDiv()],
        ['[data-testid="playback-progressbar"]', "playback-progressbar"],
        ['[data-testid="playback-progressbar"]', "playback-progressbar-container", up(1)],
        ['[data-testid="playback-position"]', "playback-bar__progress-time-elapsed"],
        ['[data-testid="playback-duration"]', "main-playbackBarRemainingTime-container"],
        ['[data-testid="volume-bar"] [data-testid="progress-bar"]', "playback-progressbar", up(1)],
        ['[data-testid="volume-bar"] [data-testid="progress-bar"]', "volume-bar__slider-container", up(2)],
        ['[data-testid="progress-bar-background"]', "x-progressBar-progressFillColor", ":scope > .x-progressBar-sliderArea:not(:has(.x-progressBar-fillColor)) > div"],
        ['[data-testid="progress-bar-handle"]', "progress-bar__slider"],
        [".main-nowPlayingView-headerWrapper", "main-nowPlayingView-headerContainer", up(1)],
        // "Reproduciendo en <dispositivo>": en 1.3.3 sin clase; se reconoce por el texto del botón
        ['[data-testid="now-playing-bar"]', "main-connectBar-connectBar", (bar) => {
            for (const b of bar.querySelectorAll("button")) {
                if (/^\s*(Reproduciendo|Escuchando|Playing|Listening)\s/i.test(b.textContent)) return b.parentElement;
            }
            return null;
        }],
        [".main-nowPlayingView-headerWrapper", "main-nowPlayingView-headerTextWrapper", ":scope > div:has(a)"],
        [".main-nowPlayingView-headerTextWrapper > a", "main-nowPlayingView-headerText"],
        [".main-nowPlayingView-headerText > div:first-child", "main-trackInfo-overlay"],
        [".main-nowPlayingView-headerWrapper > span", "main-nowPlayingView-headerButtonContainer"],
        [".main-nowPlayingView-headerButtonContainer > div", "main-nowPlayingView-headerButtonWrapper"],
        // vista cine (tagCine la marca): la isla es el hijo que lleva el escenario; la cabecera, el otro
        [".Root__cinema-view", "cs-cine-island", ':scope > div:first-child + div'],
        // escenario: lleva los colores de la portada en `style`, pero a veces Spotify no se los pone
        // (p. ej. recién pasada la reproducción desde otro dispositivo); entonces es el primer nivel,
        // bajando por los primeros hijos, cuyo 2.º hijo tiene la carátula o el vídeo
        [".Root__cinema-view > .cs-cine-island", "cs-cine-stage", (isl) => {
            const s = isl.querySelector('[style*="--cinema-mode-bg-color-from"]');
            if (s) return s;
            let n = isl.firstElementChild && isl.firstElementChild.firstElementChild;
            for (let d = 0; n && d < 6; d++, n = n.firstElementChild) {
                if (n.children.length >= 2 && n.children[1].querySelector("img, video")) return n;
            }
            return null;
        }],
        // píldora "Cambiar a vídeo/audio": un botón con su aviso de "Cargando" al lado, los dos solos
        [".Root__cinema-view > div:first-child:not(.cs-cine-island)", "main-nowPlayingView-actionButton", (h) =>
            [...h.querySelectorAll("div > div + button")].filter((b) => b.parentElement.children.length === 2).flatMap((b) => [b, b.previousElementSibling])],
        // carátula: dentro del primer hijo del escenario (con vídeo ahí va el reproductor)
        ['.Root__cinema-view .cs-cine-stage > div:first-child + div > div:first-child', "cover-art", ":scope > div:has(img):not(:has(video))"],
        // en reposo Spotify saca su título abajo a la izquierda: un 3.er hijo del escenario, solo texto
        ['.Root__cinema-view .cs-cine-stage', "main-trackInfo-container", ":scope > div:nth-child(n+3):not(:has(video, img, button))"],
    ];
    // El tercer campo, si es texto, se busca dentro de cada ancla: los `:has()` sueltos obligan a
    // probar cada div de la página (12 ms por pasada); desde un ancla con testid o clase, menos de 1.
    function tagInner() {
        for (const [sel, cls, pick] of INNER_ALIASES) {
            let list;
            try { list = document.querySelectorAll(sel); } catch (e) { continue; }
            for (const m of list) {
                let got;
                try { got = typeof pick === "string" ? m.querySelectorAll(pick) : pick ? pick(m) : m; } catch (e) { continue; }
                if (!got) continue;
                for (const el of got.nodeType === 1 ? [got] : got) {
                    if (el !== document.body && !el.classList.contains(cls)) el.classList.add(cls);
                }
            }
        }
    }
    // Lista de canciones de la 1.3.3: sin roles ni testids. Se reconoce por el placeholder de la
    // lista; la primera hija es la cabecera (fija) y las filas comparten con su fila la clase de rejilla.
    function tagTrackList() {
        for (const tl of document.querySelectorAll('#main-view div[aria-label][style*="tracklist-placeholder"]')) {
            const add = (e, ...c) => { if (e) for (const k of c) if (!e.classList.contains(k)) e.classList.add(k); };
            add(tl, "main-trackList-trackList");
            add(tl.parentElement, "main-trackList-trackListContainer");
            const head = tl.firstElementChild, hrow = head && head.querySelector(":scope > div > div");
            if (!hrow || hrow.children.length < 3) continue;
            add(head, "main-trackList-trackListHeader");
            add(hrow, "main-trackList-trackListHeaderRow", "main-trackList-trackListRowGrid");
            hrow.querySelectorAll("button").forEach((b) => add(b, "main-trackList-column", "main-trackList-sortable"));
            const cols = (row) => {
                const k = row.children;
                for (let i = 0; i < k.length; i++) {
                    add(k[i], i === 0 ? "main-trackList-rowSectionIndex" : i === k.length - 1 ? "main-trackList-rowSectionEnd"
                        : i === 1 ? "main-trackList-rowSectionStart" : "main-trackList-rowSectionVariable");
                }
            };
            cols(hrow);
            const gc = [...hrow.classList].find((c) => !c.startsWith("main-") && tl.querySelectorAll("." + CSS.escape(c)).length > 1);
            if (!gc) continue;
            for (const row of tl.querySelectorAll("." + CSS.escape(gc))) {
                if (row === hrow || row.classList.contains("main-trackList-trackListRow") || !row.offsetHeight || row.children.length < 3) continue;
                add(row, "main-trackList-trackListRow", "main-trackList-trackListRowGrid");
                cols(row);
                const start = row.children[1];
                add(start && start.querySelector(":scope > img"), "main-trackList-rowImage");
                add(start && start.querySelector(":scope > div > div:first-child"), "main-trackList-rowTitle");
            }
        }
    }
    // Se etiqueta en cuanto React monta algo nuevo (el observador corre antes de pintar, así que la
    // página nueva sale ya con su estilo, sin un fotograma con el de Spotify); el intervalo lento
    // queda de red por si algo cambia sin añadir nodos.
    // Hasta la 1.3.1 las clases vienen de serie: ahí no se hace nada (si aún no se sabe la versión, se etiqueta).
    let aliasVer = null;
    const needAliases = () => {
        if (aliasVer !== null) return aliasVer;
        const v = window.Spicetify && Spicetify.Platform && Spicetify.Platform.version;
        if (!v) return true;
        const [a, b, c] = v.split(".").map(Number);
        return (aliasVer = a > 1 || (a === 1 && (b > 3 || (b === 3 && c >= 2))));
    };
    // Vista cine / pantalla completa en 1.3.3: sin .Root__cinema-view ni su clase de reposo
    // (--controls-hidden). Es el hijo del contenedor raíz que lleva el escenario con los colores de
    // la portada; el reposo se deduce de su cabecera, que Spotify funde a 0 al esconder los controles.
    // React reescribe `className` al entrar y salir del reposo: un observador repone las clases.
    let cineEl = null, cineIdle = false, cineMO = null;
    function cinePaint() {
        const c = cineEl;
        if (!c) return;
        if (!c.classList.contains("Root__cinema-view")) c.classList.add("Root__cinema-view");
        if (c.classList.contains("Root__cinema-view--controls-hidden") !== cineIdle) c.classList.toggle("Root__cinema-view--controls-hidden", cineIdle);
    }
    function tagCine() {
        const top = document.querySelector(".Root__top-container");
        // se reconoce por su cabecera (o por los colores del escenario, que no siempre están); el
        // panel derecho también puede llevar esos colores, así que se mira hijo a hijo
        let c = null;
        for (const k of top ? top.children : []) {
            if (/\bRoot__(nav-bar|main-view|right-sidebar|now-playing-bar|lyrics-cinema|globalNav)\b/.test(k.className)) continue;
            if (k.querySelector(':scope > [style*="--header-buttons-hover-bg"], [style*="--cinema-mode-bg-color-from"]')) { c = k; break; }
        }
        if (c !== cineEl) {
            cineEl = c;
            cineIdle = false;
            cineMO ||= new MutationObserver(cinePaint);
            cineMO.disconnect();
            if (c) cineMO.observe(c, { attributes: true, attributeFilter: ["class"] });
        }
        cinePaint();
    }
    function cineIdleCheck() {
        const h = cineEl && cineEl.isConnected && cineEl.firstElementChild;
        if (!h || h.classList.contains("cs-cine-island") || h.getAnimations().length) return; // a medio fundido: ya avisará transitionend
        const idle = parseFloat(getComputedStyle(h).opacity) < 0.1;
        if (idle !== cineIdle) { cineIdle = idle; cinePaint(); }
    }
    document.addEventListener("transitionend", (e) => {
        if (cineEl && e.target === cineEl.firstElementChild && e.propertyName === "opacity") cineIdleCheck();
    }, true);
    // al mover el ratón Spotify enseña los controles: el dock vuelve sin esperar al fundido
    document.addEventListener("pointermove", () => { if (cineIdle && cineEl) { cineIdle = false; cinePaint(); } }, true);

    // Arriba a la derecha de la vista cine, la letra y salir de pantalla completa repiten los del
    // dock: a pantalla completa se esconden (cs-cine-dup); se reconocen por el mismo texto
    function cineDup() {
        const head = document.querySelector(".Root__cinema-view > div:first-child");
        if (!head) return;
        const dock = document.querySelector(".Root__now-playing-bar");
        const labels = new Set([...(dock ? dock.querySelectorAll('[data-testid="fullscreen-mode-button"], [data-testid="lyrics-button"]') : [])]
            .map((b) => b.getAttribute("aria-label")).filter(Boolean));
        for (const b of head.querySelectorAll("button")) {
            const dup = b.matches('[data-testid="lyrics-button"]') || labels.has(b.getAttribute("aria-label"));
            if (b.classList.contains("cs-cine-dup") !== dup) b.classList.toggle("cs-cine-dup", dup);
        }
    }

    let tagQueued = 0; // 1: solo la lista de canciones, 2: todo
    const tagAll = () => {
        const all = tagQueued !== 1;
        tagQueued = 0;
        if (all) cineDup();
        if (!needAliases()) return;
        if (all) { tagCine(); tagInner(); }
        tagTrackList();
    };
    new MutationObserver((ms) => {
        // al hacer scroll en una lista larga entran filas en cada fotograma: entonces basta con la lista
        // dentro de la letra (cambio de frase, trozos de palabras) no hay nada que etiquetar: la
        // etiqueta tagLyrics13; repasar todos los alias en cada frase era trabajo en pleno scroll
        if (ms.every((m) => m.target.closest && m.target.closest(".lyrics-lyrics-container"))) return;
        const want = ms.every((m) => m.target.closest && m.target.closest(".main-trackList-trackList")) ? 1 : 2;
        if (tagQueued >= want) return;
        if (!tagQueued) queueMicrotask(tagAll);
        tagQueued = want;
    }).observe(document.documentElement, { childList: true, subtree: true });
    setInterval(() => { tagQueued = 2; tagAll(); }, 2000);

    // ---- Otros temas a la vez --------------------------------------------------------
    // Spicetify aplica un solo tema, pero hay temas que se meten por JS por su cuenta (Default
    // Dynamic desde Marketplace o como extensión): escriben sus colores en el style de <html>
    // (--spice-*, --is_light) o en <style class="marketplaceCSS">, que pisan los de color.ini:
    // fondo blanco y texto verde fijos (en 1.3.3 Default Dynamic ni siquiera los actualiza).
    // Si este archivo se ejecuta, el tema activo es este: esas capas se quitan según aparecen.
    // Ni Spicetify ni este tema escriben --spice-* en línea (llegan por colors.css).
    const FOREIGN_VAR = /^--(spice-|is_light$|image_url$|colormatrix$)/;
    let foreignSeen = false;
    function evictForeign() {
        const st = document.documentElement.style;
        let hit = false;
        for (let i = st.length - 1; i >= 0; i--) {
            if (FOREIGN_VAR.test(st[i])) { st.removeProperty(st[i]); hit = true; }
        }
        // marketplaceScheme / marketplaceUserCSS (el botón luna de Default Dynamic lo oculta user.css)
        document.querySelectorAll("style.marketplaceCSS, link.marketplaceCSS").forEach((el) => { el.remove(); hit = true; });
        // Marketplace quita la hoja del tema al inyectar la suya
        if (hit && !document.querySelector('link[href="user.css"], link.userCSS')) {
            const l = document.createElement("link");
            l.rel = "stylesheet"; l.href = "user.css"; l.className = "userCSS";
            document.head.appendChild(l);
        }
        if (hit && !foreignSeen) {
            foreignSeen = true;
            console.warn("[caelestia] another theme was injecting colors (Marketplace theme / Default Dynamic); removed. Uninstall it from Marketplace to stop it.");
        }
    }
    // ---- Vista cine: estado atascado de Spotify ------------------------------------------
    // Al abrir la letra desde la vista cine, Spotify cierra la vista y marca <html> con
    // data-cinema-npv-postexit pero no quita data-cinema-npv-postenter: con esa marca su CSS
    // oculta el panel central (display: none) y desplaza la biblioteca fuera de la pantalla, y así
    // se queda hasta reiniciar. Si ya ha salido y la vista no existe, la marca de entrada sobra.
    const CINE_STALE = ["data-cinema-npv-postenter", "data-cinema-npv-duringenter", "data-cinema-npv-preexit"];
    function cineUnstick() {
        const r = document.documentElement;
        if (!r.hasAttribute("data-cinema-npv-postexit") || document.querySelector(".Root__cinema-view")) return;
        for (const a of CINE_STALE) if (r.hasAttribute(a)) r.removeAttribute(a);
    }
    new MutationObserver(() => setTimeout(cineUnstick, 0)).observe(document.documentElement, { attributes: true, attributeFilter: ["data-cinema-npv-postexit", ...CINE_STALE] });
    setInterval(cineUnstick, 1000);

    evictForeign();
    // Antes que el observador de syncMode (init): este limpia primero y aquel ya no ve el cambio
    new MutationObserver(evictForeign).observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
    new MutationObserver((ms) => {
        if (ms.some((m) => [...m.addedNodes].some((n) => n.nodeType === 1 && n.classList.contains("marketplaceCSS")))) evictForeign();
    }).observe(document.body || document.documentElement, { childList: true });

    init();
})();
