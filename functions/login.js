// Cloudflare Pages Function: Manejador de POST /login
// Las peticiones GET a /login las sirve directamente public/login/index.html como archivo estático.

export async function onRequestPost(context) {
    const url = new URL(context.request.url);
    const backendHost = context.env.BACKEND_URL || 'https://api.monosincorp.com';
    const backendUrl = `${backendHost}/login${url.search}`;

    const headers = new Headers(context.request.headers);
    headers.set('Host', new URL(backendHost).host);
    headers.set('X-Forwarded-Host', url.host);
    headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));

    const init = {
        method: 'POST',
        headers: headers,
        body: context.request.body,
        redirect: 'manual'
    };

    try {
        const response = await fetch(backendUrl, init);
        const resHeaders = new Headers(response.headers);

        // Si el backend responde con redirección (ej: 302 a / o a /login?error=...)
        if (response.status >= 300 && response.status < 400) {
            const loc = resHeaders.get('Location');
            if (loc) {
                try {
                    const locUrl = new URL(loc, backendHost);
                    // Asegurar que la redirección sea relativa al frontend en Cloudflare Pages
                    resHeaders.set('Location', locUrl.pathname + locUrl.search);
                } catch (e) {
                    // Mantener si ya es relativa
                }
            }
        }

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: resHeaders
        });
    } catch (err) {
        return new Response(`Error al conectar con el servidor backend (${backendHost}): ${err.message}`, {
            status: 502,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
    }
}
