// E.D.I.T.H. service worker — makes the app installable and lets the shell load
// even offline. Network-first for the app files (so code updates show up), with
// a cached fallback; never touches /api/* (live data must hit the network).

const CACHE = "edith-v1";
const SHELL = [
  "/",
  "/index.html",
  "/style.css",
  "/edith.js",
  "/brain.js",
  "/sports.js",
  "/players.js",
  "/manifest.json",
  "/icon.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/api/")) return; // live data — always network
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
