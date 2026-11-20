/* Budsbox service worker
   - Songs and covers you download are kept in the "budsbox-audio" cache and played from there,
     including the partial (range) requests phones use for audio.
   - The app itself (page, styles, code, icons, the Supabase library) is kept in "budsbox-shell"
     so it can open without a connection. It always tries the network first, so updates still arrive. */
const SHELL = "budsbox-shell-v1"; // worker v2: streamed songs skip the worker
const AUDIO = "budsbox-audio";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // songs: only downloaded ones (marked by the app) come through here. Streamed songs load directly,
  // because iPhones put the worker to sleep in the background and the music would stop.
  if (url.pathname.includes("/storage/v1/object/public/")) {
    if (url.searchParams.has("bbx")) { url.searchParams.delete("bbx"); e.respondWith(fromDownloads(req, url.href)); }
    else if (req.destination === "image") e.respondWith(fromDownloads(req, req.url));
    return;
  }
  const isShell = url.origin === self.location.origin ||
    url.hostname === "cdn.jsdelivr.net" || url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (isShell) e.respondWith(networkFirst(req));
});

// downloaded song or cover: answer from the cache, slicing it for range requests
async function fromDownloads(req, key) {
  const cache = await caches.open(AUDIO);
  const hit = await cache.match(key, { ignoreVary: true });
  if (!hit) { const range = req.headers.get("range"); return fetch(key, range ? { headers: { range } } : {}); }
  const range = req.headers.get("range");
  if (!range) return hit;
  const buf = await hit.arrayBuffer();
  const total = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
  let start = m[1] ? +m[1] : 0, end = m[2] ? +m[2] : total - 1;
  if (!m[1] && m[2]) { start = Math.max(0, total - +m[2]); end = total - 1; }
  end = Math.min(end, total - 1);
  if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": hit.headers.get("Content-Type") || "audio/mpeg",
      "Content-Range": `bytes ${start}-${end}/${total}`,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
    },
  });
}

// app files: network first (so updates arrive), saved copy when offline
async function networkFirst(req) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreVary: true }) ||
      (req.mode === "navigate" ? await cache.match(new URL("./", self.location).href) || await cache.match(new URL("./index.html", self.location).href) : null);
    if (hit) return hit;
    throw err;
  }
}
