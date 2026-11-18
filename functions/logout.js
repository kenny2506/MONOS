// Cloudflare Pages Function: Manejador de Logout
export async function onRequest(context) {
    const url = new URL(context.request.url);
    const backendUrl = `https://api.monosincorp.com/logout${url.search}`;

    const headers = new Headers(context.request.headers);
    headers.set('Host', 'api.monosincorp.com');
    headers.set('X-Forwarded-Host', url.host);
    headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));

    const init = {
        method: context.request.method,
        headers: headers,
        redirect: 'manual'
    };

    try {
        const response = await fetch(backendUrl, init);
        const resHeaders = new Headers(response.headers);

        if (response.status >= 300 && response.status < 400) {
            const loc = resHeaders.get('Location');
            if (loc) {
                try {
                    const locUrl = new URL(loc, 'https://api.monosincorp.com');
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
        // En caso de que el backend no responda, redirigir a /login
        return Response.redirect(new URL('/login', context.request.url).toString(), 302);
    }
}
