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
    //  1. tiempos reales por palabra de Netease (a través del proxy CORS de
    //     Spicetify), con cada palabra partida en sílabas aproximadas;
    //  2. sílabas de Spotify (`syllables`), si algún día las envía;
    //  3. el tiempo de la línea repartido entre sus palabras según su longitud;
    //  4. sin tiempos, la letra normal de Spotify.
    const lyr = { id: "", lines: null };
    const lyrCache = new Map();
    let lyrRaf = 0;

    async function loadLyrics() {
        const item = Spicetify.Player.data && Spicetify.Player.data.item;
        const id = item && /^spotify:track:/.test(item.uri || "") ? item.uri.split(":")[2] : "";
        if (id === lyr.id) return;
        lyr.id = id;
        lyr.lines = null;
        if (!id) return;
        if (lyrCache.has(id)) { lyr.lines = lyrCache.get(id); return; }
        let lines = null;
        try {
            const r = await Spicetify.CosmosAsync.get(
                `https://spclient.wg.spotify.com/color-lyrics/v2/track/${id}?format=json&vocalRemoval=false&market=from_token`);
            const L = r && r.lyrics;
            if (L && /SYNCED/.test(L.syncType) && Array.isArray(L.lines)) {
                lines = L.lines.map((l) => ({
                    t: +l.startTimeMs, end: +l.endTimeMs || 0, text: l.words || "",
                    syl: (l.syllables || []).map((s) => ({ t: +s.startTimeMs, n: +s.numChars })),
                }));
            }
        } catch (e) { if (e && e.status !== 404) return; } // sin red: no se cachea, se reintenta
        lyrCache.set(id, lines);
        if (lyr.id === id) lyr.lines = lines;
        if (lines) await neteaseWords(lines, item);
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
            // cada línea de Spotify con su línea de Netease (mismo texto, la más cercana en el tiempo)
            const pairs = [];
            let total = 0;
            for (const ln of lines) {
                const key = norm(ln.text);
                if (!key) continue;
                total++;
                let bl = null, bt = 6000;
                for (const c of nl) {
                    if (norm(c.words.map((w) => w.tx).join("")) !== key) continue;
                    const dt = Math.abs(c.t - ln.t);
                    if (dt < bt) { bl = c; bt = dt; }
                }
                if (bl) pairs.push([ln, bl]);
            }
            if (!total || pairs.length / total < 0.5) return void (lines.nx = true);
            const diffs = pairs.map(([a, b]) => b.t - a.t).sort((x, y) => x - y);
            const med = diffs[diffs.length >> 1], shift = Math.abs(med) > 700 ? med : 0;
            for (const [ln, c] of pairs) {
                const w = alignWords(ln.text, c.words);
                if (w.length) ln.w = w.map((x) => ({ t: x.t - shift, d: x.d, tx: x.tx }));
            }
            lines.nx = true;
        } catch (e) { /* sin red o proxy caído: se queda el reparto estimado */ }
    }

    // ---- Sílabas aproximadas de una palabra ---------------------------------
    const ONSETS = new Set(["bl", "br", "ch", "cl", "cr", "dr", "fl", "fr", "gl", "gr", "pl", "pr", "sc", "sh", "sk", "sl", "sm",
        "sn", "sp", "st", "sw", "th", "tr", "tw", "wh", "ph", "str", "spr", "spl", "scr", "thr", "shr"]);
    const VOWELS = "aeiouyáàâãäåæéèêëíìîïóòôõöøúùûüœ";
    function syllableCuts(word) {
        const s = word.toLowerCase(), groups = [];
        for (let i = 0; i < s.length; i++) {
            if (!VOWELS.includes(s[i])) continue;
            let j = i;
            while (j + 1 < s.length && VOWELS.includes(s[j + 1])) j++;
            groups.push([i, j + 1]);
            i = j;
        }
        // e final muda ("make", "love") y "-ed" mudo ("loved")
        const last = groups[groups.length - 1];
        if (groups.length > 1 && last) {
            const tail = s.slice(last[0]).replace(/[^\p{L}]+$/u, "");
            const before = s[last[0] - 1];
            if ((tail === "e" && !(before === "l" && groups.length > 1 && !VOWELS.includes(s[last[0] - 2] || "a"))) ||
                (tail === "ed" && before && !"td".includes(before))) groups.pop();
        }
        const cuts = [];
        for (let k = 0; k + 1 < groups.length; k++) {
            const a = groups[k], b = groups[k + 1], gap = b[0] - a[1];
            let cut = a[1];
            if (gap >= 2) {
                cut = a[1] + 1;
                for (const len of [3, 2]) if (len <= gap && ONSETS.has(s.slice(b[0] - len, b[0]))) { cut = b[0] - len; break; }
            }
            cuts.push(cut);
        }
        return cuts;
    }

    // Palabra con tiempo real → trozos con tiempo repartido: las sílabas pesan
    // según su longitud y, si la palabra se alarga, la última se queda con el resto
    function wordUnits(w) {
        const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(w.tx), core = m[2];
        const cuts = core && w.d >= 280 && /^[\p{L}'’\-]+$/u.test(core.replace(/[^\p{L}'’\-]/gu, "")) &&
            !/[぀-ヿ㐀-鿿가-힯]/.test(core) ? syllableCuts(core) : [];
        if (!cuts.length) return [{ text: w.tx, start: w.t, end: w.t + w.d }];
        const bounds = [0, ...cuts, core.length], pieces = [], weights = [];
        for (let k = 0; k + 1 < bounds.length; k++) {
            pieces.push(core.slice(bounds[k], bounds[k + 1]));
            weights.push(pieces[k].length + 1);
        }
        if (w.d > 800) weights[weights.length - 1] *= 1 + Math.min(1.5, (w.d - 800) / 1000);
        const sum = weights.reduce((x, y) => x + y, 0);
        let acc = 0;
        return pieces.map((txt, k) => {
            const start = w.t + w.d * (acc / sum);
            acc += weights[k];
            return {
                text: (k === 0 ? m[1] : "") + txt + (k === pieces.length - 1 ? m[3] : ""),
                syl: true, start, end: w.t + w.d * (acc / sum),
            };
        });
    }

    // Trozos con su intervalo [start, end) en ms: sílabas reales o palabras repartidas
    function lineUnits(i) {
        const L = lyr.lines, ln = L[i], text = ln.text;
        const next = i + 1 < L.length ? L[i + 1].t : ln.t + 4000;
        if (ln.w) return ln.w.flatMap(wordUnits);
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
        const toks = cjk ? Array.from(text) : text.split(/(\s+)/);
        const words = toks.filter((w) => w.trim());
        const span = Math.min(next - ln.t, words.reduce((a, w) => a + w.length, 0) * 170 + 900);
        const total = words.reduce((a, w) => a + w.length + 2, 0);
        let acc = 0;
        return toks.map((w) => {
            if (!w.trim()) return { text: w };
            const start = ln.t + span * (acc / total);
            acc += w.length + 2;
            return { text: w, start, end: ln.t + span * (acc / total) };
        });
    }

    // Cada palabra va en un `.cs-g` (no se parte) y cada sílaba en un `.cs-w` (se rellena y crece al cantarse)
    function buildLine(el, idx) {
        const units = lineUnits(idx), frag = document.createDocumentFragment(), timed = [];
        let group = null;
        for (const u of units) {
            const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(u.text);
            if (!m[2] || u.start === undefined) { group = null; frag.append(u.text); continue; }
            if (m[1]) { group = null; frag.append(m[1]); }
            const sp = document.createElement("span");
            sp.className = "cs-w";
            sp.textContent = m[2];
            if (!(u.syl && group)) {
                group = document.createElement("span");
                group.className = "cs-g";
                frag.append(group);
            }
            group.append(sp);
            sp.style.setProperty("--sw", Math.min(0.085, 0.032 + (u.end - u.start) / 1000 * 0.03).toFixed(3));
            if (m[3]) { group = null; frag.append(m[3]); }
            else if (!u.syl) group = null;
            timed.push({ sp, start: u.start, end: u.end, p: 0, s: 0 });
        }
        el.textContent = "";
        el.append(frag);
        el.__cs = { idx, timed, real: !!lyr.lines[idx].w };
    }

    function lyricsTick() {
        lyrRaf = 0;
        const box = document.querySelector(".lyrics-lyrics-container");
        if (!box) return;
        lyrRaf = requestAnimationFrame(lyricsTick);
        const L = lyr.lines;
        const el = L && box.querySelector(".lyrics-lyricsContent-active .lyrics-lyricsContent-text");
        const text = el && el.textContent.trim();
        if (!text || !/[\p{L}\p{N}]/u.test(text) || /[֐-ࣿ]/.test(text)) return; // ♪, vacías y RTL: tal cual
        const t = Spicetify.Player.getProgress();
        let cs = el.__cs;
        if (!cs || !el.querySelector(".cs-w") || cs.real !== !!L[cs.idx].w || t < L[cs.idx].t - 600 ||
            (cs.idx + 1 < L.length && t > L[cs.idx + 1].t + 600)) {
            let idx = -1;
            for (let i = 0; i < L.length; i++) if (L[i].text.trim() === text && L[i].t <= t + 400) idx = i;
            if (idx < 0) return;
            if (!cs || cs.idx !== idx || !el.querySelector(".cs-w") || cs.real !== !!L[idx].w) buildLine(el, idx);
            cs = el.__cs;
        }
        for (const u of cs.timed) {
            const p = Math.max(0, Math.min(1, (t - u.start) / Math.max(1, u.end - u.start)));
            if (Math.abs(p - u.p) > 0.004 || (p !== u.p && (p === 0 || p === 1))) {
                u.p = p;
                u.sp.style.setProperty("--p", p.toFixed(3));
            }
            const st = t < u.start ? 0 : t >= u.end ? 2 : 1;
            if (st !== u.s) {
                u.s = st;
                u.sp.classList.toggle("cs-cur", st === 1);
                u.sp.classList.toggle("cs-done", st === 2);
            }
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
    function closeLyrics() {
        const H = Spicetify.Platform.History, box = document.querySelector(".lyrics-lyrics-container");
        if (closing) return;
        const leave = () => {
            closing = false;
            const prev = H.entries && H.entries[H.index - 1];
            if (prev && prev.pathname !== "/lyrics") H.goBack();
            else H.push(lastRoute || { pathname: "/" });
        };
        if (!box) return leave();
        closing = true;
        box.setAttribute("data-cs-out", "");
        setTimeout(leave, 380);
    }

    // ---- Búsqueda: el desplegable se pliega hacia la píldora al cerrarse ------
    // React lo desmonta al instante, así que se deja una copia que hace la salida.
    function searchGhost(node) {
        const dd = node.id === "search-dropdown" ? node : node.querySelector && node.querySelector("#search-dropdown");
        const panel = dd && dd.querySelector(".main-actionBar-ActionBarContainer");
        const pill = document.querySelector(".main-globalNav-searchContainer");
        if (!panel || !pill || document.getElementById("search-dropdown")) return;
        const r = pill.getBoundingClientRect(), g = document.createElement("div");
        g.className = "cs-search-ghost";
        g.style.cssText = `left:${r.left}px;top:${r.bottom + 6}px;width:${r.width}px`;
        g.append(panel.cloneNode(true));
        document.body.append(g);
        setTimeout(() => g.remove(), 260);
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
        let raf = 0;
        function syncStuck(t) {
            raf = 0;
            root.toggleAttribute("data-cs-scrolled", t.scrollTop > 6);
            const h = document.querySelector(".main-trackList-trackListHeader");
            if (!h) return root.removeAttribute("data-cs-stuck");
            const top = t.getBoundingClientRect().top + (parseFloat(getComputedStyle(h).top) || 0);
            root.toggleAttribute("data-cs-stuck", h.getBoundingClientRect().top <= top + 0.5);
        }
        document.addEventListener("scroll", (e) => {
            const t = e.target;
            if (t instanceof Element && t.closest(".Root__main-view") && !raf) {
                raf = requestAnimationFrame(() => syncStuck(t));
            }
        }, true);
        if (Spicetify.Platform && Spicetify.Platform.History && Spicetify.Platform.History.listen) {
            Spicetify.Platform.History.listen(() => { root.removeAttribute("data-cs-scrolled"); root.removeAttribute("data-cs-stuck"); });
        }
        new MutationObserver(queueRelabel).observe(document.body, { childList: true, subtree: true });
        new MutationObserver((muts) => {
            for (const m of muts) {
                if (!m.removedNodes.length || !(m.target instanceof Element) || !m.target.closest(".main-globalNav-searchContainer")) continue;
                for (const n of m.removedNodes) if (n.nodeType === 1) searchGhost(n);
            }
        }).observe(document.body, { childList: true, subtree: true });
        trackRoute();
        if (Spicetify.Platform && Spicetify.Platform.History && Spicetify.Platform.History.listen) {
            Spicetify.Platform.History.listen(trackRoute);
        }
        document.addEventListener("click", (e) => {
            const b = e.target instanceof Element && e.target.closest('[data-testid="lyrics-button"]');
            if (!b || !Spicetify.Platform.History.location || Spicetify.Platform.History.location.pathname !== "/lyrics") return;
            e.preventDefault();
            e.stopImmediatePropagation();
            closeLyrics();
        }, true);
        Spicetify.Player.addEventListener("songchange", update);
        Spicetify.Player.addEventListener("songchange", loadLyrics);
        loadLyrics();
        setInterval(() => {
            loadLyrics(); // al arrancar la canción ya está cargada y no salta `songchange`
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
        new MutationObserver(syncMode).observe(document.documentElement, {
            attributes: true, attributeFilter: ["style"],
        });
    }

    init();
})();
