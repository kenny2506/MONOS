#!/bin/bash
# ============================================================================
# INSTALADOR AUTOMATIZADO - PLATAFORMA MONOS MULTITIENDA CON POSTGRESQL
# Compatible con Ubuntu / Debian / CentOS / AlmaLinux / Rocky / AWS EC2 / VPS
# ============================================================================

set -e

# Colores para la salida
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # Sin color

echo -e "${BLUE}====================================================================${NC}"
echo -e "${BLUE}      INSTALADOR Y MIGRACIÓN A SERVIDOR - MONOS MULTITIENDA         ${NC}"
echo -e "${BLUE}====================================================================${NC}"

# 1. Comprobar permisos de root
if [ "$EUID" -ne 0 ]; then
    echo -e "${YELLOW}[!] Se recomienda ejecutar este script con sudo o como root.${NC}"
fi

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

echo -e "\n${GREEN}[Paso 1/5] Verificando dependencias del servidor...${NC}"

# Función para instalar Docker si no existe
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}Docker no encontrado. Instalando Docker automáticamente...${NC}"
    if command -v apt-get &> /dev/null; then
        apt-get update -y
        apt-get install -y curl ca-certificates gnupg
        install -m 0755 -d /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg || true
        chmod a+r /etc/apt/keyrings/docker.gpg || true
        curl -fsSL https://get.docker.com | sh
    elif command -v yum &> /dev/null; then
        yum install -y yum-utils
        yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
        yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
        systemctl start docker
        systemctl enable docker
    else
        echo -e "${RED}Distribución no reconocida para instalación automática de Docker. Por favor instala Docker manualmente.${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Docker instalado exitosamente.${NC}"
else
    echo -e "${GREEN}✓ Docker ya se encuentra instalado.${NC}"
fi

# Iniciar servicio Docker si está detenido
if command -v systemctl &> /dev/null; then
    systemctl start docker || true
    systemctl enable docker || true
fi

echo -e "\n${GREEN}[Paso 2/5] Configurando variables de entorno (.env)...${NC}"
if [ ! -f "$APP_DIR/.env" ]; then
    if [ -f "$APP_DIR/.env.example" ]; then
        cp "$APP_DIR/.env.example" "$APP_DIR/.env"
        echo -e "${GREEN}✓ Archivo .env generado a partir de .env.example.${NC}"
    else
        cat <<EOF > "$APP_DIR/.env"
PORT=3020
DATABASE_URL=postgres://monos_user:MonosSecure2026*@postgres:5432/monos_db
PGHOST=postgres
PGPORT=5432
PGUSER=monos_user
PGPASSWORD=MonosSecure2026*
PGDATABASE=monos_db
EOF
        echo -e "${GREEN}✓ Archivo .env creado con credenciales por defecto.${NC}"
    fi
else
    echo -e "${GREEN}✓ Archivo .env existente detectado. Manteniendo configuración.${NC}"
fi

echo -e "\n${GREEN}[Paso 3/5] Levantando contenedores (PostgreSQL 16 + Node.js App)...${NC}"
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE_CMD="docker-compose"
else
    echo -e "${RED}Error: Ni 'docker compose' ni 'docker-compose' están disponibles.${NC}"
    exit 1
fi

$DOCKER_COMPOSE_CMD down || true
$DOCKER_COMPOSE_CMD build --no-cache
$DOCKER_COMPOSE_CMD up -d

echo -e "\n${GREEN}[Paso 4/5] Esperando que la base de datos PostgreSQL esté lista...${NC}"
sleep 6

echo -e "\n${GREEN}[Paso 5/5] Ejecutando migración de datos (data.json -> PostgreSQL)...${NC}"
$DOCKER_COMPOSE_CMD exec -T app node migrate.js || {
    echo -e "${YELLOW}Aviso: Reintentando migración en 5 segundos...${NC}"
    sleep 5
    $DOCKER_COMPOSE_CMD exec -T app node migrate.js
}

echo -e "\n${BLUE}====================================================================${NC}"
echo -e "${GREEN}          ¡INSTALACIÓN Y MIGRACIÓN COMPLETADA CON ÉXITO!            ${NC}"
echo -e "${BLUE}====================================================================${NC}"
SERVER_IP=$(curl -s ifconfig.me || curl -s icanhazip.com || echo "localhost")
echo -e "🚀 La plataforma Monos Multitienda está activa y lista."
echo -e "🌐 Acceso local:    ${GREEN}http://localhost:3020${NC}"
echo -e "🌐 Acceso servidor: ${GREEN}http://${SERVER_IP}:3020${NC}"
echo -e "🐘 Base de Datos:   PostgreSQL 16 en puerto 5432 (Contenedor monos_postgres)"
echo -e "📋 Logs en vivo:    ${YELLOW}${DOCKER_COMPOSE_CMD} logs -f${NC}"
echo -e "${BLUE}====================================================================${NC}"
