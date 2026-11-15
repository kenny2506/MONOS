const express = require('express');
const session = require('express-session');
const path = require('path');
const bodyParser = require('body-parser');
const compression = require('compression');

const { isAuthenticated } = require('./src/middleware/auth');
const authRoutes = require('./src/routes/auth.routes');
const apiRoutes = require('./src/routes/api.routes');
const emailRoutes = require('./src/routes/email.routes');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3020;

// Compresión GZIP/Deflate para reducir tráfico en Cloudflare Tunnel (~85% menos peso)
app.use(compression({
    level: 6,
    threshold: 512
}));

// Configuración de sesión
app.use(session({
    secret: 'monos-secret-key-2026',
    resave: true,
    saveUninitialized: true,
    cookie: {
        secure: false,
        maxAge: 1000 * 60 * 60 * 24 // 1 día
    }
}));

app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(bodyParser.json({ limit: '50mb' }));

// Archivos estáticos públicos (Imágenes, CSS, JS, manifest, etc) con caché
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '7d',
    etag: true
}));

// Montar Rutas de Autenticación
app.use('/', authRoutes);

// Montar Rutas API (Protegidas)
app.use('/api/email', emailRoutes);
app.use('/api', apiRoutes);

// Vista principal protegida
app.get('/', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor Multitienda corriendo en http://localhost:${PORT}`);
});
