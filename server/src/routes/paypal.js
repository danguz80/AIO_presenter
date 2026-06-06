/**
 * routes/paypal.js — Integración con PayPal Subscriptions API
 *
 * Flujo de suscripción (redirect, sin JS SDK):
 *  1. POST /paypal/create-subscription  → crea suscripción en PayPal y devuelve approval_url
 *  2. Frontend redirige al usuario a approval_url
 *  3. Usuario aprueba en PayPal → PayPal redirige a CLIENT_URL/app?subscription_id=...&plan_type=...
 *  4. App.jsx detecta subscription_id en URL → POST /paypal/activate
 *  5. Servidor verifica con PayPal API y activa el plan de la org
 *
 * Variables de entorno requeridas:
 *  PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_PLAN_ID_MONTHLY, PAYPAL_PLAN_ID_ANNUAL
 *  PAYPAL_WEBHOOK_ID, PAYPAL_ENV (sandbox | production)
 */

const express = require('express');
const pool    = require('../config/database');

const router = express.Router();

const PAYPAL_BASE = process.env.PAYPAL_ENV === 'production'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

// ─── Helper: obtener access token de PayPal ───────────────────────────────────
async function getPayPalAccessToken() {
  const creds = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method : 'POST',
    headers: {
      'Authorization' : `Basic ${creds}`,
      'Content-Type'  : 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`PayPal auth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

function requireAuth(req, res, next) {
  const { requireAuth: mwAuth } = require('../middleware/auth');
  return mwAuth(req, res, next);
}

// ─── GET /paypal/config — config pública para el frontend ────────────────────
router.get('/config', (req, res) => {
  if (!process.env.PAYPAL_CLIENT_ID) {
    return res.status(503).json({ error: 'PayPal no configurado' });
  }
  res.json({
    clientId     : process.env.PAYPAL_CLIENT_ID,
    planIdMonthly: process.env.PAYPAL_PLAN_ID_MONTHLY || null,
    planIdAnnual : process.env.PAYPAL_PLAN_ID_ANNUAL  || null,
    env          : process.env.PAYPAL_ENV || 'sandbox',
  });
});

// ─── POST /paypal/create-subscription — crea suscripción y devuelve approval URL ─
router.post('/create-subscription', requireAuth, async (req, res) => {
  const { requireAdmin } = require('../middleware/auth');
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Solo el admin puede gestionar la suscripción' });
  }
  const { planType } = req.body; // 'monthly' | 'annual'
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
    return res.status(503).json({ error: 'PayPal no configurado en el servidor' });
  }
  const planId = planType === 'annual'
    ? process.env.PAYPAL_PLAN_ID_ANNUAL
    : process.env.PAYPAL_PLAN_ID_MONTHLY;
  if (!planId) {
    return res.status(503).json({ error: `Plan PayPal no configurado: PAYPAL_PLAN_ID_${(planType || 'monthly').toUpperCase()}` });
  }

  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const returnUrl = `${clientUrl}/app?subscription_id={subscription_id}&plan_type=${planType || 'monthly'}`;
  const cancelUrl = `${clientUrl}/app?paypal_cancel=true`;

  try {
    const token = await getPayPalAccessToken();
    const body = {
      plan_id: planId,
      application_context: {
        brand_name         : 'AIO Presenter',
        locale             : 'es-ES',
        shipping_preference: 'NO_SHIPPING',
        user_action        : 'SUBSCRIBE_NOW',
        return_url         : returnUrl,
        cancel_url         : cancelUrl,
      },
    };
    const subRes = await fetch(`${PAYPAL_BASE}/v1/billing/subscriptions`, {
      method : 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body   : JSON.stringify(body),
    });
    const sub = await subRes.json();
    if (!subRes.ok) {
      console.error('[PayPal] Error creando suscripción:', sub);
      return res.status(400).json({ error: sub.message || 'Error creando suscripción en PayPal' });
    }
    const approveLink = sub.links?.find(l => l.rel === 'approve');
    if (!approveLink) {
      return res.status(500).json({ error: 'No se obtuvo approval URL de PayPal' });
    }
    res.json({ approvalUrl: approveLink.href, subscriptionId: sub.id });
  } catch (err) {
    console.error('[PayPal] Error en create-subscription:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /paypal/activate — verificar y activar tras redirect ────────────────
router.post('/activate', requireAuth, async (req, res) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Solo el admin puede activar la suscripción' });
  }
  const { subscriptionId, planType } = req.body;
  if (!subscriptionId) return res.status(400).json({ error: 'subscriptionId requerido' });
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
    return res.status(503).json({ error: 'PayPal no configurado' });
  }
  try {
    const token  = await getPayPalAccessToken();
    const subRes = await fetch(`${PAYPAL_BASE}/v1/billing/subscriptions/${subscriptionId}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (!subRes.ok) return res.status(400).json({ error: 'Suscripción no encontrada en PayPal' });
    const sub = await subRes.json();
    if (sub.status !== 'ACTIVE') {
      return res.status(400).json({ error: `Estado inválido: ${sub.status}` });
    }
    // Verificar que el plan coincide
    const expectedPlanId = planType === 'annual'
      ? process.env.PAYPAL_PLAN_ID_ANNUAL
      : process.env.PAYPAL_PLAN_ID_MONTHLY;
    if (expectedPlanId && sub.plan_id !== expectedPlanId) {
      return res.status(400).json({ error: 'El plan de la suscripción no coincide con el esperado' });
    }
    await pool.query(
      `UPDATE organizations
          SET plan = 'pro', subscription_status = 'active',
              paypal_subscription_id = $1, paypal_plan_type = $2,
              updated_at = NOW()
        WHERE id = $3`,
      [subscriptionId, planType || 'monthly', req.user.orgId]
    );
    console.log(`[PayPal] Suscripción activada: ${subscriptionId} → org ${req.user.orgId}`);
    res.json({ ok: true, plan: 'pro' });
  } catch (err) {
    console.error('[PayPal] Error activando:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /paypal/cancel — cancelar suscripción activa ───────────────────────
router.post('/cancel', requireAuth, async (req, res) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: 'Solo el admin puede cancelar la suscripción' });
  }
  const { reason } = req.body;
  try {
    const { rows } = await pool.query(
      'SELECT paypal_subscription_id FROM organizations WHERE id = $1',
      [req.user.orgId]
    );
    if (!rows.length || !rows[0].paypal_subscription_id) {
      return res.status(404).json({ error: 'No hay suscripción activa' });
    }
    const subId = rows[0].paypal_subscription_id;
    const token = await getPayPalAccessToken();
    const cancelRes = await fetch(`${PAYPAL_BASE}/v1/billing/subscriptions/${subId}/cancel`, {
      method : 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body   : JSON.stringify({ reason: reason || 'Cancelado por el usuario' }),
    });
    if (!cancelRes.ok && cancelRes.status !== 422) {
      const err = await cancelRes.json();
      console.error('[PayPal] Error cancelando:', err);
    }
    await pool.query(
      `UPDATE organizations
          SET plan = 'cancelled', subscription_status = 'cancelled',
              paypal_subscription_id = NULL, updated_at = NOW()
        WHERE id = $1`,
      [req.user.orgId]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /paypal/webhook — recibir eventos de PayPal ────────────────────────
// IMPORTANTE: debe estar ANTES del express.json() global → usa raw body
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  // Responder 200 siempre para que PayPal no reintente
  res.status(200).json({ received: true });

  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId || !process.env.PAYPAL_CLIENT_ID) return;

  try {
    const bodyStr = req.body.toString();
    const event   = JSON.parse(bodyStr);

    // Verificar firma del webhook
    const token = await getPayPalAccessToken();
    const verifyRes = await fetch(`${PAYPAL_BASE}/v1/notifications/verify-webhook-signature`, {
      method : 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body   : JSON.stringify({
        transmission_id  : req.headers['paypal-transmission-id'],
        transmission_time: req.headers['paypal-transmission-time'],
        cert_url         : req.headers['paypal-cert-url'],
        auth_algo        : req.headers['paypal-auth-algo'],
        transmission_sig : req.headers['paypal-transmission-sig'],
        webhook_id       : webhookId,
        webhook_event    : event,
      }),
    });
    const verify = await verifyRes.json();
    if (verify.verification_status !== 'SUCCESS') {
      console.warn('[PayPal] Webhook firma inválida:', verify.verification_status);
      return;
    }

    const subscriptionId = event.resource?.id;
    if (!subscriptionId) return;

    const STATUS_MAP = {
      'BILLING.SUBSCRIPTION.ACTIVATED'   : { plan: 'pro',       status: 'active'    },
      'BILLING.SUBSCRIPTION.RE-ACTIVATED': { plan: 'pro',       status: 'active'    },
      'BILLING.SUBSCRIPTION.CANCELLED'   : { plan: 'cancelled', status: 'cancelled' },
      'BILLING.SUBSCRIPTION.SUSPENDED'   : { plan: 'suspended', status: 'suspended' },
      'BILLING.SUBSCRIPTION.EXPIRED'     : { plan: 'expired',   status: 'expired'   },
    };
    const newStatus = STATUS_MAP[event.event_type];
    if (newStatus) {
      await pool.query(
        `UPDATE organizations
            SET plan = $1, subscription_status = $2, updated_at = NOW()
          WHERE paypal_subscription_id = $3`,
        [newStatus.plan, newStatus.status, subscriptionId]
      );
      console.log(`[PayPal] ${event.event_type} → plan=${newStatus.plan} (sub: ${subscriptionId})`);
    }
  } catch (err) {
    console.error('[PayPal] Error procesando webhook:', err.message);
  }
});

module.exports = router;
