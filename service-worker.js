const SHELL_CACHE_NAME = "nasa-space-explorer-shell-v13";
const SHELL_CACHE_PREFIX = "nasa-space-explorer-shell-";
const APOD_CACHE_NAME = "nasa-space-explorer-apod-v1";
const APOD_CACHE_LIMIT = 40;
const IMAGE_CACHE_NAME = "nasa-space-explorer-images-v1";
const IMAGE_CACHE_PREFIX = "nasa-space-explorer-images-";
const IMAGE_CACHE_LIMIT = 60;
const APOD_ORIGIN = "https://science.nasa.gov";
const APOD_PATH = "/wp-json/wp/v2/apod-basic";

const APP_SHELL_PATHS = [
  "./",
  "./index.html",
  "./style.css",
  "./js/dateRange.js",
  "./js/script.js?v=sw-v13",
  "./manifest.json",
  "./img/nasa-worm-logo.png",
  "./img/nasa-space-explorer-icon-180-final.png?v=ios-icon-v13",
  "./img/nasa-space-explorer-icon-192-final.png",
  "./img/nasa-space-explorer-icon-512-final.png"
];

const APP_SHELL_URLS = new Set(
  APP_SHELL_PATHS.map((assetPath) => new URL(assetPath, self.registration.scope).href)
);

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE_NAME);
    await cache.addAll(Array.from(APP_SHELL_URLS));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    const oldShellCaches = cacheNames.filter((cacheName) =>
      cacheName.startsWith(SHELL_CACHE_PREFIX) && cacheName !== SHELL_CACHE_NAME
    );
    const oldImageCaches = cacheNames.filter((cacheName) =>
      cacheName.startsWith(IMAGE_CACHE_PREFIX) && cacheName !== IMAGE_CACHE_NAME
    );

    await Promise.all([
      ...oldShellCaches.map((cacheName) => caches.delete(cacheName)),
      ...oldImageCaches.map((cacheName) => caches.delete(cacheName))
    ]);
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "image-load-failed" || typeof event.data.url !== "string") {
    return;
  }

  event.waitUntil(deleteFailedImage(event.data.url));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(request.url);

  if (requestUrl.origin === APOD_ORIGIN && requestUrl.pathname === APOD_PATH) {
    event.respondWith(networkFirstApod(request, event.clientId));
    return;
  }

  if (request.destination === "image" && requestUrl.origin !== self.location.origin) {
    event.respondWith(cacheFirstImage(request));
    return;
  }

  if (requestUrl.origin === self.location.origin && APP_SHELL_URLS.has(request.url)) {
    event.respondWith(
      request.mode === "navigate"
        ? networkFirstAppShell(request)
        : cacheFirstAppShell(request)
    );
  }
});

async function cacheFirstImage(request) {
  let cache;

  try {
    cache = await caches.open(IMAGE_CACHE_NAME);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }
  } catch (error) {
    console.warn("Unable to read the NASA image cache:", error);
  }

  const response = await fetch(request);

  if (cache && isUsableImageResponse(response)) {
    try {
      await cache.put(request, response.clone());
      await trimImageCache(cache);
    } catch (error) {
      console.warn("Unable to save the NASA image to cache:", error);
    }
  }

  return response;
}

function isUsableImageResponse(response) {
  if (response.type === "opaque") {
    return true;
  }

  const contentType = response.headers.get("content-type") || "";
  return response.ok && contentType.toLowerCase().startsWith("image/");
}

async function deleteFailedImage(url) {
  try {
    const imageUrl = new URL(url);
    if (!["http:", "https:"].includes(imageUrl.protocol) || imageUrl.origin === self.location.origin) {
      return;
    }

    const cache = await caches.open(IMAGE_CACHE_NAME);
    await cache.delete(imageUrl.href, { ignoreVary: true });
  } catch (error) {
    console.warn("Unable to remove a failed NASA image from cache:", error);
  }
}

async function cacheFirstAppShell(request) {
  const cache = await caches.open(SHELL_CACHE_NAME);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
  }

  return response;
}

async function networkFirstAppShell(request) {
  const cache = await caches.open(SHELL_CACHE_NAME);
  let response;

  try {
    response = await fetch(request);
  } catch (error) {
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    throw error;
  }

  if (response.ok) {
    try {
      await cache.put(request, response.clone());
    } catch (error) {
      console.warn("Unable to update the cached app shell:", error);
    }
  }

  return response;
}

async function networkFirstApod(request, clientId) {
  const cache = await caches.open(APOD_CACHE_NAME);

  try {
    const response = await fetch(request);
    const contentType = response.headers.get("content-type") || "";

    if (response.ok && response.type === "cors" && contentType.includes("application/json")) {
      await cache.delete(request);
      await cache.put(request, response.clone());
      await trimApodCache(cache);
    }

    return response;
  } catch (error) {
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      if (clientId) {
        const client = await self.clients.get(clientId);
        client?.postMessage({ type: "apod-cache-fallback" });
      }

      return cachedResponse;
    }

    return new Response(
      JSON.stringify({ message: "NASA could not be reached, and there are no saved results for this date range." }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}

async function trimApodCache(cache) {
  const cachedRequests = await cache.keys();
  const excessCount = cachedRequests.length - APOD_CACHE_LIMIT;

  if (excessCount > 0) {
    const oldestRequests = cachedRequests.slice(0, excessCount);
    await Promise.all(oldestRequests.map((request) => cache.delete(request)));
  }
}

async function trimImageCache(cache) {
  const cachedRequests = await cache.keys();
  const excessCount = cachedRequests.length - IMAGE_CACHE_LIMIT;

  if (excessCount > 0) {
    const oldestRequests = cachedRequests.slice(0, excessCount);
    await Promise.all(oldestRequests.map((request) => cache.delete(request)));
  }
}
