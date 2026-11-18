// Cloudflare Pages Function: Manejador de Login (GET estático y POST proxy al backend)
export async function onRequest(context) {
    const url = new URL(context.request.url);

    // Si es GET /login, servimos la página HTML estática
    if (context.request.method === 'GET') {
        return context.env.ASSETS.fetch(new URL('/login.html', context.request.url));
    }

    // Si es POST u otro método, enviamos la solicitud al backend
    const backendUrl = `https://api.monosincorp.com${url.pathname}${url.search}`;
    const headers = new Headers(context.request.headers);
    headers.set('Host', 'api.monosincorp.com');
    headers.set('X-Forwarded-Host', url.host);
    headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));

    const init = {
        method: context.request.method,
        headers: headers,
        body: context.request.body,
        redirect: 'manual'
    };

    try {
        const response = await fetch(backendUrl, init);
        const resHeaders = new Headers(response.headers);

        // Si el backend redirige a http(s)://api.monosincorp.com/..., reescribir a /...
        if (response.status >= 300 && response.status < 400) {
            const loc = resHeaders.get('Location');
            if (loc) {
                try {
                    const locUrl = new URL(loc, 'https://api.monosincorp.com');
                    resHeaders.set('Location', locUrl.pathname + locUrl.search);
                } catch (e) {
                    // Si ya es relativa, se mantiene
                }
            }
        }

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: resHeaders
        });
    } catch (err) {
        return new Response(`Error al conectar con el servidor de autenticación: ${err.message}`, {
            status: 502,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
    }
}
