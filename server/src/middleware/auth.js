const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'aio-presenter-secret-change-me';

/** Verifica JWT y adjunta req.user = { userId, orgId, isAdmin, canPush } */
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

/** Solo admin de la organización */
function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: 'Se requieren permisos de administrador' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, JWT_SECRET };
