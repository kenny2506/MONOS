// Cloudflare Pages Function: Proxy inverso transparente para /api/*
export async function onRequest(context) {
    const url = new URL(context.request.url);
    const backendUrl = `https://api.monosincorp.com${url.pathname}${url.search}`;

    const headers = new Headers(context.request.headers);
    headers.set('Host', 'api.monosincorp.com');
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
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: resHeaders
        });
    } catch (err) {
        return new Response(JSON.stringify({
            error: 'No se pudo conectar con el servidor backend (api.monosincorp.com)',
            details: err.message
        }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
