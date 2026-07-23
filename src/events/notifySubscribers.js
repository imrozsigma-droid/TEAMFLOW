/**
 * 🔔 Spec-declared notifications (auto-generated, deterministic).
 *
 * Each binding comes from a "Notify:" line in the spec — nothing here was
 * inferred. Handlers are fire-and-forget: a failed notification is logged and
 * can never fail or slow the API request that triggered it.
 */
import { subscribe } from './dispatcher.js';
import { pool } from '../db/pg.js';

const BINDINGS = [
  {
    "entity": "task",
    "state": "done",
    "event": "done",
    "channel": "email",
    "recipient": "owner"
  },
  {
    "entity": "invite",
    "state": "pending",
    "event": "created",
    "channel": "email",
    "recipient": "owner"
  }
];

const MAX_ADMIN_RECIPIENTS = 20;

async function resolveRecipients(tenantId, record, recipient, channel) {
  const column = channel === 'sms' ? 'phone' : 'email';
  if (recipient === 'admins') {
    const { rows } = await pool.query(
      `SELECT ${column} FROM users WHERE tenant_id = $1 AND role = 'admin' AND deleted_at IS NULL AND ${column} IS NOT NULL LIMIT ${MAX_ADMIN_RECIPIENTS}`,
      [tenantId]
    );
    return rows.map(r => r[column]).filter(Boolean);
  }
  const ownerId = record && (record.owner_id || record.created_by || record.user_id);
  if (ownerId) {
    const { rows } = await pool.query(
      `SELECT ${column} FROM users WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [ownerId, tenantId]
    );
    if (rows.length) return rows.map(r => r[column]).filter(Boolean);
  }
  // The record carries no owner column (e.g. invites) — fall back to the WORKSPACE
  // owner(s): the tenant's role='owner' users. Without this, "Notify: owner" on such
  // an entity resolved to [] and silently sent nothing (M3).
  const { rows: owners } = await pool.query(
    `SELECT ${column} FROM users WHERE tenant_id = $1 AND role = 'owner' AND deleted_at IS NULL AND ${column} IS NOT NULL LIMIT ${MAX_ADMIN_RECIPIENTS}`,
    [tenantId]
  );
  return owners.map(r => r[column]).filter(Boolean);
}

// Channel senders resolve lazily so a missing optional service can never
// crash boot — an unavailable channel logs a warning per event instead.
async function sendViaEmail(to, subject, text) {
  try {
    // The provider-agnostic email service is ALWAYS generated (RC5). It respects
    // EMAIL_PROVIDER and routes to whatever transport the spec declared — SES/Gmail/
    // SendGrid/Mailgun/SMTP, or console in dev — so Notify: emails work with no
    // credentials locally and use the declared service in prod. Single entry point,
    // no dangling fallback to a module that may not be generated.
    const svc = await import('../email/emailService.js');
    if (typeof svc.sendEmail !== 'function') throw new Error('sendEmail not exported');
    await svc.sendEmail({ to, subject, text, html: '<p>' + text + '</p>' });
  } catch (err) {
    console.warn('[notify] email to ' + to + ' failed: ' + (err && err.message));
  }
}

function buildMessage(entity, state) {
  const label = entity.charAt(0).toUpperCase() + entity.slice(1);
  return {
    subject: label + ' ' + state,
    text:    'Your ' + entity + ' is now ' + state + '.',
  };
}

export function registerNotifySubscribers() {
  for (const b of BINDINGS) {
    subscribe(b.entity + '.' + (b.event || b.state), async (payload) => {
      try {
        const record = payload && payload.data ? (payload.data[b.entity] || payload.data.record || payload.data) : {};
        const recipients = await resolveRecipients(payload.tenantId, record, b.recipient, b.channel);
        if (recipients.length === 0) return;
        const { subject, text } = buildMessage(b.entity, b.state);
        for (const to of recipients) {
          await sendViaEmail(to, subject, text);
        }
      } catch (err) {
        console.warn('[notify] ' + b.entity + '.' + b.state + ' handler error: ' + (err && err.message));
      }
    });
    console.log('   🔔 notify: ' + b.channel + ' ' + b.recipient + ' ← ' + b.entity + '.' + b.state);
  }
}
