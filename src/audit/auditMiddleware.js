/**
 * 📋 Audit Middleware
 * Auto-logs all write operations (POST, PUT, PATCH, DELETE).
 */

import { logAudit } from '../audit/auditService.js';

const _SENSITIVE = /(password|secret|token|api[_-]?key|authorization|cookie|cvv|card[_-]?number|ssn|stripe_|_intent_id|_charge_id|_secret)/i;

function redactAudit(value, depth = 0) {
  if (value === null || typeof value !== 'object' || depth > 6) return value;
  if (Array.isArray(value)) return value.map((v) => redactAudit(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = _SENSITIVE.test(k) ? '[redacted]' : redactAudit(v, depth + 1);
  }
  return out;
}

/**
 * Express middleware that logs audit events after response
 */
export function auditMiddleware(req, res, next) {
  // Only audit write operations
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }

  // Skip health/admin routes
  if (req.path.startsWith('/health') || req.path.startsWith('/api/v1/admin')) {
    return next();
  }

  const originalJson = res.json.bind(res);

  res.json = function(body) {
    // Extract entity info from path
    const pathParts = req.path.split('/').filter(Boolean);
    const entityType = pathParts[1] || 'unknown';
    const entityId = pathParts[2] || null;

    const actionMap = { POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' };

    // Log async (don't block response)
    logAudit({
      action: actionMap[req.method] || req.method.toLowerCase(),
      entityType: entityType.replace(/s$/, ''),
      entityId,
      userId: req.context?.user_id || null,
      tenantId: req.context?.tenant_id || null,
      before: null,
      after: res.statusCode < 400 ? redactAudit(body) : null,
      metadata: {
        ip: req.ip || req.headers['x-forwarded-for'],
        userAgent: req.headers['user-agent'],
        requestId: req.requestId,
      },
    }).catch((err) => console.error('Audit log failed:', err.message));

    return originalJson(body);
  };

  next();
}
