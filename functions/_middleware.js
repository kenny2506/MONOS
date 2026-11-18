// Cloudflare Pages Middleware Maestro: Orquestador de Rutas y Proxy Inverso al Backend
export async function onRequest(context) {
    const url = new URL(context.request.url);
    const pathname = url.pathname;
    
    // Si se definió la variable BACKEND_URL en Cloudflare Pages, usarla; si no, usar el túnel activo o api.monosincorp.com
    const backendHost = context.env.BACKEND_URL || 'https://jet-patches-excluded-dog.trycloudflare.com';

    // 1. Interceptar POST /login y POST /login/ (procesar credenciales de acceso)
    if (context.request.method === 'POST' && (pathname === '/login' || pathname === '/login/')) {
        return proxyToBackend(context, `${backendHost}/login${url.search}`);
    }

    // 2. Interceptar /logout y /logout/ (cierre de sesión)
    if (pathname === '/logout' || pathname === '/logout/') {
        return proxyToBackend(context, `${backendHost}/logout${url.search}`);
    }

    // 3. Interceptar todas las llamadas al API (/api/*)
    if (pathname.startsWith('/api/')) {
        return proxyToBackend(context, `${backendHost}${pathname}${url.search}`);
    }

    // 4. Proteger la raíz / si el usuario no tiene la cookie de sesión
    if (pathname === '/' || pathname === '/index.html') {
        const cookie = context.request.headers.get('Cookie') || '';
        if (!cookie.includes('connect.sid')) {
            return Response.redirect(new URL('/login', context.request.url).toString(), 302);
        }
    }

    // 5. Dejar que Cloudflare Pages entregue todos los archivos estáticos (login HTML, index HTML, CSS, JS, imágenes)
    return context.next();
}

async function proxyToBackend(context, targetUrl) {
    const url = new URL(context.request.url);
    const target = new URL(targetUrl);

    const headers = new Headers(context.request.headers);
    headers.set('Host', target.host);
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
        const response = await fetch(target.toString(), init);
        const resHeaders = new Headers(response.headers);

        // Si el backend responde con una redirección HTTP (301, 302, 303, 307, 308)
        if (response.status >= 300 && response.status < 400) {
            const loc = resHeaders.get('Location');
            if (loc) {
                try {
                    const locUrl = new URL(loc, target.origin);
                    // Reescribir la URL para que siempre apunte al dominio del frontend
                    resHeaders.set('Location', locUrl.pathname + locUrl.search);
                } catch (e) {
                    // Si ya es relativa, se preserva
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
            error: 'No se pudo conectar con el servidor backend',
            target: targetUrl,
            details: err.message
        }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
