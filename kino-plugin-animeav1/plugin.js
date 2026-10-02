const BASE = "https://animeav1.com";
const UPN_HOST = "https://animeav1.uns.bio";
const VOE_HOST = "https://voe.sx";
const MP4_HOST = "https://www.mp4upload.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36";
const HLS_MIME = "application/vnd.apple.mpegurl";
const PAGE_SIZE = 20;
const SLUG_RE = /^[A-Za-z0-9._-]{1,100}$/;
const UPN_KEY = "kiemtienmua911ca";
const UPN_IV = "1234567890oiuytr";

function log(...args) {
  try {
    kino.log(...args);
  } catch {
  }
}

function unescapeHtml(s) {
  return String(s)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&amp;/g, "&");
}

function stripTags(s) {
  return unescapeHtml(String(s).replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

async function fetchText(url, headers) {
  const r = await kino.fetch(url, headers ? { headers } : undefined);
  if (r.status === 404) throw kino.error("not_found", "ya no está");
  if (r.status === 429) throw kino.error("rate_limited", "demasiadas peticiones");
  if (!r.ok) throw kino.error("unavailable", "el sitio respondió " + r.status);
  return await r.text();
}

export async function search(query) {
  await null;
  const q = String((query && query.q) || "").trim().slice(0, 100);
  if (!q) return [];
  const page = query && query.cursor ? Number(query.cursor) : 1;
  if (!Number.isInteger(page) || page < 1 || page > 500) throw kino.error("not_found", "página inválida");
  const html = await fetchText(BASE + "/catalogo?search=" + encodeURIComponent(q) + "&page=" + page);
  const items = [];
  const blockRe = /<article\b[\s\S]*?<\/article>/g;
  let block;
  while ((block = blockRe.exec(html)) !== null && items.length < 100) {
    const part = block[0];
    const href = /href="\/media\/([^"?#]+)"/.exec(part);
    const h3 = /<h3[^>]*>([\s\S]*?)<\/h3>/.exec(part);
    if (!href || !h3) continue;
    let slug = href[1];
    try {
      slug = decodeURIComponent(slug);
    } catch {
    }
    if (!SLUG_RE.test(slug)) continue;
    const img = /src="(https:\/\/cdn\.animeav1\.com\/covers\/[^"]+)"/.exec(part);
    const badge = /text-subs">([^<]+)</.exec(part);
    const item = {
      id: slug,
      ref: slug,
      title: stripTags(h3[1]).slice(0, 200) || slug,
      kind: badge && /pel[ií]cula/i.test(badge[1]) ? "movie" : "series",
    };
    if (img) item.poster = img[1];
    items.push(item);
  }
  return { items, next: items.length >= PAGE_SIZE ? String(page + 1) : undefined };
}

export async function episodes(ref) {
  await null;
  const slug = String(ref || "");
  if (!SLUG_RE.test(slug)) throw kino.error("not_found", "no existe ese anime");
  const html = await fetchText(BASE + "/media/" + encodeURIComponent(slug));
  const eps = [];
  const re = /\{id:\d+,number:(\d+)\}/g;
  let m;
  while ((m = re.exec(html)) !== null && eps.length < 5000) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 99999) eps.push({ season: 1, number: n, ref: slug + "|" + n, title: "Episodio " + n });
  }
  if (!eps.length) throw kino.error("unavailable", "no tiene episodios cargados");
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html);
  const img = /src="(https:\/\/cdn\.animeav1\.com\/covers\/[^"]+)"/.exec(html);
  const series = {};
  if (h1) series.title = stripTags(h1[1]).slice(0, 200) || slug;
  if (img) series.poster = img[1];
  return { series, episodes: eps };
}

function embedsOf(html) {
  const out = { sub: [], dub: [] };
  const at = html.indexOf("embeds:{");
  if (at === -1) return out;
  let depth = 0;
  let end = -1;
  for (let i = at + 7; i < html.length; i++) {
    const c = html.charAt(i);
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return out;
  const block = html.slice(at + 8, end);
  const grab = (key) => {
    const head = new RegExp("(^|[,{])" + key + ":\\[").exec(block);
    if (!head) return "";
    const open = block.indexOf("[", head.index);
    let i = open + 1;
    let b = 1;
    for (; i < block.length && b > 0; i++) {
      const c = block.charAt(i);
      if (c === "[") b++;
      else if (c === "]") b--;
    }
    return block.slice(open + 1, i - 1);
  };
  for (const pair of [["SUB", out.sub], ["DUB", out.dub]]) {
    const segment = grab(pair[0]);
    const re = /server:"([^"]{1,40})",url:"(https:[^"]{1,600})"/g;
    let m;
    while ((m = re.exec(segment)) !== null) pair[1].push({ server: m[1], url: m[2] });
  }
  return out;
}

async function fromUPN(url) {
  const hash = url.split("#")[1] || "";
  if (!/^[A-Za-z0-9]{1,40}$/.test(hash)) throw new Error("link raro");
  const r = await kino.fetch(UPN_HOST + "/api/v1/video?id=" + hash + "&w=1680&h=1050&r=animeav1.com", {
    headers: { "User-Agent": UA, "Referer": UPN_HOST + "/" },
  });
  if (r.status === 429) throw kino.error("rate_limited", "demasiadas peticiones");
  if (!r.ok) throw new Error("la API respondió " + r.status);
  const body = (await r.text()).replace(/\s+/g, "");
  if (body.charAt(0) === "{") throw new Error("la API negó el video");
  const json = kino.crypto.decrypt("aes-128-cbc", {
    key: UPN_KEY,
    keyEncoding: "utf8",
    iv: UPN_IV,
    ivEncoding: "utf8",
    data: body,
    inputEncoding: "hex",
    outputEncoding: "utf8",
  });
  const cfg = JSON.parse(json);
  const stream = cfg.cfNative || cfg.source;
  if (typeof stream !== "string" || stream.slice(0, 6) !== "https:") throw new Error("sin enlace");
  return { url: stream, mime: HLS_MIME, expiresInSeconds: 3600 };
}

function voeConfig(html) {
  const m = /<script type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error("sin datos");
  const arr = JSON.parse(m[1].replace(/^\s+|\s+$/g, ""));
  const enc = Array.isArray(arr) ? arr[0] : null;
  if (typeof enc !== "string") throw new Error("datos raros");
  let a = enc.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
  const tokens = ["@$", "^^", "~@", "%?", "*~", "!!", "#&"];
  for (let i = 0; i < tokens.length; i++) a = a.split(tokens[i]).join("");
  a = atob(a);
  let b = "";
  for (let i = 0; i < a.length; i++) b += String.fromCharCode(a.charCodeAt(i) - 3);
  b = b.split("").reverse().join("");
  return JSON.parse(atob(b));
}

async function fromVoe(url) {
  const m = /^https:\/\/voe\.sx\/e\/([A-Za-z0-9]+)\/?$/.exec(url);
  if (!m) throw new Error("link raro");
  const first = await fetchText(VOE_HOST + "/e/" + m[1], { "User-Agent": UA });
  let embed = first;
  if (first.indexOf("application/json") === -1) {
    const h = /window\.location\.href\s*=\s*'(https:\/\/[^']+\/e\/[A-Za-z0-9]+)'/.exec(first);
    if (!h) throw new Error("sin redirección");
    embed = await fetchText(h[1], { "User-Agent": UA, "Referer": VOE_HOST + "/" });
  }
  const cfg = voeConfig(embed);
  const stream = cfg && cfg.source;
  if (typeof stream !== "string" || stream.slice(0, 6) !== "https:") throw new Error("sin enlace");
  return { url: stream, mime: HLS_MIME, expiresInSeconds: 3600 };
}

async function fromMP4(url) {
  const m = /^https:\/\/www\.mp4upload\.com\/embed-([A-Za-z0-9]+)\.html$/.exec(url);
  if (!m) throw new Error("link raro");
  const html = await fetchText(MP4_HOST + "/embed-" + m[1] + ".html", { "User-Agent": UA, "Referer": MP4_HOST + "/" });
  const s = /src:\s*"(https:[^"]+\.mp4[^"]*)"/.exec(html);
  if (!s) throw new Error("sin enlace");
  return { url: s[1], mime: "video/mp4", headers: { Referer: MP4_HOST + "/" }, expiresInSeconds: 3600 };
}

export async function resolve(ref) {
  await null;
  const raw = String(ref || "");
  const cut = raw.indexOf("|");
  const slug = cut === -1 ? "" : raw.slice(0, cut);
  const num = cut === -1 ? "" : raw.slice(cut + 1);
  if (!SLUG_RE.test(slug) || !/^[1-9]\d{0,4}$/.test(num)) throw kino.error("not_found", "episodio inválido");
  const html = await fetchText(BASE + "/media/" + encodeURIComponent(slug) + "/" + encodeURIComponent(num));
  const embeds = embedsOf(html);
  const list = embeds.sub.length ? embeds.sub : embeds.dub;
  if (!list.length) throw kino.error("unavailable", "este episodio no tiene servidores");
  const errors = [];
  for (const name of ["UPNShare", "Voe", "MP4Upload"]) {
    let hit = null;
    for (let i = 0; i < list.length; i++) {
      if (list[i].server === name) {
        hit = list[i];
        break;
      }
    }
    if (!hit) continue;
    try {
      if (name === "UPNShare") return await fromUPN(hit.url);
      if (name === "Voe") return await fromVoe(hit.url);
      return await fromMP4(hit.url);
    } catch (e) {
      errors.push(name + ": " + e.message);
      log("resolve", name, "falló:", e.message);
    }
  }
  throw kino.error("unavailable", ("ningún servidor respondió (" + errors.join("; ") + ")").slice(0, 190));
}
