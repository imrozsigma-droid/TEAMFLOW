/**
 * 💸 Settlement Service
 * Batch payouts to merchants on configurable cycles (T+1, T+2).
 * Uses idempotency keys to prevent double settlements.
 */
import { pool } from '../db/pg.js';
import crypto from 'crypto';

/**
 * Create a pending settlement
 */
export async function createSettlement(tenantId, merchantId, amountCents, currency, cycle = 'T+1') {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw Object.assign(new Error('Amount must be a positive integer in smallest currency unit'), { status: 400 });
  }

  const settlementDate = new Date();
  const daysToAdd = cycle === 'T+2' ? 2 : 1;
  settlementDate.setDate(settlementDate.getDate() + daysToAdd);
  // Skip weekends
  if (settlementDate.getDay() === 0) settlementDate.setDate(settlementDate.getDate() + 1);
  if (settlementDate.getDay() === 6) settlementDate.setDate(settlementDate.getDate() + 2);

  const idempotencyKey = crypto.createHash('sha256')
    .update(tenantId + merchantId + amountCents + currency + new Date().toISOString().split('T')[0])
    .digest('hex');

  const { rows } = await pool.query(
    `INSERT INTO settlements (tenant_id, merchant_id, amount_cents, currency, cycle, settlement_date, idempotency_key, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW())
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id, settlement_date, status`,
    [tenantId, merchantId, amountCents, currency, cycle, settlementDate, idempotencyKey]
  );

  if (rows.length === 0) {
    return { duplicate: true, message: 'Settlement already exists for this period' };
  }

  return rows[0];
}

/**
 * Process due settlements — called by cron job
 */
export async function processDueSettlements(tenantId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: due } = await client.query(
      `SELECT id, merchant_id, amount_cents, currency
       FROM settlements
       WHERE tenant_id = $1 AND deleted_at IS NULL AND status = 'pending' AND settlement_date <= NOW()
       FOR UPDATE SKIP LOCKED`,
      [tenantId]
    );

    const results = [];
    for (const settlement of due) {
      try {
        // Mark as processing
        await client.query(
          `UPDATE settlements SET status = 'processing', processed_at = NOW()
           WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
          [settlement.id, tenantId]
        );

        // #22: a settlement is 'completed' ONLY once money has actually moved. There is
        // no declared payment provider, so we must NOT fabricate a completion — that would
        // record a payout that never happened. Wire a provider Transfer API here and mark
        // 'completed' only on its success:
        //   const transfer = await stripe.transfers.create({
        //     amount: settlement.amount_cents,
        //     currency: settlement.currency.toLowerCase(),
        //     destination: merchantStripeAccountId,
        //   });
        //   await client.query(`UPDATE settlements SET status = 'completed', completed_at = NOW() WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`, [settlement.id, tenantId]);
        // Until then the row stays 'processing' (set above) — awaiting a real transfer.
        results.push({ id: settlement.id, status: 'processing', pendingTransfer: true, note: 'No payment provider configured — transfer not executed' });
      } catch (err) {
        await client.query(
          `UPDATE settlements SET status = 'failed', error = $3
           WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
          [settlement.id, tenantId, err.message]
        );
        results.push({ id: settlement.id, status: 'failed', error: err.message });
      }
    }

    await client.query('COMMIT');
    return { processed: results.length, results };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get settlements for a merchant
 */
export async function getMerchantSettlements(tenantId, merchantId, limit = 20, offset = 0) {
  const { rows } = await pool.query(
    `SELECT id, amount_cents, currency, cycle, settlement_date, status, created_at, completed_at
     FROM settlements
     WHERE tenant_id = $1 AND merchant_id = $2 AND deleted_at IS NULL
     ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
    [tenantId, merchantId, limit, offset]
  );
  return rows;
}
