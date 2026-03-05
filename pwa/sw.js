const CACHE_NAME = 'payroll-pwa-v1.4.0' // x-release-please-version
const CORE_ASSETS = [
    './index.html',
    './styles.css',
    './app.js',
    './site.webmanifest',
]

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
    )
})

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys
                        .filter((key) => key !== CACHE_NAME)
                        .map((key) => caches.delete(key))
                )
            )
            .then(() => self.clients.claim())
    )
})

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting()
    }
})

function isCdnRequest(url) {
    return (
        url.startsWith('https://cdnjs.cloudflare.com') ||
        url.startsWith('https://unpkg.com') ||
        url.startsWith('https://cdn.jsdelivr.net') ||
        url.startsWith('https://fonts.googleapis.com') ||
        url.startsWith('https://fonts.gstatic.com')
    )
}

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') {
        return
    }

    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    const responseClone = response.clone()
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone)
                    })
                    return response
                })
                .catch(() => caches.match(event.request))
        )
        return
    }

    const requestUrl = event.request.url
    if (isCdnRequest(requestUrl)) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                const fetchPromise = fetch(event.request).then((response) => {
                    const responseClone = response.clone()
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone)
                    })
                    return response
                })
                return cachedResponse || fetchPromise
            })
        )
        return
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse
            }
            return fetch(event.request)
                .then((response) => {
                    const responseClone = response.clone()
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone)
                    })
                    return response
                })
                .catch(() => caches.match('./index.html'))
        })
    )
})
