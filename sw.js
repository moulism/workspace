const CACHE = "workspace-shell-v1";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/app.js",
  "./js/auth.js",
  "./js/config.js",
  "./js/db.js",
  "./js/google.js",
  "./js/richtext.js",
  "./js/supabaseClient.js",
  "./js/vendor/supabase.esm.js",
  "./js/theme.js",
  "./js/toast.js",
  "./js/ui.js",
  "./js/views/dashboard.js",
  "./js/views/notes.js",
  "./js/views/calendar.js",
  "./js/views/todos.js",
  "./js/views/goals.js",
  "./js/views/diary.js",
  "./js/views/gym.js",
  "./js/views/meals.js",
  "./js/views/recipes.js",
  "./js/views/shopping.js",
  "./js/views/settings.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Network-first for everything (this app needs live data), falling back to
// the cached app shell so it still opens (read-only-ish) when offline.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // don't intercept Supabase/Google/CDN calls

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
