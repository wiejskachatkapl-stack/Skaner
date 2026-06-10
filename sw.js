const CACHE_NAME = "skaner-produktow-v1002";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./products.html",
  "./style.css",
  "./shared.js",
  "./app.js",
  "./products.js",
  "./manifest.json",
  "./assets/hero-market.svg",
  "./assets/empty-products.svg",
  "./assets/product-placeholder.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(key => {
      if (key !== CACHE_NAME) return caches.delete(key);
    })))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.url.includes("openfoodfacts.org")) {
    event.respondWith(fetch(request).catch(() => new Response(JSON.stringify({ status: 0 }), {
      headers: { "Content-Type": "application/json" }
    }))));
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      return response;
    }).catch(() => caches.match("./index.html")))
  );
});
