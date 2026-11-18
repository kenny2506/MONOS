// Cloudflare Advanced Mode Worker: Proxy inverso unificado al backend de Railway y entrega de assets
export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const pathname = url.pathname;
        const backendHost = env.BACKEND_URL || 'https://monos-production-00e8bbed.up.railway.app';

        // 1. Interceptar rutas dinámicas hacia el backend (API, login, logout)
        if (pathname.startsWith('/api/') || pathname === '/login' || pathname === '/login/' || pathname === '/logout' || pathname === '/logout/') {
            // Si es GET /login, dejar que se sirva el archivo estático login.html
            if (request.method === 'GET' && (pathname === '/login' || pathname === '/login/')) {
                return env.ASSETS ? env.ASSETS.fetch(new URL('/login/index.html', request.url)) : fetch(request);
            }

            const targetUrl = new URL(pathname + url.search, backendHost);
            const headers = new Headers(request.headers);
            headers.set('Host', new URL(backendHost).host);
            headers.set('X-Forwarded-Host', url.host);
            headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));

            const init = {
                method: request.method,
                headers: headers,
                redirect: 'manual'
            };

            if (request.method !== 'GET' && request.method !== 'HEAD') {
                init.body = request.body;
            }

            try {
                const response = await fetch(targetUrl.toString(), init);
                const resHeaders = new Headers(response.headers);

                // Si el backend responde con redirección HTTP (301, 302, 303, 307, 308)
                if (response.status >= 300 && response.status < 400) {
                    const loc = resHeaders.get('Location');
                    if (loc) {
                        try {
                            const locUrl = new URL(loc, backendHost);
                            resHeaders.set('Location', locUrl.pathname + locUrl.search);
                        } catch (e) {
                            // Preservar si ya es relativa
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
                    error: 'Error de comunicación con el backend en la nube',
                    backend: backendHost,
                    details: err.message
                }), {
                    status: 502,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        // 2. Proteger la raíz / si el usuario no tiene la cookie de sesión connect.sid
        if (pathname === '/' || pathname === '/index.html') {
            const cookie = request.headers.get('Cookie') || '';
            if (!cookie.includes('connect.sid')) {
                return Response.redirect(new URL('/login', request.url).toString(), 302);
            }
        }

        // 3. Dejar que Cloudflare entregue el asset estático correspondiente
        return env.ASSETS ? env.ASSETS.fetch(request) : fetch(request);
    }
};
