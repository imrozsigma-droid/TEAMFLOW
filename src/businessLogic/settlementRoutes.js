import express from 'express';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';
import { createSettlement, processDueSettlements, getMerchantSettlements } from './settlementService.js';

const router = express.Router();

router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { merchant_id, amount_cents, currency, cycle } = req.body;
    const result = await createSettlement(req.context.tenant_id, merchant_id, amount_cents, currency, cycle);
    res.status(201).json({ data: result });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

router.post('/process', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await processDueSettlements(req.context.tenant_id);
    res.json({ data: result });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

router.get('/merchant/:merchantId', requireAuth, async (req, res) => {
  try {
    const entries = await getMerchantSettlements(req.context.tenant_id, req.params.merchantId);
    res.json({ data: entries });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

export function registerSettlementRoutes(app) { app.use('/api/settlements', router); }
