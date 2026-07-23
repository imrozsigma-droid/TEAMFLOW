/**
 * 🔢 Sequential Reference Generator
 * Generates human-readable sequential references like BK-20001, INV-00042.
 * Uses database sequence for atomicity.
 */
import { pool } from '../db/pg.js';

/**
 * Generate next reference for a given prefix
 * @param {string} tenantId
 * @param {string} prefix — 'BK', 'INV', 'ORD', 'TXN'
 * @param {number} padLength — zero-pad length (default 5)
 * @returns {string} e.g. 'BK-20001'
 */
export async function generateReference(tenantId, prefix = 'BK', padLength = 5) {
  const { rows } = await pool.query(
    `INSERT INTO reference_counters (tenant_id, prefix, last_value)
     VALUES ($1, $2, 1)
     ON CONFLICT (tenant_id, prefix)
     DO UPDATE SET last_value = reference_counters.last_value + 1
     RETURNING last_value`,
    [tenantId, prefix]
  );

  const num = rows[0].last_value + 20000; // start from 20001
  return prefix + '-' + String(num).padStart(padLength, '0');
}
