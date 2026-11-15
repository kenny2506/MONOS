-- ============================================================================
-- ESQUEMA DE BASE DE DATOS POSTGRESQL - PLATAFORMA MONOS MULTITIENDA
-- ============================================================================

-- Extensión para generación de UUIDs si se requiere
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. TABLA: USUARIOS
CREATE TABLE IF NOT EXISTS users (
    username VARCHAR(100) PRIMARY KEY,
    password_hash VARCHAR(255) NOT NULL,
    store VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. TABLA: CONFIGURACIÓN POR TIENDA
CREATE TABLE IF NOT EXISTS store_config (
    store VARCHAR(100) PRIMARY KEY,
    google_forms_url TEXT DEFAULT '',
    webhook_url TEXT DEFAULT '',
    config_json JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. TABLA: VENTAS
CREATE TABLE IF NOT EXISTS ventas (
    id VARCHAR(100) NOT NULL,
    store VARCHAR(100) NOT NULL,
    fecha TEXT,
    producto TEXT,
    talla TEXT,
    pais TEXT DEFAULT 'Colombia',
    ciudad TEXT,
    plataforma TEXT,
    cliente TEXT,
    cedula TEXT,
    telefono TEXT,
    email TEXT,
    direccion TEXT,
    envio TEXT,
    guia TEXT,
    costo NUMERIC(12, 2) DEFAULT 0,
    valor NUMERIC(12, 2) DEFAULT 0,
    foto TEXT,
    estado TEXT DEFAULT 'Sin enviar',
    observacion TEXT,
    email_logs JSONB DEFAULT '[]'::jsonb,
    extra_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (store, id)
);

-- 4. TABLA: EGRESOS
CREATE TABLE IF NOT EXISTS egresos (
    id VARCHAR(100) NOT NULL,
    store VARCHAR(100) NOT NULL,
    categoria TEXT,
    monto NUMERIC(12, 2) NOT NULL DEFAULT 0,
    fecha TEXT,
    descripcion TEXT,
    extra_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (store, id)
);

-- 5. TABLA: POSTS (REDES SOCIALES)
CREATE TABLE IF NOT EXISTS posts (
    id VARCHAR(100) NOT NULL,
    store VARCHAR(100) NOT NULL,
    title TEXT,
    platform TEXT,
    type TEXT,
    days TEXT,
    month TEXT,
    year TEXT,
    views INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    extra_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (store, id)
);

-- ============================================================================
-- ÍNDICES DE RENDIMIENTO
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_ventas_store ON ventas(store);
CREATE INDEX IF NOT EXISTS idx_ventas_estado ON ventas(store, estado);
CREATE INDEX IF NOT EXISTS idx_ventas_cliente ON ventas(store, cliente);
CREATE INDEX IF NOT EXISTS idx_ventas_telefono ON ventas(store, telefono);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(store, fecha);
CREATE INDEX IF NOT EXISTS idx_egresos_store ON egresos(store);
CREATE INDEX IF NOT EXISTS idx_posts_store ON posts(store);
