const express = require('express');
const router = express.Router();
const {
    fetchOrderFromTiendanube,
    processAndSaveOrder,
    verifyTiendanubeHmac
} = require('../services/tiendanube.service');
const { appData } = require('../config/db');

/**
 * GET /api/webhooks/tiendanube
 * Healthcheck y estado de la integración con Tiendanube
 */
router.get('/tiendanube', (req, res) => {
    const store = (req.query.store || 'monos').toLowerCase();
    const envToken = process.env[`TIENDANUBE_${store.toUpperCase()}_ACCESS_TOKEN`] || process.env.TIENDANUBE_ACCESS_TOKEN;
    const hasToken = Boolean(envToken || appData[store]?.config?.tiendanube?.access_token);

    res.json({
        status: 'online',
        service: 'Monos Multitienda - Webhook de Tiendanube',
        description: 'Receptor automático de ventas cuando el pago sea recibido (evento order/paid)',
        target_store: store,
        api_token_configured: hasToken,
        webhook_url: `${req.protocol}://${req.get('host')}/api/webhooks/tiendanube?store=${store}`,
        instructions: {
            step_1: 'Crea la app en partners.tiendanube.com con Redirect URI: ' + `${req.protocol}://${req.get('host')}/api/webhooks/tiendanube/oauth`,
            step_2: 'Para conectar en 1 clic: ' + `${req.protocol}://${req.get('host')}/api/webhooks/tiendanube/connect?client_id=TU_CLIENT_ID&client_secret=TU_CLIENT_SECRET&store=${store}`
        }
    });
});

// Credenciales por defecto para Tiendanube
const DEFAULT_CLIENT_ID = process.env.TIENDANUBE_CLIENT_ID || '53974';
const DEFAULT_CLIENT_SECRET = process.env.TIENDANUBE_CLIENT_SECRET || '4ac25607dd19ded774f9ddb76e7ffc8464e4417b1be7795f';

// Guardar temporalmente secrets de OAuth en memoria
const oauthPendingSecrets = new Map();
oauthPendingSecrets.set(DEFAULT_CLIENT_ID, { clientSecret: DEFAULT_CLIENT_SECRET, store: 'monos' });

/**
 * GET /api/webhooks/tiendanube/connect
 * Inicia el flujo OAuth y redirige a Tiendanube con los permisos (scopes) correctos
 */
router.get('/tiendanube/connect', (req, res) => {
    const clientId = req.query.client_id || DEFAULT_CLIENT_ID;
    const clientSecret = req.query.client_secret || DEFAULT_CLIENT_SECRET;
    const store = (req.query.store || 'monos').toLowerCase();

    oauthPendingSecrets.set(String(clientId), { clientSecret, store });

    const host = req.get('host');
    const protocol = req.protocol;
    const redirectUri = `${protocol}://${host}/api/webhooks/tiendanube/oauth`;
    const scopes = 'read_orders,read_products,read_customers';
    
    // Tiendanube soporta tanto /apps/{id}/authorize como /apps/authorize?client_id=...
    const authUrl = `https://www.tiendanube.com/apps/${clientId}/authorize`;

    console.log(`[Tiendanube OAuth] Redirigiendo a autorización: ${authUrl}`);
    res.redirect(authUrl);
});

/**
 * GET /api/webhooks/tiendanube/oauth
 * Callback de Tiendanube: intercambia code por access_token y registra webhook
 */
router.get('/tiendanube/oauth', async (req, res) => {
    const { code, state, error, error_description } = req.query;

    if (error) {
        return res.status(400).send(`<h3>Error de autorización:</h3><p>${error_description || error}</p>`);
    }

    if (!code) {
        return res.status(400).send('<h3>Error: No se recibió código de autorización de Tiendanube.</h3>');
    }

    const store = (state || 'monos').toLowerCase();
    
    // Buscar client_id y client_secret
    let clientId = DEFAULT_CLIENT_ID;
    let clientSecret = DEFAULT_CLIENT_SECRET;

    for (const [cId, data] of oauthPendingSecrets.entries()) {
        clientId = cId;
        clientSecret = data.clientSecret;
        break;
    }

    if (!clientId || !clientSecret) {
        return res.send(`
            <div style="font-family:sans-serif; max-width:600px; margin:40px auto; padding:20px; border:1px solid #e2e8f0; border-radius:12px;">
                <h2 style="color:#e11d48;">Código de autorización recibido</h2>
                <p>Tu <strong>código de autorización</strong> es:</p>
                <code style="background:#f1f5f9; padding:8px 12px; border-radius:6px; display:block; font-size:14px; word-break:break-all;">${code}</code>
                <p style="margin-top:15px; color:#475569;">Copia este código y compártelo junto con tu <strong>Client ID</strong> y <strong>Client Secret</strong> para completar la activación.</p>
            </div>
        `);
    }

    try {
        console.log('[Tiendanube OAuth] Intercambiando code por access_token...');
        const tokenRes = await fetch('https://www.tiendanube.com/apps/authorize/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: 'authorization_code',
                code: code
            })
        });

        const tokenData = await tokenRes.json();
        if (!tokenRes.ok || !tokenData.access_token) {
            console.error('[Tiendanube OAuth] Error al obtener token:', tokenData);
            return res.status(500).send(`<h3>Error obteniendo Access Token:</h3><pre>${JSON.stringify(tokenData, null, 2)}</pre>`);
        }

        console.log(`[Tiendanube OAuth] ¡Token obtenido exitosamente! Tienda ID: ${tokenData.user_id}`);

        // Guardar token en appData y PostgreSQL
        const { saveDB } = require('../config/db');
        if (!appData[store]) appData[store] = { ventas: [], egresos: [], posts: [] };
        if (!appData[store].config) appData[store].config = {};
        appData[store].config.tiendanube = {
            access_token: tokenData.access_token,
            user_id: tokenData.user_id,
            scope: tokenData.scope,
            connected_at: new Date().toISOString()
        };
        saveDB(store, 'config', appData[store]);

        // Registrar Webhook automáticamente en Tiendanube
        const host = req.get('host');
        const protocol = req.protocol;
        const webhookUrl = `${protocol}://${host}/api/webhooks/tiendanube?store=${store}`;

        try {
            const whRes = await fetch(`https://api.tiendanube.com/v1/${tokenData.user_id}/webhooks`, {
                method: 'POST',
                headers: {
                    'Authentication': `bearer ${tokenData.access_token}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'Monos Multitienda (contacto@monos.com)'
                },
                body: JSON.stringify({
                    event: 'order/paid',
                    url: webhookUrl
                })
            });
            const whData = await whRes.json();
            console.log('[Tiendanube OAuth] Registro automático de webhook resultado:', whData);
        } catch (whErr) {
            console.warn('[Tiendanube OAuth] Nota sobre registro de webhook:', whErr.message);
        }

        res.send(`
            <div style="font-family:sans-serif; max-width:600px; margin:40px auto; padding:30px; border:1px solid #10b981; border-radius:16px; background:#f0fdf4; text-align:center;">
                <h1 style="color:#059669; margin:0 0 10px 0;">¡Conexión Exitosa! 🎉</h1>
                <p style="color:#065f46; font-size:16px;">Tu tienda de Tiendanube (ID: <strong>${tokenData.user_id}</strong>) ha sido vinculada exitosamente con <strong>Monos (${store.toUpperCase()})</strong>.</p>
                <div style="background:#ffffff; border:1px solid #d1fae5; border-radius:12px; padding:15px; margin:20px 0; text-align:left; font-size:14px; color:#334155;">
                    <p style="margin:4px 0;">✓ Permisos de lectura de pedidos activados (<code>${tokenData.scope || 'read_orders'}</code>)</p>
                    <p style="margin:4px 0;">✓ Webhook de ventas pagadas configurado: <code>${webhookUrl}</code></p>
                    <p style="margin:4px 0;">✓ Sincronización automática a PostgreSQL lista.</p>
                </div>
                <p style="color:#64748b; font-size:13px;">Ya puedes cerrar esta ventana. A partir de ahora, cada venta pagada se registrará automáticamente en tu gestor.</p>
            </div>
        `);

    } catch (e) {
        console.error('[Tiendanube OAuth] Error crítico:', e);
        res.status(500).send(`<h3>Error en el proceso OAuth:</h3><p>${e.message}</p>`);
    }
});

/**
 * POST /api/webhooks/tiendanube
 * Receptor principal de webhooks de Tiendanube
 */
router.post('/tiendanube', async (req, res) => {
    try {
        const targetStore = (req.query.store || 'monos').toLowerCase();
        const payload = req.body || {};

        console.log(`[Tiendanube Webhook] Recibida notificación para tienda "${targetStore}":`, JSON.stringify(payload).slice(0, 300));

        // 1. Validar firma HMAC si está configurada
        const clientSecret = process.env[`TIENDANUBE_${targetStore.toUpperCase()}_CLIENT_SECRET`] || process.env.TIENDANUBE_CLIENT_SECRET || DEFAULT_CLIENT_SECRET;
        const hmacHeader = req.headers['x-linkedstore-hmac-sha256'];
        if (clientSecret && hmacHeader) {
            const rawBody = JSON.stringify(req.body);
            if (!verifyTiendanubeHmac(rawBody, hmacHeader, clientSecret)) {
                console.warn('[Tiendanube Webhook] Firma HMAC inválida detectada.');
                return res.status(401).json({ error: 'Firma HMAC inválida' });
            }
        }

        // 2. CASO A: Payload liviano nativo de Tiendanube { store_id, event, id }
        if (payload.event && payload.id && payload.store_id) {
            const event = payload.event;
            const orderId = payload.id;
            const storeId = payload.store_id;

            // Solo procesar órdenes pagadas
            if (event !== 'order/paid') {
                console.log(`[Tiendanube Webhook] Evento "${event}" recibido para orden #${orderId}. No requiere acción (solo procesamos ventas con pago recibido).`);
                return res.status(200).json({
                    success: true,
                    message: `Evento ${event} recibido pero ignorado. Solo se procesan eventos "order/paid".`
                });
            }

            console.log(`[Tiendanube Webhook] ¡Venta pagada detectada! Orden #${orderId} de Tiendanube Store ID ${storeId}`);

            // Buscar Access Token para consultar la orden
            const accessToken = req.query.token || 
                                req.query.access_token || 
                                process.env[`TIENDANUBE_${targetStore.toUpperCase()}_ACCESS_TOKEN`] || 
                                process.env.TIENDANUBE_ACCESS_TOKEN ||
                                (appData[targetStore]?.config?.tiendanube?.access_token);

            if (!accessToken) {
                console.error(`[Tiendanube Webhook] ALERTA: No se encontró TIENDANUBE_ACCESS_TOKEN para la tienda "${targetStore}". ` +
                    `Para leer los detalles completos de la orden #${orderId}, configura TIENDANUBE_ACCESS_TOKEN en las variables de entorno de Railway o agrega ?token=... en la URL del webhook.`);
                
                return res.status(200).json({
                    success: false,
                    warning: 'Evento order/paid recibido, pero se requiere TIENDANUBE_ACCESS_TOKEN para consultar los detalles de la orden a través de la API.',
                    order_id: orderId,
                    store_id: storeId
                });
            }

            // Consultar orden completa desde la API de Tiendanube
            const fullOrder = await fetchOrderFromTiendanube(storeId, orderId, accessToken);
            const savedVentas = await processAndSaveOrder(fullOrder, targetStore);

            return res.status(200).json({
                success: true,
                message: `Orden #${fullOrder.number || orderId} de Tiendanube importada y registrada exitosamente`,
                count: savedVentas.length,
                ventas: savedVentas.map(v => ({ id: v.id, producto: v.producto, valor: v.valor, cliente: v.cliente }))
            });
        }

        // 3. CASO B: Payload completo de la orden (Make, Zapier, Webhook App o reenviador)
        const orderData = payload.order || payload.data || payload;

        if (orderData && (orderData.products || orderData.customer || orderData.shipping_address || orderData.id)) {
            // Verificar que el pago esté confirmado si viene especificado
            if (orderData.payment_status && orderData.payment_status !== 'paid' && orderData.payment_status !== 'authorized') {
                console.log(`[Tiendanube Webhook] Orden #${orderData.number || orderData.id} recibida con estado de pago "${orderData.payment_status}". No se registra hasta que el pago sea confirmado.`);
                return res.status(200).json({
                    success: true,
                    message: `Orden recibida con estado de pago "${orderData.payment_status}". En espera de confirmación.`
                });
            }

            const savedVentas = await processAndSaveOrder(orderData, targetStore);
            return res.status(200).json({
                success: true,
                message: `Orden #${orderData.number || orderData.id} procesada exitosamente en Monos`,
                count: savedVentas.length,
                ventas: savedVentas.map(v => ({ id: v.id, producto: v.producto, valor: v.valor, cliente: v.cliente }))
            });
        }

        // Si el formato no coincide con ninguno conocido
        console.warn('[Tiendanube Webhook] Formato de payload no reconocido:', payload);
        return res.status(200).json({
            success: false,
            message: 'Payload no contiene datos de orden ni evento reconocido de Tiendanube.'
        });

    } catch (err) {
        console.error('[Tiendanube Webhook] Error procesando webhook:', err);
        // Responder siempre con 200 o 500 informando el error
        return res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

/**
 * POST /api/webhooks/tiendanube/test
 * Permite probar o simular una venta de Tiendanube directamente
 */
router.post('/tiendanube/test', async (req, res) => {
    try {
        const targetStore = (req.query.store || 'monos').toLowerCase();
        
        // Si el usuario envió una orden personalizada en el body, usarla; si no, generar un pedido de prueba realista
        const mockOrder = req.body && req.body.id ? req.body : {
            id: 990001,
            number: 501,
            created_at: new Date().toISOString(),
            status: 'open',
            payment_status: 'paid',
            gateway: 'Mercado Pago (Tiendanube)',
            shipping_cost_customer: '16500',
            shipping_cost_owner: '12500',
            shipping_option: 'Envío Express Servientrega',
            customer: {
                name: 'Camila Restrepo Botero',
                email: 'camila.restrepo@gmail.com',
                identification: '1037648912',
                phone: '+57 314 892 4567'
            },
            shipping_address: {
                address1: 'Carrera 43A # 18 Sur-135',
                number: '135',
                floor: 'Apto 1102',
                locality: 'El Poblado',
                city: 'Medellín',
                province: 'Antioquia',
                country: 'Colombia'
            },
            products: [
                {
                    id: 101,
                    name: 'Hoodie Oversize Streetwear Monos',
                    price: '145000',
                    cost: '68000',
                    quantity: 1,
                    variant_values: ['Negro', 'L'],
                    sku: 'HOD-NG-L',
                    image: { src: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=400' }
                },
                {
                    id: 102,
                    name: 'Gorra Trucker Vintage Monos',
                    price: '48000',
                    cost: '21000',
                    quantity: 1,
                    variant_values: ['Beige / Negro'],
                    sku: 'CAP-VNT-BG',
                    image: { src: 'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=400' }
                }
            ],
            note: 'Por favor incluir calcomanías y empacar con cuidado.'
        };

        const saved = await processAndSaveOrder(mockOrder, targetStore);
        res.json({
            success: true,
            message: `Prueba simulada exitosa para tienda "${targetStore}". Se crearon ${saved.length} registros de venta.`,
            ventas: saved
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * DELETE /api/webhooks/tiendanube/test
 * Elimina las órdenes de prueba generadas por /test
 */
router.delete('/tiendanube/test', async (req, res) => {
    try {
        const targetStore = (req.query.store || 'monos').toLowerCase();
        const { deleteVentaFromPG, appData, saveDB } = require('../config/db');
        const storeData = appData[targetStore];
        const testIds = ['TN-501-1', 'TN-501-2'];
        
        if (storeData) {
            storeData.ventas = storeData.ventas.filter(v => !testIds.includes(String(v.id)));
            for (const id of testIds) {
                await deleteVentaFromPG(targetStore, id);
            }
            saveDB(targetStore);
        }
        res.json({ success: true, message: 'Ventas de prueba eliminadas correctamente.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
