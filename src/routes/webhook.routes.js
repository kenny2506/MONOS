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
            step_1: 'En Tiendanube o tu integrador (Make/Zapier/App), configura el webhook hacia esta URL.',
            step_2: 'Selecciona el evento "Orden Pagada" (order/paid).',
            step_3: 'Si usas el webhook nativo de Tiendanube, añade la variable de entorno TIENDANUBE_ACCESS_TOKEN en Railway o el parámetro ?token=TU_TOKEN en la URL.'
        }
    });
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
        const clientSecret = process.env[`TIENDANUBE_${targetStore.toUpperCase()}_CLIENT_SECRET`] || process.env.TIENDANUBE_CLIENT_SECRET;
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

module.exports = router;
