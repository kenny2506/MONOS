# Imagen base ligera de Node.js
FROM node:20-alpine

# Instalar dependencias del sistema necesarias
RUN apk add --no-cache tzdata curl bash

# Configurar zona horaria (Bogotá / Colombia por defecto)
ENV TZ=America/Bogota

# Directorio de trabajo
WORKDIR /app

# Copiar manifiestos de paquetes
COPY package*.json ./

# Instalar dependencias de producción
RUN npm ci --omit=dev

# Copiar el código fuente de la aplicación
COPY . .

# Exponer el puerto del servidor
EXPOSE 3020

# Script de arranque: ejecuta migración de datos inicial y arranca el servidor
CMD ["sh", "-c", "node migrate.js && node server.js"]
