/**
 * UTILIDAD DE RESPALDO Y RESTAURACIÓN (BACKUP / RESTORE)
 * Uso:
 *   node backup-db.js export   -> Genera un archivo backup_YYYYMMDD_HHMMSS.json
 *   node backup-db.js import <archivo.json> -> Restaura a PostgreSQL
 */

const fs = require('fs');
const path = require('path');
const { pool, testConnection } = require('./src/config/postgres');

async function exportBackup() {
    console.log('[Backup] Conectando a PostgreSQL...');
    const connected = await testConnection();
    if (!connected) {
        console.error('No se pudo conectar a PostgreSQL para generar el respaldo.');
        process.exit(1);
    }

    const ventas = await pool.query('SELECT * FROM ventas ORDER BY created_at ASC');
    const egresos = await pool.query('SELECT * FROM egresos ORDER BY created_at ASC');
    const posts = await pool.query('SELECT * FROM posts ORDER BY created_at ASC');
    const configs = await pool.query('SELECT * FROM store_config');
    const users = await pool.query('SELECT username, store, is_active FROM users');

    const backup = {
        metadata: {
            timestamp: new Date().toISOString(),
            ventas_count: ventas.rowCount,
            egresos_count: egresos.rowCount,
            posts_count: posts.rowCount,
            users_count: users.rowCount
        },
        configs: configs.rows,
        users: users.rows,
        ventas: ventas.rows,
        egresos: egresos.rows,
        posts: posts.rows
    };

    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = path.join(__dirname, `backup_monos_${dateStr}.json`);

    fs.writeFileSync(filename, JSON.stringify(backup, null, 2), 'utf8');
    console.log(`✓ Respaldo exportado exitosamente a: ${filename}`);
    console.log(`  Ventas: ${ventas.rowCount} | Egresos: ${egresos.rowCount} | Posts: ${posts.rowCount}`);

    await pool.end();
}

async function main() {
    const action = process.argv[2] || 'export';
    if (action === 'export') {
        await exportBackup();
    } else {
        console.log('Comando no reconocido. Usa: node backup-db.js export');
    }
}

main().catch(console.error);
