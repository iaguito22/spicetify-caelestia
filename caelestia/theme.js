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
    // Spotify solo sincroniza por líneas. Si la respuesta trae sílabas
    // (`syllables`) se usan; si no, el tiempo de la línea se reparte entre sus
    // palabras según su longitud; y sin datos de tiempo queda la letra de Spotify.
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
    }

    // Trozos con su intervalo [start, end) en ms: sílabas reales o palabras repartidas
    function lineUnits(i) {
        const L = lyr.lines, ln = L[i], text = ln.text;
        const next = i + 1 < L.length ? L[i + 1].t : ln.t + 4000;
        if (ln.syl.length && Math.abs(ln.syl.reduce((a, s) => a + s.n, 0) - text.trim().length) <= 2) {
            const off = ln.syl[0].t < ln.t - 1 ? ln.t : 0;
            const last = ln.syl[ln.syl.length - 1];
            const stop = ln.end > last.t + off ? ln.end : Math.min(next, last.t + off + 700);
            let pos = 0;
            return ln.syl.map((s, k) => {
                const piece = k === ln.syl.length - 1 ? text.slice(pos) : text.slice(pos, pos + s.n);
                pos += s.n;
                return { text: piece, start: s.t + off, end: k + 1 < ln.syl.length ? ln.syl[k + 1].t + off : stop };
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

    function buildLine(el, idx) {
        const units = lineUnits(idx), frag = document.createDocumentFragment(), timed = [];
        for (const u of units) {
            const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(u.text);
            if (!m[2] || u.start === undefined) { frag.append(u.text); continue; }
            if (m[1]) frag.append(m[1]);
            const sp = document.createElement("span");
            sp.className = "cs-w";
            sp.textContent = m[2];
            frag.append(sp);
            if (m[3]) frag.append(m[3]);
            timed.push({ sp, start: u.start, end: u.end, p: 0 });
        }
        el.textContent = "";
        el.append(frag);
        el.__cs = { idx, timed };
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
        if (!cs || !el.querySelector(".cs-w") || t < L[cs.idx].t - 600 ||
            (cs.idx + 1 < L.length && t > L[cs.idx + 1].t + 600)) {
            let idx = -1;
            for (let i = 0; i < L.length; i++) if (L[i].text.trim() === text && L[i].t <= t + 400) idx = i;
            if (idx < 0) return;
            if (!cs || cs.idx !== idx || !el.querySelector(".cs-w")) buildLine(el, idx);
            cs = el.__cs;
        }
        for (const u of cs.timed) {
            const p = Math.max(0, Math.min(1, (t - u.start) / Math.max(1, u.end - u.start)));
            if (Math.abs(p - u.p) > 0.004 || (p !== u.p && (p === 0 || p === 1))) {
                u.p = p;
                u.sp.style.setProperty("--p", p.toFixed(3));
            }
        }
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
