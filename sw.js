const CACHE_NAME = "skaner-produktow-v1003";
const CORE_ASSETS = [
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
    }))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  if (url.hostname.includes("openfoodfacts.org") || url.hostname.includes("unpkg.com")) {
    event.respondWith(fetch(request));
    return;
  }

  // Dla stron HTML zawsze najpierw internet, żeby GitHub Pages nie siedział w starej wersji.
  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then(response => response)
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      return cached || fetch(request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        return response;
      });
    })
  );
});
