// --- GLOBAL STATE ---
let dbVentas = [], dbEgresos = [];
let charts = { general: null, product: null, city: null, plataforma: null, monthlyEgresos: null };
let fotoTemp = null, editingId = null;
let sessionInfo = { store: 'monos' };
let calState = {
    viewMonth: new Date().getMonth(),
    viewYear: new Date().getFullYear(),
    posts: []
};
let _formsUrl = '';
let _webhookUrl = '';

// --- UI UTILS & HELPERS ---
function showToast(m, showWhatsAppCopy = false) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const t = document.createElement('div');
    t.className = 'toast';
    t.style.display = 'flex';
    t.style.flexDirection = 'column';
    t.style.gap = '8px';
    t.style.maxWidth = '380px';

    const msgSpan = document.createElement('span');
    msgSpan.innerText = m;
    t.appendChild(msgSpan);

    if (showWhatsAppCopy && lastOrderSummaryText) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.innerHTML = `<svg style="width:13px; height:13px; vertical-align:-2px; margin-right:4px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg> Copiar resumen para WhatsApp`;
        btn.style.cssText = 'padding:6px 10px; border-radius:8px; background:rgba(37,211,102,0.18); border:1px solid rgba(37,211,102,0.4); color:#25d366; font-size:11px; font-weight:700; cursor:pointer; text-align:center; transition:all 0.15s ease;';
        btn.onclick = (e) => {
            e.stopPropagation();
            copyWhatsAppSummary();
        };
        t.appendChild(btn);
    }

    container.appendChild(t);
    setTimeout(() => {
        t.style.opacity = '0';
        t.style.transition = 'opacity 0.3s ease';
        setTimeout(() => t.remove(), 300);
    }, showWhatsAppCopy ? 8000 : 3000);
}

function getWhatsAppLink(phone) {
    if (!phone) return '#';
    let clean = String(phone).replace(/\D/g, '');
    if (!clean) return '#';
    if (clean.length === 10 && clean.startsWith('3')) {
        clean = '57' + clean;
    }
    return `https://wa.me/${clean}`;
}

function formatPhoneWhatsApp(phone, clientName = '') {
    if (!phone || phone === 'S/N' || phone === 'N/A') return phone || '-';
    const link = getWhatsAppLink(phone);
    if (link === '#') return phone;
    const safePhone = String(phone).replace(/'/g, "\\'");
    const safeName = String(clientName).replace(/'/g, "\\'");
    return `<a href="javascript:void(0)" onclick="abrirModalSeleccionWhatsApp('${safePhone}', '${safeName}'); event.stopPropagation();" class="wa-phone-link" title="Contactar por WhatsApp a ${clientName || phone}">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#25d366; flex-shrink:0;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        <span>${phone}</span>
    </a>`;
}

function previewImg(s) {
    document.getElementById('modalImg').src = s;
    document.getElementById('imgModal').style.display = 'flex';
}

async function compressImage(s) {
    return new Promise(res => {
        const i = new Image();
        i.src = s;
        i.onload = () => {
            const c = document.createElement('canvas');
            const m = 300;
            const sc = m / i.width;
            c.width = m;
            c.height = i.height * sc;
            c.getContext('2d').drawImage(i, 0, 0, c.width, c.height);
            res(c.toDataURL('image/jpeg', 0.7));
        };
    });
}

function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('monos_theme', t);
    const themeBtn = document.getElementById('themeBtn');
    if (themeBtn) {
        themeBtn.innerHTML = (t === 'dark' ? '<i data-lucide="sun"></i>' : '<i data-lucide="moon"></i>') + ' Cambiar Tema';
    }
    const themeBtnDesktop = document.getElementById('themeBtnDesktop');
    if (themeBtnDesktop) {
        themeBtnDesktop.innerHTML = t === 'dark' ? '<i data-lucide="sun"></i>' : '<i data-lucide="moon"></i>';
    }
    if (window.lucide) window.lucide.createIcons();
}

function normalizar(t) {
    return t ? t.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";
}

function switchTab(tab) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.tab-btn, .drawer-link, .desktop-nav-link').forEach(b => {
        const isActive = (b.dataset.tab === tab) || (b.id === 'tab-' + tab) || (b.id === 'desk-tab-' + tab);
        b.classList.toggle('active', isActive);
    });
    const view = document.getElementById(`view-${tab}`);
    if (view) view.classList.add('active');

    const labels = {
        ventas: 'Gestión', whatsapp: 'WhatsApp', egresos: 'Egresos',
        stats: 'Reportes', clientes: 'Clientes', calendario: 'Calendario'
    };
    const lbl = document.getElementById('activeTabLabel');
    if (lbl) lbl.textContent = labels[tab] || '';

    const fabBtn = document.getElementById('btnOpenVentaModal');
    if (fabBtn) fabBtn.style.display = tab === 'ventas' ? '' : 'none';

    if (tab === 'stats' && typeof renderTemporalStats === 'function') renderTemporalStats();
    if (tab === 'clientes' && typeof renderLealtad === 'function') renderLealtad();
    if (typeof renderCalendario === 'function') renderCalendario();
    if (tab === 'whatsapp' && typeof initWhatsAppTab === 'function') initWhatsAppTab();
}

// --- CONFIGURACIÓN MULTITIENDA PARA EL MODAL DE REGISTRO DE VENTAS V2 ---
const STORE_ITEM_CONFIGS = {
    monos: {
        title: 'Ventas Monos',
        cat1: 'Prenda / Ropa',
        cat2: 'Accesorio / Otros',
        clothingSizes: ['S', 'M', 'L', 'XL', 'XXL', 'Única'],
        accTypes: ['Bufanda', 'Bolso', 'Maquillaje', 'Otro']
    },
    tenis: {
        title: 'Ventas Tenis',
        cat1: 'Calzado / Tenis',
        cat2: 'Accesorio / Merch',
        clothingSizes: ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', 'Única'],
        accTypes: ['Medias', 'Cordones', 'Gorra', 'Otro']
    },
    flores: {
        title: 'Ventas Flores',
        cat1: 'Arreglo / Flores',
        cat2: 'Complemento / Regalo',
        clothingSizes: ['Ramo', 'Arreglo', 'Caja', 'Flor Suelta', 'Planta', 'Corona', 'Otro'],
        accTypes: ['Chocolates', 'Peluche', 'Globo', 'Tarjeta', 'Vino', 'Otro']
    },
    redkat: {
        title: 'Ventas RedKat',
        cat1: 'Música / Formato',
        cat2: 'Merch / Ropa',
        clothingSizes: ['Vinilo', 'CD', 'Cassette', 'Edición Especial'],
        accTypes: ['Camiseta', 'Gorra', 'Tote Bag', 'Poster', 'Otro']
    },
    vinilos: {
        title: 'Ventas Vinilos',
        cat1: 'Música / Formato',
        cat2: 'Merch / Ropa',
        clothingSizes: ['Vinilo', 'CD', 'Cassette', 'Edición Especial'],
        accTypes: ['Camiseta', 'Gorra', 'Tote Bag', 'Poster', 'Otro']
    },
    vetpet: {
        title: 'VetPet Veterinaria',
        cat1: 'Servicio Médico',
        cat2: 'Accesorio / Alimento',
        clothingSizes: ['Consulta', 'Vacunación', 'Baño/Peluquería', 'Cirugía', 'Profilaxis', 'Otro'],
        accTypes: ['Alimento', 'Juguete', 'Snack', 'Correa/Collar', 'Medicamento', 'Otro']
    }
};

function getStoreItemConfig() {
    const st = sessionInfo && sessionInfo.store ? sessionInfo.store.toLowerCase() : 'monos';
    return STORE_ITEM_CONFIGS[st] || STORE_ITEM_CONFIGS.monos;
}

const MAIN_CITIES_LIST = [
    'bogota', 'bogotá', 'medellin', 'medellín', 'cali', 'barranquilla',
    'bucaramanga', 'cartagena', 'pereira', 'armenia', 'manizales',
    'cucuta', 'cúcuta', 'ibague', 'ibagué', 'villavicencio', 'neiva',
    'valledupar', 'santa marta', 'pasto', 'tunja', 'monteria', 'montería',
    'popayan', 'popayán', 'sincelejo', 'chia', 'chía', 'soacha', 'envigado', 'rionegro'
];

let modalItems = [];
let activePasteItemId = 1;
let activeChannel = 'Whatsapp';
let shippingMode = 'Pago'; // 'Pago' | 'Contraentrega'
let lastOrderSummaryText = '';

function formatCOP(amount) {
    const val = Number(amount) || 0;
    return '$ ' + val.toLocaleString('es-CO');
}

function escapeAttr(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function selectChannel(channel) {
    activeChannel = channel;
    const platInput = document.getElementById('plataforma');
    if (platInput) platInput.value = channel;

    const channelGroup = document.getElementById('channelGroup');
    if (!channelGroup) return;

    channelGroup.querySelectorAll('.channel-pill').forEach(btn => {
        const btnChan = btn.dataset.channel || btn.getAttribute('data-channel');
        const isMatch = btnChan && btnChan.toLowerCase() === channel.toLowerCase();
        btn.classList.remove('active-whatsapp', 'active-instagram', 'active-web', 'active-tiktok');
        if (isMatch) {
            if (channel.toLowerCase().includes('what')) btn.classList.add('active-whatsapp');
            else if (channel.toLowerCase().includes('insta')) btn.classList.add('active-instagram');
            else if (channel.toLowerCase().includes('web') || channel.toLowerCase().includes('página')) btn.classList.add('active-web');
            else if (channel.toLowerCase().includes('tik')) btn.classList.add('active-tiktok');
        }
    });
}

function handlePhoneLookup(rawVal) {
    const digits = String(rawVal || '').replace(/\D/g, '');
    const badge = document.getElementById('frequentClientBadge');

    if (digits.length >= 7 && Array.isArray(dbVentas) && dbVentas.length) {
        const match = dbVentas.slice().reverse().find(v => {
            const vDig = String(v.telefono || '').replace(/\D/g, '');
            return vDig && (vDig.endsWith(digits) || digits.endsWith(vDig));
        });

        if (match) {
            const clienteEl = document.getElementById('cliente');
            const cedulaEl = document.getElementById('cedula');
            const emailEl = document.getElementById('email');
            const paisEl = document.getElementById('pais');
            const ciudadEl = document.getElementById('ciudad');
            const direccionEl = document.getElementById('direccion');

            if (clienteEl && !clienteEl.value) clienteEl.value = match.cliente || '';
            if (cedulaEl && !cedulaEl.value) cedulaEl.value = match.cedula || '';
            if (emailEl && !emailEl.value) emailEl.value = match.email || '';
            if (paisEl && match.pais) paisEl.value = match.pais;
            if (ciudadEl && match.ciudad) ciudadEl.value = match.ciudad;
            if (direccionEl && !direccionEl.value) direccionEl.value = match.direccion || '';

            if (badge) {
                badge.style.display = 'inline-flex';
                badge.textContent = `✓ Cliente frecuente: ${match.cliente || 'Detectado'}`;
            }
            evaluateShippingTariff(true);
            return;
        }
    }
    if (badge) badge.style.display = 'none';
}

function evaluateShippingTariff(autoSetValues = false) {
    const countryEl = document.getElementById('clientCountry') || document.getElementById('pais');
    const cityEl = document.getElementById('clientCity') || document.getElementById('ciudad');
    const zoneBadge = document.getElementById('zoneIndicator');
    const ruleCaption = document.getElementById('shippingRuleCaption');
    const shippingInput = document.getElementById('shippingValue');
    const realCostInput = document.getElementById('shippingRealCost');

    if (!countryEl || !cityEl) return;

    const country = countryEl.value;
    const cityRaw = cityEl.value.trim().toLowerCase();

    if (country !== 'Colombia') {
        if (zoneBadge) {
            zoneBadge.className = 'text-[10px] font-bold text-sky-400';
            zoneBadge.textContent = 'Envío Internacional • Tarifa variable';
        }
        if (ruleCaption) ruleCaption.textContent = `Tarifa internacional (${country})`;
        if (autoSetValues && shippingInput && realCostInput) {
            shippingInput.value = 85000;
            realCostInput.value = 72000;
        }
    } else {
        const normalizedCity = cityRaw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const isMainCity = MAIN_CITIES_LIST.some(c =>
            normalizedCity.includes(c.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
        );

        if (isMainCity) {
            if (zoneBadge) {
                zoneBadge.className = 'text-[10px] font-bold text-emerald-400';
                zoneBadge.textContent = 'Ciudad Principal • $16.500';
            }
            if (ruleCaption) ruleCaption.textContent = 'Tarifa Ciudad Principal';
            if (autoSetValues && shippingInput && realCostInput) {
                shippingInput.value = 16500;
                realCostInput.value = 12500;
            }
        } else {
            if (zoneBadge) {
                zoneBadge.className = 'text-[10px] font-bold text-amber-400';
                zoneBadge.textContent = 'Resto del País • $18.000';
            }
            if (ruleCaption) ruleCaption.textContent = 'Tarifa Resto del País';
            if (autoSetValues && shippingInput && realCostInput) {
                shippingInput.value = 18000;
                realCostInput.value = 14500;
            }
        }
    }
    updateSummaryFooter();
}

function onShippingManualEdit() {
    const ruleCaption = document.getElementById('shippingRuleCaption');
    if (ruleCaption) ruleCaption.textContent = 'Tarifa personalizada';
    updateSummaryFooter();
}

function setShippingMode(mode) {
    shippingMode = mode;
    const envInput = document.getElementById('envio');
    if (envInput) envInput.value = mode;

    const btnPago = document.getElementById('modePagoBtn');
    const btnCod = document.getElementById('modeContraentregaBtn');

    if (mode === 'Pago') {
        if (btnPago) {
            btnPago.style.background = 'var(--sm-item-num-bg)';
            btnPago.style.color = 'var(--sm-item-num-text)';
            btnPago.style.border = 'none';
            btnPago.style.boxShadow = '0 1px 3px rgba(0,0,0,0.15)';
        }
        if (btnCod) {
            btnCod.style.background = 'transparent';
            btnCod.style.color = 'var(--sm-text-muted)';
            btnCod.style.border = 'none';
            btnCod.style.boxShadow = 'none';
        }
    } else {
        if (btnCod) {
            btnCod.style.background = 'rgba(245, 158, 11, 0.2)';
            btnCod.style.color = '#d97706';
            btnCod.style.border = '1px solid rgba(245, 158, 11, 0.4)';
        }
        if (btnPago) {
            btnPago.style.background = 'transparent';
            btnPago.style.color = 'var(--sm-text-muted)';
            btnPago.style.border = 'none';
            btnPago.style.boxShadow = 'none';
        }
    }
    updateSummaryFooter();
}

// Extractor de catálogo real desde dbVentas
function getCatalogFromDB() {
    const map = new Map();
    if (Array.isArray(dbVentas)) {
        for (const v of dbVentas) {
            const rawName = (v.producto || '').trim();
            const norm = normalizar(rawName);
            if (norm && !map.has(norm)) {
                map.set(norm, {
                    name: rawName,
                    cost: Number(v.costo) || 0,
                    price: Number(v.valor) || 0,
                    size: v.talla || 'M',
                    foto: v.foto && v.foto !== 'https://via.placeholder.com/50' ? v.foto : null,
                    tag: (v.talla && ['S', 'M', 'L', 'XL', 'XXL'].includes(v.talla)) ? 'Prenda' : 'Accesorio'
                });
            }
        }
    }
    return Array.from(map.values());
}

function addNewItem() {
    const nextId = modalItems.length ? Math.max(...modalItems.map(i => i.id)) + 1 : 1;
    const cfg = getStoreItemConfig();
    modalItems.push({
        id: nextId,
        type: 'ropa',
        name: '',
        qty: 1,
        size: cfg.clothingSizes[0] || 'M',
        accType: cfg.accTypes[0] || 'Otro',
        accCustom: '',
        cost: 0,
        price: 0,
        image: null,
        showNote: false,
        note: ''
    });
    activePasteItemId = nextId;
    renderModalItems();
}

function deleteItem(id) {
    if (modalItems.length <= 1) return;
    modalItems = modalItems.filter(i => i.id !== id);
    renderModalItems();
}

function changeItemType(id, newType) {
    const item = modalItems.find(i => i.id === id);
    if (!item || item.type === newType) return;
    item.type = newType;
    renderModalItems();
}

function setItemSize(id, size) {
    const item = modalItems.find(i => i.id === id);
    if (!item) return;
    item.size = size;
    renderModalItems();
}

function setAccType(id, accType) {
    const item = modalItems.find(i => i.id === id);
    if (!item) return;
    item.accType = accType;
    renderModalItems();
}

function setAccCustom(id, val) {
    const item = modalItems.find(i => i.id === id);
    if (item) item.accCustom = val;
}

function changeItemQty(id, delta) {
    const item = modalItems.find(i => i.id === id);
    if (!item) return;
    item.qty = Math.max(1, (Number(item.qty) || 1) + delta);
    renderModalItems();
}

function updateItemAmount(id, field, rawVal) {
    const item = modalItems.find(i => i.id === id);
    if (!item) return;
    item[field] = Math.max(0, Number(rawVal) || 0);

    const qty = Math.max(1, Number(item.qty) || 1);
    const profit = ((Number(item.price) || 0) - (Number(item.cost) || 0)) * qty;
    const profitPositive = profit >= 0;
    const box = document.getElementById(`itemProfitBox-${id}`);
    if (box) {
        box.className = `sm-margin-box ${profitPositive ? 'positive' : 'negative'}`;
        box.textContent = `${profitPositive ? '+' : ''}${formatCOP(profit)}`;
    }
    updateSummaryFooter();
}

function toggleItemNote(id) {
    const item = modalItems.find(i => i.id === id);
    if (!item) return;
    item.showNote = !item.showNote;
    renderModalItems();
}

function updateItemNote(id, val) {
    const item = modalItems.find(i => i.id === id);
    if (item) item.note = val;
}

function openProductDropdown(id) {
    activePasteItemId = id;
    const dd = document.getElementById(`productDropdown-${id}`);
    const input = document.getElementById(`productInput-${id}`);
    if (dd && input) {
        dd.innerHTML = buildCatalogDropdownHTML(id, input.value);
        dd.style.display = 'block';
    }
}

function toggleProductDropdown(id, event) {
    if (event) event.preventDefault();
    const dd = document.getElementById(`productDropdown-${id}`);
    if (!dd) return;
    if (dd.style.display === 'none' || !dd.style.display) {
        openProductDropdown(id);
        document.getElementById(`productInput-${id}`)?.focus();
    } else {
        dd.style.display = 'none';
    }
}

function closeProductDropdownDelayed(id) {
    setTimeout(() => {
        const dd = document.getElementById(`productDropdown-${id}`);
        if (dd) dd.style.display = 'none';
    }, 180);
}

function onProductSearchInput(id, val) {
    const item = modalItems.find(i => i.id === id);
    if (item) item.name = val;
    openProductDropdown(id);
}

function selectCatalogProduct(id, productName) {
    const item = modalItems.find(i => i.id === id);
    const catalog = getCatalogFromDB();
    const found = catalog.find(p => p.name === productName);
    if (!item || !found) return;

    item.name = found.name;
    item.cost = found.cost;
    item.price = found.price;
    if (found.foto) item.image = found.foto;
    if (found.size) item.size = found.size;
    renderModalItems();
}

function openFileDialog(id) {
    activePasteItemId = id;
    document.getElementById(`fileInput-${id}`)?.click();
}

function handleFileSelect(id, event) {
    const file = event.target.files?.[0];
    if (!file) return;
    readImageFileToItem(id, file);
}

function clearItemImage(id) {
    const item = modalItems.find(i => i.id === id);
    if (!item) return;
    item.image = null;
    renderModalItems();
}

async function readImageFileToItem(id, file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        const item = modalItems.find(i => i.id === id);
        if (item) {
            const compressed = typeof compressImage === 'function' ? await compressImage(e.target.result) : e.target.result;
            item.image = compressed;
            renderModalItems();
            showToast(`Imagen adjuntada al Ítem #${modalItems.indexOf(item) + 1}`);
        }
    };
    reader.readAsDataURL(file);
}

// Pegado directo de imágenes (Ctrl + V)
document.addEventListener('paste', async (event) => {
    const modalEl = document.getElementById('modalNuevaVenta');
    if (!modalEl || modalEl.style.display === 'none') return;

    const clipItems = event.clipboardData?.items;
    if (!clipItems) return;

    for (const clip of clipItems) {
        if (clip.type.startsWith('image/')) {
            const file = clip.getAsFile();
            if (file && modalItems.length) {
                const targetId = modalItems.some(i => i.id === activePasteItemId) ? activePasteItemId : modalItems[0].id;
                await readImageFileToItem(targetId, file);
                event.preventDefault();
                break;
            }
        }
    }
});

function buildCatalogDropdownHTML(itemId, filterQuery = '') {
    const q = filterQuery.trim().toLowerCase();
    const catalog = getCatalogFromDB();
    const matches = catalog.filter(prod =>
        !q || prod.name.toLowerCase().includes(q) || (prod.tag && prod.tag.toLowerCase().includes(q))
    ).slice(0, 8);

    if (!matches.length) {
        return `
            <div style="padding:10px 14px; font-size:11px; color:var(--sm-text-muted);">
                Producto nuevo: <strong style="color:var(--sm-text);">"${escapeAttr(filterQuery)}"</strong> — ingresa costo y venta abajo.
            </div>
        `;
    }

    return matches.map(prod => `
        <button type="button" onmousedown="selectCatalogProduct(${itemId}, '${escapeAttr(prod.name)}')" class="sm-catalog-row">
            <div style="min-width:0; display:flex; align-items:center; gap:8px;">
                <span style="font-size:12px; font-weight:700; color:var(--sm-text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeAttr(prod.name)}</span>
                <span style="padding:1px 6px; border-radius:4px; font-size:9px; font-weight:800; text-transform:uppercase; background:rgba(99, 102, 241, 0.15); color:#818cf8; border:1px solid rgba(99, 102, 241, 0.3);">${escapeAttr(prod.tag || 'Item')}</span>
            </div>
            <div style="text-align:right; flex-shrink:0;">
                <span style="display:block; font-size:12px; font-weight:700; color:#10b981;">${formatCOP(prod.price)}</span>
                <span style="display:block; font-size:10px; color:var(--sm-text-muted);">Costo: ${formatCOP(prod.cost)}</span>
            </div>
        </button>
    `).join('');
}

function renderModalItems() {
    const container = document.getElementById('garmentsContainer');
    if (!container) return;

    const itemsBadge = document.getElementById('itemsBadge');
    if (itemsBadge) {
        itemsBadge.textContent = `${modalItems.length} ${modalItems.length === 1 ? 'ítem' : 'ítems'}`;
    }

    const cfg = getStoreItemConfig();

    container.innerHTML = modalItems.map((item, idx) => {
        const isRopa = item.type === 'ropa';
        const qty = Math.max(1, Number(item.qty) || 1);
        const unitCost = Number(item.cost) || 0;
        const unitPrice = Number(item.price) || 0;
        const lineSubtotal = unitPrice * qty;
        const profit = (unitPrice - unitCost) * qty;
        const profitPositive = profit >= 0;

        return `
        <article class="sm-item-card sm-animate-entry" data-item-id="${item.id}">
            <!-- Cabecera de ítem -->
            <div class="sm-item-header">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="sm-item-badge ${isRopa ? 'prenda' : 'accesorio'}">
                        <span style="width:6px; height:6px; border-radius:50%; background:${isRopa ? '#818cf8' : '#22d3ee'};"></span>
                        ÍTEM #${idx + 1} • ${isRopa ? cfg.cat1.toUpperCase() : cfg.cat2.toUpperCase()}
                    </span>
                    ${qty > 1 ? `
                    <span style="padding:2px 8px; border-radius:6px; background:var(--sm-item-num-bg); border:1px solid var(--sm-card-border); font-size:11px; font-weight:800; color:var(--sm-item-num-text);">
                        ${qty} uds • ${formatCOP(lineSubtotal)}
                    </span>` : ''}
                </div>

                <div style="display:flex; align-items:center; gap:8px;">
                    <!-- Switch Categoría -->
                    <div style="display:inline-flex; padding:2px; border-radius:10px; background:var(--sm-switch-bg); border:1px solid var(--sm-switch-border);">
                        <button type="button" onclick="changeItemType(${item.id}, 'ropa')" style="padding:4px 10px; border-radius:7px; border:none; font-size:11px; font-weight:700; cursor:pointer; transition:all 0.15s ease; ${
                            isRopa ? 'background:#4f46e5; color:#ffffff; box-shadow:0 1px 4px rgba(79, 70, 229, 0.4);' : 'background:transparent; color:var(--sm-text-muted);'
                        }">
                            ${cfg.cat1}
                        </button>
                        <button type="button" onclick="changeItemType(${item.id}, 'accesorio')" style="padding:4px 10px; border-radius:7px; border:none; font-size:11px; font-weight:700; cursor:pointer; transition:all 0.15s ease; ${
                            !isRopa ? 'background:#0891b2; color:#ffffff; box-shadow:0 1px 4px rgba(8, 145, 178, 0.4);' : 'background:transparent; color:var(--sm-text-muted);'
                        }">
                            ${cfg.cat2}
                        </button>
                    </div>

                    ${modalItems.length > 1 ? `
                    <button type="button" onclick="deleteItem(${item.id})" title="Eliminar este ítem" style="width:28px; height:28px; border-radius:8px; display:flex; align-items:center; justify-content:center; color:var(--sm-text-muted); background:transparent; border:none; cursor:pointer; transition:all 0.15s ease;" onmouseover="this.style.color='#f43f5e'; this.style.background='rgba(244,63,94,0.1)';" onmouseout="this.style.color='var(--sm-text-muted)'; this.style.background='transparent';">
                        <svg style="width:14px; height:14px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>` : ''}
                </div>
            </div>

            <!-- Campo Producto con Menú Desplegable Enriquecido -->
            <div style="position:relative;">
                <label class="sm-label">Producto <span class="req">*</span></label>
                <div class="sm-input-wrap">
                    <span class="sm-input-icon">
                        <svg style="width:14px; height:14px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                    </span>
                    <input 
                        type="text" 
                        id="productInput-${item.id}"
                        value="${escapeAttr(item.name)}"
                        onfocus="openProductDropdown(${item.id})"
                        oninput="onProductSearchInput(${item.id}, this.value)"
                        onblur="closeProductDropdownDelayed(${item.id})"
                        autocomplete="off"
                        placeholder="Buscar o escribir nombre del producto..."
                        class="sm-input has-icon"
                    >
                    <button type="button" onmousedown="toggleProductDropdown(${item.id}, event)" tabindex="-1" style="position:absolute; right:10px; top:50%; transform:translateY(-50%); background:none; border:none; color:var(--sm-text-muted); cursor:pointer;">
                        <svg style="width:14px; height:14px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                    </button>
                </div>

                <div id="productDropdown-${item.id}" class="sm-catalog-dropdown" style="display:none;"></div>
            </div>

            <!-- Fila intermedia: Talla / Formato + Foto -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:12px; align-items:start;">
                <!-- Talla o Formato -->
                <div>
                    ${isRopa ? `
                        <label class="sm-label">Talla / Formato <span class="req">*</span></label>
                        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(44px, 1fr)); gap:6px;">
                            ${cfg.clothingSizes.map(sz => `
                                <button type="button" onclick="setItemSize(${item.id}, '${sz}')" class="sm-size-btn ${item.size === sz ? 'active' : ''}">
                                    ${sz}
                                </button>
                            `).join('')}
                        </div>
                    ` : `
                        <label class="sm-label">Tipo de Artículo <span class="req">*</span></label>
                        <div style="display:flex; flex-direction:column; gap:6px;">
                            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(64px, 1fr)); gap:6px;">
                                ${cfg.accTypes.map(tp => `
                                    <button type="button" onclick="setAccType(${item.id}, '${tp}')" class="sm-size-btn sm-acc-btn ${item.accType === tp ? 'active' : ''}">
                                        ${tp}
                                    </button>
                                `).join('')}
                            </div>
                            ${item.accType === 'Otro' ? `
                                <input 
                                    type="text" 
                                    value="${escapeAttr(item.accCustom)}"
                                    oninput="setAccCustom(${item.id}, this.value)"
                                    placeholder="Especifica el artículo..."
                                    class="sm-input"
                                    style="margin-top:4px;"
                                >
                            ` : ''}
                        </div>
                    `}
                </div>

                <!-- Foto del Producto -->
                <div>
                    <label class="sm-label">Foto del Producto <span class="opt">(Ctrl+V o clic)</span></label>
                    ${item.image ? `
                        <div style="display:flex; align-items:center; gap:10px; background:var(--sm-input); border:1px solid var(--sm-input-border); border-radius:12px; padding:6px 10px;">
                            <div style="position:relative; width:44px; height:44px; border-radius:8px; overflow:hidden; border:1px solid var(--sm-card-border); background:#000; flex-shrink:0;">
                                <img src="${item.image}" alt="Preview" style="width:100%; height:100%; object-fit:cover;">
                                <button type="button" onclick="clearItemImage(${item.id})" title="Quitar foto" style="position:absolute; top:2px; right:2px; width:16px; height:16px; border-radius:50%; background:rgba(0,0,0,0.8); color:#f1f5f9; border:none; cursor:pointer; font-size:10px; line-height:1; display:flex; align-items:center; justify-content:center;">×</button>
                            </div>
                            <div style="min-width:0; flex:1;">
                                <p style="font-size:11px; font-weight:600; color:#10b981; margin:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Imagen adjunta</p>
                                <button type="button" onclick="openFileDialog(${item.id})" style="font-size:10px; color:var(--sm-text-muted); text-decoration:underline; background:none; border:none; cursor:pointer; padding:0; margin-top:2px;">Reemplazar</button>
                            </div>
                        </div>
                    ` : `
                        <button type="button" onclick="openFileDialog(${item.id})" style="width:100%; height:38px; display:flex; align-items:center; justify-content:center; gap:8px; background:var(--sm-input); border:1px dashed var(--sm-input-border); border-radius:12px; color:var(--sm-text-muted); font-size:12px; font-weight:600; cursor:pointer; transition:all 0.15s ease;" onmouseover="this.style.borderColor='var(--sm-input-focus)'; this.style.color='var(--sm-text)';" onmouseout="this.style.borderColor='var(--sm-input-border)'; this.style.color='var(--sm-text-muted)';">
                            <svg style="width:14px; height:14px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                            Subir o pegar imagen (Ctrl+V)
                        </button>
                    `}
                    <input type="file" id="fileInput-${item.id}" accept="image/*" onchange="handleFileSelect(${item.id}, event)" style="display:none;">
                </div>
            </div>

            <!-- Fila Financiera: Cantidad, Costo, Venta, Margen -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px; padding-top:4px;">
                <div>
                    <label class="sm-label">Cantidad</label>
                    <div style="height:38px; display:flex; align-items:center; justify-content:space-between; background:var(--sm-counter-bg); border:1px solid var(--sm-counter-border); border-radius:12px; padding:0 6px;">
                        <button type="button" onclick="changeItemQty(${item.id}, -1)" style="width:26px; height:26px; border-radius:6px; background:var(--sm-counter-btn); border:none; color:var(--sm-counter-btn-text); font-size:14px; font-weight:700; cursor:pointer;">−</button>
                        <span style="font-size:13px; font-weight:800; color:var(--sm-text);">${qty}</span>
                        <button type="button" onclick="changeItemQty(${item.id}, 1)" style="width:26px; height:26px; border-radius:6px; background:var(--sm-counter-btn); border:none; color:var(--sm-counter-btn-text); font-size:14px; font-weight:700; cursor:pointer;">+</button>
                    </div>
                </div>

                <div>
                    <label class="sm-label">Costo Unit.</label>
                    <div class="sm-input-wrap">
                        <span class="sm-input-icon" style="color:var(--sm-text-muted); font-weight:700; font-size:12px;">$</span>
                        <input type="number" min="0" step="500" value="${item.cost || ''}" placeholder="0" oninput="updateItemAmount(${item.id}, 'cost', this.value)" class="sm-input" style="padding-left:26px;">
                    </div>
                </div>

                <div>
                    <label class="sm-label">Venta Unit. <span class="req">*</span></label>
                    <div class="sm-input-wrap">
                        <span class="sm-input-icon" style="color:var(--sm-text-muted); font-weight:700; font-size:12px;">$</span>
                        <input type="number" min="0" step="500" value="${item.price || ''}" placeholder="0" oninput="updateItemAmount(${item.id}, 'price', this.value)" class="sm-input" style="padding-left:26px; font-weight:700;">
                    </div>
                </div>

                <div>
                    <label class="sm-label">Margen Ítem</label>
                    <div id="itemProfitBox-${item.id}" class="sm-margin-box ${profitPositive ? 'positive' : 'negative'}">
                        ${profitPositive ? '+' : ''}${formatCOP(profit)}
                    </div>
                </div>
            </div>

            <!-- Observación / Nota Especial -->
            <div>
                ${!item.showNote ? `
                    <button type="button" onclick="toggleItemNote(${item.id})" style="display:inline-flex; align-items:center; gap:6px; padding:5px 10px; border-radius:8px; background:var(--sm-note-bg); border:1px solid var(--sm-note-border); font-size:11px; font-weight:700; color:var(--sm-note-text); cursor:pointer;">
                        <svg style="width:14px; height:14px; color:#f59e0b; flex-shrink:0;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                        + Agregar nota o instrucción especial
                    </button>
                ` : `
                    <div style="background:var(--sm-note-bg); border:1px solid var(--sm-note-border); border-radius:12px; padding:12px; display:flex; flex-direction:column; gap:8px;">
                        <div style="display:flex; align-items:center; justify-content:space-between;">
                            <label style="display:inline-flex; align-items:center; gap:6px; font-size:11px; font-weight:800; text-transform:uppercase; color:var(--sm-note-text);">
                                <svg style="width:14px; height:14px; color:#f59e0b; flex-shrink:0;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                                Observación / Nota Especial Importante
                            </label>
                            <button type="button" onclick="toggleItemNote(${item.id})" style="font-size:11px; color:var(--sm-note-text); opacity:0.85; text-decoration:underline; background:none; border:none; cursor:pointer;">Ocultar</button>
                        </div>
                        <textarea rows="2" oninput="updateItemNote(${item.id}, this.value)" placeholder="Ej. Estampado espalda DTF, tarjeta de regalo, empaque especial..." class="sm-input" style="background:var(--sm-note-input); border-color:var(--sm-note-border); color:var(--sm-text); height:auto; resize:vertical;">${escapeAttr(item.note)}</textarea>
                    </div>
                `}
            </div>
        </article>
        `;
    }).join('');

    updateSummaryFooter();
}

function updateSummaryFooter() {
    const subtotal = modalItems.reduce((acc, item) => acc + ((Number(item.price) || 0) * (Math.max(1, Number(item.qty) || 1))), 0);
    const totalItemsCost = modalItems.reduce((acc, item) => acc + ((Number(item.cost) || 0) * (Math.max(1, Number(item.qty) || 1))), 0);
    const shippingInput = document.getElementById('shippingValue');
    const realCostInput = document.getElementById('shippingRealCost');
    const discountInput = document.getElementById('discountValue');

    const shippingCharged = shippingInput ? (Number(shippingInput.value) || 0) : 0;
    const shippingRealCost = realCostInput ? (Number(realCostInput.value) || 0) : 0;
    const discount = discountInput ? (Number(discountInput.value) || 0) : 0;

    const shippingMargin = shippingMode === 'Pago' ? (shippingCharged - shippingRealCost) : 0;
    const netProfit = (subtotal - totalItemsCost - discount) + shippingMargin;

    const spreadBadge = document.getElementById('shippingSpreadBadge');
    if (spreadBadge) {
        if (shippingMode === 'Contraentrega') {
            spreadBadge.style.color = '#f59e0b';
            spreadBadge.textContent = 'Paga cliente';
        } else {
            spreadBadge.style.color = shippingMargin >= 0 ? '#34d399' : '#fb7185';
            spreadBadge.textContent = `${shippingMargin >= 0 ? '+' : ''}${formatCOP(shippingMargin)}`;
        }
    }

    const footerSubtotal = document.getElementById('footerSubtotal');
    const footerShipping = document.getElementById('footerShipping');
    const footerProfit = document.getElementById('footerProfit');
    const footerTotal = document.getElementById('footerTotal');
    const discountBlock = document.getElementById('footerDiscountBlock');
    const footerDiscount = document.getElementById('footerDiscount');

    if (footerSubtotal) footerSubtotal.textContent = formatCOP(subtotal);

    if (discount > 0 && discountBlock && footerDiscount) {
        discountBlock.style.display = 'flex';
        footerDiscount.textContent = `-${formatCOP(discount)}`;
    } else if (discountBlock) {
        discountBlock.style.display = 'none';
    }

    let totalToday = Math.max(0, subtotal - discount);
    if (shippingMode === 'Pago') {
        totalToday += shippingCharged;
        if (footerShipping) {
            footerShipping.style.color = 'var(--sm-text)';
            footerShipping.textContent = formatCOP(shippingCharged);
        }
    } else {
        if (footerShipping) {
            footerShipping.style.color = '#f59e0b';
            footerShipping.textContent = `${formatCOP(shippingCharged)} (Contraentrega)`;
        }
    }

    if (footerProfit) {
        footerProfit.style.color = netProfit >= 0 ? '#34d399' : '#fb7185';
        footerProfit.textContent = `${netProfit >= 0 ? '+' : ''}${formatCOP(netProfit)}`;
    }
    if (footerTotal) footerTotal.textContent = formatCOP(totalToday);
}

function toggleSmartPasteDrawer(forceState) {
    const drawer = document.getElementById('smartPasteDrawer');
    if (!drawer) return;
    const show = typeof forceState === 'boolean' ? forceState : drawer.classList.contains('hidden');
    if (show) {
        drawer.classList.remove('hidden');
        document.getElementById('rawChatInput')?.focus();
    } else {
        drawer.classList.add('hidden');
    }
}

function fillSampleChatText() {
    const input = document.getElementById('rawChatInput');
    if (input) {
        input.value =
            "Nombre: Laura Sofía Martínez\n" +
            "CC: 1020845912\n" +
            "Cel: 318 492 7710\n" +
            "Ciudad: Medellín - Antioquia\n" +
            "Dirección: Carrera 43A # 14-109 Edificio Nova Apto 502, El Poblado\n" +
            "Correo: laurasofia.m@gmail.com";
    }
}

function parseSmartChatData() {
    const rawInput = document.getElementById('rawChatInput');
    const raw = rawInput ? rawInput.value.trim() : '';
    if (!raw) {
        showToast('Pega primero el mensaje con los datos del cliente');
        return;
    }

    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let extractedPhone = '';
    let extractedDoc = '';
    let extractedEmail = '';
    let extractedCity = '';
    let extractedAddress = '';
    let extractedName = '';

    // 1. Extraer Email
    const emailMatch = raw.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) extractedEmail = emailMatch[0];

    // 2. Extraer Teléfono celular colombiano
    const phoneMatch = raw.match(/(?:\+?57[\s-]*)?(3\d{2}[\s.-]?\d{3}[\s.-]?\d{4})/);
    if (phoneMatch) {
        extractedPhone = phoneMatch[1].replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3');
    }

    // 3. Extraer Cédula / NIT
    const cleanNoPhone = phoneMatch ? raw.replace(phoneMatch[0], '') : raw;
    const docLabeled = cleanNoPhone.match(/(?:c\.?c\.?|c[eé]dula|nit|doc(?:umento)?|id)\s*[:#.-]?\s*(\d[\d.]{5,12})/i);
    if (docLabeled) {
        extractedDoc = docLabeled[1].replace(/\./g, '');
    } else {
        const genericDigits = cleanNoPhone.match(/\b\d{6,11}\b/);
        if (genericDigits) extractedDoc = genericDigits[0];
    }

    // 4. Ciudad
    const cityDict = [
        { key: 'bogota', label: 'Bogotá D.C. - Bogotá' },
        { key: 'medellin', label: 'Antioquia - Medellín' },
        { key: 'cali', label: 'Valle del Cauca - Cali' },
        { key: 'barranquilla', label: 'Atlántico - Barranquilla' },
        { key: 'bucaramanga', label: 'Santander - Bucaramanga' },
        { key: 'cartagena', label: 'Bolívar - Cartagena' },
        { key: 'pereira', label: 'Risaralda - Pereira' },
        { key: 'armenia', label: 'Quindío - Armenia' },
        { key: 'manizales', label: 'Caldas - Manizales' },
        { key: 'cucuta', label: 'Norte de Santander - Cúcuta' },
        { key: 'ibague', label: 'Tolima - Ibagué' },
        { key: 'villavicencio', label: 'Meta - Villavicencio' },
        { key: 'neiva', label: 'Huila - Neiva' },
        { key: 'valledupar', label: 'Cesar - Valledupar' },
        { key: 'santa marta', label: 'Magdalena - Santa Marta' },
        { key: 'pasto', label: 'Nariño - Pasto' },
        { key: 'tunja', label: 'Boyacá - Tunja' },
        { key: 'monteria', label: 'Córdoba - Montería' },
        { key: 'popayan', label: 'Cauca - Popayán' },
        { key: 'sincelejo', label: 'Sucre - Sincelejo' },
        { key: 'chia', label: 'Cundinamarca - Chía' },
        { key: 'soacha', label: 'Cundinamarca - Soacha' },
        { key: 'envigado', label: 'Antioquia - Envigado' },
        { key: 'rionegro', label: 'Antioquia - Rionegro' }
    ];

    const normalizedFull = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const foundCity = cityDict.find(c => normalizedFull.includes(c.key));
    if (foundCity) {
        extractedCity = foundCity.label;
    } else {
        const cityLine = lines.find(l => /^(?:ciudad|municipio|destino)\s*[:.-]/i.test(l));
        if (cityLine) extractedCity = cityLine.replace(/^(?:ciudad|municipio|destino)\s*[:.-]\s*/i, '').trim();
    }

    // 5. Dirección física
    const addrLine = lines.find(l =>
        /^(?:dir(?:ecci[oó]n)?|entrega)\s*[:.-]/i.test(l) ||
        /\b(?:calle|cll|cl|carrera|cra|kr|diagonal|diag|dg|transversal|tv|avenida|av|manzana|mz|vereda)\b/i.test(l)
    );
    if (addrLine) {
        extractedAddress = addrLine.replace(/^(?:dir(?:ecci[oó]n)?|entrega)\s*[:.-]\s*/i, '').trim();
    }

    // 6. Nombre del Cliente
    const nameLine = lines.find(l => /^(?:nombre(?:\s+completo)?|cliente|destinatario|recibe)\s*[:.-]/i.test(l));
    if (nameLine) {
        extractedName = nameLine.replace(/^(?:nombre(?:\s+completo)?|cliente|destinatario|recibe)\s*[:.-]\s*/i, '').trim();
    } else {
        const candidateLine = lines.find(l => {
            const clean = l.replace(/^(?:hola|buenas|datos)[,\s]*/i, '').trim();
            return clean.length >= 5 &&
                !/\d/.test(clean) &&
                !clean.includes('@') &&
                (!foundCity || !clean.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(foundCity.key));
        });
        if (candidateLine) extractedName = candidateLine;
    }

    if (extractedPhone) {
        const telEl = document.getElementById('telefono');
        if (telEl) telEl.value = extractedPhone;
        handlePhoneLookup(extractedPhone);
    }
    if (extractedName) {
        const cliEl = document.getElementById('cliente');
        if (cliEl) cliEl.value = extractedName;
    }
    if (extractedDoc) {
        const docEl = document.getElementById('cedula');
        if (docEl) docEl.value = extractedDoc;
    }
    if (extractedEmail) {
        const mailEl = document.getElementById('email');
        if (mailEl) mailEl.value = extractedEmail;
    }
    if (extractedAddress) {
        const dirEl = document.getElementById('direccion');
        if (dirEl) dirEl.value = extractedAddress;
    }
    if (extractedCity) {
        const paisEl = document.getElementById('pais');
        const ciudadEl = document.getElementById('ciudad');
        if (paisEl) paisEl.value = 'Colombia';
        if (ciudadEl) ciudadEl.value = extractedCity;
        evaluateShippingTariff(true);
    }

    toggleSmartPasteDrawer(false);
    showToast('Datos extraídos del chat y asignados');
}

function runQuickDemo() {
    selectChannel('Instagram');
    const telEl = document.getElementById('telefono');
    if (telEl) {
        telEl.value = '315 672 9041';
        handlePhoneLookup('3156729041');
    }
    const cliEl = document.getElementById('cliente');
    if (cliEl && !cliEl.value) cliEl.value = 'Valentina Gómez Morales';

    const dirEl = document.getElementById('direccion');
    if (dirEl && !dirEl.value) dirEl.value = 'Calle 10 # 43E-25 Apto 704, El Poblado';

    const ciudadEl = document.getElementById('ciudad');
    if (ciudadEl) ciudadEl.value = 'Antioquia - Medellín';

    const guiaEl = document.getElementById('guia');
    if (guiaEl) guiaEl.value = '2400981234';

    const payEl = document.getElementById('paymentMethod');
    if (payEl) payEl.value = 'Nequi';

    const discEl = document.getElementById('discountValue');
    if (discEl) discEl.value = 0;

    setShippingMode('Pago');
    evaluateShippingTariff(true);

    const cfg = getStoreItemConfig();
    modalItems = [
        {
            id: 1,
            type: 'ropa',
            name: cfg.title.includes('Tenis') ? 'Nike Air Jordan 1 Retro High' : 'Hoodie Streetwear Oversize Monos',
            qty: 2,
            size: cfg.clothingSizes[1] || 'M',
            accType: cfg.accTypes[0] || 'Bolso',
            accCustom: '',
            cost: 65000,
            price: 135000,
            image: null,
            showNote: true,
            note: 'Empaque para regalo con calcomanías exclusivas.'
        },
        {
            id: 2,
            type: 'accesorio',
            name: cfg.title.includes('Tenis') ? 'Medias Deportivas Antideslizantes' : 'Gorra Trucker Bordada',
            qty: 1,
            size: cfg.clothingSizes[0] || 'M',
            accType: cfg.accTypes[0] || 'Gorra',
            accCustom: '',
            cost: 18000,
            price: 45000,
            image: null,
            showNote: false,
            note: ''
        }
    ];
    renderModalItems();
    showToast('Datos de demostración cargados');
}

function copyWhatsAppSummary() {
    if (!lastOrderSummaryText) return;
    navigator.clipboard?.writeText(lastOrderSummaryText).then(() => {
        showToast('Resumen copiado para WhatsApp');
    }).catch(() => {
        const temp = document.createElement('textarea');
        temp.value = lastOrderSummaryText;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
        showToast('Resumen copiado para WhatsApp');
    });
}

// Inicializar el formulario y resetear ítems
function initGarmentsForm() {
    const cfg = getStoreItemConfig();
    const fechaEl = document.getElementById('fecha');
    if (fechaEl && !fechaEl.value) {
        fechaEl.value = new Date().toISOString().split('T')[0];
    }
    const paisEl = document.getElementById('pais');
    if (paisEl && !paisEl.value) paisEl.value = 'Colombia';

    const modalTitle = document.getElementById('salesModalTitle');
    if (modalTitle) modalTitle.textContent = 'Registrar Nueva Venta';

    const modalSubtitle = document.getElementById('salesModalSubtitle');
    if (modalSubtitle) modalSubtitle.textContent = `${cfg.title} • Gestión de Pedidos`;

    const btnSubmit = document.getElementById('btnSubmit');
    if (btnSubmit) {
        btnSubmit.innerHTML = `<svg style="width:18px; height:18px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg> Registrar Venta`;
    }
    const btnCancel = document.getElementById('btnCancelEdit');
    if (btnCancel) btnCancel.style.display = 'none';

    modalItems = [{
        id: 1,
        type: 'ropa',
        name: '',
        qty: 1,
        size: cfg.clothingSizes[0] || 'M',
        accType: cfg.accTypes[0] || 'Otro',
        accCustom: '',
        cost: 0,
        price: 0,
        image: null,
        showNote: false,
        note: ''
    }];

    renderModalItems();
    evaluateShippingTariff(true);
}

// Backwards compatibility wrappers
function createGarmentBlock(garmentData = null) {
    if (garmentData) {
        const nextId = modalItems.length ? Math.max(...modalItems.map(i => i.id)) + 1 : 1;
        modalItems.push({
            id: nextId,
            type: 'ropa',
            name: garmentData.producto || '',
            qty: 1,
            size: garmentData.talla || 'M',
            accType: 'Otro',
            accCustom: '',
            cost: Number(garmentData.costo) || 0,
            price: Number(garmentData.valor) || 0,
            image: garmentData.foto || null,
            showNote: Boolean(garmentData.observacion),
            note: garmentData.observacion || ''
        });
        renderModalItems();
    } else {
        addNewItem();
    }
}

function updateGarmentHeaders() {
    renderModalItems();
}

function cancelarEdicion() {
    editingId = null;
    const form = document.getElementById('ventaForm');
    if (form) form.reset();

    const btnSubmit = document.getElementById('btnSubmit');
    if (btnSubmit) {
        btnSubmit.innerHTML = `<svg style="width:18px; height:18px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg> Registrar Venta`;
    }
    const btnCancel = document.getElementById('btnCancelEdit');
    if (btnCancel) btnCancel.style.display = 'none';

    const modalTitle = document.getElementById('salesModalTitle');
    if (modalTitle) modalTitle.textContent = 'Registrar Nueva Venta';

    const addBtn = document.getElementById('btnAddGarment');
    if (addBtn) addBtn.style.display = 'inline-flex';

    if (typeof _closeVentaModal === 'function') _closeVentaModal();
    initGarmentsForm();
}

function prepararEdicion(id) {
    editingId = id;
    const v = Array.isArray(dbVentas) ? dbVentas.find(x => String(x.id) === String(id)) : null;
    if (!v) return;

    ['pais', 'ciudad', 'plataforma', 'cliente', 'cedula', 'telefono', 'email', 'direccion', 'envio', 'guia', 'fecha'].forEach(k => {
        const el = document.getElementById(k);
        if (el) el.value = v[k] || '';
    });

    if (v.plataforma) selectChannel(v.plataforma);
    if (v.envio) setShippingMode(v.envio);

    // Extraer datos financieros de extra_data si existen
    if (v.extra_data) {
        const ex = typeof v.extra_data === 'string' ? JSON.parse(v.extra_data) : v.extra_data;
        if (ex.metodoPago) {
            const payEl = document.getElementById('paymentMethod');
            if (payEl) payEl.value = ex.metodoPago;
        }
        if (ex.descuento) {
            const discEl = document.getElementById('discountValue');
            if (discEl) discEl.value = ex.descuento;
        }
        if (ex.shippingValue) {
            const shValEl = document.getElementById('shippingValue');
            if (shValEl) shValEl.value = ex.shippingValue;
        }
        if (ex.shippingRealCost) {
            const shRealEl = document.getElementById('shippingRealCost');
            if (shRealEl) shRealEl.value = ex.shippingRealCost;
        }
    }

    modalItems = [{
        id: 1,
        type: 'ropa',
        name: v.producto || '',
        qty: 1,
        size: v.talla || 'M',
        accType: 'Otro',
        accCustom: '',
        cost: Number(v.costo) || 0,
        price: Number(v.valor) || 0,
        image: v.foto && v.foto !== 'https://via.placeholder.com/50' ? v.foto : null,
        showNote: Boolean(v.observacion),
        note: v.observacion || ''
    }];

    const addBtn = document.getElementById('btnAddGarment');
    if (addBtn) addBtn.style.display = 'none';

    renderModalItems();

    const btnSubmit = document.getElementById('btnSubmit');
    if (btnSubmit) {
        btnSubmit.innerHTML = `<svg style="width:18px; height:18px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg> Actualizar Venta`;
    }
    const btnCancel = document.getElementById('btnCancelEdit');
    if (btnCancel) btnCancel.style.display = 'inline-flex';

    const modalTitle = document.getElementById('salesModalTitle');
    if (modalTitle) modalTitle.textContent = 'Editar Venta';

    if (typeof openVentaModal === 'function') openVentaModal();
    if (window.lucide) window.lucide.createIcons();
}

async function handleVentaSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();

    const submitBtn = document.getElementById('btnSubmit');
    const originalText = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = 'Guardando...';
    }

    try {
        const cliente = document.getElementById('cliente')?.value.trim();
        const telefono = document.getElementById('telefono')?.value.trim();
        const ciudad = document.getElementById('ciudad')?.value.trim();
        const direccion = document.getElementById('direccion')?.value.trim();

        if (!cliente || !telefono || !ciudad || !direccion) {
            showToast('Por favor completa teléfono, nombre, ciudad y dirección');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
            return;
        }

        if (!modalItems.length) {
            showToast('Agrega al menos un producto al pedido');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
            return;
        }

        const hasInvalidItem = modalItems.some(i => !i.name.trim() || Number(i.price) <= 0);
        if (hasInvalidItem) {
            showToast('Verifica que cada producto tenga nombre y precio de venta mayor a $0');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
            return;
        }

        const commonData = {
            fecha: document.getElementById('fecha')?.value || new Date().toISOString().split('T')[0],
            pais: document.getElementById('pais')?.value.trim() || 'Colombia',
            ciudad: ciudad,
            plataforma: document.getElementById('plataforma')?.value || 'Whatsapp',
            cliente: cliente,
            cedula: document.getElementById('cedula')?.value.trim() || '',
            telefono: telefono,
            email: document.getElementById('email')?.value.trim() || '',
            direccion: direccion,
            envio: document.getElementById('envio')?.value || 'Pago',
            guia: document.getElementById('guia')?.value.trim() || '',
            metodoPago: document.getElementById('paymentMethod')?.value || 'Nequi',
            descuento: Number(document.getElementById('discountValue')?.value) || 0,
            shippingValue: Number(document.getElementById('shippingValue')?.value) || 0,
            shippingRealCost: Number(document.getElementById('shippingRealCost')?.value) || 0
        };

        const baseId = Date.now();
        let idx = 0;

        for (const item of modalItems) {
            const prodNombre = item.name.trim();
            let finalFoto = item.image || null;

            if (!finalFoto) {
                const existente = dbVentas.find(v => normalizar(v.producto) === normalizar(prodNombre) && v.foto && v.foto !== 'https://via.placeholder.com/50');
                if (existente) finalFoto = existente.foto;
            }

            const data = {
                id: editingId && modalItems.length === 1 ? editingId : (baseId + idx),
                fecha: commonData.fecha,
                producto: prodNombre,
                talla: item.size || item.accType || 'Única',
                observacion: item.note ? item.note.trim() : '',
                pais: commonData.pais,
                ciudad: commonData.ciudad,
                plataforma: commonData.plataforma,
                cliente: commonData.cliente,
                cedula: commonData.cedula,
                telefono: commonData.telefono,
                email: commonData.email,
                direccion: commonData.direccion,
                envio: commonData.envio,
                guia: commonData.guia,
                costo: parseFloat(item.cost) || 0,
                valor: parseFloat(item.price) || 0,
                foto: finalFoto || 'https://via.placeholder.com/50',
                estado: editingId && modalItems.length === 1 ? (dbVentas.find(x => x.id === editingId)?.estado || 'Sin enviar') : 'Sin enviar',
                extra_data: {
                    metodoPago: commonData.metodoPago,
                    descuento: commonData.descuento,
                    shippingValue: commonData.shippingValue,
                    shippingRealCost: commonData.shippingRealCost,
                    qty: item.qty || 1,
                    categoria: item.type
                }
            };

            await fetch('/api/ventas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (finalFoto) {
                for (let v of dbVentas) {
                    if (v.id !== data.id && normalizar(v.producto) === normalizar(prodNombre) && (!v.foto || v.foto === 'https://via.placeholder.com/50')) {
                        v.foto = finalFoto;
                        await fetch('/api/ventas', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(v)
                        });
                    }
                }
            }
            idx++;
        }

        // Construir mensaje resumen formateado para WhatsApp
        const totalToday = document.getElementById('footerTotal')?.textContent || '';
        const shipTag = commonData.envio === 'Pago' ? `Envío Pago (${formatCOP(commonData.shippingValue)})` : `Contraentrega (${formatCOP(commonData.shippingValue)} al recibir)`;

        const itemsSummary = modalItems.map((i, itIdx) => {
            const qty = Math.max(1, Number(i.qty) || 1);
            const lineTotal = (Number(i.price) || 0) * qty;
            const detail = i.type === 'ropa' ? `Talla ${i.size}` : (i.accType === 'Otro' ? (i.accCustom || 'Otro') : i.accType);
            const noteLine = i.note && i.note.trim() ? ` | Nota: ${i.note.trim()}` : '';
            return `${itIdx + 1}. ${qty}x ${i.name} (${detail}) - ${formatCOP(lineTotal)}${noteLine}`;
        }).join('\n');

        lastOrderSummaryText = `*PEDIDO ${getStoreItemConfig().title.toUpperCase()}* 📦\n` +
            `*Cliente:* ${commonData.cliente} (${commonData.telefono})\n` +
            `*Destino:* ${commonData.ciudad} - ${commonData.direccion}\n` +
            `*Canal:* ${commonData.plataforma} | *Pago:* ${commonData.metodoPago}\n` +
            `*Productos:*\n${itemsSummary}\n` +
            `*Envío:* ${shipTag}${commonData.guia ? ` | Guía: ${commonData.guia}` : ''}\n` +
            `*Total a Cobrar Hoy:* ${totalToday}`;

        cancelarEdicion();
        await cargarDatos();
        showToast('¡Venta guardada y sincronizada exitosamente!', true);
    } catch (err) {
        console.error('Error guardando venta:', err);
        showToast('Error al guardar el registro');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    }
}

// --- TABLA Y EDICIÓN VENTAS ---
function refrescar() {
    const searchInput = document.getElementById('search');
    const q = normalizar(searchInput ? searchInput.value : '');
    const sorted = [...dbVentas].sort((a, b) => {
        if (a.estado === 'cambio' && b.estado !== 'cambio') return -1;
        if (a.estado !== 'cambio' && b.estado === 'cambio') return 1;
        return new Date(b.fecha) - new Date(a.fecha) || b.id - a.id;
    });
    const filtrados = sorted.filter(v => {
        const fullSearchString = `${v.producto || ''} ${v.cliente || ''} ${v.ciudad || ''} ${v.estado || ''} ${v.cedula || ''} ${v.email || ''} ${v.telefono || ''} ${v.pais || ''} ${v.plataforma || ''} ${v.direccion || ''} ${v.talla || ''} ${v.guia || ''} ${v.observacion || ''}`;
        return normalizar(fullSearchString).includes(normalizar(q));
    });

    const clientDateCounts = {};
    dbVentas.forEach(v => {
        const clientKey = v.cliente ? v.cliente.toLowerCase().trim() : "";
        const dateKey = v.fecha || "";
        if (clientKey && dateKey) {
            const key = `${clientKey}_${dateKey}`;
            clientDateCounts[key] = (clientDateCounts[key] || 0) + 1;
        }
    });

    const tbody = document.getElementById('tbody');
    if (!tbody) return;

    tbody.innerHTML = filtrados.map(v => {
        const clientKey = v.cliente ? v.cliente.toLowerCase().trim() : "";
        const dateKey = v.fecha || "";
        const key = `${clientKey}_${dateKey}`;
        const hasMultiple = clientDateCounts[key] > 1;
        let rowClass = 'data-row';
        if (v.estado === 'cambio') {
            rowClass += ' row-cambio';
        } else if (hasMultiple) {
            rowClass += ' multiple-items';
        }

        const obsAlertHtml = (v.observacion && v.observacion.trim()) ? `
            <br>
            <div style="margin-top:6px; padding:4px 8px; background:rgba(239, 68, 68, 0.15); border:1px solid rgba(239, 68, 68, 0.4); border-radius:6px; color:#ef4444; font-size:11px; font-weight:700; display:inline-flex; align-items:center; gap:5px; box-shadow: 0 0 8px rgba(239, 68, 68, 0.2);" title="Observación registrada">
                <i data-lucide="bell" class="lucide-sm" style="color:#ef4444; flex-shrink:0;"></i> 
                <span>⚠️ <strong>Obs:</strong> ${v.observacion}</span>
            </div>
        ` : '';

        return `
        <tr class="${rowClass}">
            <td data-label="Sel."><input type="checkbox" class="proveedor-checkbox" value="${v.id}" data-id="${v.id}" style="width:18px; height:18px; accent-color: var(--primary); cursor:pointer;" onchange="this.closest('tr').classList.toggle('selected', this.checked); const anyChecked = document.querySelectorAll('.proveedor-checkbox:checked').length > 0; const btnEl = document.getElementById('btnEliminarSel'); if(btnEl) btnEl.style.display = anyChecked ? 'inline-flex' : 'none'; const btnG = document.getElementById('btnGenerarGuia'); if(btnG) btnG.style.display = anyChecked ? 'inline-flex' : 'none'; const btnE = document.getElementById('btnEnviarProveedor'); if(btnE) btnE.style.display = (anyChecked && window._isMonosStore) ? 'inline-flex' : 'none';"></td>
            <td data-label="Img"><img src="${v.foto}" class="img-mini" onclick="previewImg(this.src)"></td>
            <td data-label="Prenda"><strong>${v.producto}</strong><br><small>${v.talla} • ${v.fecha ? v.fecha.split('-').reverse().join('/') : ''}</small>${obsAlertHtml}</td>
            <td data-label="Cliente"><strong>${v.cliente}</strong> <small>(${v.cedula || 'S/N'})</small><br><small>${formatPhoneWhatsApp(v.telefono, v.cliente)} - ${v.email ? `<a href="javascript:void(0)" onclick="openEmailModal('${v.email.replace(/'/g, "\\'")}', '${(v.cliente || '').replace(/'/g, "\\'")}', '${v.id}')" style="color:var(--primary); font-weight:700; text-decoration:underline; cursor:pointer;" title="Enviar correo a cliente"><i data-lucide="mail" style="width:12px; height:12px; display:inline; vertical-align:middle; margin-right:2px;"></i>${v.email}</a>` : '-'}</small><br><small>${v.plataforma || '-'} • ${v.ciudad}, ${v.pais || '-'}</small><br><small style="color:var(--text-muted); font-style:italic; display:inline-flex; align-items:center; gap:3px;"><i data-lucide="map-pin" class="lucide-sm"></i> ${v.direccion || 'Sin dirección'}</small><br><small style="color:var(--primary); font-weight:800; display:inline-flex; align-items:center; gap:3px;"><i data-lucide="package" class="lucide-sm"></i> Envío: ${v.envio || 'Por defecto'}</small>${v.guia ? `<br><button type="button" onclick="abrirModalRastreo('${escapeAttr(v.guia)}', '${escapeAttr(v.cliente || '')}', '${escapeAttr(v.telefono || '')}', '${escapeAttr(v.producto || '')}')" class="guia-tracking-pill" title="Rastrear paquete en 1 clic"><i data-lucide="truck" class="lucide-sm"></i> Guía: <strong>${v.guia}</strong> <span style="font-size:10px; opacity:0.85; margin-left:3px;">(Rastrear ↗)</span></button>` : ''}</td>
            <td data-label="Utilidad" style="color:var(--success); font-weight:700;">$${(v.valor - v.costo).toLocaleString()}</td>
            <td data-label="Estado">
                <select class="status-select st-${v.estado}" onchange="cambiarEstado('${v.id}', this.value)">
                    <option value="pendiente" ${v.estado === 'pendiente' ? 'selected' : ''}>Pendiente</option>
                    <option value="enviado" ${v.estado === 'enviado' ? 'selected' : ''}>Enviado</option>
                    <option value="entregado" ${v.estado === 'entregado' ? 'selected' : ''}>Entregado</option>
                    <option value="cambio" ${v.estado === 'cambio' ? 'selected' : ''}>Cambio</option>
                </select>
            </td>
            <td data-label="Acciones">
                <div style="display:flex; gap:5px;">
                    <button class="action-btn" onclick="prepararEdicion('${v.id}')" title="Editar"><i data-lucide="pencil" class="lucide-sm"></i></button>
                    <button class="action-btn btn-delete" onclick="eliminarVenta('${v.id}')" title="Eliminar"><i data-lucide="trash-2" class="lucide-sm"></i></button>
                </div>
            </td>
        </tr>
        `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();

    const getUniqueOrdersCount = (list) => {
        const uniqueKeys = new Set();
        list.forEach(v => {
            const clientKey = v.cliente ? v.cliente.toLowerCase().trim() : "";
            const dateKey = v.fecha || "";
            uniqueKeys.add(`${clientKey}_${dateKey}`);
        });
        return uniqueKeys.size;
    };
    const countTopEl = document.getElementById('countTop');
    const countTopHeaderEl = document.getElementById('countTopHeader');
    const count = (q === "") ? getUniqueOrdersCount(dbVentas) : getUniqueOrdersCount(filtrados);
    if (countTopEl) countTopEl.innerText = count;
    if (countTopHeaderEl) countTopHeaderEl.innerText = count;

    // REVISAR ALERTAS DE REDENCIÓN (LEALTAD DE 10 PEDIDOS)
    const loyaltyMap = {};
    dbVentas.forEach(v => {
        if (!v.cliente) return;
        const k = v.cliente.toLowerCase().trim();
        const key = v.cedula ? `${k}_${v.cedula}` : k;
        if (!loyaltyMap[key]) loyaltyMap[key] = { n: v.cliente, dates: new Set() };
        if (v.fecha) loyaltyMap[key].dates.add(v.fecha);
    });

    const redemptionClients = Object.values(loyaltyMap).filter(c => c.dates.size >= 10);
    const alertBanner = document.getElementById('redemptionAlertBanner');
    if (alertBanner) {
        if (redemptionClients.length > 0) {
            const namesList = redemptionClients.map(c => `<strong>${c.n}</strong> (${c.dates.size} pedidos)`).join(', ');
            alertBanner.innerHTML = `
                <div class="redemption-banner">
                    <div style="display:flex; align-items:center; gap:10px; font-size:13px; color:var(--text-main);">
                        <i data-lucide="gift" style="color:#f59e0b; width:24px; height:24px; flex-shrink:0;"></i>
                        <div>
                            <span style="font-weight:800; color:#f59e0b; text-transform:uppercase;">¡Meta de Redención Alcanzada!</span><br>
                            Los siguientes clientes han alcanzado o superado 10 pedidos: ${namesList}.
                        </div>
                    </div>
                    <button class="btn btn-primary" style="width:auto; padding:6px 14px; font-size:11px; margin:0;" onclick="switchTab('clientes')">
                        <i data-lucide="award" class="lucide-sm"></i> Ver Clientes
                    </button>
                </div>
            `;
            alertBanner.style.display = 'block';
        } else {
            alertBanner.style.display = 'none';
        }
    }

    // DATALISTS
    const prodU = [...new Set(dbVentas.map(v => v.producto).filter(Boolean))].sort();
    const ciuU = [...new Set(dbVentas.map(v => v.ciudad).filter(Boolean))].sort();
    const paisU = [...new Set(dbVentas.map(v => v.pais).filter(Boolean))].sort();
    const cliU = [...new Set(dbVentas.map(v => v.cliente).filter(Boolean))].sort();

    const datalistProd = document.getElementById('listaProd');
    if (datalistProd) datalistProd.innerHTML = prodU.map(p => `<option value="${p}">`).join('');

    const datalistCiu = document.getElementById('listaCiudades');
    if (datalistCiu) datalistCiu.innerHTML = ciuU.map(c => `<option value="${c}">`).join('');

    const datalistPais = document.getElementById('listaPaises');
    if (datalistPais) datalistPais.innerHTML = paisU.map(p => `<option value="${p}">`).join('');

    const datalistCli = document.getElementById('listaClientes');
    if (datalistCli) datalistCli.innerHTML = cliU.map(c => `<option value="${c}">`).join('');

    const prendaFilter = document.getElementById('prendaFilter');
    if (prendaFilter) prendaFilter.innerHTML = '<option value="">Filtrar prenda...</option>' + prodU.map(p => `<option value="${p}">${p}</option>`).join('');

    const baseDataSet = filtrados.length ? filtrados : dbVentas;
    const cityOrderKeys = new Set();
    const counts = { p: {}, t: {}, c: {} };

    baseDataSet.forEach(v => {
        if (v.producto) counts.p[v.producto] = (counts.p[v.producto] || 0) + 1;
        if (v.talla) counts.t[v.talla] = (counts.t[v.talla] || 0) + 1;

        if (v.ciudad) {
            const clientKey = v.cliente ? v.cliente.toLowerCase().trim() : "";
            const dateKey = v.fecha || "";
            const cityKey = `${v.ciudad.toLowerCase().trim()}_${clientKey}_${dateKey}`;
            if (!cityOrderKeys.has(cityKey)) {
                cityOrderKeys.add(cityKey);
                counts.c[v.ciudad] = (counts.c[v.ciudad] || 0) + 1;
            }
        }
    });

    const getTopKey = (o) => {
        const keys = Object.keys(o);
        if (!keys.length) return "-";
        return keys.reduce((a, b) => o[a] >= o[b] ? a : b);
    };

    const topPEl = document.getElementById('topP');
    const topTEl = document.getElementById('topT');
    const topCEl = document.getElementById('topC');

    if (topPEl) topPEl.innerText = getTopKey(counts.p);

    // Calcular Ganancia del Mes Actual en dbVentas
    const hoyMes = new Date();
    const curMes = hoyMes.getMonth();
    const curAno = hoyMes.getFullYear();
    let gananciaMesActual = 0;

    dbVentas.forEach(v => {
        if (!v.fecha) return;
        const fV = new Date(v.fecha + "T00:00:00");
        if (!isNaN(fV.getTime()) && fV.getMonth() === curMes && fV.getFullYear() === curAno) {
            gananciaMesActual += ((parseFloat(v.valor) || 0) - (parseFloat(v.costo) || 0));
        }
    });

    if (topTEl) {
        topTEl.innerText = formatCOP(gananciaMesActual);
        topTEl.style.color = gananciaMesActual >= 0 ? '#10b981' : '#fb7185';
    }

    if (topCEl) topCEl.innerText = getTopKey(counts.c);
}

async function eliminarVenta(id) {
    if (confirm("¿Eliminar este registro permanentemente?")) {
        await fetch('/api/ventas/' + id, { method: 'DELETE' });
        cargarDatos();
    }
}

async function cambiarEstado(id, n) {
    const v = dbVentas.find(x => String(x.id) === String(id));
    if (v) {
        v.estado = n;
        await fetch('/api/ventas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) });
        cargarDatos();
    }
}

async function eliminarSeleccionados() {
    const checks = document.querySelectorAll('.proveedor-checkbox:checked');
    if (checks.length === 0) return showToast('Selecciona al menos un registro para eliminar');
    if (!confirm(`¿Eliminar ${checks.length} registro(s) seleccionado(s)? Esta acción no se puede deshacer.`)) return;

    const ids = Array.from(checks).map(c => c.dataset.id);
    let eliminados = 0;
    for (const id of ids) {
        try {
            await fetch('/api/ventas/' + id, { method: 'DELETE' });
            eliminados++;
        } catch (e) { }
    }
    await cargarDatos();
    showToast(`${eliminados} registro(s) eliminado(s) correctamente`);
}

// --- EGRESOS ---
function renderEgresos() {
    const tbodyEgresos = document.getElementById('tbodyEgresos');
    if (!tbodyEgresos) return;
    const sorted = [...dbEgresos].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    const totalEgresos = dbEgresos.reduce((sum, e) => sum + (parseFloat(e.monto) || 0), 0);
    const badgeEl = document.getElementById('totalEgresosBadge');
    if (badgeEl) badgeEl.innerText = `$${totalEgresos.toLocaleString()}`;
    tbodyEgresos.innerHTML = sorted.map(e => `<tr class="data-row"><td data-label="Fecha"><small>${e.fecha}</small></td><td data-label="Categoría"><strong>${e.categoria}</strong></td><td data-label="Descripción"><small>${e.desc || '-'}</small></td><td data-label="Monto" style="color:var(--danger); font-weight:700;">$${e.monto.toLocaleString()}</td><td data-label="Acción"><button onclick="eliminarEgreso(${e.id})" style="border:none; background:none; cursor:pointer;">🗑️</button></td></tr>`).join('');
}

async function eliminarEgreso(id) {
    if (confirm("¿Eliminar egreso?")) {
        await fetch('/api/egresos/' + id, { method: 'DELETE' });
        cargarDatos();
    }
}

// --- REPORTES ---
function renderTemporalStats() {
    if (!dbVentas.length && !dbEgresos.length) return;
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const col = document.documentElement.getAttribute('data-theme') === 'dark' ? '#f8fafc' : '#0f172a';
    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();

    const anoFilterEl = document.getElementById('anoFilter');
    if (anoFilterEl) {
        const currentAnoVal = anoFilterEl.value;
        const anosDisponibles = [...new Set(dbVentas.map(v => {
            const f = new Date(v.fecha + "T00:00:00");
            return f.getFullYear();
        }).concat(dbEgresos.map(e => {
            const f = new Date(e.fecha + "T00:00:00");
            return f.getFullYear();
        })).filter(Boolean))].sort((a, b) => b - a);

        let anoHtml = '<option value="">📆 Todos los Años</option>';
        anosDisponibles.forEach(y => {
            anoHtml += `<option value="${y}" ${currentAnoVal == y ? 'selected' : ''}>${y}</option>`;
        });
        anoFilterEl.innerHTML = anoHtml;
    }

    const mesFilterEl = document.getElementById('mesFilter');
    const mesSelVal = mesFilterEl ? mesFilterEl.value : '';
    const mesSel = mesSelVal !== '' ? parseInt(mesSelVal) : hoy.getMonth();
    const anoSelVal = anoFilterEl ? anoFilterEl.value : '';

    const mesNombres = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    let mesLabel = mesNombres[mesSel];
    if (anoSelVal) mesLabel += ` ${anoSelVal}`;

    const prendaFilterEl = document.getElementById('prendaFilter');
    const pSel = prendaFilterEl ? prendaFilterEl.value : '';

    const platFilterEl = document.getElementById('plataformaFilter');
    const platSel = platFilterEl ? platFilterEl.value : '';

    const geoSel = document.getElementById('geoFilter') ? document.getElementById('geoFilter').value : 'ciudad';

    const geoTitleEl = document.getElementById('geoTitle');
    if (geoTitleEl) geoTitleEl.innerText = geoSel === 'pais' ? 'Países' : 'Ciudades';

    const s = { sV: 0, sG: 0, sE: 0, mV: 0, mG: 0, mE: 0, tV: 0, tG: 0, tE: 0 };
    const f = { sV: 0, sG: 0, mV: 0, mG: 0, tV: 0, tG: 0 };
    const plat = { sV: 0, sG: 0, mV: 0, mG: 0, tV: 0, tG: 0 };
    const geoMap = {};
    const geoProcessedOrders = new Set();

    dbVentas.forEach(v => {
        const fV = new Date(v.fecha + "T00:00:00");
        const gan = v.valor - v.costo;
        const diff = (hoy - fV) / 86400000;

        const matchesMonth = fV.getMonth() === mesSel;
        const matchesYear = !anoSelVal || fV.getFullYear() == anoSelVal;
        const isSelectedPeriod = matchesMonth && matchesYear;
        const isThisWeek = diff >= 0 && diff <= 7;

        s.tV += v.valor; s.tG += gan;

        const clientKey = v.cliente ? v.cliente.toLowerCase().trim() : "";
        const dateKey = v.fecha || "";
        const geoValue = (geoSel === 'pais' ? (v.pais || 'Otro') : (v.ciudad || 'Otra')).toUpperCase().trim();
        const orderGeoKey = `${geoSel}_${geoValue}_${clientKey}_${dateKey}`;

        if (!geoProcessedOrders.has(orderGeoKey)) {
            geoProcessedOrders.add(orderGeoKey);
            geoMap[geoValue] = (geoMap[geoValue] || 0) + 1;
        }

        if (isSelectedPeriod) { s.mV += v.valor; s.mG += gan; }
        if (isThisWeek) { s.sV += v.valor; s.sG += gan; }

        if (v.producto === pSel) {
            f.tV += v.valor; f.tG += gan;
            if (isSelectedPeriod) { f.mV += v.valor; f.mG += gan; }
            if (isThisWeek) { f.sV += v.valor; f.sG += gan; }
        }
        if (!platSel || v.plataforma === platSel) {
            plat.tV += v.valor; plat.tG += gan;
            if (isSelectedPeriod) { plat.mV += v.valor; plat.mG += gan; }
            if (isThisWeek) { plat.sV += v.valor; plat.sG += gan; }
        }
    });

    dbEgresos.forEach(e => {
        const fE = new Date(e.fecha + "T00:00:00");
        const diff = (hoy - fE) / 86400000;
        s.tE += e.monto;
        const matchesMonth = fE.getMonth() === mesSel;
        const matchesYear = !anoSelVal || fE.getFullYear() == anoSelVal;
        if (matchesMonth && matchesYear) s.mE += e.monto;
        if (diff >= 0 && diff <= 7) s.sE += e.monto;
    });

    const semDiv = document.getElementById('semDiv');
    const mesDiv = document.getElementById('mesDiv');
    const totDiv = document.getElementById('totDiv');

    const metricSel = document.getElementById('rendimientoMetricFilter') ? document.getElementById('rendimientoMetricFilter').value : 'ventas';
    const isUtilidad = metricSel === 'utilidad';

    // Descontar egresos de los totales tanto para Ventas Netas como Utilidad Neta
    const semVal = isUtilidad ? (s.sG - s.sE) : (s.sV - s.sE);
    const mesVal = isUtilidad ? (s.mG - s.mE) : (s.mV - s.mE);
    const totVal = isUtilidad ? (s.tG - s.tE) : (s.tV - s.tE);

    const formatVal = (val) => val < 0 ? `-$${Math.abs(val).toLocaleString()}` : `$${val.toLocaleString()}`;
    const subLabel = isUtilidad ? '<span style="font-size:9px; opacity:0.75; display:block;">(UTILIDAD NETA)</span>' : '<span style="font-size:9px; opacity:0.75; display:block;">(VENTAS NETAS)</span>';
    const valColor = isUtilidad ? '#10b981' : 'var(--text-main)';

    if (semDiv) semDiv.innerHTML = `7 DÍAS${subLabel}<span id="sSemV" style="font-weight:800; color:${valColor}; display:block;">${formatVal(semVal)}</span><small style="font-size:10px; color:var(--danger); font-weight:700;">Gastos: -$${s.sE.toLocaleString()}</small>`;
    if (mesDiv) mesDiv.innerHTML = `${mesLabel.toUpperCase()}${subLabel}<span id="sMesV" style="font-weight:800; color:${valColor}; display:block;">${formatVal(mesVal)}</span><small style="font-size:10px; color:var(--danger); font-weight:700;">Gastos: -$${s.mE.toLocaleString()}</small>`;
    if (totDiv) totDiv.innerHTML = `TOTAL${subLabel}<span id="sTotalV" style="font-weight:800; color:${valColor}; display:block;">${formatVal(totVal)}</span><small style="font-size:10px; color:var(--danger); font-weight:700;">Gastos: -$${s.tE.toLocaleString()}</small>`;

    const barLabels = ['7 Días', mesLabel, 'Total'];

    const genCanvas = document.getElementById('generalChart');
    if (genCanvas) {
        if (charts.general) charts.general.destroy();
        charts.general = new Chart(genCanvas, {
            type: 'bar',
            data: {
                labels: barLabels,
                datasets: [
                    { label: 'Ventas Netas', data: [(s.sV - s.sE), (s.mV - s.mE), (s.tV - s.tE)], backgroundColor: primaryColor },
                    { label: 'Utilidad Neta', data: [(s.sG - s.sE), (s.mG - s.mE), (s.tG - s.tE)], backgroundColor: '#10b981' },
                    { label: 'Egresos (Gastos)', data: [s.sE, s.mE, s.tE], backgroundColor: '#ef4444' }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: col },
                        onClick: (e, legendItem, legend) => {
                            Chart.defaults.plugins.legend.onClick(e, legendItem, legend);
                            const ci = legend.chart;
                            const vHidden = ci.getDatasetMeta(0).hidden;
                            const uHidden = ci.getDatasetMeta(1).hidden;
                            const rSelect = document.getElementById('rendimientoMetricFilter');
                            if (rSelect) {
                                if (vHidden && !uHidden && rSelect.value !== 'utilidad') {
                                    rSelect.value = 'utilidad';
                                    renderTemporalStats();
                                } else if (!vHidden && uHidden && rSelect.value !== 'ventas') {
                                    rSelect.value = 'ventas';
                                    renderTemporalStats();
                                }
                            }
                        }
                    }
                }
            }
        });
    }

    // ── Rendimiento y Egresos Mes a Mes ──────────────────────────────────
    const monthlyData = {};

    dbVentas.forEach(v => {
        const fV = new Date(v.fecha + "T00:00:00");
        if (anoSelVal && fV.getFullYear() != anoSelVal) return;
        const key = `${fV.getFullYear()}-${String(fV.getMonth()).padStart(2, '0')}`;
        if (!monthlyData[key]) {
            monthlyData[key] = { year: fV.getFullYear(), month: fV.getMonth(), ventas: 0, ganancia: 0, egresos: 0 };
        }
        monthlyData[key].ventas += v.valor;
        monthlyData[key].ganancia += (v.valor - v.costo);
    });

    dbEgresos.forEach(e => {
        const fE = new Date(e.fecha + "T00:00:00");
        if (anoSelVal && fE.getFullYear() != anoSelVal) return;
        const key = `${fE.getFullYear()}-${String(fE.getMonth()).padStart(2, '0')}`;
        if (!monthlyData[key]) {
            monthlyData[key] = { year: fE.getFullYear(), month: fE.getMonth(), ventas: 0, ganancia: 0, egresos: 0 };
        }
        monthlyData[key].egresos += e.monto;
    });

    const sortedKeys = Object.keys(monthlyData).sort();
    const monthlyLabels = [];
    const dsVentasBrutas = [];
    const dsEgresos = [];
    const dsUtilidadNeta = [];

    let totVentasB = 0, totEgresosG = 0, totVentasN = 0, totUtilidadN = 0;

    let rowsHtml = '';
    sortedKeys.forEach(k => {
        const item = monthlyData[k];
        const label = anoSelVal ? mesNombres[item.month] : `${mesNombres[item.month]} ${item.year}`;
        const vNetas = item.ventas - item.egresos;
        const uNeta = item.ganancia - item.egresos;

        monthlyLabels.push(label);
        dsVentasBrutas.push(item.ventas);
        dsEgresos.push(item.egresos);
        dsUtilidadNeta.push(uNeta);

        totVentasB += item.ventas;
        totEgresosG += item.egresos;
        totVentasN += vNetas;
        totUtilidadN += uNeta;

        rowsHtml += `<tr class="data-row">
            <td data-label="Mes"><strong>${label}</strong></td>
            <td data-label="Ventas Brutas">$${item.ventas.toLocaleString()}</td>
            <td data-label="Egresos Gastados" style="color:var(--danger); font-weight:700;">-$${item.egresos.toLocaleString()}</td>
            <td data-label="Ventas Netas" style="font-weight:700;">$${vNetas.toLocaleString()}</td>
            <td data-label="Utilidad Neta" style="color:#10b981; font-weight:700;">$${uNeta.toLocaleString()}</td>
        </tr>`;
    });

    const tbodyMonthly = document.getElementById('tbodyMonthlyRendimiento');
    if (tbodyMonthly) {
        tbodyMonthly.innerHTML = rowsHtml || '<tr><td colspan="5" style="text-align:center; opacity:0.6;">Sin registros para el período seleccionado</td></tr>';
    }

    const tfootMonthly = document.getElementById('tfootMonthlyRendimiento');
    if (tfootMonthly) {
        tfootMonthly.innerHTML = `<tr>
            <td>TOTALES</td>
            <td>$${totVentasB.toLocaleString()}</td>
            <td style="color:var(--danger);">-$${totEgresosG.toLocaleString()}</td>
            <td>$${totVentasN.toLocaleString()}</td>
            <td style="color:#10b981;">$${totUtilidadN.toLocaleString()}</td>
        </tr>`;
    }

    const badgeReporte = document.getElementById('badgeTotalEgresosReporte');
    if (badgeReporte) {
        badgeReporte.innerText = `Total Gastado: -$${totEgresosG.toLocaleString()}`;
    }

    const mChartCanvas = document.getElementById('monthlyEgresosChart');
    if (mChartCanvas) {
        if (charts.monthlyEgresos) charts.monthlyEgresos.destroy();
        charts.monthlyEgresos = new Chart(mChartCanvas, {
            type: 'bar',
            data: {
                labels: monthlyLabels,
                datasets: [
                    { label: 'Ventas Brutas', data: dsVentasBrutas, backgroundColor: primaryColor },
                    { label: 'Egresos (Gastos)', data: dsEgresos, backgroundColor: '#ef4444' },
                    { label: 'Utilidad Neta', data: dsUtilidadNeta, backgroundColor: '#10b981' }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: col } }
                }
            }
        });
    }

    const cityCanvas = document.getElementById('cityChart');
    if (cityCanvas) {
        if (charts.city) charts.city.destroy();
        const geoKeys = Object.keys(geoMap); const geoVals = Object.values(geoMap);
        charts.city = new Chart(cityCanvas, {
            type: 'doughnut',
            data: {
                labels: geoKeys,
                datasets: [{
                    label: geoSel === 'pais' ? 'Pedidos por País' : 'Pedidos por Ciudad',
                    data: geoVals,
                    backgroundColor: [primaryColor, '#10b981', '#f59e0b', '#f43f5e', '#a855f7', '#06b6d4', '#ec4899']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { color: col } },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                const label = context.label || '';
                                const value = context.raw || 0;
                                return ` ${label}: ${value} pedido(s)`;
                            }
                        }
                    }
                }
            }
        });
    }

    const prodCanvas = document.getElementById('productChart');
    if (prodCanvas) {
        if (charts.product) charts.product.destroy();
        charts.product = new Chart(prodCanvas, {
            type: 'bar',
            data: {
                labels: barLabels,
                datasets: [
                    { label: 'Venta Prenda', data: [f.sV, f.mV, f.tV], backgroundColor: '#f59e0b' },
                    { label: 'Utilidad Prenda', data: [f.sG, f.mG, f.tG], backgroundColor: '#10b981' }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: col } } } }
        });
    }

    const platCanvas = document.getElementById('plataformaChart');
    if (platCanvas) {
        if (charts.plataforma) charts.plataforma.destroy();
        charts.plataforma = new Chart(platCanvas, {
            type: 'bar',
            data: {
                labels: barLabels,
                datasets: [
                    { label: 'Venta por Plataforma', data: [plat.sV, plat.mV, plat.tV], backgroundColor: '#f43f5e' },
                    { label: 'Utilidad por Plataforma', data: [plat.sG, plat.mG, plat.tG], backgroundColor: primaryColor }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: col } } } }
        });
    }
}

// --- INITIALIZATION & EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    initBranding();
    cargarDatos();
    initInactivityTimeout(30); // Cierre automático por inactividad a los 30 minutos
    applyTheme(localStorage.getItem('monos_theme') || 'light');
    if (window.lucide) window.lucide.createIcons();

    const themeBtn = document.getElementById('themeBtn');
    if (themeBtn) {
        themeBtn.onclick = () => applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    }
    const themeBtnDesktop = document.getElementById('themeBtnDesktop');
    if (themeBtnDesktop) {
        themeBtnDesktop.onclick = () => applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
    }

    // Venta Form Submit (V2)
    const ventaForm = document.getElementById('ventaForm');
    if (ventaForm) {
        ventaForm.onsubmit = handleVentaSubmit;
    }

    // Egreso Form Submit
    const egresoForm = document.getElementById('egresoForm');
    if (egresoForm) {
        egresoForm.onsubmit = async (e) => {
            e.preventDefault();
            const data = {
                id: Date.now(),
                categoria: document.getElementById('egresoCat').value,
                monto: parseFloat(document.getElementById('egresoMonto').value),
                fecha: document.getElementById('egresoFecha').value,
                desc: document.getElementById('egresoDesc').value
            };
            await fetch('/api/egresos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            document.getElementById('egresoForm').reset();
            cargarDatos();
            showToast("Egreso registrado");
        };
    }

    // Calendar Form Submit
    const calendarForm = document.getElementById('calendarForm');
    if (calendarForm) {
        calendarForm.onsubmit = async (e) => {
            e.preventDefault();
            const id = document.getElementById('calPostId').value;
            const selectedDays = Array.from(document.getElementById('calDay').selectedOptions).map(o => parseInt(o.value));

            if (selectedDays.length === 0) return showToast("Selecciona al menos un día");

            const data = {
                id: id || "p" + Date.now(),
                title: document.getElementById('calTitle').value,
                platform: document.getElementById('calPlatform').value,
                type: document.getElementById('calType').value,
                days: selectedDays,
                month: calState.viewMonth,
                year: calState.viewYear,
                views: parseInt(document.getElementById('calViews').value) || 0,
                likes: parseInt(document.getElementById('calLikes').value) || 0,
                comments: parseInt(document.getElementById('calComments').value) || 0
            };

            await fetch('/api/posts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            closeCalendarModal();
            cargarDatos();
            showToast("Calendario guardado");
        };
    }

    // Auto-fill client details
    const clienteInput = document.getElementById('cliente');
    if (clienteInput) {
        clienteInput.addEventListener('input', function () {
            const nombre = this.value.trim().toLowerCase();
            if (!nombre) return;
            const clienteExistente = dbVentas.find(v => v.cliente && v.cliente.toLowerCase() === nombre);
            if (clienteExistente && !editingId) {
                ['pais', 'ciudad', 'cedula', 'telefono', 'email', 'direccion'].forEach(campo => {
                    const el = document.getElementById(campo);
                    if (el && clienteExistente[campo] && !el.value) {
                        el.value = clienteExistente[campo];
                    }
                });
            }
        });
        // Inactivity Auto-Logout (15 minutos)
        const INACTIVITY_LIMIT = 15 * 60 * 1000; // 15 minutos en milisegundos
        let inactivityTimer = null;

        function resetInactivityTimer() {
            if (inactivityTimer) clearTimeout(inactivityTimer);
            inactivityTimer = setTimeout(() => {
                showToast('Sesión cerrada por inactividad');
                setTimeout(async () => {
                    try {
                        await fetch('/api/logout', { method: 'POST' });
                    } catch (e) { }
                    window.location.href = '/login';
                }, 1000);
            }, INACTIVITY_LIMIT);
        }

        ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart', 'click'].forEach(evt => {
            document.addEventListener(evt, resetInactivityTimer, { passive: true });
        });
        resetInactivityTimer();
    }
});

// --- GESTOR DE CORREOS ELECTRONICOS CON PLANTILLAS HTML Y TOKENS ---
let _emailCurrentVenta = null;
let _emailTemplatesData = null;

async function loadEmailTemplates() {
    try {
        const res = await fetch('/api/email/templates');
        if (res.ok) {
            _emailTemplatesData = await res.json();
        }
    } catch (e) {
        console.error('Error cargando plantillas de correo:', e);
    }
}

async function openEmailModal(email, clienteName, ventaId) {
    const modal = document.getElementById('modalEmailManager');
    if (!modal) return;

    const ventaPrincipal = dbVentas.find(v => String(v.id) === String(ventaId)) || {
        cliente: clienteName,
        email: email,
        producto: 'Producto',
        talla: '',
        guia: 'S/N',
        ciudad: 'Colombia',
        telefono: ''
    };

    // Recopilar todos los ítems del mismo pedido (mismo cliente + misma fecha)
    const clientKey = (ventaPrincipal.cliente || '').toLowerCase().trim();
    const dateKey = ventaPrincipal.fecha || '';
    const pedidoItems = dbVentas.filter(v => {
        const vKey = (v.cliente || '').toLowerCase().trim();
        const vDate = v.fecha || '';
        return vKey === clientKey && vDate === dateKey;
    });

    // Agregar la lista de ítems a la venta principal para uso en tokens
    _emailCurrentVenta = Object.assign({}, ventaPrincipal, {
        items: pedidoItems.length > 0 ? pedidoItems : [ventaPrincipal]
    });

    document.getElementById('emailRecipientInput').value = email || _emailCurrentVenta.email || '';

    // Alias por defecto MONOS INC
    document.getElementById('emailSenderAliasInput').value = `MONOS INC <ventas@monosincorp.com>`;
    document.getElementById('emailStatusMsg').textContent = '';

    if (!_emailTemplatesData) {
        await loadEmailTemplates();
    }

    // Cargar plantilla empacado por defecto
    selectEmailStateTemplate('empacado');
    switchEmailTab('edit');

    modal.style.display = 'flex';
    if (window.lucide) window.lucide.createIcons();
}

function closeEmailModal(e) {
    if (e && e.target && e.target.id !== 'modalEmailManager' && !e.target.classList.contains('calendar-modal-mask')) {
        // llamado directo
    }
    const modal = document.getElementById('modalEmailManager');
    if (modal) modal.style.display = 'none';
}

function selectEmailStateTemplate(stateKey) {
    if (!_emailTemplatesData || !_emailTemplatesData.defaults) return;

    const tmpl = _emailTemplatesData.defaults[stateKey];
    if (!tmpl) return;

    const venta = _emailCurrentVenta || {};
    const subjectProcessed = replaceEmailTokens(tmpl.subject, venta);
    const htmlProcessed = replaceEmailTokens(tmpl.html, venta);

    document.getElementById('emailSubjectInput').value = subjectProcessed;
    document.getElementById('emailHtmlBodyInput').value = htmlProcessed;

    renderEmailPreview();
}

function replaceEmailTokens(text, venta) {
    if (!text) return '';

    const store = window.userStore || 'monos';
    const storeTitle = store.toUpperCase();

    // Logotipo según tienda
    let logoPath = '/Logo.png';
    if (store === 'redkat') logoPath = '/logo_vinilos.png';
    else if (store === 'flores') logoPath = '/logo_flores.png';
    else if (store === 'tenis') logoPath = '/logo_tenis.png';
    else if (store === 'vetpet') logoPath = '/logo_vetpet.svg';

    const origin = window.location.origin || '';
    const logoFullUrl = origin + logoPath;
    const logoImgHtml = `<img src="${logoFullUrl}" alt="${storeTitle}" style="max-height:55px; max-width:180px; object-fit:contain; margin:0 auto; display:block;" />`;

    // Banner publicitario personalizable que redirige a monosincorp.com
    const bannerPath = '/banner_email.svg';
    const bannerFullUrl = origin + bannerPath;
    const bannerImgHtml = `<img src="${bannerFullUrl}" alt="MONOS INC - Tienda Oficial" style="width:100%; max-width:550px; border-radius:12px; border:1px solid #cbd5e1; display:block; margin:0 auto; box-shadow:0 4px 14px rgba(0,0,0,0.06);" />`;

    // Lista de productos/tallas del pedido (multi-ítem)
    const items = venta.items && venta.items.length > 0 ? venta.items : [venta];
    const productosListaHtml = `<ol style="margin:8px 0 0 0; padding-left:20px; font-size:14px; color:#475569; line-height:2;">
${items.map((item, i) => `        <li><strong>${item.producto || 'Producto'}</strong>${item.talla ? ` — <span style="color:#0284c7; font-weight:700;">${item.talla}</span>` : ''}</li>`).join('\n')}
    </ol>`;

    // Texto plano de producto(s) para asunto / párrafo introductorio
    const productosTexto = items.map(item => `${item.producto || 'Producto'}${item.talla ? ` (${item.talla})` : ''}`).join(', ');

    // Número de WhatsApp configurado (573009523534)
    const targetPhone = '573009523534';
    const waText = encodeURIComponent('Hola, Quisiera consultar sobre mi envio');
    const waUrl = `https://wa.me/${targetPhone}?text=${waText}`;

    const waSvgIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle; display:inline-block;"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;

    const waButtonHtml = `<a href="${waUrl}" target="_blank" style="display:inline-flex; align-items:center; gap:8px; background:#25d366; color:#ffffff; padding:12px 22px; border-radius:30px; font-weight:800; text-decoration:none; font-size:14px; box-shadow:0 4px 12px rgba(37,211,102,0.3);">
        ${waSvgIcon} Chatear por WhatsApp
    </a>`;

    return text
        .replace(/\{logo_img\}/g, logoImgHtml)
        .replace(/\{banner_img\}/g, bannerImgHtml)
        .replace(/\{productos_lista\}/g, productosListaHtml)
        .replace(/\{cliente\}/g, venta.cliente || 'Cliente')
        .replace(/\{telefono\}/g, venta.telefono || 'Sin registrar')
        .replace(/\{direccion\}/g, venta.direccion || 'Sin registrar')
        .replace(/\{producto\}/g, productosTexto)
        .replace(/\{guia\}/g, venta.guia || 'Sin Guía')
        .replace(/\{estado\}/g, venta.estado || 'Pendiente')
        .replace(/\{ciudad\}/g, venta.ciudad || 'Ciudad')
        .replace(/\{tienda\}/g, storeTitle)
        .replace(/\{whatsapp_link\}/g, waButtonHtml);
}

function switchEmailTab(tab) {
    const editContent = document.getElementById('emailEditorTabContent');
    const previewContent = document.getElementById('emailPreviewTabContent');
    const btnEdit = document.getElementById('btnTabEditHtml');
    const btnPreview = document.getElementById('btnTabPreviewHtml');

    if (tab === 'edit') {
        editContent.style.display = 'block';
        previewContent.style.display = 'none';
        btnEdit.className = 'btn btn-sm btn-primary';
        btnPreview.className = 'btn btn-sm btn-outline';
    } else {
        renderEmailPreview();
        editContent.style.display = 'none';
        previewContent.style.display = 'block';
        btnEdit.className = 'btn btn-sm btn-outline';
        btnPreview.className = 'btn btn-sm btn-primary';
    }
}

function renderEmailPreview() {
    const htmlInput = document.getElementById('emailHtmlBodyInput');
    const previewBox = document.getElementById('emailPreviewTabContent');
    if (htmlInput && previewBox) {
        previewBox.innerHTML = htmlInput.value;
    }
}

async function submitSendEmailForm(e) {
    e.preventDefault();

    const statusMsg = document.getElementById('emailStatusMsg');
    const submitBtn = document.getElementById('btnSubmitEmail');

    const to = document.getElementById('emailRecipientInput').value.trim();
    const alias = document.getElementById('emailSenderAliasInput').value.trim();
    const subject = document.getElementById('emailSubjectInput').value.trim();
    const html = document.getElementById('emailHtmlBodyInput').value.trim();

    if (!to || !html) {
        if (statusMsg) {
            statusMsg.style.color = '#ef4444';
            statusMsg.textContent = '❌ Por favor ingresa correo de destino y contenido.';
        }
        return;
    }

    try {
        if (submitBtn) submitBtn.disabled = true;
        if (statusMsg) {
            statusMsg.style.color = 'var(--primary)';
            statusMsg.textContent = '⏳ Enviando correo electrónico...';
        }

        const payload = {
            to,
            alias,
            subject,
            html,
            ventaId: _emailCurrentVenta ? _emailCurrentVenta.id : null
        };

        const res = await fetch('/api/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (res.ok && data.success) {
            if (statusMsg) {
                if (data.isSimulated) {
                    statusMsg.style.color = '#f59e0b';
                    statusMsg.innerHTML = `⚠️ ${data.message} ${data.previewUrl ? `<br><a href="${data.previewUrl}" target="_blank" style="color:#3b82f6; text-decoration:underline;">Ver correo simulado aquí</a>` : ''}`;
                } else {
                    statusMsg.style.color = '#10b981';
                    statusMsg.textContent = `✅ ${data.message}`;
                    showToast(`Correo enviado a ${to}`);
                    setTimeout(() => {
                        closeEmailModal();
                    }, 2200);
                }
            }
        } else {
            throw new Error(data.error || 'Error enviando correo');
        }
    } catch (err) {
        if (statusMsg) {
            statusMsg.style.color = '#ef4444';
            statusMsg.textContent = `❌ ${err.message}`;
        }
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

// --- CONFIGURACIÓN DE SERVIDOR SMTP REAL ---
let _currentSmtpProvider = 'custom';

function selectSmtpProvider(provider) {
    _currentSmtpProvider = provider;
    const hostInput = document.getElementById('smtpHostInput');
    const portInput = document.getElementById('smtpPortInput');
    const secureInput = document.getElementById('smtpSecureInput');
    const hintBox = document.getElementById('smtpProviderHint');
    const helpText = document.getElementById('smtpPassHelpText');

    document.querySelectorAll('.btn-smtp-provider').forEach(btn => {
        btn.style.background = 'transparent';
        btn.style.boxShadow = 'none';
    });

    if (provider === 'outlook') {
        if (hostInput) hostInput.value = 'smtp.office365.com';
        if (portInput) portInput.value = '587';
        if (secureInput) secureInput.value = 'false';

        const btnOutlook = document.getElementById('btnPresetOutlook');
        if (btnOutlook) btnOutlook.style.background = 'rgba(0, 120, 212, 0.2)';

        if (hintBox) {
            hintBox.style.display = 'block';
            hintBox.innerHTML = `<strong>Configuración Outlook / Office 365:</strong><br>Servidor: <code>smtp.office365.com</code> | Puerto: <code>587 (STARTTLS)</code><br>Ingresa tu cuenta (@outlook.com, @hotmail.com o corporativa Microsoft) y tu contraseña de inicio de sesión.`;
        }
        if (helpText) {
            helpText.innerHTML = 'Usa la <strong>contraseña de tu cuenta Outlook</strong>. Si tienes verificación en 2 pasos activada, usa una Contraseña de Aplicación.';
        }
    } else if (provider === 'gmail') {
        if (hostInput) hostInput.value = 'smtp.gmail.com';
        if (portInput) portInput.value = '587';
        if (secureInput) secureInput.value = 'false';

        const btnGmail = document.getElementById('btnPresetGmail');
        if (btnGmail) btnGmail.style.background = 'rgba(234, 67, 53, 0.2)';

        if (hintBox) {
            hintBox.style.display = 'block';
            hintBox.innerHTML = `<strong>Configuración Gmail:</strong><br>Servidor: <code>smtp.gmail.com</code> | Puerto: <code>587 (STARTTLS)</code><br>Requiere usar una Contraseña de Aplicación de 16 caracteres de Google.`;
        }
        if (helpText) {
            helpText.innerHTML = 'En Gmail debes usar una <strong>Contraseña de Aplicación de 16 caracteres</strong> generada en tu cuenta de Google.';
        }
    } else {
        const btnCustom = document.getElementById('btnPresetCustom');
        if (btnCustom) btnCustom.style.background = 'rgba(255, 255, 255, 0.1)';

        if (hintBox) hintBox.style.display = 'none';
        if (helpText) {
            helpText.innerHTML = 'Ingresa la contraseña de tu cuenta de correo o servidor SMTP.';
        }
    }
}

async function openSmtpConfigModal() {
    const modal = document.getElementById('modalSmtpConfig');
    if (!modal) return;

    let providerToSelect = 'custom';

    try {
        const res = await fetch('/api/email/config');
        if (res.ok) {
            const cfg = await res.json();
            const host = cfg.host || '';
            document.getElementById('smtpHostInput').value = host;
            document.getElementById('smtpPortInput').value = cfg.port || '587';
            document.getElementById('smtpSecureInput').value = cfg.secure ? 'true' : 'false';
            document.getElementById('smtpUserInput').value = cfg.user || '';
            document.getElementById('smtpPassInput').placeholder = cfg.hasPass ? '•••••••••••• (Guardada)' : 'Contraseña de correo';

            if (cfg.provider) {
                providerToSelect = cfg.provider;
            } else if (host.includes('office365') || host.includes('outlook')) {
                providerToSelect = 'outlook';
            } else if (host.includes('gmail')) {
                providerToSelect = 'gmail';
            }
        }
    } catch (e) {
        console.error('Error cargando configuracion SMTP:', e);
    }

    selectSmtpProvider(providerToSelect);
    document.getElementById('smtpStatusMsg').textContent = '';
    modal.style.display = 'flex';
    if (window.lucide) window.lucide.createIcons();
}

function closeSmtpConfigModal(e) {
    if (e && e.target && e.target.id !== 'modalSmtpConfig' && !e.target.classList.contains('calendar-modal-mask')) {
        // llamado directo
    }
    const modal = document.getElementById('modalSmtpConfig');
    if (modal) modal.style.display = 'none';
}

async function submitSmtpConfigForm(e) {
    e.preventDefault();
    const statusMsg = document.getElementById('smtpStatusMsg');
    const submitBtn = document.getElementById('btnSaveSmtp');

    const host = document.getElementById('smtpHostInput').value.trim();
    const port = document.getElementById('smtpPortInput').value.trim();
    const secure = document.getElementById('smtpSecureInput').value === 'true';
    const user = document.getElementById('smtpUserInput').value.trim();
    const pass = document.getElementById('smtpPassInput').value.trim();

    try {
        if (submitBtn) submitBtn.disabled = true;
        if (statusMsg) {
            statusMsg.style.color = 'var(--primary)';
            statusMsg.textContent = '⏳ Guardando configuración SMTP...';
        }

        const payload = { provider: _currentSmtpProvider, host, port, secure, user, pass };
        const res = await fetch('/api/email/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (res.ok && data.success) {
            if (statusMsg) {
                statusMsg.style.color = '#10b981';
                statusMsg.textContent = `✅ ${data.message}`;
            }
            showToast('Configuración SMTP actualizada');
            setTimeout(() => {
                closeSmtpConfigModal();
            }, 1500);
        } else {
            throw new Error(data.error || 'No se pudo guardar la configuración SMTP');
        }
    } catch (err) {
        if (statusMsg) {
            statusMsg.style.color = '#ef4444';
            statusMsg.textContent = `❌ ${err.message}`;
        }
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

// --- CIERRE DE SESIÓN POR INACTIVIDAD (30 MINUTOS) ---
function initInactivityTimeout(minutes = 30) {
    const timeoutMs = minutes * 60 * 1000;
    let inactivityTimer = null;

    function resetTimer() {
        clearTimeout(inactivityTimer);
        localStorage.setItem('monos_last_active', Date.now().toString());
        inactivityTimer = setTimeout(triggerLogout, timeoutMs);
    }

    function triggerLogout() {
        const lastActive = parseInt(localStorage.getItem('monos_last_active') || '0', 10);
        const elapsed = Date.now() - lastActive;

        // Si el usuario tuvo actividad en otra pestaña, extender el tiempo
        if (elapsed < timeoutMs) {
            inactivityTimer = setTimeout(triggerLogout, timeoutMs - elapsed);
            return;
        }

        // Mostrar aviso antes de salir
        showToast("🔒 Sesión expirada por inactividad");
        setTimeout(() => {
            window.location.href = '/logout?reason=inactivity';
        }, 1200);
    }

    // Escuchar eventos de interacción humana
    let lastThrottledTime = 0;
    const userEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];

    function handleActivity() {
        const now = Date.now();
        // Throttle a cada 15 segundos para no sobrecargar el navegador
        if (now - lastThrottledTime > 15000) {
            lastThrottledTime = now;
            resetTimer();
        }
    }

    userEvents.forEach(evt => {
        window.addEventListener(evt, handleActivity, { passive: true });
    });

    // Iniciar temporizador base
    resetTimer();

    // Sincronizar actividad si el usuario tiene varias pestañas abiertas
    window.addEventListener('storage', (e) => {
        if (e.key === 'monos_last_active') {
            clearTimeout(inactivityTimer);
            const elapsed = Date.now() - parseInt(e.newValue || '0', 10);
            const remaining = Math.max(1000, timeoutMs - elapsed);
            inactivityTimer = setTimeout(triggerLogout, remaining);
        }
    });
}

// ==========================================
// RASTREO DE GUÍAS DE ENVÍO EN 1 CLIC (COLOMBIA)
// ==========================================
let _currentRastreo = { guia: '', cliente: '', telefono: '', producto: '' };

function abrirModalRastreo(guia, cliente, telefono, producto) {
    _currentRastreo = {
        guia: String(guia || '').trim(),
        cliente: String(cliente || '').trim(),
        telefono: String(telefono || '').trim(),
        producto: String(producto || '').trim()
    };

    const modal = document.getElementById('modalRastreoGuia');
    const guiaEl = document.getElementById('modalRastreoGuiaNum');
    const cliEl = document.getElementById('modalRastreoCliente');
    const prodEl = document.getElementById('modalRastreoProducto');

    if (guiaEl) guiaEl.textContent = _currentRastreo.guia || '-';
    if (cliEl) cliEl.textContent = _currentRastreo.cliente || 'Cliente';
    if (prodEl) prodEl.textContent = _currentRastreo.producto || 'Pedido';

    if (modal) {
        modal.style.display = 'flex';
        if (window.lucide) window.lucide.createIcons();
    }
}

function cerrarModalRastreo() {
    const modal = document.getElementById('modalRastreoGuia');
    if (modal) modal.style.display = 'none';
}

function copiarGuiaModal() {
    const g = _currentRastreo.guia;
    if (!g) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(g).then(() => {
            showToast('📋 Guía copiada: ' + g);
        }).catch(() => {
            prompt('Copia el número de guía:', g);
        });
    } else {
        prompt('Copia el número de guía:', g);
    }
}

function abrirRastreoWeb(carrier) {
    const g = (_currentRastreo.guia || '').trim();
    if (!g) {
        showToast('⚠️ No hay número de guía disponible');
        return;
    }

    // Copiar al portapapeles automáticamente por comodidad
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(g).catch(() => {});
    }

    let url = '';
    const enc = encodeURIComponent(g);

    switch (carrier) {
        case 'interrapidisimo':
            url = `https://www.interrapidisimo.com/sigue-tu-envio/?guia=${enc}`;
            break;
        case 'servientrega':
            url = `https://www.servientrega.com/wps/portal/rastreo-envio`;
            break;
        case 'coordinadora':
            url = `https://www.coordinadora.com/portafolio-de-servicios/servicios-en-linea/rastrear-guias/?guia=${enc}`;
            break;
        case 'envia':
            url = `https://envia.co/`;
            break;
        case 'tcc':
            url = `https://tcc.com.co/rastreo/?guia=${enc}`;
            break;
        case 'google':
        default:
            url = `https://www.google.com/search?q=rastreo+guia+${enc}`;
            break;
    }

    showToast(`🔍 Abriendo rastreo para guía ${g}...`);
    window.open(url, '_blank', 'noopener,noreferrer');
}

function enviarGuiaWhatsAppModal() {
    const g = _currentRastreo.guia;
    const cli = _currentRastreo.cliente;
    const tel = _currentRastreo.telefono;
    const prod = _currentRastreo.producto;

    if (!g) {
        showToast('⚠️ No hay número de guía');
        return;
    }

    let phoneClean = String(tel || '').replace(/\D/g, '');
    if (phoneClean.length === 10 && phoneClean.startsWith('3')) {
        phoneClean = '57' + phoneClean;
    }

    const saludo = cli ? `Hola ${cli}! 👋` : `Hola! 👋`;
    const detalleProd = prod ? ` de tu pedido (${prod})` : ` de tu pedido`;
    const mensaje = `${saludo} Te escribimos de Monos para confirmarte que tu paquete ya va en camino 📦\n\nNúmero de Guía: ${g}\n\nPuedes consultar el estado del envío con la transportadora. ¡Quedamos atentos a cualquier duda!`;

    if (phoneClean) {
        const waUrl = `https://wa.me/${phoneClean}?text=${encodeURIComponent(mensaje)}`;
        window.open(waUrl, '_blank', 'noopener,noreferrer');
    } else {
        // Si no hay teléfono registrado, copiar el mensaje para que el usuario lo pegue donde quiera
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(mensaje).then(() => {
                showToast('💬 Sin teléfono registrado. Mensaje copiado al portapapeles.');
            });
        } else {
            prompt('Sin teléfono registrado. Copia el mensaje:', mensaje);
        }
    }
}
