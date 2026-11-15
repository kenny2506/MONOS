const bcrypt = require('bcryptjs');

const USERS = [
    {
        username: 'monos',
        passwordHash: '$2b$10$sN2cd4WwKfWwp.XCdiD1RO9F7iNO6uknl.hspzV5VjcHGkAPJ3aWS',
        store: 'monos'
    },
    {
        username: 'redkat',
        passwordHash: '$2b$10$j/UIOkoRh1fC1EzJ5cX.m.pI6Y8zamoYA80ItvhF5SlqBXvkNXN7W', // Password: C4t2026*
        store: 'redkat'
    },
    {
        username: 'vinilos',
        passwordHash: '$2b$10$j/UIOkoRh1fC1EzJ5cX.m.pI6Y8zamoYA80ItvhF5SlqBXvkNXN7W', // Password: C4t2026* (alias to redkat)
        store: 'redkat'
    },
    {
        username: 'flores',
        passwordHash: '$2b$10$j/UIOkoRh1fC1EzJ5cX.m.pI6Y8zamoYA80ItvhF5SlqBXvkNXN7W', // Password: C4t2026*
        store: 'flores'
    },
    {
        username: 'tenis',
        passwordHash: '$2b$10$j/UIOkoRh1fC1EzJ5cX.m.pI6Y8zamoYA80ItvhF5SlqBXvkNXN7W', // Password: C4t2026*
        store: 'tenis'
    },
    {
        username: 'vetpet',
        passwordHash: '$2b$10$j/UIOkoRh1fC1EzJ5cX.m.pI6Y8zamoYA80ItvhF5SlqBXvkNXN7W', // Password: C4t2026*
        store: 'vetpet'
    }
];

function isAuthenticated(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    }
    res.redirect('/login');
}

module.exports = {
    USERS,
    isAuthenticated
};
