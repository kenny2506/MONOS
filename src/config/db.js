const path = require('path');
const fs = require('fs');
const { pool, testConnection, initSchema, isPostgresConnected } = require('./postgres');

const DB_FILE = path.join(__dirname, '..', '..', 'data.json');

let appData = {
    monos: { ventas: [], egresos: [], posts: [] },
    redkat: { ventas: [], egresos: [], posts: [] },
    flores: { ventas: [], egresos: [], posts: [] },
    tenis: { ventas: [], egresos: [], posts: [] },
    vetpet: { ventas: [], egresos: [], posts: [] }
};

// Carga inicial desde archivo JSON como baseline inmediato
function loadLocalFileDB() {
    if (fs.existsSync(DB_FILE)) {
        try {
            const rawData = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
            if (rawData.ventas && Array.isArray(rawData.ventas)) {
                appData.monos.ventas = rawData.ventas;
                appData.monos.egresos = rawData.egresos || [];
            } else {
                appData = rawData;
            }
            if (appData.vinilos && !appData.redkat) {
                appData.redkat = appData.vinilos;
            }
        } catch (e) {
            console.error('[DB] Error parseando data.json local:', e.message);
        }
    }
}

// Carga y sincronización profunda desde PostgreSQL
async function loadFromPostgres() {
    try {
        const isOnline = await testConnection();
        if (!isOnline) {
            console.log('[DB] Operando con caché local (PostgreSQL no conectado en este momento).');
            return;
        }

        await initSchema();

        // 1. Cargar Configuración de Tiendas
        const configs = await pool.query('SELECT store, google_forms_url, webhook_url, config_json FROM store_config');
        configs.rows.forEach(row => {
            if (!appData[row.store]) appData[row.store] = { ventas: [], egresos: [], posts: [] };
            appData[row.store].googleFormsUrl = row.google_forms_url || '';
            appData[row.store].webhookUrl = row.webhook_url || '';
            if (row.config_json) appData[row.store].config = row.config_json;
        });

        // 2. Cargar Ventas
        const ventasRes = await pool.query(`
            SELECT id, store, fecha, producto, talla, pais, ciudad, plataforma,
                   cliente, cedula, telefono, email, direccion, envio, guia,
                   costo, valor, foto, estado, observacion, email_logs, extra_data
            FROM ventas ORDER BY created_at DESC
        `);

        // Resetear ventas por tienda para hidratar desde Postgres
        const pgVentasByStore = {};
        ventasRes.rows.forEach(r => {
            if (!pgVentasByStore[r.store]) pgVentasByStore[r.store] = [];
            const v = {
                id: isNaN(Number(r.id)) ? r.id : Number(r.id),
                fecha: r.fecha,
                producto: r.producto,
                talla: r.talla,
                pais: r.pais,
                ciudad: r.ciudad,
                plataforma: r.plataforma,
                cliente: r.cliente,
                cedula: r.cedula,
                telefono: r.telefono,
                email: r.email,
                direccion: r.direccion,
                envio: r.envio,
                guia: r.guia,
                costo: parseFloat(r.costo) || 0,
                valor: parseFloat(r.valor) || 0,
                foto: r.foto,
                estado: r.estado,
                observacion: r.observacion,
                emailLogs: r.email_logs || [],
                ...(r.extra_data || {})
            };
            pgVentasByStore[r.store].push(v);
        });

        Object.keys(pgVentasByStore).forEach(store => {
            if (!appData[store]) appData[store] = { ventas: [], egresos: [], posts: [] };
            appData[store].ventas = pgVentasByStore[store];
        });

        // 3. Cargar Egresos
        const egresosRes = await pool.query('SELECT id, store, categoria, monto, fecha, descripcion, extra_data FROM egresos');
        const pgEgresosByStore = {};
        egresosRes.rows.forEach(r => {
            if (!pgEgresosByStore[r.store]) pgEgresosByStore[r.store] = [];
            pgEgresosByStore[r.store].push({
                id: isNaN(Number(r.id)) ? r.id : Number(r.id),
                categoria: r.categoria,
                monto: parseFloat(r.monto) || 0,
                fecha: r.fecha,
                desc: r.descripcion,
                ...(r.extra_data || {})
            });
        });
        Object.keys(pgEgresosByStore).forEach(store => {
            if (!appData[store]) appData[store] = { ventas: [], egresos: [], posts: [] };
            appData[store].egresos = pgEgresosByStore[store];
        });

        // 4. Cargar Posts
        const postsRes = await pool.query('SELECT * FROM posts');
        const pgPostsByStore = {};
        postsRes.rows.forEach(r => {
            if (!pgPostsByStore[r.store]) pgPostsByStore[r.store] = [];
            pgPostsByStore[r.store].push({
                id: r.id,
                title: r.title,
                platform: r.platform,
                type: r.type,
                days: r.days,
                month: r.month,
                year: r.year,
                views: r.views,
                likes: r.likes,
                comments: r.comments,
                ...(r.extra_data || {})
            });
        });
        Object.keys(pgPostsByStore).forEach(store => {
            if (!appData[store]) appData[store] = { ventas: [], egresos: [], posts: [] };
            appData[store].posts = pgPostsByStore[store];
        });

        console.log(`[DB] Hidratación completa desde PostgreSQL (${ventasRes.rowCount} ventas, ${egresosRes.rowCount} egresos, ${postsRes.rowCount} posts).`);
    } catch (e) {
        console.error('[DB] Error cargando datos desde PostgreSQL:', e.message);
    }
}

// Persistencia en archivo local de resguardo
function saveLocalFileDB() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(appData, null, 2), 'utf8');
    } catch (e) {
        console.error('[DB] Error escribiendo data.json local:', e.message);
    }
}

// Sincronización a PostgreSQL para Ventas
async function syncVentaToPG(store, venta) {
    if (!isPostgresConnected()) return;
    try {
        const id = String(venta.id);
        const emailLogs = JSON.stringify(venta.emailLogs || []);
        const knownKeys = [
            'id', 'fecha', 'producto', 'talla', 'pais', 'ciudad',
            'plataforma', 'cliente', 'cedula', 'telefono', 'email',
            'direccion', 'envio', 'guia', 'costo', 'valor', 'foto',
            'estado', 'observacion', 'emailLogs'
        ];
        const extraData = {};
        Object.keys(venta).forEach(k => {
            if (!knownKeys.includes(k)) extraData[k] = venta[k];
        });

        await pool.query(`
            INSERT INTO ventas (
                id, store, fecha, producto, talla, pais, ciudad,
                plataforma, cliente, cedula, telefono, email, direccion,
                envio, guia, costo, valor, foto, estado, observacion,
                email_logs, extra_data
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7,
                $8, $9, $10, $11, $12, $13,
                $14, $15, $16, $17, $18, $19, $20,
                $21, $22
            )
            ON CONFLICT (store, id) DO UPDATE SET
                fecha = EXCLUDED.fecha,
                producto = EXCLUDED.producto,
                talla = EXCLUDED.talla,
                pais = EXCLUDED.pais,
                ciudad = EXCLUDED.ciudad,
                plataforma = EXCLUDED.plataforma,
                cliente = EXCLUDED.cliente,
                cedula = EXCLUDED.cedula,
                telefono = EXCLUDED.telefono,
                email = EXCLUDED.email,
                direccion = EXCLUDED.direccion,
                envio = EXCLUDED.envio,
                guia = EXCLUDED.guia,
                costo = EXCLUDED.costo,
                valor = EXCLUDED.valor,
                foto = EXCLUDED.foto,
                estado = EXCLUDED.estado,
                observacion = EXCLUDED.observacion,
                email_logs = EXCLUDED.email_logs,
                extra_data = EXCLUDED.extra_data,
                updated_at = CURRENT_TIMESTAMP
        `, [
            id, store, venta.fecha || null, venta.producto || null,
            venta.talla || null, venta.pais || 'Colombia', venta.ciudad || null,
            venta.plataforma || null, venta.cliente || null, venta.cedula || null,
            venta.telefono || null, venta.email || null, venta.direccion || null,
            venta.envio || null, venta.guia || null, parseFloat(venta.costo) || 0,
            parseFloat(venta.valor) || 0, venta.foto || null, venta.estado || 'Sin enviar',
            venta.observacion || null, emailLogs, JSON.stringify(extraData)
        ]);
    } catch (err) {
        console.error(`[PostgreSQL] Error guardando venta ${venta.id}:`, err.message);
    }
}

// Sincronización a PostgreSQL para eliminación de Venta
async function deleteVentaFromPG(store, id) {
    if (!isPostgresConnected()) return;
    try {
        await pool.query('DELETE FROM ventas WHERE store = $1 AND id = $2', [store, String(id)]);
    } catch (err) {
        console.error(`[PostgreSQL] Error eliminando venta ${id}:`, err.message);
    }
}

// Sincronización a PostgreSQL para Egresos
async function syncEgresoToPG(store, egreso) {
    if (!isPostgresConnected()) return;
    try {
        const id = String(egreso.id);
        await pool.query(`
            INSERT INTO egresos (id, store, categoria, monto, fecha, descripcion, extra_data)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (store, id) DO UPDATE SET
                categoria = EXCLUDED.categoria,
                monto = EXCLUDED.monto,
                fecha = EXCLUDED.fecha,
                descripcion = EXCLUDED.descripcion,
                extra_data = EXCLUDED.extra_data
        `, [
            id, store, egreso.categoria || null,
            parseFloat(egreso.monto) || 0, egreso.fecha || null,
            egreso.desc || egreso.descripcion || null, JSON.stringify(egreso)
        ]);
    } catch (err) {
        console.error(`[PostgreSQL] Error guardando egreso ${egreso.id}:`, err.message);
    }
}

// Sincronización a PostgreSQL para eliminación de Egreso
async function deleteEgresoFromPG(store, id) {
    if (!isPostgresConnected()) return;
    try {
        await pool.query('DELETE FROM egresos WHERE store = $1 AND id = $2', [store, String(id)]);
    } catch (err) {
        console.error(`[PostgreSQL] Error eliminando egreso ${id}:`, err.message);
    }
}

// Sincronización a PostgreSQL para Posts
async function syncPostToPG(store, post) {
    if (!isPostgresConnected()) return;
    try {
        const id = String(post.id);
        await pool.query(`
            INSERT INTO posts (
                id, store, title, platform, type, days, month, year,
                views, likes, comments, extra_data
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ON CONFLICT (store, id) DO UPDATE SET
                title = EXCLUDED.title,
                platform = EXCLUDED.platform,
                type = EXCLUDED.type,
                days = EXCLUDED.days,
                month = EXCLUDED.month,
                year = EXCLUDED.year,
                views = EXCLUDED.views,
                likes = EXCLUDED.likes,
                comments = EXCLUDED.comments,
                extra_data = EXCLUDED.extra_data
        `, [
            id, store, post.title || null, post.platform || null,
            post.type || null, post.days || null, post.month || null,
            post.year || null, parseInt(post.views, 10) || 0,
            parseInt(post.likes, 10) || 0, parseInt(post.comments, 10) || 0,
            JSON.stringify(post)
        ]);
    } catch (err) {
        console.error(`[PostgreSQL] Error guardando post ${post.id}:`, err.message);
    }
}

// Sincronización a PostgreSQL para eliminación de Post
async function deletePostFromPG(store, id) {
    if (!isPostgresConnected()) return;
    try {
        await pool.query('DELETE FROM posts WHERE store = $1 AND id = $2', [store, String(id)]);
    } catch (err) {
        console.error(`[PostgreSQL] Error eliminando post ${id}:`, err.message);
    }
}

// Sincronización a PostgreSQL para Configuración de Tienda
async function syncStoreConfigToPG(store) {
    if (!isPostgresConnected()) return;
    try {
        const s = appData[store] || {};
        await pool.query(`
            INSERT INTO store_config (store, google_forms_url, webhook_url, config_json)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (store) DO UPDATE SET
                google_forms_url = EXCLUDED.google_forms_url,
                webhook_url = EXCLUDED.webhook_url,
                updated_at = CURRENT_TIMESTAMP
        `, [
            store,
            (s.googleFormsUrl || '').trim(),
            (s.webhookUrl || '').trim(),
            JSON.stringify(s.config || {})
        ]);
    } catch (err) {
        console.error(`[PostgreSQL] Error guardando config de ${store}:`, err.message);
    }
}

// Función principal de guardado que asegura atomicidad en Postgres y resguardo local
function saveDB(store, entityType, item, isDelete = false) {
    // 1. Resguardo local en archivo data.json
    saveLocalFileDB();

    // 2. Si se especifican entidad y tienda, sincronizar de inmediato con PostgreSQL
    if (store && entityType) {
        if (entityType === 'venta') {
            if (isDelete) deleteVentaFromPG(store, item);
            else syncVentaToPG(store, item);
        } else if (entityType === 'egreso') {
            if (isDelete) deleteEgresoFromPG(store, item);
            else syncEgresoToPG(store, item);
        } else if (entityType === 'post') {
            if (isDelete) deletePostFromPG(store, item);
            else syncPostToPG(store, item);
        } else if (entityType === 'config') {
            syncStoreConfigToPG(store);
        }
    }
}

function getStoreData(store) {
    if (!appData[store]) {
        appData[store] = { ventas: [], egresos: [], posts: [] };
    }
    if (!appData[store].posts) {
        appData[store].posts = [];
    }
    return appData[store];
}

// Carga inicial
loadLocalFileDB();
loadFromPostgres();

module.exports = {
    appData,
    loadDB: loadFromPostgres,
    saveDB,
    getStoreData,
    syncVentaToPG,
    deleteVentaFromPG,
    syncEgresoToPG,
    deleteEgresoFromPG,
    syncPostToPG,
    deletePostFromPG,
    syncStoreConfigToPG,
    loadFromPostgres
};
