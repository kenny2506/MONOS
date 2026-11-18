const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Configuración de conexión flexible: admite DATABASE_URL o variables individuales
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:dmRbIIvNKelZkXHQAkXjkGDvcLZkaISU@postgres.railway.internal:5432/railway';

// En la red interna de Railway (railway.internal) no se usa SSL; para conexiones externas sí
const isInternalRailway = connectionString && connectionString.includes('railway.internal');
const isRemoteSSL = !isInternalRailway && (process.env.PGSSL === 'true' || (connectionString && process.env.PGSSL !== 'false'));

const poolConfig = connectionString ? {
    connectionString,
    ssl: isRemoteSSL ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
} : {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'monos_db',
    ssl: isRemoteSSL ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
};

const pool = new Pool(poolConfig);

let isConnected = false;

pool.on('error', (err) => {
    console.error('[PostgreSQL] Error inesperado en el cliente idle del pool:', err.message);
});

async function testConnection() {
    try {
        const client = await pool.connect();
        const res = await client.query('SELECT NOW() as current_time, current_database() as db');
        client.release();
        isConnected = true;
        console.log(`[PostgreSQL] Conectado exitosamente a la base de datos "${res.rows[0].db}" a las ${res.rows[0].current_time}`);
        return true;
    } catch (err) {
        isConnected = false;
        console.warn(`[PostgreSQL] No se pudo conectar a PostgreSQL (${err.message}).`);
        return false;
    }
}

async function initSchema() {
    try {
        const schemaPath = path.join(__dirname, '..', '..', 'schema.sql');
        if (fs.existsSync(schemaPath)) {
            const sql = fs.readFileSync(schemaPath, 'utf8');
            await pool.query(sql);
            console.log('[PostgreSQL] Esquema de tablas verificado/creado exitosamente.');
        }
    } catch (err) {
        console.error('[PostgreSQL] Error inicializando esquema SQL:', err.message);
    }
}

module.exports = {
    pool,
    testConnection,
    initSchema,
    isPostgresConnected: () => isConnected,
    query: (text, params) => pool.query(text, params),
};
