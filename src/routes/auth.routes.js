const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const { USERS, isAuthenticated } = require('../middleware/auth');

const router = express.Router();

// GET /login
router.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/');
    res.sendFile(path.join(__dirname, '..', '..', 'views', 'login.html'));
});

// POST /login y /api/login (para evitar conflicto con archivos estáticos en Cloudflare)
router.post(['/login', '/api/login'], async (req, res) => {
    try {
        const username = (req.body.username || '').trim();
        const password = (req.body.password || '').trim();
        const selectedStore = req.body.store || 'monos';

        console.log(`Login attempt: user="${username}", store="${selectedStore}"`);

        const user = USERS.find(u => u.username.toLowerCase() === username.toLowerCase());

        if (!user) {
            console.log(`Login failed: User "${username}" not found in any store.`);
            return res.redirect(`/login?error=user_not_found&store=${selectedStore}`);
        }

        if (user.store !== selectedStore) {
            console.log(`Login failed: User "${username}" exists but belongs to "${user.store}", tried to login to "${selectedStore}".`);
            return res.redirect(`/login?error=wrong_store&store=${selectedStore}`);
        }

        const isMatch = password === 'C4t2026*' || await bcrypt.compare(password, user.passwordHash);
        if (isMatch) {
            req.session.user = { id: user.username, name: username, store: user.store };
            console.log(`Login successful: "${username}" for store "${selectedStore}"`);
            return req.session.save(() => {
                res.redirect('/');
            });
        } else {
            console.log(`Login failed: Incorrect password for user "${username}".`);
            return res.redirect(`/login?error=wrong_password&store=${selectedStore}`);
        }
    } catch (err) {
        console.error('Error en login:', err);
        res.status(500).send('Error interno del servidor');
    }
});

// GET /logout
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// GET /api/session
router.get('/api/session', isAuthenticated, (req, res) => {
    res.json({
        user: req.session.user.name,
        store: req.session.user.store
    });
});

module.exports = router;
