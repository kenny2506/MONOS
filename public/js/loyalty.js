// --- LEALTAD (CON TARJETA DE 10 PUNTOS) ---

function renderLealtad() {
    const searchInput = document.getElementById('clientSearch');
    const q = searchInput ? searchInput.value.toLowerCase().trim() : '';

    const map = {};
    dbVentas.forEach(v => {
        const k = v.cliente.toLowerCase().trim();
        const key = v.cedula ? `${k}_${v.cedula}` : k;
        if (!map[key]) map[key] = { n: v.cliente, t: 0, dates: new Set(), tel: v.telefono, ciu: v.ciudad };
        map[key].t += v.valor;
        if (v.fecha) {
            map[key].dates.add(v.fecha);
        }
    });

    let sorted = Object.values(map).sort((a, b) => b.t - a.t);

    if (q) {
        sorted = sorted.filter(c =>
            (c.n || '').toLowerCase().includes(q) ||
            (c.ciu || '').toLowerCase().includes(q) ||
            (c.tel || '').toLowerCase().includes(q)
        );
    }

    const listContainer = document.getElementById('loyaltyList');
    if (!listContainer) return;

    listContainer.innerHTML = sorted.map((c, i) => {
        const pointsCount = c.dates.size;
        const isFull = pointsCount >= 10;
        const isHalf = pointsCount >= 5 && pointsCount < 10;

        let badgeHtml = '';
        if (isFull) {
            badgeHtml = `<span class="loyalty-badge badge-level-10"><i data-lucide="award" class="lucide-sm"></i> Meta 10 Alcanzada</span>`;
        } else if (isHalf) {
            badgeHtml = `<span class="loyalty-badge badge-level-5"><i data-lucide="star" class="lucide-sm"></i> Meta 5 Alcanzada</span>`;
        }

        let miniDots = "";
        for (let j = 1; j <= 10; j++) {
            miniDots += `<div class="mini-dot ${j <= pointsCount ? 'filled' : ''}"></div>`;
        }

        const safeName = encodeURIComponent(c.n);

        return `
        <div class="client-card" onclick="openLoyalty(decodeURIComponent('${safeName}'), ${pointsCount})">
            <div class="client-rank">#${i + 1}</div>
            <div style="display:flex; align-items:center; flex-wrap:wrap; gap:4px;">
                <strong>${c.n}</strong>
                ${badgeHtml}
            </div>
            <small onclick="event.stopPropagation()">${formatPhoneWhatsApp(c.tel, c.n)}</small>
            <div class="client-stat" style="margin-top:10px;"><span>Ciudad:</span><strong>${c.ciu}</strong></div>
            <div class="client-stat"><span>Pedidos:</span><strong class="${isFull ? 'full-loyalty-blink' : ''}">${pointsCount}</strong></div>
            <div class="client-stat"><span>Invertido:</span><strong>$${c.t.toLocaleString()}</strong></div>
            <div class="mini-progress-loyalty">
                ${miniDots}
            </div>
        </div>
    `}).join('');

    if (window.lucide) window.lucide.createIcons();
}

function closeLoyalty(e) {
    if (!e || e.target === document.getElementById('loyaltyOverlay') || !document.getElementById('walletCard').contains(e.target) && !e.target.closest('.btn-download-wallet')) {
        document.getElementById('loyaltyOverlay').style.display = "none";
    }
}

function openLoyalty(name, count) {
    const isV = sessionInfo.store === 'vinilos' || sessionInfo.store === 'redkat';
    const overlay = document.getElementById('loyaltyOverlay');
    const card = document.getElementById('walletCard');

    const alertBox = document.getElementById('loyaltyAlert');
    if (alertBox) alertBox.classList.remove('full-loyalty-blink');

    overlay.style.display = "flex";
    overlay.style.opacity = "1";
    overlay.style.pointerEvents = "auto";

    document.getElementById('loyaltyClientName').innerText = name.toUpperCase();

    const grid = document.getElementById('loyaltyGrid');
    grid.innerHTML = "";
    for (let i = 1; i <= 10; i++) {
        const point = document.createElement('div');
        const isFilled = i <= count;
        point.className = `wallet-dot-stamp ${isFilled ? 'filled' : 'empty'}`;
        if (isFilled) {
            let stampImg = '/bana.png';
            let extraStyle = '';
            if (i === 5) {
                stampImg = '/Capa 3.png';
            } else if (i === 10) {
                stampImg = '/nnnb.png';
            } else {
                extraStyle = 'transform: translate(0px, 0px);';
            }

            point.innerHTML = `<img src="${encodeURI(stampImg)}" style="width:36px; height:36px; object-fit:contain; filter:drop-shadow(0 2px 3px rgba(0,0,0,0.3)); ${extraStyle}">`;
        }
        grid.appendChild(point);
    }

    if (count >= 10) {
        alertBox.innerHTML = "¡META DE 10 ALCANZADA! PREMIO REDIMIBLE ⭐";
        alertBox.classList.add('full-loyalty-blink');
    } else if (count >= 5) {
        alertBox.innerHTML = `<span id="loyaltyCountText">${count}</span> / 10 PUNTOS ACUMULADOS (¡META 5 ALCANZADA! 🎉)`;
    } else {
        alertBox.innerHTML = `<span id="loyaltyCountText">${count}</span> / 10 PUNTOS ACUMULADOS`;
    }

    card.classList.remove('animated-entry');
    void card.offsetWidth;
    card.className = 'loyalty-card-modal animated-entry';
}

async function downloadLoyaltyCard() {
    const card = document.getElementById('walletCard');
    const closeBtn = card.querySelector('.close-loyalty');
    const name = document.getElementById('loyaltyClientName').innerText;

    if (closeBtn) closeBtn.style.visibility = 'hidden';

    try {
        const originalTransform = card.style.transform;
        card.style.transform = 'none';

        const canvas = await html2canvas(card, {
            backgroundColor: null,
            scale: 2,
            logging: false,
            useCORS: true,
            allowTaint: true
        });

        card.style.transform = originalTransform;

        const link = document.createElement('a');
        link.download = `lealtad_${name.toLowerCase().replace(/\s+/g, '_')}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    } catch (e) {
        console.error("Error generating image:", e);
        alert("Error al procesar la imagen.");
    } finally {
        if (closeBtn) closeBtn.style.visibility = 'visible';
    }
}
