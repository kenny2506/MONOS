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
function showToast(m) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerText = m;
    container.appendChild(t);
    setTimeout(() => t.remove(), 2500);
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

// --- DYNAMIC GARMENTS FORM MANAGEMENT ---
function initGarmentsForm() {
    const container = document.getElementById('garmentsContainer');
    if (container) {
        container.innerHTML = '';
        createGarmentBlock();
    }
    const addBtn = document.getElementById('btnAddGarment');
    if (addBtn) addBtn.style.display = 'block';
}

function updateGarmentHeaders() {
    const container = document.getElementById('garmentsContainer');
    if (!container) return;
    const blocks = container.querySelectorAll('.garment-block');
    blocks.forEach((block, index) => {
        const headerText = block.querySelector('strong');
        if (headerText) {
            headerText.innerText = `Prenda / Producto #${index + 1}`;
        }
        const removeBtn = block.querySelector('.btn-remove-garment');
        if (removeBtn) {
            removeBtn.style.display = blocks.length === 1 ? 'none' : 'block';
        }
    });
}

function createGarmentBlock(garmentData = null) {
    const container = document.getElementById('garmentsContainer');
    if (!container) return;
    const blockIndex = container.children.length + 1;

    const block = document.createElement('div');
    block.className = 'garment-block';
    block.style.border = '1px solid var(--border)';
    block.style.borderRadius = '12px';
    block.style.padding = '15px';
    block.style.marginBottom = '15px';
    block.style.background = 'var(--bg)';

    const isVinilos = sessionInfo.store === 'vinilos' || sessionInfo.store === 'redkat';
    const isFlores = sessionInfo.store === 'flores';
    const isTenis = sessionInfo.store === 'tenis';

    let tallaLabel = 'Talla *';
    if (isVinilos) tallaLabel = 'Formato *';
    else if (isFlores) tallaLabel = 'Tipo *';
    else if (isTenis) tallaLabel = 'Talla / N° *';

    const headerHtml = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <strong style="font-size: 12px; color: var(--primary);">Prenda / Producto #${blockIndex}</strong>
            <button type="button" class="btn-remove-garment" style="background: none; border: none; color: var(--danger); font-weight: 700; cursor: pointer; font-size: 11px;">⚠️ Quitar</button>
        </div>
    `;

    let optionsHtml = '';
    if (isVinilos) {
        optionsHtml = `
            <option value="Vinilo">Vinilo</option>
            <option value="CD">CD</option>
            <option value="Cassette">Cassette</option>
            <option value="Merch">Merch</option>
        `;
    } else if (isFlores) {
        optionsHtml = `
            <option value="Ramo">Ramo</option>
            <option value="Arreglo">Arreglo</option>
            <option value="Caja">Caja</option>
            <option value="Flor Suelta">Flor Suelta</option>
            <option value="Planta">Planta</option>
            <option value="Corona">Corona</option>
            <option value="Otro">Otro</option>
        `;
    } else if (isTenis) {
        optionsHtml = `
            <option value="35">35</option>
            <option value="36">36</option>
            <option value="37">37</option>
            <option value="38">38</option>
            <option value="39">39</option>
            <option value="40">40</option>
            <option value="41">41</option>
            <option value="42">42</option>
            <option value="43">43</option>
            <option value="44">44</option>
            <option value="Única">Única</option>
        `;
    } else {
        optionsHtml = `
            <option value="S">S</option>
            <option value="M">M</option>
            <option value="L">L</option>
            <option value="XL">XL</option>
            <option value="XXL">XXL</option>
            <option value="Única">Única</option>
            <option value="Bolso">Bolso</option>
            <option value="Accesorio">Accesorio</option>
            <option value="Maquillaje">Maquillaje</option>
        `;
    }

    block.innerHTML = `
        ${headerHtml}
        <div class="form-group" style="margin-bottom: 10px;">
            <label>Producto *</label>
            <input type="text" class="garment-producto" list="listaProd" required placeholder="Nombre..." value="${garmentData ? garmentData.producto : ''}">
        </div>
        <div class="form-row" style="margin-bottom: 10px;">
            <div class="form-group">
                <label>${tallaLabel}</label>
                <select class="garment-talla" required></select>
            </div>
            <div class="form-group">
                <label>Foto</label>
                <input type="file" class="garment-foto-file" accept="image/*" style="font-size: 11px;">
            </div>
        </div>
        <div class="form-row" style="margin-bottom: 10px;">
            <div class="form-group">
                <label>Costo *</label>
                <input type="number" class="garment-costo" required placeholder="$0" value="${garmentData ? garmentData.costo : ''}">
            </div>
            <div class="form-group">
                <label>Venta *</label>
                <input type="number" class="garment-venta" required placeholder="$0" value="${garmentData ? garmentData.valor : ''}">
            </div>
        </div>
        <div class="form-group" style="margin-top: 10px;">
            <label style="font-size: 11px; font-weight: 700; color: #f59e0b; display: flex; align-items: center; gap: 4px;">
                <i data-lucide="alert-circle" class="lucide-sm"></i> Observación / Nota Especial
            </label>
            <textarea class="garment-observacion" placeholder="Escribe alguna observación o nota especial sobre la venta (opcional)..." style="width: 100%; height: 60px; border: 1px solid var(--border); border-radius: 8px; padding: 8px; font-size: 12px; background: var(--card); color: var(--text); resize: vertical;">${garmentData && garmentData.observacion ? garmentData.observacion : ''}</textarea>
        </div>
    `;

    const tallaSelect = block.querySelector('.garment-talla');
    tallaSelect.innerHTML = optionsHtml;
    if (garmentData && garmentData.talla) {
        tallaSelect.value = garmentData.talla;
    }

    const fileInput = block.querySelector('.garment-foto-file');
    let blockFoto = garmentData ? garmentData.foto : null;

    if (fileInput) {
        fileInput.onchange = (e) => {
            if (e.target.files[0]) {
                const reader = new FileReader();
                reader.onload = async (ev) => {
                    const compressed = await compressImage(ev.target.result);
                    block.dataset.foto = compressed;
                };
                reader.readAsDataURL(e.target.files[0]);
            }
        };
    }

    if (blockFoto) {
        block.dataset.foto = blockFoto;
    }

    const removeBtn = block.querySelector('.btn-remove-garment');
    removeBtn.onclick = () => {
        block.remove();
        updateGarmentHeaders();
    };

    container.appendChild(block);
    updateGarmentHeaders();
}

function toggleVentaForm() {
    const body = document.getElementById('ventaCollapsible');
    body.classList.toggle('collapsed');
    if (window.innerWidth > 768) {
        const view = document.getElementById('view-ventas');
        if (body.classList.contains('collapsed')) {
            view.classList.add('aside-collapsed');
        } else {
            view.classList.remove('aside-collapsed');
        }
    }
}

function cancelarEdicion() {
    editingId = null;
    document.getElementById('ventaForm').reset();
    const btnSubmit = document.getElementById('btnSubmit');
    if (btnSubmit) btnSubmit.innerHTML = '<i data-lucide="check"></i> Registrar Venta';
    document.getElementById('btnCancelEdit').style.display = "none";
    // Resetear título del modal
    const modalTitle = document.querySelector('#modalNuevaVenta .calendar-modal-header h3');
    if (modalTitle) modalTitle.innerHTML = '<i data-lucide="file-plus-2" style="color:var(--primary);"></i> Registrar Nueva Venta';
    if (window.lucide) window.lucide.createIcons();
    // Cerrar el modal
    if (typeof _closeVentaModal === 'function') _closeVentaModal();
    initGarmentsForm();
}

function prepararEdicion(id) {
    editingId = id;
    const v = dbVentas.find(x => x.id === id);
    if (!v) return;
    const container = document.getElementById('garmentsContainer');
    if (container) {
        container.innerHTML = '';
        createGarmentBlock(v);
    }
    const addBtn = document.getElementById('btnAddGarment');
    if (addBtn) addBtn.style.display = 'none';

    const removeBtn = container ? container.querySelector('.btn-remove-garment') : null;
    if (removeBtn) removeBtn.style.display = 'none';

    ['pais', 'ciudad', 'plataforma', 'cliente', 'cedula', 'telefono', 'email', 'direccion', 'envio', 'guia', 'fecha'].forEach(k => {
        const el = document.getElementById(k);
        if (el) el.value = v[k] || "";
    });

    const btnSubmit = document.getElementById('btnSubmit');
    if (btnSubmit) btnSubmit.innerHTML = '<i data-lucide="save"></i> Actualizar Venta';
    document.getElementById('btnCancelEdit').style.display = "flex";

    // Actualizar título del modal a "Editar Venta"
    const modalTitle = document.querySelector('#modalNuevaVenta .calendar-modal-header h3');
    if (modalTitle) modalTitle.innerHTML = '<i data-lucide="pencil" style="color:var(--primary);"></i> Editar Venta';

    // Abrir el modal con los valores prellenados
    if (typeof openVentaModal === 'function') openVentaModal();
    if (window.lucide) window.lucide.createIcons();
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
            <td data-label="Cliente"><strong>${v.cliente}</strong> <small>(${v.cedula || 'S/N'})</small><br><small>${formatPhoneWhatsApp(v.telefono, v.cliente)} - ${v.email ? `<a href="javascript:void(0)" onclick="openEmailModal('${v.email.replace(/'/g, "\\'")}', '${(v.cliente || '').replace(/'/g, "\\'")}', ${v.id})" style="color:var(--primary); font-weight:700; text-decoration:underline; cursor:pointer;" title="Enviar correo a cliente"><i data-lucide="mail" style="width:12px; height:12px; display:inline; vertical-align:middle; margin-right:2px;"></i>${v.email}</a>` : '-'}</small><br><small>${v.plataforma || '-'} • ${v.ciudad}, ${v.pais || '-'}</small><br><small style="color:var(--text-muted); font-style:italic; display:inline-flex; align-items:center; gap:3px;"><i data-lucide="map-pin" class="lucide-sm"></i> ${v.direccion || 'Sin dirección'}</small><br><small style="color:var(--primary); font-weight:800; display:inline-flex; align-items:center; gap:3px;"><i data-lucide="package" class="lucide-sm"></i> Envío: ${v.envio || 'Por defecto'}</small>${v.guia ? `<br><small style="color:var(--success); font-weight:700; display:inline-flex; align-items:center; gap:3px;"><i data-lucide="truck" class="lucide-sm"></i> Guía: ${v.guia}</small>` : ''}</td>
            <td data-label="Utilidad" style="color:var(--success); font-weight:700;">$${(v.valor - v.costo).toLocaleString()}</td>
            <td data-label="Estado">
                <select class="status-select st-${v.estado}" onchange="cambiarEstado(${v.id}, this.value)">
                    <option value="pendiente" ${v.estado === 'pendiente' ? 'selected' : ''}>Pendiente</option>
                    <option value="enviado" ${v.estado === 'enviado' ? 'selected' : ''}>Enviado</option>
                    <option value="entregado" ${v.estado === 'entregado' ? 'selected' : ''}>Entregado</option>
                    <option value="cambio" ${v.estado === 'cambio' ? 'selected' : ''}>Cambio</option>
                </select>
            </td>
            <td data-label="Acciones">
                <div style="display:flex; gap:5px;">
                    <button class="action-btn" onclick="prepararEdicion(${v.id})" title="Editar"><i data-lucide="pencil" class="lucide-sm"></i></button>
                    <button class="action-btn btn-delete" onclick="eliminarVenta(${v.id})" title="Eliminar"><i data-lucide="trash-2" class="lucide-sm"></i></button>
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
    if (topTEl) topTEl.innerText = getTopKey(counts.t);
    if (topCEl) topCEl.innerText = getTopKey(counts.c);
}

async function eliminarVenta(id) {
    if (confirm("¿Eliminar este registro permanentemente?")) {
        await fetch('/api/ventas/' + id, { method: 'DELETE' });
        cargarDatos();
    }
}

async function cambiarEstado(id, n) {
    const v = dbVentas.find(x => x.id === id);
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

    // Venta Form Submit
    const ventaForm = document.getElementById('ventaForm');
    if (ventaForm) {
        ventaForm.onsubmit = async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('btnSubmit');
            const originalText = submitBtn.innerText;
            submitBtn.disabled = true;
            submitBtn.innerText = "Guardando...";

            try {
                const garmentBlocks = document.querySelectorAll('.garment-block');
                if (garmentBlocks.length === 0) {
                    showToast("Agrega al menos una prenda");
                    submitBtn.disabled = false;
                    submitBtn.innerText = originalText;
                    return;
                }

                const commonData = {
                    fecha: document.getElementById('fecha').value,
                    pais: document.getElementById('pais').value.trim(),
                    ciudad: document.getElementById('ciudad').value.trim(),
                    plataforma: document.getElementById('plataforma').value,
                    cliente: document.getElementById('cliente').value.trim(),
                    cedula: document.getElementById('cedula').value.trim(),
                    telefono: document.getElementById('telefono').value.trim(),
                    email: document.getElementById('email').value.trim(),
                    direccion: document.getElementById('direccion').value.trim(),
                    envio: document.getElementById('envio').value,
                    guia: document.getElementById('guia').value.trim()
                };

                const baseId = Date.now();
                let idx = 0;

                for (let block of garmentBlocks) {
                    const prodNombre = block.querySelector('.garment-producto').value.trim();
                    const blockFoto = block.dataset.foto || null;

                    let finalFoto = blockFoto;
                    if (!finalFoto) {
                        const existente = dbVentas.find(v => normalizar(v.producto) === normalizar(prodNombre) && v.foto && v.foto !== "https://via.placeholder.com/50");
                        if (existente) finalFoto = existente.foto;
                    }

                    const obsEl = block.querySelector('.garment-observacion');
                    const data = {
                        id: editingId && garmentBlocks.length === 1 ? editingId : (baseId + idx),
                        fecha: commonData.fecha,
                        producto: prodNombre,
                        talla: block.querySelector('.garment-talla').value,
                        observacion: obsEl ? obsEl.value.trim() : "",
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
                        costo: parseFloat(block.querySelector('.garment-costo').value) || 0,
                        valor: parseFloat(block.querySelector('.garment-venta').value) || 0,
                        foto: finalFoto || "https://via.placeholder.com/50",
                        estado: editingId && garmentBlocks.length === 1 ? dbVentas.find(x => x.id === editingId).estado : "pendiente"
                    };

                    await fetch('/api/ventas', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });

                    if (blockFoto) {
                        for (let v of dbVentas) {
                            if (v.id !== data.id && normalizar(v.producto) === normalizar(prodNombre) && v.foto !== blockFoto) {
                                v.foto = blockFoto;
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

                cancelarEdicion();
                await cargarDatos();
                showToast("¡Registro guardado y sincronizado!");
            } catch (err) {
                console.error("Error guardando venta:", err);
                showToast("Error al guardar registro");
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerText = originalText;
            }
        };
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
