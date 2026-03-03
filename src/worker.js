export default {
    async fetch(request, env) {
        const url = new URL(request.url)
        const pathname = url.pathname

        const response = await env.ASSETS.fetch(request)

        const noCache =
            pathname === '/' ||
            pathname === '/index.html' ||
            pathname === '/sw.js' ||
            pathname === '/site.webmanifest'

        if (noCache) {
            const headers = new Headers(response.headers)
            headers.set('Cache-Control', 'no-cache')
            return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers,
            })
        }

        return response
    },
}
