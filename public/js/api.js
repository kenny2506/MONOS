// --- DB MOTOR CENTRALIZADO & API CALLS ---

async function cargarDatos() {
    try {
        const res = await fetch('/api/data');
        const data = await res.json();
        dbVentas = data.ventas || [];
        dbEgresos = data.egresos || [];
        calState.posts = data.posts || [];
        refrescar();
        renderEgresos();
        renderLealtad();
        renderCalendario();

        // Cargar URL de Forms desde el servidor al iniciar
        if (!_formsUrl) {
            try {
                const confRes = await fetch('/api/config/forms-url');
                const confData = await confRes.json();
                if (confData.success && confData.formsUrl) {
                    _formsUrl = confData.formsUrl;
                }
            } catch (e) { }
        }
        // Cargar URL de Webhook desde el servidor al iniciar
        if (!_webhookUrl) {
            try {
                const wRes = await fetch('/api/config/webhook-url');
                const wData = await wRes.json();
                if (wData.success && wData.webhookUrl) {
                    _webhookUrl = wData.webhookUrl;
                }
            } catch (e) { }
        }
    } catch (err) {
        console.error("Error cargando DB:", err);
        showToast("Error de conexión con el servidor");
    }
}

async function initBranding() {
    try {
        const res = await fetch('/api/session');
        if (res.redirected && res.url.includes('/login')) {
            window.location.href = '/login';
            return;
        }
        if (!res.ok) {
            window.location.href = '/login';
            return;
        }
        sessionInfo = await res.json();
        if (!sessionInfo || !sessionInfo.user) {
            window.location.href = '/login';
            return;
        }

        const isVinilos = sessionInfo.store === 'vinilos' || sessionInfo.store === 'redkat';
        const isFlores = sessionInfo.store === 'flores';
        const isTenis = sessionInfo.store === 'tenis';

        let title = 'Ventas Monos';
        let logo = '/Logo.png';
        let statTallaLabel = 'GANANCIAS';

        if (isVinilos) {
            title = 'Ventas RedKat';
            logo = '/logo_vinilos.png';
            document.documentElement.style.setProperty('--primary', '#ef4444');
            document.documentElement.style.setProperty('--primary-rgb', '239, 68, 68');
        } else if (isFlores) {
            title = 'Ventas Flores';
            logo = '/logo_flores.png';
            document.documentElement.style.setProperty('--primary', '#e11d48');
            document.documentElement.style.setProperty('--primary-rgb', '225, 29, 72');
        } else if (isTenis) {
            title = 'Ventas Tenis';
            logo = '/logo_tenis.png';
            document.documentElement.style.setProperty('--primary', '#0284c7');
            document.documentElement.style.setProperty('--primary-rgb', '2, 132, 199');
        }

        document.title = title;
        document.getElementById('headerTitle').innerText = title;
        document.getElementById('headerLogo').src = logo;

        const statLabelEl = document.getElementById('statTallaLabel');
        if (statLabelEl) statLabelEl.innerText = 'GANANCIAS';

        // Update favicon
        const favicon = document.querySelector('link[rel="icon"]');
        if (favicon) favicon.href = logo;

        // Hide Sincronizar ventas & Enviar a proveedor buttons for non-monos sessions
        const btnSinc = document.getElementById('btnSincronizarVentas');
        const isMonos = sessionInfo.store === 'monos';
        if (btnSinc) btnSinc.style.display = isMonos ? 'inline-flex' : 'none';
        // btnEnviarProveedor stays hidden until checkboxes are selected (controlled by checkbox onchange)
        // Store the monos flag globally so the checkbox handler can use it
        window._isMonosStore = isMonos;

        // Initialize dynamic garments form
        initGarmentsForm();
    } catch (err) {
        console.error("Error identifying session:", err);
    }
}

function exportarVentas() {
    let csv = "ID,Fecha,Producto,Talla,Ciudad,Cliente,Telefono,Costo,Venta,Observacion,Estado\n";
    dbVentas.forEach(v => csv += `${v.id},${v.fecha},${v.producto},${v.talla},${v.ciudad},${v.cliente},${v.telefono},${v.costo},${v.valor},"${(v.observacion || '').replace(/"/g, '""')}",${v.estado}\n`);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `backup_${sessionInfo.store}.csv`;
    a.click();
}

window._guiaGroups = [];
window._guiaCurrentIndex = 0;

function cerrarModalGuia(e) {
    if (!e || e.target === document.getElementById('modalGuiaMask')) {
        document.getElementById('modalGuiaMask').style.display = "none";
    }
}

function imprimirGuiaEtiquetas() {
    window.print();
}

function cambiarGuiaActual(dir) {
    if (!window._guiaGroups || window._guiaGroups.length === 0) return;
    let newIdx = window._guiaCurrentIndex + dir;
    if (newIdx < 0) newIdx = window._guiaGroups.length - 1;
    if (newIdx >= window._guiaGroups.length) newIdx = 0;

    mostrarGuiaPorIndice(newIdx);
}

function mostrarGuiaPorIndice(idx) {
    if (!window._guiaGroups || window._guiaGroups.length === 0) return;
    window._guiaCurrentIndex = idx;
    const g = window._guiaGroups[idx];
    const total = window._guiaGroups.length;

    // Actualizar Badge de navegación
    const navBadge = document.getElementById('guiaNavBadge');
    if (navBadge) {
        navBadge.textContent = `Guía ${idx + 1} de ${total}`;
    }

    const container = document.getElementById('guiaSingleCardContainer');
    if (!container || !g) return;

    const store = (sessionInfo && sessionInfo.store) || 'monos';
    const logoMap = {
        monos: '/Logo.png',
        vinilos: '/logo_vinilos.png',
        redkat: '/logo_vinilos.png',
        flores: '/logo_flores.png',
        tenis: '/logo_tenis.png',
        teniqs: '/logo_teniqs.png'
    };
    const logoPath = logoMap[store] || '/Logo.png';
    const storeLabel = store === 'monos' ? 'MONOS INC' : (store.toUpperCase() + ' INC');
    const remitenteDireccion = 'Cra 71C # 52-83 Apt 202';
    const remitenteCiudad = 'Bogotá';
    const remitenteTelefono = '3009523534';
    const barcodeCode = g.guia ? g.guia.trim() : `MONOS-${g.id}`;

    container.innerHTML = `
        <div class="etiqueta-envio-card">
            <div class="etiqueta-header">
                <div class="etiqueta-logo-box">
                    <img src="${logoPath}" alt="Logo" class="etiqueta-logo-img">
                </div>
                <div class="etiqueta-empresa-nombre">${storeLabel}</div>
            </div>
            <div class="etiqueta-body">
                <div class="etiqueta-grid">
                    <div class="etiqueta-cell cell-de">
                        <div class="cell-title">DE:</div>
                        <div class="cell-content">
                            <strong>${storeLabel}</strong><br>
                            ${remitenteDireccion}<br>
                            ${remitenteCiudad}<br>
                            Teléfono: ${remitenteTelefono}
                        </div>
                    </div>
                    <div class="etiqueta-cell cell-destinatario">
                        <div class="cell-title">DESTINATARIO:</div>
                        <div class="cell-content">
                            <strong>${g.cliente}</strong><br>
                            ${g.direccion || 'Sin dirección'}<br>
                            ${g.ciudad}${g.pais ? ', ' + g.pais : ''}<br>
                            Teléfono: ${g.telefono || 'Sin teléfono'}
                        </div>
                    </div>
                    <div class="etiqueta-cell cell-guia">
                        <div class="cell-title">Nº DE ARTÍCULO / GUÍA:</div>
                        <div class="cell-content">
                            <strong>${barcodeCode}</strong>
                        </div>
                    </div>
                    <div class="etiqueta-cell cell-prenda">
                        <div class="cell-title">PRENDA(S):</div>
                        <div class="cell-content">
                            <strong>${g.prendas.join(', ')}</strong>
                        </div>
                    </div>
                </div>
                <div class="etiqueta-barcode-container">
                    <svg id="barcode-single-svg" class="etiqueta-barcode-svg"></svg>
                </div>
                <div class="etiqueta-footer">
                    ${storeLabel}
                </div>
            </div>
        </div>`;

    setTimeout(() => {
        const rawCode = g.guia ? g.guia.trim() : `${g.id}`;
        if (window.JsBarcode) {
            try {
                JsBarcode('#barcode-single-svg', rawCode, {
                    format: "CODE128",
                    width: 2,
                    height: 50,
                    displayValue: true,
                    fontSize: 12,
                    font: "monospace",
                    margin: 4,
                    background: "#ffffff"
                });
            } catch (e) {
                console.warn("JsBarcode error:", e);
            }
        }
    }, 40);
}

async function abrirModalGuia() {
    const checks = document.querySelectorAll('.proveedor-checkbox:checked');
    if (checks.length === 0) {
        return showToast('Selecciona al menos una venta para generar la guía');
    }

    const store = (sessionInfo && sessionInfo.store) || 'monos';
    const logoMap = {
        monos: '/Logo.png',
        vinilos: '/logo_vinilos.png',
        redkat: '/logo_vinilos.png',
        flores: '/logo_flores.png',
        tenis: '/logo_tenis.png',
        teniqs: '/logo_teniqs.png'
    };
    const logoPath = logoMap[store] || '/Logo.png';
    const storeLabel = store === 'monos' ? 'MONOS INC' : (store.toUpperCase() + ' INC');
    const remitenteDireccion = 'Cra 71C # 52-83 Apt 202';
    const remitenteCiudad = 'Bogotá';
    const remitenteTelefono = '3009523534';

    // Agrupar ventas seleccionadas por cliente + direccion
    const clientGroups = {};
    checks.forEach(chk => {
        const v = dbVentas.find(x => x.id == chk.value);
        if (v) {
            const key = `${(v.cliente || '').trim().toLowerCase()}_${(v.direccion || '').trim().toLowerCase()}`;
            if (!clientGroups[key]) {
                clientGroups[key] = {
                    id: v.id,
                    cliente: v.cliente || 'Sin Nombre',
                    cedula: v.cedula || '',
                    telefono: v.telefono || '',
                    direccion: v.direccion || '',
                    ciudad: v.ciudad || '',
                    pais: v.pais || '',
                    guia: v.guia || '',
                    prendas: []
                };
            }
            clientGroups[key].prendas.push(`${v.producto || 'Producto'} (${v.talla || 'Única'})`);
            if (v.guia && !clientGroups[key].guia) {
                clientGroups[key].guia = v.guia;
            }
        }
    });

    const groups = Object.values(clientGroups);
    window._guiaGroups = groups;
    window._guiaCurrentIndex = 0;

    // Mostrar u ocultar controles de navegación según cantidad
    const navControls = document.getElementById('guiaNavControls');
    if (navControls) {
        navControls.style.display = groups.length > 1 ? 'flex' : 'none';
    }

    // Generar HTML para el contenedor de impresión (todas las guías)
    const printContainer = document.getElementById('guiaAllCardsPrintContainer');
    if (printContainer) {
        let printHtml = '';
        groups.forEach((g, idx) => {
            const barcodeCode = g.guia ? g.guia.trim() : `MONOS-${g.id}`;
            printHtml += `
            <div class="etiqueta-envio-card">
                <div class="etiqueta-header">
                    <div class="etiqueta-logo-box">
                        <img src="${logoPath}" alt="Logo" class="etiqueta-logo-img">
                    </div>
                    <div class="etiqueta-empresa-nombre">${storeLabel}</div>
                </div>
                <div class="etiqueta-body">
                    <div class="etiqueta-grid">
                        <div class="etiqueta-cell cell-de">
                            <div class="cell-title">DE:</div>
                            <div class="cell-content">
                                <strong>${storeLabel}</strong><br>
                                ${remitenteDireccion}<br>
                                ${remitenteCiudad}<br>
                                Teléfono: ${remitenteTelefono}
                            </div>
                        </div>
                        <div class="etiqueta-cell cell-destinatario">
                            <div class="cell-title">DESTINATARIO:</div>
                            <div class="cell-content">
                                <strong>${g.cliente}</strong><br>
                                ${g.direccion || 'Sin dirección'}<br>
                                ${g.ciudad}${g.pais ? ', ' + g.pais : ''}<br>
                                Teléfono: ${g.telefono || 'Sin teléfono'}
                            </div>
                        </div>
                        <div class="etiqueta-cell cell-guia">
                            <div class="cell-title">Nº DE ARTÍCULO / GUÍA:</div>
                            <div class="cell-content">
                                <strong>${barcodeCode}</strong>
                            </div>
                        </div>
                        <div class="etiqueta-cell cell-prenda">
                            <div class="cell-title">PRENDA(S):</div>
                            <div class="cell-content">
                                <strong>${g.prendas.join(', ')}</strong>
                            </div>
                        </div>
                    </div>
                    <div class="etiqueta-barcode-container">
                        <svg id="barcode-print-svg-${idx}" class="etiqueta-barcode-svg"></svg>
                    </div>
                    <div class="etiqueta-footer">
                        ${storeLabel}
                    </div>
                </div>
            </div>`;
        });
        printContainer.innerHTML = printHtml;
    }

    document.getElementById('modalGuiaMask').style.display = 'flex';

    // Mostrar la primera guía en pantalla
    mostrarGuiaPorIndice(0);

    // Generar códigos de barras para impresión
    setTimeout(() => {
        groups.forEach((g, idx) => {
            const barcodeCode = g.guia ? g.guia.trim() : `${g.id}`;
            if (window.JsBarcode) {
                try {
                    JsBarcode(`#barcode-print-svg-${idx}`, barcodeCode, {
                        format: "CODE128",
                        width: 2,
                        height: 50,
                        displayValue: true,
                        fontSize: 12,
                        font: "monospace",
                        margin: 4,
                        background: "#ffffff"
                    });
                } catch (e) {
                    console.warn("JsBarcode error:", e);
                }
            }
        });
    }, 50);
}

// Navegación con teclado (Flecha Izquierda / Derecha)
document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('modalGuiaMask');
    if (modal && modal.style.display === 'flex' && window._guiaGroups && window._guiaGroups.length > 1) {
        if (e.key === 'ArrowLeft') {
            cambiarGuiaActual(-1);
        } else if (e.key === 'ArrowRight') {
            cambiarGuiaActual(1);
        }
    }
});

async function generarGuiaExcel() {
    const checks = document.querySelectorAll('.proveedor-checkbox:checked');
    if (checks.length === 0) {
        return showToast('Selecciona al menos una venta para generar la guía');
    }

    // ── Verificar que ExcelJS esté cargado ────────────────────────────────────
    if (typeof ExcelJS === 'undefined') {
        return showToast('Error: librería Excel no cargada. Recarga la página.');
    }

    const store = (sessionInfo && sessionInfo.store) || 'monos';
    const logoMap = {
        monos: '/Logo.png',
        vinilos: '/logo_vinilos.png',
        redkat: '/logo_vinilos.png',
        flores: '/logo_flores.png',
        tenis: '/logo_tenis.png',
        teniqs: '/logo_teniqs.png'
    };
    const logoPath = logoMap[store] || '/Logo.png';
    const storeLabel = (sessionInfo && sessionInfo.store || 'VENTAS').toUpperCase();

    showToast('Generando Excel...');

    // ── Obtener logo como ArrayBuffer ─────────────────────────────────────────
    let logoBuffer = null;
    let logoExt = 'png';
    try {
        const imgRes = await fetch(logoPath);
        if (imgRes.ok) {
            const blob = await imgRes.blob();
            logoExt = blob.type.includes('png') ? 'png' : 'jpeg';
            logoBuffer = await blob.arrayBuffer();
        }
    } catch (e) {
        console.warn('No se pudo cargar el logo:', e);
    }

    // ── Agrupar ventas seleccionadas por cliente ───────────────────────────────
    const clientGroups = {};
    checks.forEach(chk => {
        const v = dbVentas.find(x => x.id == chk.value);
        if (v) {
            const key = `${(v.cliente || '').trim().toLowerCase()}_${(v.direccion || '').trim().toLowerCase()}`;
            if (!clientGroups[key]) {
                clientGroups[key] = {
                    cliente: v.cliente || 'Sin Nombre',
                    cedula: v.cedula || '',
                    telefono: v.telefono || '',
                    email: v.email || '',
                    direccion: v.direccion || '',
                    ciudad: v.ciudad || '',
                    pais: v.pais || '',
                    envio: v.envio || '',
                    guia: v.guia || '',
                    plataforma: v.plataforma || '',
                    prendas: [],
                    observaciones: []
                };
            }
            clientGroups[key].prendas.push(`${v.producto || 'Producto'} (${v.talla || 'Única'})`);
            if (v.observacion && v.observacion.trim()) {
                clientGroups[key].observaciones.push(v.observacion.trim());
            }
            if (v.guia && !clientGroups[key].guia) {
                clientGroups[key].guia = v.guia;
            }
        }
    });

    const groups = Object.values(clientGroups);
    const dateStr = new Date().toISOString().slice(0, 10);
    const fechaLabel = new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });

    // ── Crear workbook ExcelJS ────────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    wb.creator = storeLabel;
    wb.created = new Date();

    const ws = wb.addWorksheet('Guías de Envío', {
        pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 }
    });

    // Columnas con anchos
    ws.columns = [
        { key: 'num', width: 5 },
        { key: 'cliente', width: 28 },
        { key: 'cedula', width: 14 },
        { key: 'tel', width: 16 },
        { key: 'email', width: 26 },
        { key: 'dir', width: 36 },
        { key: 'ciudad', width: 20 },
        { key: 'envio', width: 16 },
        { key: 'guia', width: 22 },
        { key: 'prenda', width: 34 },
        { key: 'obs', width: 26 },
    ];

    const COLS = 11;  // A–K
    const lastCol = String.fromCharCode(64 + COLS); // 'K'

    // ── Bloque de logo: filas 1-4 ─────────────────────────────────────────────
    const LOGO_ROWS = 4;
    for (let r = 1; r <= LOGO_ROWS; r++) {
        ws.getRow(r).height = 18;
        ws.mergeCells(`A${r}:B${r}`);
    }

    // Insertar imagen si está disponible
    if (logoBuffer) {
        const imgId = wb.addImage({ buffer: logoBuffer, extension: logoExt });
        ws.addImage(imgId, {
            tl: { col: 0, row: 0 },
            ext: { width: 160, height: 72 }
        });
    }

    // ── Fila de título (fila LOGO_ROWS+1) ─────────────────────────────────────
    const titleRowNum = LOGO_ROWS + 1;
    ws.mergeCells(`A${titleRowNum}:${lastCol}${titleRowNum}`);
    const titleRow = ws.getRow(titleRowNum);
    titleRow.height = 28;
    const titleCell = ws.getCell(`A${titleRowNum}`);
    titleCell.value = `GUÍA DE ENVÍOS — ${storeLabel}`;
    titleCell.font = { name: 'Calibri', bold: true, size: 18, color: { argb: 'FFFFFFFF' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };

    // ── Fila de fecha / total envíos ──────────────────────────────────────────
    const subRowNum = LOGO_ROWS + 2;
    ws.mergeCells(`A${subRowNum}:${lastCol}${subRowNum}`);
    const subRow = ws.getRow(subRowNum);
    subRow.height = 18;
    const subCell = ws.getCell(`A${subRowNum}`);
    subCell.value = `Fecha: ${fechaLabel}   ·   Total envíos: ${groups.length}`;
    subCell.font = { name: 'Calibri', italic: true, size: 11, color: { argb: 'FFFFFFFF' } };
    subCell.alignment = { horizontal: 'center', vertical: 'middle' };
    subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };

    // ── Fila vacía separadora ─────────────────────────────────────────────────
    const sepRowNum = LOGO_ROWS + 3;
    ws.getRow(sepRowNum).height = 6;

    // ── Fila de encabezados ───────────────────────────────────────────────────
    const headerRowNum = LOGO_ROWS + 4;
    const headerLabels = ['#', 'Nombre del Cliente', 'Cédula', 'Teléfono', 'Email', 'Dirección', 'Ciudad / País', 'Envío', 'Guía / Plataforma', 'Productos', 'Observaciones'];
    const headerRow = ws.getRow(headerRowNum);
    headerRow.height = 22;
    headerLabels.forEach((label, ci) => {
        const cell = headerRow.getCell(ci + 1);
        cell.value = label;
        cell.font = { name: 'Calibri', bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = {
            top: { style: 'thin', color: { argb: 'FF334155' } },
            bottom: { style: 'thin', color: { argb: 'FF334155' } },
            left: { style: 'thin', color: { argb: 'FF334155' } },
            right: { style: 'thin', color: { argb: 'FF334155' } }
        };
    });

    // ── Filas de datos ────────────────────────────────────────────────────────
    const borderStyle = { style: 'thin', color: { argb: 'FFE2E8F0' } };
    const cellBorder = { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle };

    groups.forEach((g, i) => {
        const rowNum = headerRowNum + 1 + i;
        const dataRow = ws.getRow(rowNum);
        dataRow.height = 45;

        const rowBg = i % 2 === 0
            ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAFA' } }
            : { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

        const values = [
            i + 1,
            g.cliente,
            g.cedula,
            g.telefono,
            g.email,
            g.direccion,
            `${g.ciudad}${g.pais ? ' / ' + g.pais : ''}`,
            g.envio,
            `${g.guia || '-'}${g.plataforma ? '\n(' + g.plataforma + ')' : ''}`,
            g.prendas.join('\n'),
            g.observaciones.join(' / ') || '-'
        ];

        values.forEach((val, ci) => {
            const cell = dataRow.getCell(ci + 1);
            cell.value = val;
            cell.font = { name: 'Calibri', size: 10 };
            cell.alignment = { vertical: 'middle', wrapText: true, horizontal: ci === 0 ? 'center' : 'left' };
            cell.fill = rowBg;
            cell.border = cellBorder;
        });
    });

    // ── Descargar ─────────────────────────────────────────────────────────────
    const cleanName = (name) => (name || 'cli').trim().replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ]/g, '_').replace(/_+/g, '_');
    const clients = groups.map(g => g.cliente);
    let fileName = '';
    if (clients.length === 1) {
        fileName = `guia_${cleanName(clients[0])}_${dateStr}.xlsx`;
    } else if (clients.length === 2) {
        fileName = `guias_${cleanName(clients[0])}_y_${cleanName(clients[1])}_${dateStr}.xlsx`;
    } else {
        fileName = `guias_${cleanName(clients[0])}_y_${clients.length - 1}_mas_${dateStr}.xlsx`;
    }

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    showToast('¡Guía Excel generada y descargada! 📊');
}

async function enviarProveedor(evt) {
    const checks = document.querySelectorAll('.proveedor-checkbox:checked');
    if (checks.length === 0) return showToast('Selecciona al menos una prenda');

    const storeKey = 'google_sheets_webhook_url_' + (sessionInfo.store || 'monos');
    let sheetUrl = _webhookUrl || localStorage.getItem(storeKey) || localStorage.getItem('google_sheets_webhook_url') || '';

    const isEditRequested = evt && (evt.shiftKey || evt.ctrlKey || evt.type === 'contextmenu');
    if (evt && isEditRequested) evt.preventDefault();

    if (!sheetUrl || isEditRequested) {
        const nuevaUrl = prompt('Ingresa la URL del Webhook de Google Apps Script:', sheetUrl || '');
        if (nuevaUrl) {
            sheetUrl = nuevaUrl.trim();
            _webhookUrl = sheetUrl;
            localStorage.setItem(storeKey, sheetUrl);
            localStorage.setItem('google_sheets_webhook_url', sheetUrl);
            try {
                await fetch('/api/config/webhook-url', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ webhookUrl: sheetUrl })
                });
            } catch (e) { }
        } else if (!sheetUrl) {
            return;
        }
    }

    const itemsPayload = [];
    const clientGroups = {};

    checks.forEach(chk => {
        const v = dbVentas.find(x => x.id == chk.value);
        if (v) {
            const clientKey = (v.cliente || 'Sin nombre').trim().toLowerCase();
            if (!clientGroups[clientKey]) {
                clientGroups[clientKey] = {
                    cliente: v.cliente || 'Sin nombre',
                    telefono: v.telefono || 'N/A',
                    direccion: v.direccion || 'N/A',
                    ciudad: v.ciudad || 'N/A',
                    envio: v.envio || 'Pago',
                    guia: v.guia || '',
                    prendas: [],
                    fotos: [],
                    observaciones: []
                };
            }
            let labelTalla = 'Talla';
            if (sessionInfo.store === 'vinilos' || sessionInfo.store === 'redkat') labelTalla = 'Formato';
            else if (sessionInfo.store === 'flores') labelTalla = 'Tipo';
            else if (sessionInfo.store === 'tenis') labelTalla = 'Talla / N°';

            clientGroups[clientKey].prendas.push(`${v.producto || 'Sin producto'} (${labelTalla}: ${v.talla || 'N/A'})`);

            if (v.foto && v.foto !== 'https://via.placeholder.com/50' && v.foto.trim() !== '') {
                clientGroups[clientKey].fotos.push(v.foto.trim());
            }

            if (v.observacion && v.observacion.trim()) {
                clientGroups[clientKey].observaciones.push(v.observacion.trim());
            }
        }
    });

    Object.values(clientGroups).forEach(group => {
        let rawEnvio = (group.envio || 'Pago').toString().trim().toLowerCase();
        let envioFormatted = rawEnvio.includes('contra') || rawEnvio.includes('entrega')
            ? 'Envio Contraentrega'
            : 'Envio Pago';

        const commaFotos = group.fotos.join(', ');
        const newlineFotos = group.fotos.join('\n');
        const obsJoined = group.observaciones.join(" / ");

        itemsPayload.push({
            prendaTalla: group.prendas.join("\n+ "),
            nombre: group.cliente,
            telefono: group.telefono,
            direccion: group.direccion,
            ciudad: group.ciudad,
            envio: envioFormatted,
            guia: group.guia,
            foto: commaFotos || group.fotos[0] || '',
            imagen: commaFotos || group.fotos[0] || '',
            imagenUrl: commaFotos || group.fotos[0] || '',
            fotoLines: newlineFotos,
            fotos: group.fotos,
            fotoArray: group.fotos,
            todasLasFotos: newlineFotos,
            foto1: group.fotos[0] || '',
            foto2: group.fotos[1] || '',
            foto3: group.fotos[2] || '',
            foto4: group.fotos[3] || '',
            foto5: group.fotos[4] || '',
            observacion: obsJoined
        });
    });

    try {
        showToast('Enviando a Google Sheets...');

        const resp = await fetch('/api/enviar-proveedor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: itemsPayload, sheetUrl: sheetUrl })
        });

        if (resp.status === 401 || resp.redirected) {
            showToast('Sesión expirada. Por favor vuelve a iniciar sesión.');
            return;
        }

        const resData = await resp.json();
        if (resp.ok && resData.success) {
            showToast('¡Petición enviada a Google Sheets correctamente!');
        } else {
            showToast('Error de envío: ' + (resData.error || 'No se pudo procesar la petición'));
        }
    } catch (err) {
        console.error('Error enviando a Google Sheets:', err);
        showToast('Error de red al conectar con el servidor');
    }
}

async function sincronizarGoogleForms(evt) {
    let csvUrl = _formsUrl;

    if (!csvUrl) {
        const storeKey = 'google_forms_csv_url_' + (sessionInfo.store || 'monos');
        csvUrl = localStorage.getItem(storeKey) || localStorage.getItem('google_forms_csv_url') || '';
    }

    const isEditRequested = evt && (evt.shiftKey || evt.ctrlKey || evt.type === 'contextmenu');
    if (evt && isEditRequested) evt.preventDefault();

    if (!csvUrl || isEditRequested) {
        const nuevaUrl = prompt('Ingresa la URL del enlace de Google Sheets publicado como CSV:\n(Archivo -> Compartir -> Publicar en la web -> CSV)', csvUrl || '');
        if (nuevaUrl) {
            csvUrl = nuevaUrl.trim();
            _formsUrl = csvUrl;
            const storeKey = 'google_forms_csv_url_' + (sessionInfo.store || 'monos');
            localStorage.setItem(storeKey, csvUrl);
            localStorage.setItem('google_forms_csv_url', csvUrl);

            try {
                await fetch('/api/config/forms-url', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ formsUrl: csvUrl })
                });
            } catch (eServer) { }
        } else if (!csvUrl) {
            return;
        }
    }

    try {
        showToast('Descargando respuestas de Google Forms...');
        const res = await fetch(csvUrl);
        if (!res.ok) throw new Error('No se pudo descargar el CSV');
        const text = await res.text();

        const parseCSV = (str) => {
            const arr = [];
            let quote = false;
            let row = [''];
            for (let c of str) {
                if (c === '"') {
                    quote = !quote;
                } else if (c === ',' && !quote) {
                    row.push('');
                } else if ((c === '\r' || c === '\n') && !quote) {
                    if (c === '\n') {
                        arr.push(row);
                        row = [''];
                    }
                } else {
                    row[row.length - 1] += c;
                }
            }
            if (row.length > 1 || row[0] !== '') arr.push(row);
            return arr;
        };

        const rows = parseCSV(text);
        if (rows.length < 2) return showToast('El archivo CSV no contiene registros');

        const headers = rows[0].map(h => h.trim().toUpperCase());

        const getIdx = (keys) => headers.findIndex(h => keys.some(k => h.includes(k)));

        const idxTimestamp = getIdx(['MARCA TEMPORAL', 'FECHA', 'TIMESTAMP']);
        const idxCliente = getIdx(['NOMBRE COMPLETO', 'NOMBRE', 'CLIENTE']);
        const idxTelefono = getIdx(['TELEFONO', 'TELÉFONO', 'CELULAR']);
        const idxDireccion = getIdx(['DIRECCION', 'DIRECCIÓN']);
        const idxPais = getIdx(['PAIS', 'PAÍS']);
        const idxCiudad = getIdx(['CIUDAD', 'MUNICIPIO']);
        const idxEmail = getIdx(['EMAIL', 'CORREO']);
        const idxCedula = getIdx(['CEDULA', 'CÉDULA', 'IDENTIFICACION']);
        const idxPrenda = getIdx(['PRENDA', 'PRODUCTO', 'MAQUILLAJE']);
        const idxTalla = getIdx(['TALLA', 'FORMATO']);
        const idxEnvio = getIdx(['ENVIO', 'ENVÍO', 'METODO DE ENVIO']);
        const idxPlataforma = getIdx(['DONDE REALIZASTE LA COMPRA', '¿DÓNDE REALIZASTE LA COMPRA?', 'DÓNDE REALIZASTE LA COMPRA', 'PLATAFORMA', 'COMPRA']);

        const getIdxExact = (keys) => headers.findIndex(h => keys.some(k => h === k.trim().toUpperCase()));

        const prendaIdxs = [
            { prenda: idxPrenda, talla: idxTalla },
            { prenda: getIdxExact(['PRENDA 2', 'PRODUCTO 2', 'MAQUILLAJE 2']), talla: getIdxExact(['TALLA 2', 'FORMATO 2']) },
            { prenda: getIdxExact(['PRENDA 3', 'PRODUCTO 3', 'MAQUILLAJE 3']), talla: getIdxExact(['TALLA 3', 'FORMATO 3']) },
            { prenda: getIdxExact(['PRENDA 4', 'PRODUCTO 4', 'MAQUILLAJE 4']), talla: getIdxExact(['TALLA 4', 'FORMATO 4']) },
            { prenda: getIdxExact(['PRENDA 5', 'PRODUCTO 5', 'MAQUILLAJE 5']), talla: getIdxExact(['TALLA 5', 'FORMATO 5']) },
        ];

        const homologarEnvio = (raw) => {
            if (!raw) return 'Pago';
            const norm = normalizar(raw.trim());
            if (norm.includes('contra') || norm.includes('entrega')) return 'Contraentrega';
            return 'Pago';
        };

        const homologarPlataforma = (raw) => {
            if (!raw) return 'Página Web';
            const norm = normalizar(raw.trim());
            if (norm.includes('insta') || norm.includes('ig')) return 'Instagram';
            if (norm.includes('whats') || norm.includes('wpp') || norm.includes('wa')) return 'Whatsapp';
            if (norm.includes('tik') || norm.includes('tok')) return 'Tiktok';
            if (norm.includes('web') || norm.includes('pag') || norm.includes('sitio')) return 'Página Web';
            const str = raw.trim();
            return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
        };

        const parseFecha = (raw) => {
            if (!raw) return new Date().toISOString().split('T')[0];
            const partes = raw.trim().split(/[\s,]+/)[0];
            const separador = partes.includes('/') ? '/' : '-';
            const trozos = partes.split(separador);
            if (trozos.length === 3) {
                if (trozos[0].length === 4) return `${trozos[0]}-${trozos[1].padStart(2, '0')}-${trozos[2].padStart(2, '0')}`;
                if (trozos[2].length === 4) return `${trozos[2]}-${trozos[1].padStart(2, '0')}-${trozos[0].padStart(2, '0')}`;
            }
            return new Date().toISOString().split('T')[0];
        };

        let creados = 0;

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0 || !row[0]) continue;

            const clienteVal = (idxCliente !== -1 && row[idxCliente]) ? row[idxCliente].trim() : 'Cliente Form';
            const telefonoVal = (idxTelefono !== -1 && row[idxTelefono]) ? row[idxTelefono].trim() : '';
            const fechaVal = parseFecha((idxTimestamp !== -1 && row[idxTimestamp]) ? row[idxTimestamp] : '');

            const prendasDeFila = [];

            // 1. Verificar pares de Prenda / Talla tradicionales o de Producto
            prendaIdxs.forEach(({ prenda: pIdx, talla: tIdx }) => {
                if (pIdx !== -1 && row[pIdx] && row[pIdx].trim()) {
                    const headerName = headers[pIdx] || '';
                    if (headerName.includes('DESEAS') || headerName.includes('OTRO')) return;

                    const isMakeupHeader = headerName.includes('MAQUILLAJE');
                    const prodName = row[pIdx].trim();
                    let tallaVal = 'Única';

                    if (isMakeupHeader) {
                        tallaVal = 'Maquillaje';
                    } else if (tIdx !== -1 && row[tIdx] && row[tIdx].trim()) {
                        tallaVal = row[tIdx].trim();
                    } else if (sessionInfo.store === 'flores') {
                        tallaVal = 'Maquillaje';
                    }

                    prendasDeFila.push({
                        producto: prodName,
                        talla: tallaVal
                    });
                }
            });

            // 2. Verificar específicamente cualquier otra columna de MAQUILLAJE (1 a 5) que no haya sido mapeada arriba
            headers.forEach((h, colIdx) => {
                if (h.includes('MAQUILLAJE') && !h.includes('DESEAS') && !h.includes('OTRO') && row[colIdx] && row[colIdx].trim()) {
                    const prodName = row[colIdx].trim();
                    // Evitar duplicados si ya se capturó mediante prendaIdxs
                    const yaRegistrado = prendasDeFila.some(p => p.producto === prodName);
                    if (!yaRegistrado) {
                        prendasDeFila.push({
                            producto: prodName,
                            talla: 'Maquillaje'
                        });
                    }
                }
            });

            if (prendasDeFila.length === 0) continue;

            for (const { producto: prendaVal, talla: tallaItem } of prendasDeFila) {
                const yaExiste = dbVentas.some(v => {
                    const mismoCliente = (v.cliente && clienteVal && normalizar(v.cliente) === normalizar(clienteVal)) ||
                        (v.telefono && telefonoVal && v.telefono.replace(/\D/g, '') === telefonoVal.replace(/\D/g, ''));
                    const mismaPrenda = v.producto && prendaVal && normalizar(v.producto) === normalizar(prendaVal);
                    const mismaTalla = !v.talla || !tallaItem || normalizar(v.talla) === normalizar(tallaItem);
                    return mismoCliente && mismaPrenda && mismaTalla;
                });
                if (yaExiste) continue;

                let fotoVal = '';
                const prodNorm = normalizar(prendaVal);
                const fotoExistente = dbVentas.find(x => x.foto && x.foto.length > 50 && x.foto !== "https://via.placeholder.com/50" && normalizar(x.producto) === prodNorm);
                if (fotoExistente) fotoVal = fotoExistente.foto;

                let costoAuto = 0, valorAuto = 0;
                const pLower = prendaVal.toLowerCase().trim();
                if (pLower.startsWith('hoodie') || pLower.startsWith('hoddie') || pLower.startsWith('buzo')) {
                    costoAuto = 85000; valorAuto = 130000;
                } else if (pLower.startsWith('camiseta') || pLower.startsWith('camisa') || pLower.startsWith('t-shirt') || pLower.startsWith('shirt')) {
                    costoAuto = 41500; valorAuto = 75000;
                }

                const data = {
                    id: Date.now() + Math.floor(Math.random() * 99999),
                    fecha: fechaVal,
                    producto: prendaVal,
                    talla: tallaItem,
                    pais: (idxPais !== -1 && row[idxPais]) ? row[idxPais].trim() : 'Colombia',
                    ciudad: (idxCiudad !== -1 && row[idxCiudad]) ? row[idxCiudad].trim() : 'Bogotá',
                    plataforma: homologarPlataforma((idxPlataforma !== -1 && row[idxPlataforma]) ? row[idxPlataforma] : ''),
                    cliente: clienteVal,
                    cedula: (idxCedula !== -1 && row[idxCedula]) ? row[idxCedula].trim() : '',
                    telefono: telefonoVal,
                    email: (idxEmail !== -1 && row[idxEmail]) ? row[idxEmail].trim() : '',
                    direccion: (idxDireccion !== -1 && row[idxDireccion]) ? row[idxDireccion].trim() : '',
                    envio: homologarEnvio((idxEnvio !== -1 && row[idxEnvio]) ? row[idxEnvio] : ''),
                    guia: '',
                    costo: costoAuto,
                    valor: valorAuto,
                    foto: fotoVal || "https://via.placeholder.com/50",
                    estado: "pendiente"
                };

                await fetch('/api/ventas', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                creados++;
            }
        }

        await cargarDatos();
        showToast(`¡Sincronización completada! ${creados} ventas agregadas.`);
    } catch (err) {
        console.error('Error sincronizando Google Forms:', err);
        showToast('Error al procesar el archivo de Google Forms');
    }
}

function importarVentas(input) {
    if (!input.files[0]) return;
    const r = new FileReader();
    r.onload = async (e) => {
        const rows = e.target.result.split('\n').filter(row => row.trim() !== "").slice(1);
        for (let row of rows) {
            const c = row.split(',').map(s => s.trim());
            if (c.length >= 9) {
                const data = { id: parseInt(c[0]) || Date.now() + Math.random(), fecha: c[1], producto: c[2], talla: c[3], ciudad: c[4], cliente: c[5], telefono: c[6], costo: parseFloat(c[7]) || 0, valor: parseFloat(c[8]) || 0, estado: c[9] || "pendiente", foto: "https://via.placeholder.com/50" };
                await fetch('/api/ventas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            }
        }
        cargarDatos();
        showToast("Datos importados");
    };
    r.readAsText(input.files[0]);
}
