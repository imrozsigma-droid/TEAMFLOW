-- ═══ Business Logic Tables ═══

-- Settlement / Payout
-- Settlements / payouts
CREATE TABLE IF NOT EXISTS "settlements" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "merchant_id" UUID NOT NULL,
  "amount_cents" BIGINT NOT NULL CHECK (amount_cents > 0),
  "currency" VARCHAR(3) NOT NULL,
  "cycle" VARCHAR(10) NOT NULL DEFAULT 'T+1',
  "settlement_date" DATE NOT NULL,
  "idempotency_key" VARCHAR(64) UNIQUE,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  "error" TEXT,
  "processed_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deleted_at" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_settlements_merchant ON "settlements" (tenant_id, merchant_id);
CREATE INDEX IF NOT EXISTS idx_settlements_due ON "settlements" (tenant_id, status, settlement_date) WHERE status = 'pending';

ALTER TABLE "settlements" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "settlements_tenant" ON "settlements";
CREATE POLICY settlements_tenant ON settlements USING (tenant_id = current_setting('app.tenant_id', true)::uuid);


-- Sequential Reference Generator
-- Reference counter for sequential IDs
CREATE TABLE IF NOT EXISTS "reference_counters" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "prefix" VARCHAR(10) NOT NULL,
  "last_value" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_ref_counter ON "reference_counters" (tenant_id, prefix);
ALTER TABLE reference_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reference_counters_tenant" ON "reference_counters";
CREATE POLICY reference_counters_tenant ON reference_counters USING (tenant_id = current_setting('app.tenant_id', true)::uuid);


-- Notification Queue

-- ── Notification Queue Tables ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notification_templates (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL,
  code              TEXT        NOT NULL,            -- e.g. 'order_confirmed'
  notification_type TEXT        NOT NULL,
  subject_template  TEXT,                            -- nullable (not used for push/sms)
  body_template     TEXT        NOT NULL,            -- supports {{variable}} placeholders
  description       TEXT,
  is_active         BOOLEAN     NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ,
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL,
  user_id           UUID        NOT NULL,
  channel           TEXT        NOT NULL CHECK (channel IN ('email','sms','push','in_app')),
  notification_type TEXT        NOT NULL,            -- specific type or '*' for all
  is_enabled        BOOLEAN     NOT NULL DEFAULT true,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id, channel, notification_type)
);

CREATE TABLE IF NOT EXISTS notifications (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL,
  recipient_id      UUID        NOT NULL,
  channel           TEXT        NOT NULL CHECK (channel IN ('email','sms','push','in_app')),
  notification_type TEXT        NOT NULL,
  subject           TEXT,
  body              TEXT        NOT NULL,
  metadata          JSONB       NOT NULL DEFAULT '{}',
  idempotency_key   TEXT        NOT NULL,
  status            TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','sending','sent','failed','suppressed')),
  retry_count       SMALLINT    NOT NULL DEFAULT 0,
  last_error        TEXT,
  next_retry_at     TIMESTAMPTZ,
  scheduled_at      TIMESTAMPTZ,
  sent_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ,
  UNIQUE (tenant_id, idempotency_key)
);

-- RLS
ALTER TABLE notification_templates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications            ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation" ON "notification_templates";
CREATE POLICY tenant_isolation ON notification_templates
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS "tenant_isolation" ON "notification_preferences";
CREATE POLICY tenant_isolation ON notification_preferences
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

DROP POLICY IF EXISTS "tenant_isolation" ON "notifications";
CREATE POLICY tenant_isolation ON notifications
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Worker poll index — partial index keeps it tiny
CREATE INDEX IF NOT EXISTS idx_notifications_pending
  ON notifications (tenant_id, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_notifications_scheduled
  ON notifications (scheduled_at)
  WHERE status = 'pending' AND scheduled_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient
  ON notifications (tenant_id, recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_prefs_lookup
  ON notification_preferences (tenant_id, user_id, channel);

-- Append-only guard: sent notifications cannot be deleted or have status reverted
CREATE RULE no_delete_sent_notification AS
  ON DELETE TO notifications
  WHERE OLD.status = 'sent'
  DO INSTEAD NOTHING;


-- Multi-Currency / FX
-- Global ISO-4217 reference data (facts, not tenant data — no tenant_id/RLS).
-- Read-only by design: no write endpoint exists; exponent drives all rounding.
CREATE TABLE IF NOT EXISTS currencies (
  code     TEXT PRIMARY KEY CHECK (code ~ '^[A-Z]{3}$'),
  name     TEXT NOT NULL,
  exponent SMALLINT NOT NULL DEFAULT 2 CHECK (exponent BETWEEN 0 AND 4),
  active   BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO currencies (code, name, exponent) VALUES
  ('USD', 'US Dollar', 2), ('EUR', 'Euro', 2), ('GBP', 'Pound Sterling', 2),
  ('INR', 'Indian Rupee', 2), ('JPY', 'Japanese Yen', 0), ('CNY', 'Yuan Renminbi', 2),
  ('AUD', 'Australian Dollar', 2), ('CAD', 'Canadian Dollar', 2), ('CHF', 'Swiss Franc', 2),
  ('SGD', 'Singapore Dollar', 2), ('HKD', 'Hong Kong Dollar', 2), ('AED', 'UAE Dirham', 2),
  ('SAR', 'Saudi Riyal', 2), ('NZD', 'New Zealand Dollar', 2), ('ZAR', 'South African Rand', 2),
  ('KWD', 'Kuwaiti Dinar', 3), ('BHD', 'Bahraini Dinar', 3), ('OMR', 'Omani Rial', 3)
ON CONFLICT (code) DO NOTHING;

-- Append-only: rates are inserted, never updated — history IS the audit trail.
CREATE TABLE IF NOT EXISTS exchange_rates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL,
  base_currency  TEXT NOT NULL REFERENCES currencies(code),
  quote_currency TEXT NOT NULL REFERENCES currencies(code),
  rate           NUMERIC(24,12) NOT NULL CHECK (rate > 0),
  source         TEXT NOT NULL DEFAULT 'manual',
  effective_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by     UUID,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  CHECK (base_currency <> quote_currency)
);

CREATE INDEX IF NOT EXISTS idx_fx_rates_lookup ON exchange_rates (tenant_id, base_currency, quote_currency, effective_at DESC);

ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS exchange_rates_tenant ON exchange_rates;
DROP POLICY IF EXISTS "exchange_rates_tenant" ON "exchange_rates";
CREATE POLICY exchange_rates_tenant ON exchange_rates
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE TABLE IF NOT EXISTS fx_conversions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  rate_id       UUID REFERENCES exchange_rates(id),
  from_currency TEXT NOT NULL REFERENCES currencies(code),
  to_currency   TEXT NOT NULL REFERENCES currencies(code),
  amount_in     NUMERIC(28,10) NOT NULL CHECK (amount_in > 0),
  amount_out    NUMERIC(38,10) NOT NULL CHECK (amount_out >= 0),
  rate_used     NUMERIC(24,12) NOT NULL CHECK (rate_used > 0),
  inverted      BOOLEAN NOT NULL DEFAULT FALSE,
  reference     TEXT,
  created_by    UUID,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fx_conversions_tenant ON fx_conversions (tenant_id, created_at DESC);

ALTER TABLE fx_conversions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fx_conversions_tenant ON fx_conversions;
DROP POLICY IF EXISTS "fx_conversions_tenant" ON "fx_conversions";
CREATE POLICY fx_conversions_tenant ON fx_conversions
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

