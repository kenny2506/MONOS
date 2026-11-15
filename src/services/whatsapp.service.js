const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, downloadMediaMessage } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const pino = require('pino');
const path = require('path');
const fs = require('fs');

// Almacenamiento global de servicios por tienda
const sessions = {}; // store -> { sock, status, qrCode, user, chats, messages, saveChatsData }

function getSessionPath(store) {
    const dir = path.join(__dirname, '../../whatsapp_sessions', store);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}

function getChatsHistoryPath(store) {
    const dir = path.join(__dirname, '../../whatsapp_sessions');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, `${store}_chats_history.json`);
}

function loadChatsData(store) {
    const filePath = getChatsHistoryPath(store);
    if (fs.existsSync(filePath)) {
        try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            return {
                chats: data.chats || {},
                messages: data.messages || {}
            };
        } catch (e) {
            console.error(`[WhatsApp] Error leyendo chats_history de ${store}:`, e);
        }
    }
    return { chats: {}, messages: {} };
}

function saveChatsData(store, chats, messages) {
    const filePath = getChatsHistoryPath(store);
    try {
        fs.writeFileSync(filePath, JSON.stringify({ chats, messages }, null, 2), 'utf8');
    } catch (e) {
        console.error(`[WhatsApp] Error guardando chats_history de ${store}:`, e);
    }
}

function sanitizePhone(phone) {
    if (!phone) return '';
    let digits = String(phone).replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 10 && digits.startsWith('3')) {
        digits = '57' + digits;
    }
    return digits;
}

function formatJid(phone) {
    const clean = sanitizePhone(phone);
    if (!clean) return '';
    return clean.includes('@s.whatsapp.net') ? clean : `${clean}@s.whatsapp.net`;
}

function getPhoneFromJid(jid) {
    if (!jid) return '';
    const raw = jid.split('@')[0].split(':')[0];
    return sanitizePhone(raw);
}

function cleanAuthFiles(store) {
    const sessionDir = getSessionPath(store);
    if (fs.existsSync(sessionDir)) {
        try {
            const files = fs.readdirSync(sessionDir);
            for (const file of files) {
                if (file !== 'chats_data.json') {
                    fs.rmSync(path.join(sessionDir, file), { recursive: true, force: true });
                }
            }
        } catch (e) {
            console.error(`[WhatsApp ${store}] Error limpiando auth files:`, e);
        }
    }
}

async function initWhatsApp(store = 'monos', forceReset = false, isReconnect = false) {
    if (sessions[store] && !isReconnect) {
        if (!forceReset && (sessions[store].status === 'connected' || sessions[store].status === 'qr_ready')) {
            return sessions[store];
        }
        if (!forceReset && sessions[store].status === 'connecting') {
            const now = Date.now();
            if (sessions[store].connectingSince && (now - sessions[store].connectingSince < 15000)) {
                return sessions[store];
            }
        }
    }

    if (sessions[store] && sessions[store].sock) {
        try {
            sessions[store].sock.ev.removeAllListeners();
            sessions[store].sock.end();
        } catch (e) { }
    }

    const sessionDir = getSessionPath(store);

    if (forceReset) {
        cleanAuthFiles(store);
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();
    const storedData = loadChatsData(store);

    const sessionObj = {
        sock: null,
        status: 'connecting',
        connectingSince: Date.now(),
        qrCode: null,
        user: null,
        chats: storedData.chats,
        messages: storedData.messages,
        store: store
    };

    sessions[store] = sessionObj;

    const logger = pino({ level: 'silent' });

    const sock = makeWASocket({
        version,
        auth: state,
        logger,
        printQRInTerminal: false,
        browser: Browsers.macOS('Desktop'),
        syncFullHistory: false,
        connectTimeoutMs: 30000,
        defaultQueryTimeoutMs: 30000,
        keepAliveIntervalMs: 25000
    });

    sessionObj.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            try {
                sessionObj.qrCode = await QRCode.toDataURL(qr);
                sessionObj.status = 'qr_ready';
                console.log(`[WhatsApp ${store}] Nuevo código QR listo para escaneo`);
            } catch (err) {
                console.error(`[WhatsApp ${store}] Error generando QR:`, err);
            }
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.statusCode;
            const reasonMsg = lastDisconnect?.error?.message || '';
            console.log(`[WhatsApp ${store}] Conexión cerrada. Status Code: ${statusCode}. Mensaje: ${reasonMsg}`);

            const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;

            if (isLoggedOut) {
                console.log(`[WhatsApp ${store}] Sesión desvinculada/Logged Out. Limpiando credenciales.`);
                sessionObj.status = 'disconnected';
                sessionObj.qrCode = null;
                sessionObj.user = null;
                cleanAuthFiles(store);
            } else {
                console.log(`[WhatsApp ${store}] Reconectando socket manteniendo credenciales...`);
                sessionObj.status = 'connecting';
                setTimeout(() => {
                    initWhatsApp(store, false, true);
                }, 1000);
            }
        } else if (connection === 'open') {
            sessionObj.status = 'connected';
            sessionObj.qrCode = null;
            sessionObj.user = sock.user ? getPhoneFromJid(sock.user.id) : null;
            console.log(`[WhatsApp ${store}] ¡Conectado exitosamente como!`, sessionObj.user);
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;

        for (const msg of m.messages) {
            if (!msg.message || msg.key.remoteJid === 'status@broadcast') continue;

            const jid = msg.key.remoteJid;
            const phone = getPhoneFromJid(jid);
            if (!phone) continue;

            const fromMe = msg.key.fromMe || false;

            let text = msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                msg.message.imageMessage?.caption ||
                msg.message.videoMessage?.caption ||
                msg.message.documentMessage?.caption ||
                '';

            let mediaUrl = null;
            let mediaType = null;
            let mediaName = null;

            const isImage = !!msg.message.imageMessage;
            const isAudio = !!msg.message.audioMessage;
            const isDocument = !!msg.message.documentMessage;
            const isVideo = !!msg.message.videoMessage;

            if (isImage || isAudio || isDocument || isVideo) {
                try {
                    const buffer = await downloadMediaMessage(
                        msg,
                        'buffer',
                        {},
                        { logger, reuploadRequest: sock.updateMediaMessage }
                    );

                    if (isImage) {
                        mediaType = 'image';
                        mediaUrl = `data:image/jpeg;base64,${buffer.toString('base64')}`;
                        if (!text) text = '📷 Imagen recibida';
                    } else if (isAudio) {
                        mediaType = 'audio';
                        const mime = msg.message.audioMessage?.mimetype || 'audio/ogg';
                        mediaUrl = `data:${mime};base64,${buffer.toString('base64')}`;
                        if (!text) text = '🎵 Nota de voz recibida';
                    } else if (isDocument) {
                        mediaType = 'document';
                        mediaName = msg.message.documentMessage?.fileName || 'documento.pdf';
                        const mime = msg.message.documentMessage?.mimetype || 'application/octet-stream';
                        mediaUrl = `data:${mime};base64,${buffer.toString('base64')}`;
                        if (!text) text = `📄 ${mediaName}`;
                    } else if (isVideo) {
                        mediaType = 'video';
                        const mime = msg.message.videoMessage?.mimetype || 'video/mp4';
                        mediaUrl = `data:${mime};base64,${buffer.toString('base64')}`;
                        if (!text) text = '🎥 Video recibido';
                    }
                } catch (errMedia) {
                    console.error(`[WhatsApp ${store}] Error descargando contenido multimedia:`, errMedia);
                    if (!text) text = '[Contenido multimedia]';
                }
            }

            if (!text && !mediaUrl) text = '[Mensaje de WhatsApp]';

            const senderName = msg.pushName || phone;
            const timestamp = new Date((msg.messageTimestamp || Math.floor(Date.now() / 1000)) * 1000).toISOString();

            const messageObj = {
                id: msg.key.id,
                fromMe,
                phone,
                senderName,
                text,
                mediaUrl,
                mediaType,
                mediaName,
                timestamp
            };

            if (!sessionObj.messages[phone]) {
                sessionObj.messages[phone] = [];
            }
            if (!sessionObj.messages[phone].some(m => m.id === msg.key.id)) {
                sessionObj.messages[phone].push(messageObj);
            }

            sessionObj.chats[phone] = {
                phone,
                name: senderName || sessionObj.chats[phone]?.name || phone,
                lastMessage: text,
                updatedAt: timestamp,
                unreadCount: fromMe ? 0 : ((sessionObj.chats[phone]?.unreadCount || 0) + 1)
            };

            saveChatsData(store, sessionObj.chats, sessionObj.messages);
        }
    });

    return sessionObj;
}

function getStatus(store = 'monos') {
    const session = sessions[store];
    if (!session) {
        return { status: 'disconnected', qrCode: null, user: null };
    }
    return {
        status: session.status,
        qrCode: session.qrCode,
        user: session.user
    };
}

function getChats(store = 'monos') {
    const session = sessions[store];
    if (!session) return [];
    const chatsList = Object.values(session.chats || {});
    chatsList.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    return chatsList;
}

function getMessages(store = 'monos', phone) {
    const session = sessions[store];
    if (!session) return [];
    const cleanPhone = sanitizePhone(phone);
    return session.messages[cleanPhone] || [];
}

async function sendMessage(store = 'monos', phone, text, media = null) {
    const session = sessions[store];
    if (!session || session.status !== 'connected' || !session.sock) {
        throw new Error('WhatsApp no está conectado.');
    }

    const cleanPhone = sanitizePhone(phone);
    if (!cleanPhone) throw new Error('Número de teléfono inválido.');

    let targetJid = formatJid(cleanPhone);
    try {
        const results = await session.sock.onWhatsApp(cleanPhone);
        if (results && results.length > 0 && results[0].exists) {
            targetJid = results[0].jid;
            console.log(`[WhatsApp ${store}] Target JID verificado en servidores de WhatsApp: ${targetJid}`);
        }
    } catch (eOnWa) {
        console.log(`[WhatsApp ${store}] onWhatsApp fallback a: ${targetJid}`);
    }

    let sentMsg;

    if (media && media.base64) {
        const buffer = Buffer.from(media.base64.split(',')[1] || media.base64, 'base64');
        const isImage = media.mimetype ? media.mimetype.startsWith('image/') : false;

        if (isImage) {
            sentMsg = await session.sock.sendMessage(targetJid, {
                image: buffer,
                caption: text || ''
            });
        } else {
            sentMsg = await session.sock.sendMessage(targetJid, {
                document: buffer,
                mimetype: media.mimetype || 'application/octet-stream',
                fileName: media.fileName || 'archivo',
                caption: text || ''
            });
        }
    } else {
        sentMsg = await session.sock.sendMessage(targetJid, { text });
    }

    console.log(`[WhatsApp ${store}] Mensaje enviado exitosamente a ${targetJid}. ID:`, sentMsg?.key?.id);

    const timestamp = new Date().toISOString();
    const messageText = text || (media ? `📎 [${media.fileName || 'Archivo adjunto'}]` : '');

    const messageObj = {
        id: sentMsg?.key?.id || `out_${Date.now()}`,
        fromMe: true,
        phone: cleanPhone,
        senderName: 'Yo',
        text: messageText,
        mediaUrl: media ? media.base64 : null,
        mediaType: media ? (media.mimetype?.startsWith('image/') ? 'image' : 'document') : null,
        mediaName: media ? media.fileName : null,
        timestamp: timestamp
    };

    if (!session.messages[cleanPhone]) {
        session.messages[cleanPhone] = [];
    }
    if (!session.messages[cleanPhone].some(m => m.id === messageObj.id)) {
        session.messages[cleanPhone].push(messageObj);
    }

    session.chats[cleanPhone] = {
        phone: cleanPhone,
        name: session.chats[cleanPhone]?.name || cleanPhone,
        lastMessage: messageText,
        updatedAt: timestamp,
        unreadCount: 0
    };

    saveChatsData(store, session.chats, session.messages);

    return messageObj;
}

async function logoutWhatsApp(store = 'monos') {
    const session = sessions[store];
    if (session && session.sock) {
        try {
            await session.sock.logout();
        } catch (e) {
            console.error(`[WhatsApp ${store}] Error en logout:`, e);
        }
    }
    delete sessions[store];
    const sessionDir = getSessionPath(store);
    try {
        fs.rmSync(sessionDir, { recursive: true, force: true });
    } catch (e) { }
    return { success: true };
}

module.exports = {
    initWhatsApp,
    getStatus,
    getChats,
    getMessages,
    sendMessage,
    logoutWhatsApp,
    sanitizePhone
};
