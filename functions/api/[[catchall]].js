// Cloudflare Pages Function: Proxy inverso transparente para /api/*
export async function onRequest(context) {
    const url = new URL(context.request.url);
    const backendHost = context.env.BACKEND_URL || 'https://api.monosincorp.com';
    const backendUrl = `${backendHost}${url.pathname}${url.search}`;

    const headers = new Headers(context.request.headers);
    headers.set('Host', new URL(backendHost).host);
    headers.set('X-Forwarded-Host', url.host);
    headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));

    const init = {
        method: context.request.method,
        headers: headers,
        redirect: 'manual'
    };

    if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
        init.body = context.request.body;
    }

    try {
        const response = await fetch(backendUrl, init);
        const resHeaders = new Headers(response.headers);

        // Si el backend responde con redirect a /login (ej. no autenticado)
        if (response.status >= 300 && response.status < 400) {
            const loc = resHeaders.get('Location');
            if (loc) {
                try {
                    const locUrl = new URL(loc, backendHost);
                    resHeaders.set('Location', locUrl.pathname + locUrl.search);
                } catch (e) {
                    // Mantener
                }
            }
        }

        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: resHeaders
        });
    } catch (err) {
        return new Response(JSON.stringify({
            error: `No se pudo conectar con el servidor backend (${backendHost})`,
            details: err.message
        }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
