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
