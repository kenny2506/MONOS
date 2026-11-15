const express = require('express');
const { appData, saveDB, getStoreData } = require('../config/db');
const { isAuthenticated } = require('../middleware/auth');

const router = express.Router();

// Helper para enviar peticiones al Webhook de Google Apps Script desde el servidor
async function sendToGoogleWebhook(targetUrl, payload) {
    console.log(`[Webhook Proxy] Petición iniciada hacia: ${targetUrl}`);
    if (typeof fetch !== 'undefined') {
        const res = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload),
            redirect: 'follow'
        });
        console.log(`[Webhook Proxy] Respuesta recibida con status: ${res.status}`);
        return res;
    } else {
        const https = require('https');
        const http = require('http');
        return new Promise((resolve, reject) => {
            const sendReq = (reqUrl) => {
                const u = new URL(reqUrl);
                const bodyStr = JSON.stringify(payload);
                const client = u.protocol === 'https:' ? https : http;
                const options = {
                    hostname: u.hostname,
                    port: u.port || (u.protocol === 'https:' ? 443 : 80),
                    path: u.pathname + u.search,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(bodyStr)
                    }
                };
                const req = client.request(options, (res) => {
                    console.log(`[Webhook Proxy Native] Response status: ${res.statusCode}`);
                    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        const redirUrl = res.headers.location;
                        const u2 = new URL(redirUrl);
                        client.get({
                            hostname: u2.hostname,
                            port: u2.port || (u2.protocol === 'https:' ? 443 : 80),
                            path: u2.pathname + u2.search
                        }, resolve).on('error', reject);
                    } else {
                        resolve(res);
                    }
                });
                req.on('error', reject);
                req.write(bodyStr);
                req.end();
            };
            sendReq(targetUrl);
        });
    }
}

// GET /api/data
router.get('/data', isAuthenticated, (req, res) => {
    const store = req.session.user.store;
    const d = getStoreData(store);
    res.json(d);
});

// POST /api/ventas
router.post('/ventas', isAuthenticated, (req, res) => {
    const store = req.session.user.store;
    const venta = req.body;
    const storeData = getStoreData(store);

    const idx = storeData.ventas.findIndex(v => v.id === venta.id);
    if (idx >= 0) storeData.ventas[idx] = venta;
    else storeData.ventas.push(venta);

    saveDB(store, 'venta', venta);
    res.json({ success: true, ventas: storeData.ventas });
});

// DELETE /api/ventas/:id
router.delete('/ventas/:id', isAuthenticated, (req, res) => {
    const store = req.session.user.store;
    const id = parseInt(req.params.id) || req.params.id;
    const storeData = appData[store];
    if (storeData) {
        storeData.ventas = storeData.ventas.filter(v => v.id !== id);
        saveDB(store, 'venta', id, true);
    }
    res.json({ success: true, ventas: storeData ? storeData.ventas : [] });
});

// POST /api/egresos
router.post('/egresos', isAuthenticated, (req, res) => {
    const store = req.session.user.store;
    const egreso = req.body;
    const storeData = getStoreData(store);

    const idx = storeData.egresos.findIndex(e => e.id === egreso.id);
    if (idx >= 0) storeData.egresos[idx] = egreso;
    else storeData.egresos.push(egreso);

    saveDB(store, 'egreso', egreso);
    res.json({ success: true, egresos: storeData.egresos });
});

// DELETE /api/egresos/:id
router.delete('/egresos/:id', isAuthenticated, (req, res) => {
    const store = req.session.user.store;
    const id = parseInt(req.params.id) || req.params.id;
    const storeData = appData[store];
    if (storeData) {
        storeData.egresos = storeData.egresos.filter(e => e.id !== id);
        saveDB(store, 'egreso', id, true);
    }
    res.json({ success: true, egresos: storeData ? storeData.egresos : [] });
});

// POST /api/posts
router.post('/posts', isAuthenticated, (req, res) => {
    const store = req.session.user.store;
    const post = req.body;
    const storeData = getStoreData(store);

    const idx = storeData.posts.findIndex(p => p.id === post.id);
    if (idx >= 0) storeData.posts[idx] = post;
    else storeData.posts.push(post);

    saveDB(store, 'post', post);
    res.json({ success: true, posts: storeData.posts });
});

// DELETE /api/posts/:id
router.delete('/posts/:id', isAuthenticated, (req, res) => {
    const store = req.session.user.store;
    const id = req.params.id;
    const storeData = appData[store];
    if (storeData && storeData.posts) {
        storeData.posts = storeData.posts.filter(p => p.id !== id);
        saveDB(store, 'post', id, true);
    }
    res.json({ success: true, posts: storeData ? storeData.posts : [] });
});

// GET /api/config/forms-url
router.get('/config/forms-url', isAuthenticated, (req, res) => {
    const store = req.session.user.store;
    const storeData = getStoreData(store);
    res.json({ success: true, formsUrl: storeData.googleFormsUrl || '' });
});

// POST /api/config/forms-url
router.post('/config/forms-url', isAuthenticated, (req, res) => {
    const store = req.session.user.store;
    const { formsUrl } = req.body;
    const storeData = getStoreData(store);
    storeData.googleFormsUrl = (formsUrl || '').trim();
    saveDB(store, 'config');
    res.json({ success: true, formsUrl: storeData.googleFormsUrl });
});

// GET /api/config/webhook-url
router.get('/config/webhook-url', isAuthenticated, (req, res) => {
    const store = req.session.user.store;
    const storeData = getStoreData(store);
    res.json({ success: true, webhookUrl: storeData.webhookUrl || '' });
});

// POST /api/config/webhook-url
router.post('/config/webhook-url', isAuthenticated, (req, res) => {
    const store = req.session.user.store;
    const { webhookUrl } = req.body;
    const storeData = getStoreData(store);
    storeData.webhookUrl = (webhookUrl || '').trim();
    saveDB(store, 'config');
    res.json({ success: true, webhookUrl: storeData.webhookUrl });
});

const whatsappService = require('../services/whatsapp.service');

// POST /api/enviar-proveedor
router.post('/enviar-proveedor', isAuthenticated, async (req, res) => {
    const store = req.session.user.store;
    const { items, sheetUrl } = req.body;
    const storeData = getStoreData(store);

    let targetUrl = (sheetUrl || '').trim() || storeData.webhookUrl;
    if (!targetUrl) {
        return res.status(400).json({ success: false, error: 'No hay URL de Webhook configurada' });
    }

    if (sheetUrl && sheetUrl.trim() !== storeData.webhookUrl) {
        storeData.webhookUrl = sheetUrl.trim();
        saveDB(store, 'config');
    }

    try {
        await sendToGoogleWebhook(targetUrl, { items });
        res.json({ success: true });
    } catch (err) {
        console.error('Error enviando a proveedor desde el servidor:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── RUTAS WHATSAPP (BAILEYS) ────────────────────────────────────────────────
// GET /api/whatsapp/status
router.get('/whatsapp/status', isAuthenticated, async (req, res) => {
    const store = req.session.user.store || 'monos';
    let statusInfo = whatsappService.getStatus(store);
    if (statusInfo.status === 'disconnected') {
        whatsappService.initWhatsApp(store);
        statusInfo = whatsappService.getStatus(store);
    }
    res.json({ success: true, ...statusInfo });
});

// POST /api/whatsapp/connect
router.post('/whatsapp/connect', isAuthenticated, async (req, res) => {
    const store = req.session.user.store || 'monos';
    const currentStatus = whatsappService.getStatus(store);
    const force = currentStatus.status !== 'connected';
    await whatsappService.initWhatsApp(store, force);
    const statusInfo = whatsappService.getStatus(store);
    res.json({ success: true, ...statusInfo });
});

// POST /api/whatsapp/logout
router.post('/whatsapp/logout', isAuthenticated, async (req, res) => {
    const store = req.session.user.store || 'monos';
    await whatsappService.logoutWhatsApp(store);
    res.json({ success: true });
});

// GET /api/whatsapp/chats
router.get('/whatsapp/chats', isAuthenticated, (req, res) => {
    const store = req.session.user.store || 'monos';
    const chats = whatsappService.getChats(store);
    res.json({ success: true, chats });
});

// GET /api/whatsapp/messages/:phone
router.get('/whatsapp/messages/:phone', isAuthenticated, (req, res) => {
    const store = req.session.user.store || 'monos';
    const messages = whatsappService.getMessages(store, req.params.phone);
    res.json({ success: true, messages });
});

// POST /api/whatsapp/send
router.post('/whatsapp/send', isAuthenticated, async (req, res) => {
    const store = req.session.user.store || 'monos';
    const { phone, message, media } = req.body;
    if (!phone || (!message && !media)) {
        return res.status(400).json({ success: false, error: 'Teléfono y mensaje o archivo requeridos.' });
    }
    try {
        const msgObj = await whatsappService.sendMessage(store, phone, message || '', media || null);
        res.json({ success: true, message: msgObj });
    } catch (err) {
        console.error(`[WhatsApp API Send Error]:`, err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
