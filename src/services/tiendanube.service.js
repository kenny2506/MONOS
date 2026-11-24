const crypto = require('crypto');
const { appData, saveDB, getStoreData } = require('../config/db');

/**
 * Normaliza teléfonos colombianos (+57 3XX XXX XXXX -> 3XX XXX XXXX)
 */
function normalizePhone(rawPhone) {
    if (!rawPhone) return '';
    let cleaned = String(rawPhone).replace(/[^\d+]/g, '');
    if (cleaned.startsWith('+57')) cleaned = cleaned.slice(3);
    else if (cleaned.startsWith('57') && cleaned.length > 10) cleaned = cleaned.slice(2);
    
    // Si tiene 10 dígitos (ej. 3123456789), formatear como 312 345 6789 para mantener consistencia con la UI
    if (cleaned.length === 10) {
        return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 6)} ${cleaned.slice(6)}`;
    }
    return cleaned;
}

/**
 * Consulta los detalles completos de una orden en la API REST de Tiendanube
 */
async function fetchOrderFromTiendanube(storeId, orderId, accessToken) {
    const url = `https://api.tiendanube.com/v1/${storeId}/orders/${orderId}`;
    console.log(`[Tiendanube Service] Consultando orden ${orderId} en API Tiendanube...`);

    const res = await fetch(url, {
        method: 'GET',
        headers: {
            'Authentication': `bearer ${accessToken}`,
            'User-Agent': 'Monos Multitienda (soporte@monos.com)',
            'Content-Type': 'application/json'
        }
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Error ${res.status} al consultar API Tiendanube: ${errText}`);
    }

    return await res.json();
}

/**
 * Convierte un objeto de orden de Tiendanube en uno o varios registros de ventas para Monos
 */
function parseTiendanubeOrderToVentas(order, targetStore = 'monos') {
    if (!order) return [];

    const orderId = order.id;
    const orderNumber = order.number || order.id;
    const createdAt = order.created_at || order.paid_at || new Date().toISOString();
    const fecha = createdAt.split('T')[0];

    // 1. Datos del Cliente
    const customer = order.customer || {};
    const shipping = order.shipping_address || customer.default_address || order.billing_address || {};
    
    let cliente = (customer.name || '').trim();
    if (!cliente && (shipping.first_name || shipping.last_name)) {
        cliente = `${shipping.first_name || ''} ${shipping.last_name || ''}`.trim();
    }
    if (!cliente) cliente = 'Cliente Tiendanube';

    const cedula = String(
        customer.identification || 
        customer.document || 
        shipping.identification || 
        (order.billing_address && order.billing_address.identification) || 
        ''
    ).trim();

    const rawPhone = customer.phone || shipping.phone || (customer.default_address && customer.default_address.phone) || '';
    const telefono = normalizePhone(rawPhone);

    const email = (customer.email || order.contact_email || '').trim().toLowerCase();

    // 2. Datos de Envío y Dirección
    const addrParts = [];
    const baseAddr = (shipping.address || shipping.address1 || '').trim();
    if (baseAddr) addrParts.push(baseAddr);
    
    if (shipping.number && !baseAddr.includes(shipping.number)) {
        addrParts.push(`# ${shipping.number}`);
    }
    
    if (shipping.floor) {
        const floorStr = String(shipping.floor).trim();
        if (/^(piso|apto|interior|torre|oficina)/i.test(floorStr)) {
            addrParts.push(floorStr);
        } else {
            addrParts.push(`Apto/Piso ${floorStr}`);
        }
    }
    
    if (shipping.locality && !baseAddr.toLowerCase().includes(shipping.locality.toLowerCase())) {
        addrParts.push(`(${shipping.locality})`);
    }
    
    const direccion = addrParts.join(' ').trim() || (shipping.name ? `Entrega a ${shipping.name}` : 'Dirección en Tiendanube');
    
    let ciudad = (shipping.city || '').trim();
    const province = (shipping.province || '').trim();
    if (province && ciudad && !ciudad.toLowerCase().includes(province.toLowerCase())) {
        ciudad = `${province} - ${ciudad}`;
    } else if (!ciudad && province) {
        ciudad = province;
    }
    if (!ciudad) ciudad = 'Colombia';

    const pais = (shipping.country || 'Colombia').trim();

    const shippingCustomerVal = parseFloat(order.shipping_cost_customer) || 
                                parseFloat(order.shipping_cost) || 0;
    const shippingOwnerVal = parseFloat(order.shipping_cost_owner) || 0;
    const shippingOptionName = order.shipping_option || order.shipping_option_reference || 'Envío Tiendanube';

    // 3. Método de pago y Notas
    const paymentGateway = order.gateway || order.payment_method || 'Tiendanube';
    const generalNote = (order.note || order.owner_note || '').trim();

    // 4. Mapeo de Productos / Prendas
    const products = Array.isArray(order.products) && order.products.length > 0 
        ? order.products 
        : [{
            name: 'Producto Tiendanube',
            price: order.total || 0,
            quantity: 1,
            variant_values: []
        }];

    const ventas = [];
    const totalProducts = products.length;

    products.forEach((prod, index) => {
        // Generar ID único y predecible
        const ventaId = totalProducts === 1 ? `TN-${orderNumber}` : `TN-${orderNumber}-${index + 1}`;

        // Determinar Talla o Variante
        let talla = 'Única';
        if (Array.isArray(prod.variant_values) && prod.variant_values.length > 0) {
            talla = prod.variant_values.join(' / ');
        } else if (prod.variant_name) {
            talla = prod.variant_name;
        } else if (prod.size) {
            talla = prod.size;
        }

        // Determinar Foto del producto
        let foto = 'https://via.placeholder.com/50';
        if (prod.image && prod.image.src) {
            foto = prod.image.src;
        } else if (typeof prod.image === 'string' && prod.image.startsWith('http')) {
            foto = prod.image;
        } else if (prod.image_url) {
            foto = prod.image_url;
        }

        // Notas del ítem
        const itemNotes = [];
        if (generalNote) itemNotes.push(generalNote);
        if (prod.sku) itemNotes.push(`SKU: ${prod.sku}`);
        if (totalProducts > 1) itemNotes.push(`Ítem ${index + 1} de ${totalProducts} (Orden #${orderNumber})`);

        const venta = {
            id: ventaId,
            fecha: fecha,
            producto: (prod.name || 'Producto').trim(),
            talla: talla,
            pais: pais,
            ciudad: ciudad,
            plataforma: 'Tiendanube',
            cliente: cliente,
            cedula: cedula,
            telefono: telefono,
            email: email,
            direccion: direccion,
            envio: 'Pago',
            guia: order.shipping_tracking_number || '',
            costo: parseFloat(prod.cost) || 0,
            valor: parseFloat(prod.price) || 0,
            foto: foto,
            estado: 'Sin enviar',
            observacion: itemNotes.join(' | '),
            extra_data: {
                tiendanube_order_id: orderId,
                tiendanube_order_number: orderNumber,
                tiendanube_store_id: order.store_id || null,
                payment_status: order.payment_status || 'paid',
                metodoPago: paymentGateway,
                descuento: parseFloat(order.discount) || 0,
                shippingValue: shippingCustomerVal,
                shippingRealCost: shippingOwnerVal,
                shippingOption: shippingOptionName,
                qty: parseInt(prod.quantity, 10) || 1,
                canal: 'Tiendanube'
            }
        };

        ventas.push(venta);
    });

    return ventas;
}

/**
 * Valida la firma HMAC de Tiendanube si se ha configurado un Client Secret
 */
function verifyTiendanubeHmac(rawBody, signature, secret) {
    if (!secret || !signature) return true; // Si no hay secret configurado, pasar
    try {
        const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
        return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
    } catch (e) {
        console.error('[Tiendanube Service] Error validando firma HMAC:', e.message);
        return false;
    }
}

/**
 * Procesa y guarda la orden en la base de datos de Monos y en memoria
 */
async function processAndSaveOrder(order, targetStore = 'monos') {
    const store = targetStore.toLowerCase();
    const storeData = getStoreData(store);
    const ventas = parseTiendanubeOrderToVentas(order, store);

    console.log(`[Tiendanube Service] Procesando ${ventas.length} ítems de la orden #${order.number || order.id} para la tienda "${store}"...`);

    const savedRecords = [];

    for (const venta of ventas) {
        // Verificar si ya existe en memoria para actualizarlo o insertarlo
        const existingIdx = storeData.ventas.findIndex(v => String(v.id) === String(venta.id));
        if (existingIdx >= 0) {
            storeData.ventas[existingIdx] = venta;
            console.log(`[Tiendanube Service] Actualizada venta existente: ${venta.id} (${venta.producto})`);
        } else {
            // Se inserta al inicio de la lista para que sea la primera visible
            storeData.ventas.unshift(venta);
            console.log(`[Tiendanube Service] Registrada nueva venta: ${venta.id} (${venta.producto})`);
        }

        // Guardar atómicamente en PostgreSQL y archivo local
        saveDB(store, 'venta', venta);
        savedRecords.push(venta);
    }

    return savedRecords;
}

module.exports = {
    normalizePhone,
    fetchOrderFromTiendanube,
    parseTiendanubeOrderToVentas,
    verifyTiendanubeHmac,
    processAndSaveOrder
};
