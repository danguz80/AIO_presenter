const jwt  = require('jsonwebtoken');
const pool = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'aio-presenter-secret-change-me';

// ─── Throttle para actualizar last_seen sin golpear la DB en cada request ────
const sessionUpdateThrottle = new Map();
const THROTTLE_MS = 5 * 60 * 1000; // 5 min

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || null;
}

function updateSessionAsync(userId, iat, ip) {
  const key = `${userId}:${iat}`;
  const now = Date.now();
  if ((sessionUpdateThrottle.get(key) || 0) > now - THROTTLE_MS) return;
  sessionUpdateThrottle.set(key, now);
  pool.query(
    'UPDATE user_sessions SET last_seen = NOW(), last_ip = $1 WHERE user_id = $2 AND jwt_iat = $3',
    [ip, userId, iat]
  ).catch(() => {});
}

/** Verifica JWT y adjunta req.user = { userId, orgId, isAdmin, canPush, canPull } */
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    // Actualizar last_seen + last_ip de la sesión (throttled)
    if (req.user.userId && req.user.iat) {
      updateSessionAsync(req.user.userId, req.user.iat, getClientIp(req));
    }
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

/** Verifica que la org tenga plan activo (pro), trial vigente, O licencia activa */
async function requireActivePlan(req, res, next) {
  try {
    const { rows } = await pool.query(
      'SELECT plan, trial_ends FROM organizations WHERE id = $1',
      [req.user.orgId]
    );
    if (!rows.length) return res.status(403).json({ error: 'Organización no encontrada' });
    const { plan, trial_ends } = rows[0];
    if (plan === 'pro') return next();
    if (plan === 'trial') {
      if (trial_ends && new Date(trial_ends) >= new Date()) return next();
    }
    // Verificar si tiene licencia activa (permanente o no vencida)
    const { rows: lic } = await pool.query(
      `SELECT id FROM org_licenses
        WHERE org_id = $1 AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > NOW())
        LIMIT 1`,
      [req.user.orgId]
    );
    if (lic.length) return next();
    if (plan === 'trial') {
      return res.status(402).json({
        error: 'Tu período de prueba ha terminado. Suscríbete para continuar.',
        code : 'TRIAL_EXPIRED',
      });
    }
    return res.status(402).json({ error: 'Suscripción inactiva', code: 'SUBSCRIPTION_INACTIVE' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/** Solo el owner (ADMIN_EMAIL en env) puede acceder */
function requireOwner(req, res, next) {
  const ownerEmail = process.env.ADMIN_EMAIL;
  if (!ownerEmail) return res.status(503).json({ error: 'Owner no configurado' });
  if (!req.user)   return res.status(401).json({ error: 'No autenticado' });
  if (req.user.email !== ownerEmail) return res.status(403).json({ error: 'Acceso denegado' });
  next();
}

/** Verifica JWT si está presente, pero NO bloquea si falta o es inválido */
function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(header.slice(7), JWT_SECRET);
    } catch {
      // Token inválido — continúa sin autenticar
    }
  }
  next();
}

/** Solo admin de la organización */
function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: 'Se requieren permisos de administrador' });
  }
  next();
}

module.exports = { requireAuth, optionalAuth, requireAdmin, requireActivePlan, requireOwner, JWT_SECRET, getClientIp };
