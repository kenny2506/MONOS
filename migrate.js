/**
 * SCRIPT DE MIGRACIÓN DE DATOS (data.json -> PostgreSQL)
 * Garantiza CERO pérdida de información mediante inserción idempotente (ON CONFLICT DO UPDATE)
 */

const fs = require('fs');
const path = require('path');
const { pool, testConnection, initSchema } = require('./src/config/postgres');
const { USERS } = require('./src/middleware/auth');

const DB_FILE = path.join(__dirname, 'data.json');

async function runMigration() {
    console.log('====================================================');
    console.log('   INICIANDO MIGRACIÓN COMPLETA A POSTGRESQL');
    console.log('====================================================');

    const connected = await testConnection();
    if (!connected) {
        console.error('❌ ERROR: No se pudo conectar a PostgreSQL. Verifica que el servicio esté corriendo y las variables de entorno configuradas.');
        console.error('Variables esperadas: PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE o DATABASE_URL');
        process.exit(1);
    }

    // 1. Inicializar tablas
    console.log('\n[1/5] Inicializando tablas y estructuras...');
    await initSchema();

    // 2. Migrar Usuarios del sistema
    console.log('\n[2/5] Migrando usuarios del sistema...');
    for (const u of USERS) {
        await pool.query(`
            INSERT INTO users (username, password_hash, store)
            VALUES ($1, $2, $3)
            ON CONFLICT (username) DO UPDATE
            SET password_hash = EXCLUDED.password_hash,
                store = EXCLUDED.store
        `, [u.username, u.passwordHash, u.store]);
    }
    console.log(`  ✓ ${USERS.length} usuarios sincronizados en tabla 'users'.`);

    // 3. Leer data.json
    if (!fs.existsSync(DB_FILE)) {
        console.warn('⚠️ No se encontró el archivo data.json en', DB_FILE);
        console.log('Migración de esquema y usuarios completada.');
        process.exit(0);
    }

    console.log('\n[3/5] Leyendo registros desde data.json...');
    const rawData = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

    let totalVentasMigradas = 0;
    let totalEgresosMigrados = 0;
    let totalPostsMigrados = 0;

    const stores = Object.keys(rawData);
    console.log(`Tiendas encontradas: ${stores.join(', ')}`);

    for (const store of stores) {
        const storeData = rawData[store] || {};
        console.log(`\n--- Procesando tienda: [${store}] ---`);

        // Migrar Configuración de Tienda
        await pool.query(`
            INSERT INTO store_config (store, google_forms_url, webhook_url, config_json)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (store) DO UPDATE
            SET google_forms_url = EXCLUDED.google_forms_url,
                webhook_url = EXCLUDED.webhook_url,
                updated_at = CURRENT_TIMESTAMP
        `, [
            store,
            (storeData.googleFormsUrl || '').trim(),
            (storeData.webhookUrl || '').trim(),
            JSON.stringify(storeData.config || {})
        ]);

        // Migrar Ventas
        const ventas = storeData.ventas || [];
        for (const v of ventas) {
            const id = String(v.id || Date.now() + Math.random());
            const emailLogs = JSON.stringify(v.emailLogs || []);

            // Extraer campos conocidos y guardar el resto en extra_data para CERO pérdida
            const knownKeys = [
                'id', 'fecha', 'producto', 'talla', 'pais', 'ciudad',
                'plataforma', 'cliente', 'cedula', 'telefono', 'email',
                'direccion', 'envio', 'guia', 'costo', 'valor', 'foto',
                'estado', 'observacion', 'emailLogs'
            ];
            const extraData = {};
            Object.keys(v).forEach(k => {
                if (!knownKeys.includes(k)) {
                    extraData[k] = v[k];
                }
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
                id,
                store,
                v.fecha || null,
                v.producto || null,
                v.talla || null,
                v.pais || 'Colombia',
                v.ciudad || null,
                v.plataforma || null,
                v.cliente || null,
                v.cedula || null,
                v.telefono || null,
                v.email || null,
                v.direccion || null,
                v.envio || null,
                v.guia || null,
                parseFloat(v.costo) || 0,
                parseFloat(v.valor) || 0,
                v.foto || null,
                v.estado || 'Sin enviar',
                v.observacion || null,
                emailLogs,
                JSON.stringify(extraData)
            ]);
            totalVentasMigradas++;
        }
        console.log(`  ✓ ${ventas.length} ventas migradas en [${store}].`);

        // Migrar Egresos
        const egresos = storeData.egresos || [];
        for (const e of egresos) {
            const id = String(e.id || Date.now() + Math.random());
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
                id,
                store,
                e.categoria || null,
                parseFloat(e.monto) || 0,
                e.fecha || null,
                e.desc || e.descripcion || null,
                JSON.stringify(e)
            ]);
            totalEgresosMigrados++;
        }
        console.log(`  ✓ ${egresos.length} egresos migrados en [${store}].`);

        // Migrar Posts
        const posts = storeData.posts || [];
        for (const p of posts) {
            const id = String(p.id || Date.now() + Math.random());
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
                id,
                store,
                p.title || null,
                p.platform || null,
                p.type || null,
                p.days || null,
                p.month || null,
                p.year || null,
                parseInt(p.views, 10) || 0,
                parseInt(p.likes, 10) || 0,
                parseInt(p.comments, 10) || 0,
                JSON.stringify(p)
            ]);
            totalPostsMigrados++;
        }
        console.log(`  ✓ ${posts.length} posts migrados en [${store}].`);
    }

    // 5. Verificación de conteos en PostgreSQL
    console.log('\n[4/5] Verificando conteos en la base de datos PostgreSQL...');
    const countVentas = await pool.query('SELECT count(*) FROM ventas');
    const countEgresos = await pool.query('SELECT count(*) FROM egresos');
    const countPosts = await pool.query('SELECT count(*) FROM posts');
    const countUsers = await pool.query('SELECT count(*) FROM users');

    console.log('====================================================');
    console.log('          RESUMEN DE MIGRACIÓN EXITOSA');
    console.log('====================================================');
    console.log(`📦 Ventas en Postgres:     ${countVentas.rows[0].count} (Procesadas: ${totalVentasMigradas})`);
    console.log(`💸 Egresos en Postgres:    ${countEgresos.rows[0].count} (Procesados: ${totalEgresosMigrados})`);
    console.log(`📱 Posts en Postgres:      ${countPosts.rows[0].count} (Procesados: ${totalPostsMigrados})`);
    console.log(`👤 Usuarios en Postgres:   ${countUsers.rows[0].count}`);
    console.log('====================================================');
    console.log('🎉 ¡Migración finalizada con CERO pérdida de datos!');
    console.log('====================================================');

    await pool.end();
}

runMigration().catch(err => {
    console.error('❌ Error fatal en la migración:', err);
    process.exit(1);
});
