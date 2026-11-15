// --- CALENDARIO DINÁMICO ---

const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function changeMonth(offset) {
    calState.viewMonth += offset;
    if (calState.viewMonth < 0) { calState.viewMonth = 11; calState.viewYear--; }
    if (calState.viewMonth > 11) { calState.viewMonth = 0; calState.viewYear++; }
    renderCalendario();
}

function renderCalendario() {
    const grid = document.getElementById('mainCellsContainer');
    const daySelect = document.getElementById('calDay');
    const title = document.getElementById('calendarMonthTitle');

    if (!grid || !daySelect) return;

    grid.innerHTML = '';
    daySelect.innerHTML = '';
    if (title) title.innerText = `${monthNames[calState.viewMonth]} ${calState.viewYear}`;

    const firstDay = new Date(calState.viewYear, calState.viewMonth, 1).getDay();
    const daysInMonth = new Date(calState.viewYear, calState.viewMonth + 1, 0).getDate();

    // 1. Organizar posts en segmentos por semana y calcular pistas (tracks)
    const weeks = [];
    const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

    for (let w = 0; w < totalCells / 7; w++) {
        const weekSegments = [];
        const startOfNextWeek = (w + 1) * 7 - firstDay + 1;
        const startOfThisWeek = w * 7 - firstDay + 1;

        calState.posts.forEach(post => {
            if (Number(post.month) !== Number(calState.viewMonth) || Number(post.year) !== Number(calState.viewYear)) return;

            const inThisWeek = post.days.filter(d => d >= startOfThisWeek && d < startOfNextWeek).sort((a, b) => a - b);
            if (inThisWeek.length > 0) {
                let sub = [inThisWeek[0]];
                for (let i = 1; i < inThisWeek.length; i++) {
                    if (inThisWeek[i] === inThisWeek[i - 1] + 1) sub.push(inThisWeek[i]);
                    else {
                        weekSegments.push({ post, days: sub });
                        sub = [inThisWeek[i]];
                    }
                }
                weekSegments.push({ post, days: sub });
            }
        });

        const tracks = [];
        weekSegments.sort((a, b) => a.days[0] - b.days[0] || b.days.length - a.days.length).forEach(seg => {
            let assigned = false;
            for (let t = 0; t < tracks.length; t++) {
                const overlap = tracks[t].some(s => s.days.some(d => seg.days.includes(d)));
                if (!overlap) { tracks[t].push(seg); seg.track = t; assigned = true; break; }
            }
            if (!assigned) { seg.track = tracks.length; tracks.push([seg]); }
        });

        weeks.push({
            index: w,
            tracksCount: Math.max(tracks.length, 1),
            segments: weekSegments
        });
    }

    const gridTemplateRows = weeks.map(w => `minmax(140px, auto)`).join(' ');
    grid.style.gridTemplateRows = gridTemplateRows;

    for (let b = 0; b < totalCells; b++) {
        const row = Math.floor(b / 7) + 1;
        const col = (b % 7) + 1;
        const d = b - firstDay + 1;

        const cell = document.createElement('div');
        cell.className = (d > 0 && d <= daysInMonth) ? 'calendar-cell active-month' : 'calendar-cell blank-day';
        cell.style.gridRow = row;
        cell.style.gridColumn = col;

        if (d > 0 && d <= daysInMonth) {
            cell.dataset.day = d;
            cell.innerHTML = `<span class="cell-number">${d}</span>`;
            cell.ondragover = (e) => { e.preventDefault(); cell.classList.add('drag-over'); };
            cell.ondragleave = () => cell.classList.remove('drag-over');
            cell.ondrop = onPostDrop;
            daySelect.innerHTML += `<option value="${d}">${monthNames[calState.viewMonth]} ${d}</option>`;
        }
        grid.appendChild(cell);
    }

    weeks.forEach(week => {
        week.segments.forEach(seg => {
            const firstD = seg.days[0];
            const col = (firstDay + firstD - 1) % 7 + 1;
            const row = week.index + 1;

            const card = buildPostCard(seg.post, firstD);
            card.style.gridRow = row;
            card.style.gridColumn = `${col} / span ${seg.days.length}`;
            card.style.marginTop = (35 + (seg.track * 55)) + 'px';
            card.style.marginRight = '5px';
            card.style.zIndex = "20";

            grid.appendChild(card);
        });
    });

    if (window.lucide) window.lucide.createIcons();
}

function buildPostCard(p, currentDay) {
    const card = document.createElement('div');
    const fmt = n => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n;
    card.className = `post-card ${p.platform}`;
    card.draggable = true;
    card.dataset.id = p.id;
    card.dataset.fromDay = currentDay;

    card.innerHTML = `
        <div class="post-meta" style="display:flex; justify-content:space-between; align-items:center;">
            <span class="platform-badge" style="background:${p.platform === 'instagram' ? '#e1306c' : '#000'}; padding: 2px 6px; border-radius:4px; color:white; font-size:8px; font-weight:900;">${p.platform.toUpperCase()}</span>
            <span style="font-size: 9px; opacity:0.9; font-weight:800; color:#334; text-transform:uppercase;">${p.type || 'post'}</span>
        </div>
        <div class="post-card-title" title="${p.title}">${p.title}</div>
        <div class="post-metrics-summary" style="display:flex; gap:10px; font-size:10px; opacity:0.8; color:#334; font-weight:600; align-items:center;">
            <span style="display:inline-flex; align-items:center; gap:2px;"><i data-lucide="eye" class="lucide-sm"></i> ${fmt(p.views)}</span>
            <span style="display:inline-flex; align-items:center; gap:2px;"><i data-lucide="heart" class="lucide-sm"></i> ${fmt(p.likes)}</span>
        </div>
    `;

    card.ondragstart = (e) => {
        e.dataTransfer.setData('postId', p.id);
        e.dataTransfer.setData('fromDay', currentDay);
        setTimeout(() => card.style.opacity = '0.4', 0);
    };
    card.ondragend = () => card.style.opacity = '1';
    card.onclick = (e) => { e.stopPropagation(); openCalendarModal(p); };
    return card;
}

async function onPostDrop(e) {
    e.preventDefault();
    this.classList.remove('drag-over');
    const id = e.dataTransfer.getData('postId');
    const fromDay = parseInt(e.dataTransfer.getData('fromDay'));
    const toDay = parseInt(this.dataset.day);
    const post = calState.posts.find(x => x.id === id);
    if (post && toDay) {
        const idx = post.days.indexOf(fromDay);
        if (idx !== -1) {
            post.days[idx] = toDay;
            await fetch('/api/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(post) });
            renderCalendario();
            showToast("Fecha actualizada");
        }
    }
}

function openCalendarModal(post = null) {
    const modal = document.getElementById('calendarModalMask');
    const form = document.getElementById('calendarForm');
    form.reset();
    if (post) {
        document.getElementById('calModalTitle').innerText = "Editar Publicación";
        document.getElementById('calPostId').value = post.id;
        document.getElementById('calTitle').value = post.title;
        document.getElementById('calPlatform').value = post.platform;
        document.getElementById('calType').value = post.type || "post";
        document.getElementById('calViews').value = post.views || 0;
        document.getElementById('calLikes').value = post.likes || 0;
        document.getElementById('calComments').value = post.comments || 0;

        const dSelect = document.getElementById('calDay');
        Array.from(dSelect.options).forEach(opt => {
            opt.selected = post.days.includes(parseInt(opt.value));
        });
    } else {
        document.getElementById('calModalTitle').innerText = "Nueva Publicación";
        document.getElementById('calPostId').value = "";
    }
    modal.style.display = "flex";
}

function closeCalendarModal(e) {
    if (!e || e.target === document.getElementById('calendarModalMask')) {
        document.getElementById('calendarModalMask').style.display = "none";
    }
}

async function eliminarPost() {
    const id = document.getElementById('calPostId').value;
    if (!id) return;
    if (confirm("¿Eliminar esta publicación?")) {
        await fetch('/api/posts/' + id, { method: 'DELETE' });
        closeCalendarModal();
        cargarDatos();
        showToast("Publicación eliminada");
    }
}
