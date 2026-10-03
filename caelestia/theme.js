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

    // ---- Desplazamiento suave de la letra --------------------------------------
    // Spotify centra la frase activa con scrollIntoView({behavior:"smooth"}): dura ~150 ms y
    // se ve como un salto. Aquí se sustituye, solo para las frases, por una animación propia
    // que arranca en el acto y frena suave, en el mismo tiempo y curva que el resaltado de
    // la frase (CSS): la nueva llega al centro mientras se enciende y la vista no se mueve.
    // (Antes arrancaba despacio y duraba más: la vista saltaba a la línea de abajo y luego
    // el scroll se la llevaba hacia arriba.)
    const nativeSIV = Element.prototype.scrollIntoView;
    let lyrScroll = { raf: 0, el: null };
    let lyrDur = 620;
    // Duración del paso a la frase i: una fracción de lo que dura esa frase (letra rápida → paso
    // rápido; lenta → pausado), entre 420 y 1000 ms
    function setLyrDur(i) {
        const L = lyr.lines;
        const g = L && i >= 0 && i + 1 < L.length ? L[i + 1].t - L[i].t : 2600;
        const d = Math.round(Math.max(420, Math.min(1000, g * 0.3)));
        if (d !== lyrDur) {
            lyrDur = d;
            document.documentElement.style.setProperty("--cs-lyr-dur", d + "ms");
        }
    }
    // Centra una frase con la animación propia (sobre el ancestro que hace scroll)
    function smoothCenter(line) {
        let sc = line.parentElement;
        while (sc && !(sc.scrollHeight > sc.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
        if (!sc) return false;
        const r = line.getBoundingClientRect(), s = sc.getBoundingClientRect();
        // la frase activa crece 3% (transform): se centra su caja sin escalar
        const to = Math.max(0, Math.min(sc.scrollHeight - sc.clientHeight,
            sc.scrollTop + (r.top + r.height / 2) - (s.top + s.height / 2)));
        const from = sc.scrollTop, d = to - from;
        cancelAnimationFrame(lyrScroll.raf);
        lyrScroll.raf = 0;
        if (Math.abs(d) < 1) return true;
        // misma duración que el relevo de la frase (--cs-lyr-dur), algo más si el salto es largo
        const dur = lyrDur + (Math.abs(d) > 400 ? 200 : 0), t0 = performance.now();
        const step = (now) => {
            const p = Math.min(1, (now - t0) / dur);
            const e = 1 - Math.pow(1 - p, 4); // easeOutQuart ≈ cubic-bezier(0.25, 1, 0.5, 1)
            sc.scrollTop = from + d * e;
            lyrScroll.raf = p < 1 ? requestAnimationFrame(step) : 0;
        };
        lyrScroll.raf = requestAnimationFrame(step);
        return true;
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
        // Las palabras van a ritmo de canto (~60 ms por letra) y la última se alarga: es la que
        // el cantante suele estirar hasta la respiración antes de la frase siguiente
        const words = toks.filter((w) => w.trim()), U = 60;
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
        let acc = ln.t, wi = 0;
        return toks.map((w) => {
            if (!w.trim()) return { text: w };
            const start = acc;
            acc += wi < units.length ? units[wi] * k : hold;
            wi++;
            return { text: w, start, end: acc };
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

    // ---- Frase actual por el reloj de la canción -----------------------------
    // Spotify marca la activa 250-400 ms tarde (hasta 1 s tras un ♪): aquí se calcula con
    // el progreso y cada línea lleva data-cs-d (distancia a la actual; ver el CSS)
    const clk = { on: false, box: null, wrap: null, els: null, off: 0, id: "", cur: -2, at: 0, follow: true, mo: null };
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
        const key = (x) => (x || "").replace(/\s+/g, " ").trim();
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
                cancelAnimationFrame(lyrScroll.raf);
                lyrScroll.raf = 0;
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
        if (cur < 0) return;
        const lineEl = clk.els[cur + clk.off];
        const el = lineEl && lineEl.querySelector(".lyrics-lyricsContent-text");
        const text = el && el.textContent.trim();
        if (!text || !/[\p{L}\p{N}]/u.test(text) || /[\u0590-\u08ff]/.test(text)) return; // ♪, vacías y RTL: tal cual
        if (!el.__cs || el.__cs.idx !== cur || !el.querySelector(".cs-w") || el.__cs.real !== !!L[cur].w) buildLine(el, cur);
        const cs = el.__cs;
        // La siguiente se trocea ya (sus trozos solo tienen estilo cuando es la actual): al
        // encenderse sale directamente con el relleno por palabras
        if (cs.prepped !== cur) {
            cs.prepped = cur;
            const nx = clk.els[cur + 1 + clk.off], nEl = nx && nx.querySelector(".lyrics-lyricsContent-text");
            const n = cur + 1, nt = nEl && nEl.textContent.trim();
            if (nEl && n < L.length && nt && /[\p{L}\p{N}]/u.test(nt) &&
                !(nEl.__cs && nEl.__cs.idx === n && nEl.querySelector(".cs-w"))) buildLine(nEl, n);
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
        // Cambio de página (p. ej. de una playlist a otra): entrada animada del panel central.
        // Se ignora la letra (tiene su propia animación) y los cambios de solo query/hash.
        // Spotify sustituye el objeto History después de arrancar: se re-engancha si cambia.
        let lastPath = null, routeT = 0, boundH = null;
        const onRoute = (loc) => {
            root.removeAttribute("data-cs-scrolled"); root.removeAttribute("data-cs-stuck");
            const path = loc && loc.pathname;
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
        document.addEventListener("click", (e) => {
            const b = e.target instanceof Element && e.target.closest('[data-testid="lyrics-button"]');
            if (!b || !Spicetify.Platform.History.location || Spicetify.Platform.History.location.pathname !== "/lyrics") return;
            e.preventDefault();
            e.stopImmediatePropagation();
            closeLyrics();
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
            if (!b || lyrBypass || lyrPageBroken || document.documentElement.dataset.csOs === "linux" || !H.location || H.location.pathname === "/lyrics") return;
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
                if (row === hrow || !row.offsetHeight || row.children.length < 3) continue;
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
    let tagQueued = 0; // 1: solo la lista de canciones, 2: todo
    const tagAll = () => {
        const all = tagQueued !== 1;
        tagQueued = 0;
        if (!needAliases()) return;
        if (all) tagInner();
        tagTrackList();
    };
    new MutationObserver((ms) => {
        // al hacer scroll en una lista larga entran filas en cada fotograma: entonces basta con la lista
        const want = ms.every((m) => m.target.closest && m.target.closest(".main-trackList-trackList")) ? 1 : 2;
        if (tagQueued >= want) return;
        if (!tagQueued) queueMicrotask(tagAll);
        tagQueued = want;
    }).observe(document.documentElement, { childList: true, subtree: true });
    setInterval(() => { tagQueued = 2; tagAll(); }, 2000);

    init();
})();
