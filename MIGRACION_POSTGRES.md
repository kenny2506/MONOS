# Guía Completa de Migración a PostgreSQL y Despliegue en Servidor

Esta guía documenta la migración de la plataforma **Monos Multitienda** desde el almacenamiento de archivo plano (`data.json`) a un motor relacional de alto rendimiento **PostgreSQL 16**, con cero pérdida de información y soporte para despliegue automatizado en tu nuevo servidor.

---

## 📦 Componentes Creados para la Migración

| Archivo | Función |
| :--- | :--- |
| [`schema.sql`](file:///d:/Monos/schema.sql) | DDL con tablas `ventas`, `egresos`, `posts`, `store_config`, `users` e índices optimizados. |
| [`src/config/postgres.js`](file:///d:/Monos/src/config/postgres.js) | Conexión con Connection Pool (`pg`), reconexión automática y soporte de variables de entorno. |
| [`src/config/db.js`](file:///d:/Monos/src/config/db.js) | Adaptador híbrido: lee y escribe en PostgreSQL en tiempo real con resguardo local. |
| [`migrate.js`](file:///d:/Monos/migrate.js) | Script idempotente que traslada **todas las ventas, egresos y posts** existentes de `data.json` a PostgreSQL. |
| [`installer.sh`](file:///d:/Monos/installer.sh) | **Instalador automático para servidores Linux** (Ubuntu/Debian/CentOS). |
| [`installer.bat`](file:///d:/Monos/installer.bat) | Instalador automático para servidores Windows. |
| [`docker-compose.yml`](file:///d:/Monos/docker-compose.yml) | Orquestación contenerizada de PostgreSQL 16 y la aplicación Node.js. |
| [`Dockerfile`](file:///d:/Monos/Dockerfile) | Imagen optimizada de Node.js 20 con migración automática al arrancar. |
| [`backup-db.js`](file:///d:/Monos/backup-db.js) | Herramienta de respaldo y exportación de datos. |

---

## 🚀 Cómo Migrar al Nuevo Servidor

### Paso 1: Copiar los archivos al nuevo servidor
Copia la carpeta del proyecto a tu nuevo servidor (por ejemplo vía SCP, SFTP, Git o rsync):

```bash
# Ejemplo desde tu máquina local por SCP a tu VPS:
scp -r D:\Monos usuario@tu-servidor-ip:/var/www/monos
```

---

### Opción A: Despliegue Automatizado con Docker (Recomendada)
Esta opción instala todo automáticamente (Docker, PostgreSQL 16, Node.js, migración de datos y arranque del servicio) con un solo comando.

1. Entra a la carpeta en tu servidor:
   ```bash
   cd /var/www/monos
   ```

2. Dale permisos de ejecución y corre el instalador:
   ```bash
   chmod +x installer.sh
   sudo ./installer.sh
   ```

El instalador:
- Detectará si tienes Docker instalado (y lo instalará si falta).
- Levantará un contenedor con **PostgreSQL 16** con volumen persistente.
- Ejecutará la migración de tus 172+ ventas, egresos y posts hacia PostgreSQL.
- Levantará la aplicación en el puerto **3020**.

Para ver los logs en vivo:
```bash
docker compose logs -f
```

---

### Opción B: Instalación Nativa en Servidor Linux (Sin Docker)
Si tu servidor ya tiene PostgreSQL instalado localmente:

1. Crea la base de datos y usuario en PostgreSQL:
   ```bash
   sudo -u postgres psql
   ```
   ```sql
   CREATE DATABASE monos_db;
   CREATE USER monos_user WITH ENCRYPTED PASSWORD 'TuPasswordSeguro2026*';
   GRANT ALL PRIVILEGES ON DATABASE monos_db TO monos_user;
   \c monos_db
   GRANT ALL ON SCHEMA public TO monos_user;
   \q
   ```

2. Configura el archivo `.env`:
   ```bash
   cp .env.example .env
   nano .env
   ```
   Asegúrate de ajustar los datos de conexión:
   ```ini
   PORT=3020
   DATABASE_URL=postgres://monos_user:TuPasswordSeguro2026*@localhost:5432/monos_db
   PGHOST=localhost
   PGPORT=5432
   PGUSER=monos_user
   PGPASSWORD=TuPasswordSeguro2026*
   PGDATABASE=monos_db
   ```

3. Instala dependencias y corre la migración de datos:
   ```bash
   npm install --omit=dev
   node migrate.js
   ```

4. Inicia la aplicación con PM2 para que siempre esté activa:
   ```bash
   npm install -g pm2
   pm2 start server.js --name "monos-multitienda"
   pm2 save
   pm2 startup
   ```

---

### Opción C: Instalación en Servidor Windows
1. Asegúrate de tener instalado Node.js LTS y PostgreSQL en Windows.
2. Abre la consola o dale doble clic a:
   ```bat
   installer.bat
   ```
3. El script instalará paquetes, configurará `.env` y correrá `node migrate.js`.

---

## 🛡️ Verificación de Integridad de los Datos
Para comprobar en cualquier momento que todos los registros están en PostgreSQL:

```bash
node -e "const { pool } = require('./src/config/postgres'); pool.query('SELECT count(*) FROM ventas').then(r => { console.log('Total ventas en PostgreSQL:', r.rows[0].count); process.exit(0); });"
```

## 💾 Generar Copias de Seguridad (Backups)
Para exportar un volcado completo de la base de datos a un archivo JSON con timestamp:
```bash
node backup-db.js export
```
O con herramientas nativas de PostgreSQL:
```bash
pg_dump -U monos_user -d monos_db > backup_$(date +%Y%m%d).sql
```
