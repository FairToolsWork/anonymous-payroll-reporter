const CACHE_NAME = 'payroll-pwa-v3.5.0' // x-release-please-version
const CDN_CACHE_LIMIT = 8
const CORE_ASSETS = [
    './index.html',
    './holiday-calculations.html',
    './styles.css',
    './app.js',
    './pdfjs.js',
    './pdf.js',
    './report.js',
    './parse.js',
    './pdf.worker.min.mjs',
    './xlsx.js',
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
        url.startsWith('https://fonts.googleapis.com') ||
        url.startsWith('https://fonts.gstatic.com')
    )
}

async function pruneCdnCache(cache) {
    const requests = await cache.keys()
    const cdnRequests = requests.filter((request) => isCdnRequest(request.url))
    if (cdnRequests.length <= CDN_CACHE_LIMIT) {
        return
    }
    const excess = cdnRequests.length - CDN_CACHE_LIMIT
    for (const request of cdnRequests.slice(0, excess)) {
        await cache.delete(request)
    }
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
                const fetchPromise = fetch(event.request)
                    .then((response) => {
                        const responseClone = response.clone()
                        caches.open(CACHE_NAME).then((cache) => {
                            if (response.ok) {
                                cache.delete(event.request).then(() => {
                                    cache
                                        .put(event.request, responseClone)
                                        .then(() => {
                                            pruneCdnCache(cache)
                                        })
                                })
                            }
                        })
                        return response
                    })
                    .catch(() => cachedResponse || Response.error())
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
