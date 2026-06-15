/*
 * SPDX-FileCopyrightText: 2024 Volodymyr Shymanskyy
 * SPDX-License-Identifier: MIT
 *
 * The software is provided 'as is', without any warranties or guarantees (explicit or implied).
 * This includes no assurances about being fit for any specific purpose.
 */

const cacheName = `viper-${VIPER_IDE_VERSION}-${VIPER_IDE_BUILD}`;

const log = console.log.bind(console).bind(console, `[Service Worker ${VIPER_IDE_VERSION}-${VIPER_IDE_BUILD}]`);

const contentToCache = new Set([
    '/index.html',
    '/assets/favicon.png',
    '/assets/app_1024.png',
    '/assets/logo_1024.png',
    '/assets/mpy-cross-v6.wasm',
    '/assets/micropython.wasm',
    '/assets/ruff_wasm_bg.wasm',
    '/assets/tools_vfs.tar.gz',
    '/assets/vm_vfs.tar.gz',
]);

self.addEventListener('install', event => {
  log('Install');
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    await Promise.all(contentToCache.values().map(resource => {
      return cache.add(new Request(resource, { cache: 'no-store' }));
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  log('Activate');
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== cacheName) {
        log(`Deleting ${key}`);
        await caches.delete(key);
      }
    }
    // Take control of all open clients immediately so the freshly
    // deployed version is used without requiring a manual reload.
    await self.clients.claim();
  })());
});

function normalizeUrl(s) {
  const url = new URL(s);
  if (url.pathname === '/') {
    return new URL('/index.html', url.origin);
  }
  return url;
}

function isAppShell(request, url) {
  return request.mode === 'navigate' || url.pathname === '/index.html';
}

self.addEventListener('fetch', event => {
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const url = normalizeUrl(event.request.url);

    // Network-first for the HTML app shell so a new deploy is picked up
    // immediately. Fall back to the cached shell when offline.
    if (isAppShell(event.request, url)) {
      try {
        const rsp = await fetch(new Request(url, { cache: 'no-store' }));
        cache.put(url, rsp.clone());
        log(`Fetched shell: ${url}`);
        return rsp;
      } catch (err) {
        const cached = await cache.match(url);
        if (cached) {
          log(`Offline, using cached shell: ${url}`);
          return cached;
        }
        log(err.message);
        throw err;
      }
    }

    // Cache-first for the listed static assets. The cache name is unique
    // per build, so a new deploy starts with an empty cache and re-fetches.
    const r = await cache.match(url);
    if (r) {
      log(`Using cached: ${url}`);
      return r;
    } else {
      //log(`Loading: ${url}`);
      try {
        const rsp = await fetch(event.request);

        if (contentToCache.has(url.pathname)) {
          log(`Caching: ${url}`);
          cache.put(event.request, rsp.clone());
        }

        return rsp;
      } catch (err) {
        log(err.message);
        throw err;
      }
    }
  })());
});
