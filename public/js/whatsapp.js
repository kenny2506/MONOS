// --- MÓDULO WHATSAPP (BAILEYS + CHAT EN VIVO) ---

let _waActivePhone = null;
let _waStatusInterval = null;
let _waMessagesInterval = null;

async function fetchWhatsAppStatus() {
    try {
        const res = await fetch('/api/whatsapp/status');
        const data = await res.json();
        if (data.success) {
            updateWhatsAppUI(data);
        }
    } catch (e) {
        console.error('Error obteniendo estado de WhatsApp:', e);
    }
}

function updateWhatsAppUI(data) {
    const badge = document.getElementById('waStatusBadge');
    const qrImg = document.getElementById('imgWhatsAppQR');
    const spinner = document.getElementById('waQrSpinner');
    const qrBtn = document.getElementById('btnWaConnectQR');
    const logoutBtn = document.getElementById('btnWaLogout');
    const phoneInfo = document.getElementById('waConnectedPhone');

    if (!badge) return;

    if (data.status === 'connected') {
        badge.className = 'record-badge';
        badge.style.background = '#10b981';
        badge.style.color = '#ffffff';
        badge.innerHTML = `<i data-lucide="check-circle" class="lucide-sm"></i> Conectado`;
        if (phoneInfo) phoneInfo.innerText = data.user ? `(+${data.user})` : '';
        if (qrBtn) qrBtn.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'inline-flex';
        cerrarModalWhatsAppQR();
    } else if (data.status === 'qr_ready') {
        badge.className = 'record-badge';
        badge.style.background = '#f59e0b';
        badge.style.color = '#ffffff';
        badge.innerHTML = `<i data-lucide="qr-code" class="lucide-sm"></i> QR Listo`;
        if (phoneInfo) phoneInfo.innerText = '';
        if (qrBtn) qrBtn.style.display = 'inline-flex';
        if (logoutBtn) logoutBtn.style.display = 'none';

        if (qrImg && data.qrCode) {
            qrImg.src = data.qrCode;
            qrImg.style.display = 'block';
            if (spinner) spinner.style.display = 'none';
        }
    } else if (data.status === 'connecting') {
        badge.className = 'record-badge';
        badge.style.background = '#3b82f6';
        badge.style.color = '#ffffff';
        badge.innerHTML = `<i data-lucide="refresh-cw" class="lucide-sm spinning"></i> Conectando...`;
        if (phoneInfo) phoneInfo.innerText = '';
        if (qrBtn) qrBtn.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'none';

        if (qrImg) qrImg.style.display = 'none';
        if (spinner) spinner.style.display = 'flex';
    } else {
        badge.className = 'record-badge';
        badge.style.background = '#ef4444';
        badge.style.color = '#ffffff';
        badge.innerHTML = `<i data-lucide="alert-circle" class="lucide-sm"></i> Desconectado`;
        if (phoneInfo) phoneInfo.innerText = '';
        if (qrBtn) qrBtn.style.display = 'inline-flex';
        if (logoutBtn) logoutBtn.style.display = 'none';

        if (qrImg) qrImg.style.display = 'none';
        if (spinner) spinner.style.display = 'flex';
    }

    if (window.lucide) window.lucide.createIcons();
}

async function abrirModalWhatsAppQR() {
    const modal = document.getElementById('modalWhatsAppQR');
    if (modal) {
        modal.style.display = 'flex';
        const spinner = document.getElementById('waQrSpinner');
        const qrImg = document.getElementById('imgWhatsAppQR');
        if (spinner) spinner.style.display = 'flex';
        if (qrImg) qrImg.style.display = 'none';

        // Disparar conexión en backend
        try {
            await fetch('/api/whatsapp/connect', { method: 'POST' });
        } catch (e) {
            console.error('Error iniciando conexión WhatsApp:', e);
        }

        // Sondeo rápido de 1 segundo para mostrar el QR apenas se genere
        let pollCount = 0;
        const quickInterval = setInterval(async () => {
            pollCount++;
            try {
                const res = await fetch('/api/whatsapp/status');
                const data = await res.json();
                if (data.success) {
                    updateWhatsAppUI(data);
                    if (data.status === 'qr_ready' || data.status === 'connected' || pollCount >= 20) {
                        clearInterval(quickInterval);
                    }
                }
            } catch (err) {
                console.error('Error sondeo QR:', err);
            }
        }, 1000);
    }
}

function cerrarModalWhatsAppQR(e) {
    if (!e || e.target === document.getElementById('modalWhatsAppQR') || e.target.closest('.close-wa-qr')) {
        const modal = document.getElementById('modalWhatsAppQR');
        if (modal) modal.style.display = 'none';
    }
}

async function logoutWhatsAppClient() {
    if (!confirm('¿Estás seguro de cerrar la sesión de WhatsApp? Tendrás que volver a escanear el código QR.')) return;
    try {
        const res = await fetch('/api/whatsapp/logout', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showToast('Sesión de WhatsApp cerrada');
            fetchWhatsAppStatus();
            loadWhatsAppChats();
            const messagesContainer = document.getElementById('waMessagesContainer');
            if (messagesContainer) messagesContainer.innerHTML = '';
            _waActivePhone = null;
        }
    } catch (e) {
        showToast('Error al cerrar sesión de WhatsApp');
    }
}

async function loadWhatsAppChats() {
    try {
        const res = await fetch('/api/whatsapp/chats');
        const data = await res.json();
        if (data.success) {
            renderWhatsAppChats(data.chats || []);
        }
    } catch (e) {
        console.error('Error cargando chats de WhatsApp:', e);
    }
}

function renderWhatsAppChats(chats) {
    const container = document.getElementById('waChatsList');
    if (!container) return;

    const q = (document.getElementById('waSearchChat')?.value || '').toLowerCase().trim();

    // Sincronizar clientes registrados de dbVentas para autocompletar nombres
    const clientMap = {};
    if (window.dbVentas) {
        window.dbVentas.forEach(v => {
            if (v.telefono) {
                const clean = String(v.telefono).replace(/\D/g, '');
                if (clean) {
                    clientMap[clean] = v.cliente;
                    if (clean.length === 10 && clean.startsWith('3')) {
                        clientMap['57' + clean] = v.cliente;
                    }
                }
            }
        });
    }

    let filtered = chats.filter(c => {
        const name = (c.name || clientMap[c.phone] || c.phone || '').toLowerCase();
        const phone = (c.phone || '').toLowerCase();
        return name.includes(q) || phone.includes(q);
    });

    if (filtered.length === 0 && !q) {
        container.innerHTML = `
            <div style="padding:30px 15px; text-align:center; opacity:0.6; font-size:13px;">
                <i data-lucide="message-square-off" style="width:32px; height:32px; margin-bottom:8px;"></i>
                <p style="margin:0;">No hay chats registrados aún.</p>
                <small style="display:block; margin-top:4px;">Inicia una nueva conversación con un cliente.</small>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    container.innerHTML = filtered.map(c => {
        const displayName = clientMap[c.phone] || c.name || c.phone;
        const isActive = _waActivePhone === c.phone;
        const timeStr = c.updatedAt ? new Date(c.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        const unreadBadge = (c.unreadCount && c.unreadCount > 0) ? `<span class="wa-unread-badge">${c.unreadCount}</span>` : '';

        return `
            <div class="wa-chat-item ${isActive ? 'active' : ''}" onclick="selectWhatsAppChat('${c.phone}', '${encodeURIComponent(displayName)}')">
                <div class="wa-avatar">${displayName.charAt(0).toUpperCase()}</div>
                <div class="wa-chat-info">
                    <div class="wa-chat-header-line">
                        <span class="wa-chat-name">${displayName}</span>
                        <span class="wa-chat-time">${timeStr}</span>
                    </div>
                    <div class="wa-chat-subline">
                        <span class="wa-chat-lastmsg">${c.lastMessage || 'Sin mensajes'}</span>
                        ${unreadBadge}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
}

async function selectWhatsAppChat(phone, encodedName) {
    _waActivePhone = phone;
    const displayName = encodedName ? decodeURIComponent(encodedName) : phone;

    const titleEl = document.getElementById('waActiveChatName');
    const phoneEl = document.getElementById('waActiveChatPhone');
    if (titleEl) titleEl.innerText = displayName;
    if (phoneEl) phoneEl.innerText = `+${phone}`;

    // Resaltar chat seleccionado
    loadWhatsAppChats();
    loadWhatsAppMessages(phone);
}

async function loadWhatsAppMessages(phone) {
    if (!phone) return;
    try {
        const res = await fetch(`/api/whatsapp/messages/${phone}`);
        const data = await res.json();
        if (data.success) {
            renderWhatsAppMessages(data.messages || []);
        }
    } catch (e) {
        console.error('Error cargando mensajes de WhatsApp:', e);
    }
}

let _waSelectedMedia = null;

function triggerWaAttachment() {
    const fileInput = document.getElementById('waFileInput');
    if (fileInput) fileInput.click();
}

function handleWaFileSelected(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
        showToast('El archivo supera el límite de 15MB');
        e.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function (evt) {
        _waSelectedMedia = {
            base64: evt.target.result,
            mimetype: file.type,
            fileName: file.name
        };

        const previewBox = document.getElementById('waAttachmentPreview');
        const nameEl = document.getElementById('waAttachmentName');
        if (previewBox && nameEl) {
            nameEl.innerText = file.name;
            previewBox.style.display = 'flex';
        }
    };
    reader.readAsDataURL(file);
}

function clearWaAttachment() {
    _waSelectedMedia = null;
    const fileInput = document.getElementById('waFileInput');
    if (fileInput) fileInput.value = '';
    const previewBox = document.getElementById('waAttachmentPreview');
    if (previewBox) previewBox.style.display = 'none';
}

function renderWhatsAppMessages(messages) {
    const container = document.getElementById('waMessagesContainer');
    if (!container) return;

    if (messages.length === 0) {
        container.innerHTML = `
            <div style="margin:auto; text-align:center; opacity:0.6; padding:20px;">
                <p style="margin:0; font-size:13px;">Inicia la conversación enviando un mensaje abajo 👇</p>
            </div>
        `;
        return;
    }

    container.innerHTML = messages.map(m => {
        const timeStr = m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        let mediaHtml = '';

        if (m.mediaUrl) {
            if (m.mediaType === 'image') {
                mediaHtml = `<div style="margin-bottom:6px;"><img src="${m.mediaUrl}" style="max-width:260px; max-height:260px; border-radius:10px; display:block; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,0.12);" onclick="previewImg('${m.mediaUrl}')"></div>`;
            } else if (m.mediaType === 'audio') {
                mediaHtml = `<div style="margin-bottom:6px; min-width:240px; padding:4px 0;"><audio controls style="width:100%; height:38px; outline:none;"><source src="${m.mediaUrl}"></audio></div>`;
            } else if (m.mediaType === 'video') {
                mediaHtml = `<div style="margin-bottom:6px;"><video controls style="max-width:260px; max-height:260px; border-radius:10px; display:block;"><source src="${m.mediaUrl}"></video></div>`;
            } else {
                mediaHtml = `<div style="margin-bottom:6px;"><a href="${m.mediaUrl}" download="${m.mediaName || 'archivo'}" style="display:inline-flex; align-items:center; gap:8px; background:rgba(0,0,0,0.06); padding:8px 12px; border-radius:10px; text-decoration:none; color:inherit; font-size:12px; font-weight:700;"><i data-lucide="file-text" style="color:#25d366;"></i> ${m.mediaName || 'Descargar archivo'}</a></div>`;
            }
        }

        const textHtml = m.text ? `<div class="wa-msg-text">${m.text.replace(/\n/g, '<br>')}</div>` : '';

        return `
            <div class="wa-msg-bubble ${m.fromMe ? 'outbound' : 'inbound'}">
                ${mediaHtml}
                ${textHtml}
                <div class="wa-msg-time">${timeStr} ${m.fromMe ? '✓✓' : ''}</div>
            </div>
        `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
    container.scrollTop = container.scrollHeight;
}

async function sendWhatsAppMessage() {
    const input = document.getElementById('waMessageInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text && !_waSelectedMedia) return;

    if (!_waActivePhone) {
        showToast('Selecciona o inicia un chat primero');
        return;
    }

    const payloadMedia = _waSelectedMedia;
    input.value = '';
    input.style.height = '56px';
    clearWaAttachment();

    try {
        const res = await fetch('/api/whatsapp/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: _waActivePhone,
                message: text,
                media: payloadMedia
            })
        });
        const data = await res.json();
        if (data.success) {
            loadWhatsAppMessages(_waActivePhone);
            loadWhatsAppChats();
        } else {
            showToast(`Error al enviar: ${data.error || 'WhatsApp deshabilitado'}`);
        }
    } catch (e) {
        showToast('Error al enviar mensaje');
    }
}

function abrirModalNuevoChatWA() {
    const modal = document.getElementById('modalNuevoChatWA');
    if (modal) {
        modal.style.display = 'flex';
        document.getElementById('inputNuevoPhoneWA').value = '';
        document.getElementById('inputNuevoMsgWA').value = '';
    }
}

function cerrarModalNuevoChatWA(e) {
    if (!e || e.target === document.getElementById('modalNuevoChatWA') || e.target.closest('.close-wa-newchat')) {
        const modal = document.getElementById('modalNuevoChatWA');
        if (modal) modal.style.display = 'none';
    }
}

async function submitNuevoChatWA(e) {
    if (e) e.preventDefault();

    const phoneInput = document.getElementById('inputNuevoPhoneWA').value.trim();
    const msgInput = document.getElementById('inputNuevoMsgWA').value.trim();

    if (!phoneInput) {
        showToast('Ingresa un número de teléfono válido');
        return;
    }

    let cleanPhone = phoneInput.replace(/\D/g, '');
    if (cleanPhone.length === 10 && cleanPhone.startsWith('3')) {
        cleanPhone = '57' + cleanPhone;
    }

    _waActivePhone = cleanPhone;
    cerrarModalNuevoChatWA();

    if (msgInput) {
        try {
            const res = await fetch('/api/whatsapp/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: cleanPhone, message: msgInput })
            });
            const data = await res.json();
            if (data.success) {
                showToast('Mensaje enviado con éxito');
            } else {
                showToast(`Error: ${data.error}`);
            }
        } catch (err) {
            showToast('Error enviando mensaje');
        }
    }

    selectWhatsAppChat(cleanPhone, cleanPhone);
}

function initWhatsAppTab() {
    fetchWhatsAppStatus();
    loadWhatsAppChats();

    if (_waActivePhone) {
        loadWhatsAppMessages(_waActivePhone);
    }

    if (!_waStatusInterval) {
        _waStatusInterval = setInterval(() => {
            fetchWhatsAppStatus();
            loadWhatsAppChats();
            if (_waActivePhone) {
                loadWhatsAppMessages(_waActivePhone);
            }
        }, 3500);
    }
}

// Escuchar evento de tecla Enter e input en el textarea de mensaje
document.addEventListener('DOMContentLoaded', () => {
    const inputMsg = document.getElementById('waMessageInput');
    if (inputMsg) {
        inputMsg.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendWhatsAppMessage();
            }
        });
        inputMsg.addEventListener('input', () => {
            inputMsg.style.height = 'auto';
            inputMsg.style.height = Math.min(inputMsg.scrollHeight, 180) + 'px';
        });
    }
});

// --- MODAL DE SELECCIÓN DE CANAL WHATSAPP (INTERNO vs EXTERNO) ---
let _waSelectedPhone = null;
let _waSelectedName = null;

function abrirModalSeleccionWhatsApp(phone, clientName = '') {
    _waSelectedPhone = phone;
    _waSelectedName = clientName || phone;

    const modal = document.getElementById('modalSelectWA');
    const nameEl = document.getElementById('waSelectClientName');
    const phoneEl = document.getElementById('waSelectClientPhone');

    if (nameEl) nameEl.innerText = _waSelectedName;
    if (phoneEl) phoneEl.innerText = phone ? `+${phone}` : '';

    if (modal) {
        modal.style.display = 'flex';
    }
    if (window.lucide) window.lucide.createIcons();
}

function cerrarModalSeleccionWA(e) {
    if (!e || e.target === document.getElementById('modalSelectWA')) {
        const modal = document.getElementById('modalSelectWA');
        if (modal) modal.style.display = 'none';
    }
}

function opcionWAInterno() {
    cerrarModalSeleccionWA();
    if (!_waSelectedPhone) return;

    let clean = String(_waSelectedPhone).replace(/\D/g, '');
    if (clean.length === 10 && clean.startsWith('3')) {
        clean = '57' + clean;
    }

    switchTab('whatsapp');
    selectWhatsAppChat(clean, encodeURIComponent(_waSelectedName));
}

function opcionWAExterno() {
    cerrarModalSeleccionWA();
    if (!_waSelectedPhone) return;

    const link = getWhatsAppLink(_waSelectedPhone);
    if (link && link !== '#') {
        window.open(link, '_blank', 'noopener,noreferrer');
    }
}
