/**
 * ⚡ Transaction Helper
 * Automatic BEGIN/COMMIT/ROLLBACK with retry on serialization failure.
 */

import { pool } from './poolConfig.js';

/**
 * Run callback inside a transaction
 * @param {function} callback - async (client) => result
 * @param {object} opts - { retries, isolationLevel, tenantId, role }
 *   tenantId / role — when provided, bind this transaction's Row-Level-Security
 *   context (app.tenant_id / app.role) so tenant- and role-scoped policies
 *   enforce on this connection. RLS policies are restrictive-only (they narrow
 *   access, never grant it); app-layer requireRole() remains authoritative.
 *   Pass role alongside tenantId (e.g. { tenantId: req.context.tenant_id,
 *   role: req.context.role }) so admin-scoped policies aren't left fail-closed.
 * @returns {*} callback result
 */
export async function withTransaction(callback, opts = {}) {
  const { retries = 3, isolationLevel = 'READ COMMITTED', tenantId = null, role = null } = opts;

  // Validate isolationLevel — whitelist only, never user input
  const VALID_LEVELS = ['READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE', 'READ UNCOMMITTED'];
  const safeLevel = VALID_LEVELS.includes(isolationLevel) ? isolationLevel : 'READ COMMITTED';

  for (let attempt = 1; attempt <= retries; attempt++) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL ' + safeLevel);
      // Bind RLS tenant context — TRANSACTION-LOCAL (3rd arg true). This is
      // critical on a pooled connection: a non-local SET would persist to the
      // next request that reuses this connection and leak tenant context across
      // tenants. set_config(..., true) scopes it to this transaction only.
      if (tenantId) {
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [String(tenantId)]);
      }
      // Bind the role context too (also transaction-local) so admin/owner-scoped
      // policies evaluate against the caller's real role instead of failing closed.
      if (role) {
        await client.query("SELECT set_config('app.role', $1, true)", [String(role)]);
      }
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');

      // Retry on serialization failure
      if (err.code === '40001' && attempt < retries) {
        const delay = Math.pow(2, attempt) * 100;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      throw err;
    } finally {
      client.release();
    }
  }
}

/**
 * Run multiple operations atomically
 * @param {Array<function>} operations - async (client) => result
 * @returns {Array} results
 */
export async function withBatchTransaction(operations) {
  return withTransaction(async (client) => {
    const results = [];
    for (const op of operations) {
      results.push(await op(client));
    }
    return results;
  });
}
