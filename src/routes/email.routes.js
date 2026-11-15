const express = require('express');
const nodemailer = require('nodemailer');
const { isAuthenticated } = require('../middleware/auth');
const { getStoreData, saveDB } = require('../config/db');

const router = express.Router();

// Plantillas predeterminadas de HTML elegantes (Sin Emojis, con Logos, Banner Clicable a monosincorp.com y detalles ampliados)
const DEFAULT_TEMPLATES = {
    empacado: {
        id: 'empacado',
        name: 'Pedido Empacado',
        subject: '¡Tu pedido ha sido empacado! - MONOS INC',
        html: `<div style="font-family:'Helvetica Neue',Arial,sans-serif; max-width:600px; margin:0 auto; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.08); border:1px solid #e2e8f0;">
    <div style="background:linear-gradient(135deg, #10b981 0%, #059669 100%); padding:32px 24px; text-align:center; color:#ffffff;">
        {logo_img}
        <h1 style="margin:12px 0 0 0; font-size:22px; font-weight:800; text-transform:uppercase; letter-spacing:1px;">¡Tu pedido está empacado!</h1>
        <p style="margin:8px 0 0 0; opacity:0.9; font-size:14px;">Hola <strong>{cliente}</strong>, todo está listo para ser despachado.</p>
    </div>
    <div style="padding:28px 24px; color:#334155; line-height:1.6;">
        <p style="font-size:15px;">Nos alegra informarte que tu(s) prenda(s) ha(n) superado el control de calidad y ya se encuentran empacadas de manera segura.</p>
        <div style="background:#f8fafc; border-left:4px solid #10b981; padding:16px; margin:20px 0; border-radius:8px;">
            <p style="margin:0; font-size:14px; font-weight:700; color:#1e293b;">Resumen del Envío:</p>
            <ul style="margin:8px 0 0 0; padding-left:20px; font-size:14px; color:#475569; line-height:1.8;">
                <li><strong>Cliente:</strong> {cliente}</li>
                <li><strong>Celular:</strong> {telefono}</li>
                <li><strong>Dirección:</strong> {direccion}</li>
                <li><strong>Ciudad:</strong> {ciudad}</li>
                <li><strong>Estado:</strong> Empacado</li>
            </ul>
            <p style="margin:12px 0 2px 0; font-size:13px; font-weight:700; color:#1e293b;">Prenda(s) del Pedido:</p>
            {productos_lista}
        </div>
        
        <!-- Banner Publicitario Personalizable -->
        <div style="margin:24px 0; text-align:center;">
            <a href="https://www.monosincorp.com/" target="_blank" style="display:block; text-decoration:none;">
                {banner_img}
            </a>
        </div>

        <p style="font-size:14px; text-align:center; margin-top:24px;">Si deseas consultar el estado en tiempo real o comunicarte con nosotros:</p>
        <div style="text-align:center; margin:20px 0;">
            {whatsapp_link}
        </div>
    </div>
    <div style="background:#f1f5f9; padding:16px 24px; text-align:center; font-size:12px; color:#94a3b8;">
        © {tienda} · Todos los derechos reservados.
    </div>
</div>`
    },
    enviado: {
        id: 'enviado',
        name: 'Pedido Enviado',
        subject: '¡Tu pedido ha sido Enviado! #{guia} - MONOS INC',
        html: `<div style="font-family:'Helvetica Neue',Arial,sans-serif; max-width:600px; margin:0 auto; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.08); border:1px solid #e2e8f0;">
    <div style="background:linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding:32px 24px; text-align:center; color:#ffffff;">
        {logo_img}
        <h1 style="margin:12px 0 0 0; font-size:22px; font-weight:800; text-transform:uppercase; letter-spacing:1px;">¡Tu pedido va en camino!</h1>
        <p style="margin:8px 0 0 0; opacity:0.9; font-size:14px;">Hola <strong>{cliente}</strong>, tu paquete ya fue entregado a la transportadora.</p>
    </div>
    <div style="padding:28px 24px; color:#334155; line-height:1.6;">
        <p style="font-size:15px;">¡Excelentes noticias! Tu(s) prenda(s) ha(n) sido enviadas.</p>
        <div style="background:#f0f9ff; border:1px dashed #0284c7; padding:18px; margin:20px 0; border-radius:12px; text-align:center;">
            <span style="font-size:12px; text-transform:uppercase; font-weight:800; color:#0369a1; letter-spacing:1px; display:block;">Número de Guía de Transporte</span>
            <span style="font-size:22px; font-weight:900; color:#0284c7; font-family:monospace; display:block; margin-top:4px;">{guia}</span>
        </div>
        <div style="background:#f8fafc; border-left:4px solid #3b82f6; padding:16px; margin:20px 0; border-radius:8px;">
            <p style="margin:0; font-size:14px; font-weight:700; color:#1e293b;">Detalles de la Entrega:</p>
            <ul style="margin:8px 0 0 0; padding-left:20px; font-size:14px; color:#475569; line-height:1.8;">
                <li><strong>Cliente:</strong> {cliente}</li>
                <li><strong>Celular:</strong> {telefono}</li>
                <li><strong>Dirección:</strong> {direccion}</li>
                <li><strong>Destino:</strong> {ciudad}</li>
                <li><strong>Número de Guía:</strong> {guia}</li>
            </ul>
            <p style="margin:12px 0 2px 0; font-size:13px; font-weight:700; color:#1e293b;">Prenda(s) del Pedido:</p>
            {productos_lista}
        </div>

        <!-- Banner Publicitario Personalizable -->
        <div style="margin:24px 0; text-align:center;">
            <a href="https://www.monosincorp.com/" target="_blank" style="display:block; text-decoration:none;">
                {banner_img}
            </a>
        </div>

        <div style="text-align:center; margin:24px 0;">
            {whatsapp_link}
        </div>
    </div>
    <div style="background:#f1f5f9; padding:16px 24px; text-align:center; font-size:12px; color:#94a3b8;">
        © {tienda} · Gracias por comprar con nosotros.
    </div>
</div>`
    },
    entregado: {
        id: 'entregado',
        name: 'Pedido Entregado',
        subject: '¡Tu pedido ha sido entregado exitosamente! - {tienda}',
        html: `<div style="font-family:'Helvetica Neue',Arial,sans-serif; max-width:600px; margin:0 auto; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.08); border:1px solid #e2e8f0;">
    <div style="background:linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); padding:32px 24px; text-align:center; color:#ffffff;">
        {logo_img}
        <h1 style="margin:12px 0 0 0; font-size:22px; font-weight:800; text-transform:uppercase; letter-spacing:1px;">¡Pedido Entregado!</h1>
        <p style="margin:8px 0 0 0; opacity:0.9; font-size:14px;">Hola <strong>{cliente}</strong>, confirmamos que tu paquete ya fue entregado.</p>
    </div>
    <div style="padding:28px 24px; color:#334155; line-height:1.6;">
        <p style="font-size:15px;">Esperamos que disfrutes al máximo tu(s) prenda(s). Muchas gracias por confiar en nosotros.</p>
        <div style="background:#faf5ff; border:1px solid #e9d5ff; padding:16px; margin:20px 0; border-radius:12px;">
            <p style="margin:0; font-size:14px; font-weight:700; color:#7e22ce;">Datos de la Entrega Registrada:</p>
            <ul style="margin:8px 0 0 0; padding-left:20px; font-size:14px; color:#6b21a8; line-height:1.8;">
                <li><strong>Cliente:</strong> {cliente}</li>
                <li><strong>Celular:</strong> {telefono}</li>
                <li><strong>Dirección:</strong> {direccion}</li>
                <li><strong>Ciudad:</strong> {ciudad}</li>
            </ul>
            <p style="margin:12px 0 2px 0; font-size:13px; font-weight:700; color:#7e22ce;">Prenda(s) del Pedido:</p>
            {productos_lista}
        </div>

        <!-- Banner Publicitario Personalizable -->
        <div style="margin:24px 0; text-align:center;">
            <a href="https://www.monosincorp.com/" target="_blank" style="display:block; text-decoration:none;">
                {banner_img}
            </a>
        </div>

        <div style="text-align:center; margin:24px 0;">
            {whatsapp_link}
        </div>
    </div>
    <div style="background:#f1f5f9; padding:16px 24px; text-align:center; font-size:12px; color:#94a3b8;">
        © {tienda} · Siempre a tu servicio.
    </div>
</div>`
    }
};

// GET /api/email/templates
router.get('/templates', isAuthenticated, (req, res) => {
    const store = req.session.user.store;
    const storeData = getStoreData(store);
    const customTemplates = storeData.emailTemplates || {};

    res.json({
        defaults: DEFAULT_TEMPLATES,
        custom: customTemplates
    });
});

// POST /api/email/templates
router.post('/templates', isAuthenticated, (req, res) => {
    const store = req.session.user.store;
    const { id, name, subject, html } = req.body;
    if (!id || !name || !html) {
        return res.status(400).json({ error: 'Faltan campos obligatorios para la plantilla' });
    }

    const storeData = getStoreData(store);
    if (!storeData.emailTemplates) storeData.emailTemplates = {};
    storeData.emailTemplates[id] = { id, name, subject: subject || '', html };
    saveDB(store, 'config');

    res.json({ success: true, templates: storeData.emailTemplates });
});

// GET /api/email/config
router.get('/config', isAuthenticated, (req, res) => {
    const store = req.session.user.store;
    const storeData = getStoreData(store);
    const config = storeData.smtpConfig || {};
    const host = config.host || process.env.SMTP_HOST || '';

    let detectedProvider = config.provider;
    if (!detectedProvider) {
        if (host.includes('outlook') || host.includes('office365')) {
            detectedProvider = 'outlook';
        } else if (host.includes('gmail')) {
            detectedProvider = 'gmail';
        } else {
            detectedProvider = 'custom';
        }
    }

    res.json({
        provider: detectedProvider,
        host: host,
        port: config.port || process.env.SMTP_PORT || '587',
        secure: config.secure ?? (process.env.SMTP_SECURE === 'true'),
        user: config.user || process.env.SMTP_USER || '',
        hasPass: !!(config.pass || process.env.SMTP_PASS)
    });
});

// POST /api/email/config
router.post('/config', isAuthenticated, (req, res) => {
    const store = req.session.user.store;
    const { provider, host, port, secure, user, pass } = req.body;

    if (!host || !user) {
        return res.status(400).json({ error: 'Host SMTP y Usuario/Correo son obligatorios' });
    }

    const storeData = getStoreData(store);
    if (!storeData.smtpConfig) storeData.smtpConfig = {};

    storeData.smtpConfig.provider = provider || 'custom';
    storeData.smtpConfig.host = host;
    storeData.smtpConfig.port = parseInt(port || '587');
    storeData.smtpConfig.secure = !!secure;
    storeData.smtpConfig.user = user;
    if (pass) storeData.smtpConfig.pass = pass;

    saveDB(store, 'config');

    res.json({ success: true, message: 'Configuración SMTP guardada exitosamente' });
});

// POST /api/email/send
router.post('/send', isAuthenticated, async (req, res) => {
    try {
        const store = req.session.user.store;
        const storeData = getStoreData(store);
        const smtpConfig = storeData.smtpConfig || {};

        const { to, alias, subject, html, ventaId } = req.body;

        if (!to || !html) {
            return res.status(400).json({ error: 'Correo de destino y contenido HTML son obligatorios' });
        }

        const senderAlias = alias || `MONOS INC <${smtpConfig.user || 'ventas@monosincorp.com'}>`;

        // Determinar Transporter (Configuración guardada > Envs de entorno > Fallback Ethereal)
        let transporter;
        let isRealSmtp = false;
        let testAccountCreated = false;

        const smtpHost = smtpConfig.host || process.env.SMTP_HOST;
        const smtpUser = smtpConfig.user || process.env.SMTP_USER;
        const smtpPass = smtpConfig.pass || process.env.SMTP_PASS;
        const smtpPort = smtpConfig.port || (process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587);
        const smtpSecure = smtpConfig.secure ?? (process.env.SMTP_SECURE === 'true');

        if (smtpHost && smtpUser && smtpPass) {
            transporter = nodemailer.createTransport({
                host: smtpHost,
                port: smtpPort,
                secure: smtpSecure,
                auth: {
                    user: smtpUser,
                    pass: smtpPass
                },
                tls: {
                    rejectUnauthorized: false
                }
            });
            isRealSmtp = true;
        } else {
            // Sin credenciales reales: usará servidor Ethereal de prueba (no entrega correos a bandejas reales)
            const testAccount = await nodemailer.createTestAccount();
            transporter = nodemailer.createTransport({
                host: 'smtp.ethereal.email',
                port: 587,
                secure: false,
                auth: {
                    user: testAccount.user,
                    pass: testAccount.pass
                }
            });
            testAccountCreated = true;
        }

        // Determinar archivo de logotipo según tienda
        const path = require('path');
        const fs = require('fs');

        let logoFileName = 'Logo.png';
        if (store === 'redkat') logoFileName = 'logo_vinilos.png';
        else if (store === 'flores') logoFileName = 'logo_flores.png';
        else if (store === 'tenis') logoFileName = 'logo_tenis.png';
        else if (store === 'vetpet') logoFileName = 'logo_vetpet.svg';

        const logoPath = path.join(__dirname, '../../public', logoFileName);
        const bannerPath = path.join(__dirname, '../../public/banner_email.svg');

        const attachments = [];
        let finalHtml = html;

        // Reemplazar o asegurar etiquetas con CID embebido inline
        if (fs.existsSync(logoPath)) {
            attachments.push({
                filename: logoFileName,
                path: logoPath,
                cid: 'storelogo'
            });
            // Reemplazar srcs de logo por cid:storelogo si es URL o token
            finalHtml = finalHtml.replace(/src="[^"]*Logo[^"]*"/gi, 'src="cid:storelogo"')
                .replace(/src="[^"]*logo_[^"]*"/gi, 'src="cid:storelogo"');
        }

        if (fs.existsSync(bannerPath)) {
            attachments.push({
                filename: 'banner_email.svg',
                path: bannerPath,
                cid: 'storebanner'
            });
            finalHtml = finalHtml.replace(/src="[^"]*banner_email[^"]*"/gi, 'src="cid:storebanner"');
        }

        const mailOptions = {
            from: senderAlias,
            to: to,
            subject: subject || `Notificación de tu pedido - MONOS INC`,
            html: finalHtml,
            attachments: attachments
        };

        const info = await transporter.sendMail(mailOptions);

        console.log(`[Email ${store}] Correo procesado a ${to}. MessageId: ${info.messageId}`);
        let previewUrl = null;
        if (testAccountCreated) {
            previewUrl = nodemailer.getTestMessageUrl(info);
            console.log(`[Email ${store}] URL de previsualización Ethereal: ${previewUrl}`);
        }

        // Registrar en el historial de la venta si existe ventaId
        if (ventaId) {
            const venta = storeData.ventas ? storeData.ventas.find(v => String(v.id) === String(ventaId)) : null;
            if (venta) {
                if (!venta.emailLogs) venta.emailLogs = [];
                venta.emailLogs.push({
                    to,
                    subject: mailOptions.subject,
                    date: new Date().toISOString(),
                    previewUrl,
                    isRealSmtp
                });
                saveDB(store, 'venta', venta);
            }
        }

        if (!isRealSmtp) {
            return res.json({
                success: true,
                isSimulated: true,
                message: `El correo fue simulado en modo pruebas (Ethereal). Para que llegue a la bandeja de entrada real de tu cliente, configura las credenciales SMTP en el botón 'Configuración SMTP'.`,
                previewUrl
            });
        }

        res.json({
            success: true,
            isSimulated: false,
            message: `Correo enviado exitosamente a la bandeja de entrada de ${to}`,
            messageId: info.messageId
        });

    } catch (err) {
        console.error('Error al enviar correo:', err);
        let errorDetails = err.message || 'Error de conexión con el servidor de correo.';
        if (errorDetails.includes('535') || errorDetails.includes('Authentication failed') || errorDetails.includes('Invalid login')) {
            errorDetails = 'Fallo de autenticación (Usuario o contraseña incorrectos). Si usas Outlook/Office365 o Gmail, asegúrate de ingresar tu correo y contraseña correctos (o Contraseña de Aplicación).';
        }
        res.status(500).json({ error: 'No se pudo enviar el correo: ' + errorDetails });
    }
});

module.exports = router;
