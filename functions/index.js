// Cloudflare Pages Function: Protección de la ruta raíz /
// Si el usuario no tiene la cookie de sesión 'connect.sid', se le redirige inmediatamente a /login
export async function onRequest(context) {
    const cookie = context.request.headers.get('Cookie') || '';
    
    if (!cookie.includes('connect.sid')) {
        return Response.redirect(new URL('/login', context.request.url).toString(), 302);
    }
    
    // Si tiene cookie de sesión, continuar y servir el dashboard estático (public/index.html)
    return context.next();
}
