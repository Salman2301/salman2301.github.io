/* eslint-disable no-restricted-globals */
/**
 * The service worker: makes the site installable and lets it open offline.
 *
 * The build (vite.config.ts, servicePlugin) fills in VERSION and PRECACHE
 * (every built file) and writes this as /sw.js. Not used in `vite dev`.
 *
 * - the page itself: network first, the cached copy when offline
 * - built files (/assets/*, hashed): cache first, they never change
 * - other files on this site and Google Fonts: cached copy at once, refreshed in the background
 * - everything else (radio streams, embeds, news): straight to the network
 */

const VERSION = 'ea89f3c897f7';
const PRECACHE = /** @type {string[]} */ (["/","/assets/index.2972d051.js","/assets/LiveEditor.1b0f8e45.js","/assets/LiveEditor.bbbda5eb.css","/assets/index.d560b4fe.css","/css/global.css","/favicon.ico","/icons/apple-touch-icon.png","/icons/icon-192.png","/icons/icon-512.png","/icons/icon.svg","/icons/maskable-512.png","/manifest.webmanifest"]);
const CACHE = `s2301-${VERSION}`;
const FONTS = 's2301-fonts';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('s2301-') && k !== CACHE && k !== FONTS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Fetch and store a copy (only good, same-type responses). */
async function fetchAndStore(cacheName, request) {
  const res = await fetch(request);
  if (res.ok || res.type === 'opaque') {
    const cache = await caches.open(cacheName);
    await cache.put(request, res.clone());
  }
  return res;
}

async function networkFirst(request) {
  try {
    return await fetchAndStore(CACHE, request);
  } catch {
    const cache = await caches.open(CACHE);
    return (await cache.match(request, { ignoreSearch: true })) || (await cache.match('/')) || Response.error();
  }
}

async function cacheFirst(cacheName, request) {
  const hit = await caches.match(request);
  return hit || fetchAndStore(cacheName, request);
}

async function staleWhileRevalidate(cacheName, request) {
  const hit = await caches.match(request);
  const fresh = fetchAndStore(cacheName, request).catch(() => hit || Response.error());
  return hit || fresh;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname === '/sw.js') return;
    if (request.mode === 'navigate') return event.respondWith(networkFirst(request));
    if (url.pathname.startsWith('/assets/')) return event.respondWith(cacheFirst(CACHE, request));
    return event.respondWith(staleWhileRevalidate(CACHE, request));
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    return event.respondWith(staleWhileRevalidate(FONTS, request));
  }
});

/** Clicking a reminder notification brings the site forward (or opens it). */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => new URL(c.url).origin === self.location.origin);
      return open ? open.focus() : self.clients.openWindow('/');
    }),
  );
});
