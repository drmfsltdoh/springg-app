-- SPRING database schema (PostgreSQL)
-- Every money/trip-state table is append-only or fully audit-logged.
-- Run via: node src/db/migrate.js  (see that file)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────────────────
-- USERS & IDENTITY
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone VARCHAR(20) UNIQUE NOT NULL,          -- Nigeria-first: phone is the trust anchor
  email VARCHAR(255) UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(10) NOT NULL CHECK (role IN ('rider', 'driver', 'admin')),
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'deactivated')),
  phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

CREATE TABLE otp_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone VARCHAR(20) NOT NULL,
  code VARCHAR(6) NOT NULL,
  purpose VARCHAR(20) NOT NULL DEFAULT 'signup', -- signup | login | reset
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- NOTE: no SMS provider is configured yet (see services/otpService.js).
-- Codes are generated and stored here so the flow is real end-to-end;
-- until an SMS provider key is added, the code is returned in the API
-- response in development mode only — never in production.

CREATE TABLE wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_type VARCHAR(10) NOT NULL CHECK (owner_type IN ('rider', 'driver')),
  owner_id UUID NOT NULL,
  balance BIGINT NOT NULL DEFAULT 0,          -- stored in kobo (₦1 = 100 kobo) to avoid float errors
  pending_balance BIGINT NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_type, owner_id)
);

CREATE TABLE riders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  home_address TEXT,
  wallet_id UUID REFERENCES wallets(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE trusted_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE drivers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  legal_name VARCHAR(255) NOT NULL,
  verification_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'approved', 'rejected', 'suspended')),
  verification_notes TEXT,
  rating_avg NUMERIC(3,2) NOT NULL DEFAULT 5.00,
  total_trips INTEGER NOT NULL DEFAULT 0,
  online BOOLEAN NOT NULL DEFAULT FALSE,
  current_lat DOUBLE PRECISION,
  current_lng DOUBLE PRECISION,
  location_updated_at TIMESTAMPTZ,
  wallet_id UUID REFERENCES wallets(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  make VARCHAR(100),
  model VARCHAR(100),
  year INTEGER,
  plate_number VARCHAR(20) NOT NULL,
  color VARCHAR(50),
  category VARCHAR(20) NOT NULL DEFAULT 'economy'
    CHECK (category IN ('economy', 'comfort', 'xl')),
  verification_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE driver_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL CHECK (type IN ('license', 'national_id', 'vehicle_reg', 'insurance', 'profile_photo')),
  file_base64 TEXT,           -- MVP storage; swap for S3/Cloudinary URL later without changing callers
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- TRIPS
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE trips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rider_id UUID NOT NULL REFERENCES riders(id),
  driver_id UUID REFERENCES drivers(id),           -- null until assigned
  vehicle_id UUID REFERENCES vehicles(id),
  status VARCHAR(30) NOT NULL DEFAULT 'requested' CHECK (status IN (
    'requested', 'searching_for_driver', 'driver_assigned', 'driver_accepted',
    'driver_en_route_to_pickup', 'driver_arrived', 'rider_onboard',
    'trip_started', 'trip_completed', 'payment_completed', 'rated',
    'cancelled_by_rider', 'cancelled_by_driver', 'cancelled_for_safety',
    'no_driver_found', 'payment_failed', 'disputed'
  )),
  pickup_lat DOUBLE PRECISION NOT NULL,
  pickup_lng DOUBLE PRECISION NOT NULL,
  pickup_address TEXT NOT NULL,
  destination_lat DOUBLE PRECISION NOT NULL,
  destination_lng DOUBLE PRECISION NOT NULL,
  destination_address TEXT NOT NULL,
  vehicle_category VARCHAR(20) NOT NULL DEFAULT 'economy',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  arrived_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by VARCHAR(10) CHECK (cancelled_by IN ('rider', 'driver', 'system')),
  cancellation_reason TEXT
);

CREATE INDEX idx_trips_rider ON trips(rider_id);
CREATE INDEX idx_trips_driver ON trips(driver_id);
CREATE INDEX idx_trips_status ON trips(status);

-- Append-only GPS breadcrumb trail. Written at intelligent intervals
-- (see locationService.js — not on every GPS tick) to control write volume.
CREATE TABLE trip_locations (
  id BIGSERIAL PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_trip_locations_trip ON trip_locations(trip_id, recorded_at);

-- Full audit trail of every state transition and notable event on a trip.
CREATE TABLE trip_events (
  id BIGSERIAL PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  actor VARCHAR(10) CHECK (actor IN ('rider', 'driver', 'system', 'admin')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_trip_events_trip ON trip_events(trip_id, created_at);

-- Immutable once written. Never overwritten — a new trip means a new row.
CREATE TABLE fare_breakdowns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  base_fare BIGINT NOT NULL,          -- all money fields in kobo
  distance_cost BIGINT NOT NULL,
  time_cost BIGINT NOT NULL,
  booking_fee BIGINT NOT NULL,
  surge_multiplier NUMERIC(3,2) NOT NULL DEFAULT 1.00,
  tolls BIGINT NOT NULL DEFAULT 0,
  discount BIGINT NOT NULL DEFAULT 0,
  platform_fee BIGINT NOT NULL,
  driver_earnings BIGINT NOT NULL,
  operating_cost_estimate BIGINT NOT NULL,
  net_driver_estimate BIGINT NOT NULL,
  total BIGINT NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
  distance_km NUMERIC(6,2) NOT NULL,
  duration_min NUMERIC(6,2) NOT NULL,
  is_estimate BOOLEAN NOT NULL DEFAULT TRUE,   -- true = pre-trip quote, false = final
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fare_breakdowns_trip ON fare_breakdowns(trip_id);

-- ─────────────────────────────────────────────────────────────────────────
-- PAYMENTS & WALLETS
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID REFERENCES trips(id),
  rider_id UUID NOT NULL REFERENCES riders(id),
  amount BIGINT NOT NULL,             -- kobo
  method VARCHAR(20) NOT NULL CHECK (method IN ('cash', 'card', 'transfer', 'wallet')),
  provider VARCHAR(30),               -- 'paystack' | 'flutterwave' | null for cash/wallet
  provider_ref VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'success', 'failed', 'refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_trip ON payments(trip_id);

CREATE TABLE wallet_transactions (
  id BIGSERIAL PRIMARY KEY,
  wallet_id UUID NOT NULL REFERENCES wallets(id),
  type VARCHAR(10) NOT NULL CHECK (type IN ('credit', 'debit')),
  amount BIGINT NOT NULL,             -- kobo, always positive; type sets direction
  reason VARCHAR(50) NOT NULL,        -- 'trip_earning' | 'topup' | 'refund' | 'payout' | 'bonus' | 'cancellation_fee'
  reference_id UUID,                  -- trip_id, payout_id, etc — whatever caused this entry
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wallet_tx_wallet ON wallet_transactions(wallet_id, created_at);
-- Wallet balance is ALWAYS derived as SUM(credits) - SUM(debits) for a wallet.
-- wallets.balance is a cached total, updated transactionally alongside each
-- insert here — never hand-edited directly. See services/walletService.js.

CREATE TABLE driver_payouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID NOT NULL REFERENCES drivers(id),
  amount BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'success', 'failed')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  provider_ref VARCHAR(255)
);

-- ─────────────────────────────────────────────────────────────────────────
-- RATINGS, SUPPORT, SAFETY
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE ratings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES trips(id),
  from_role VARCHAR(10) NOT NULL CHECK (from_role IN ('rider', 'driver')),
  to_user_id UUID NOT NULL REFERENCES users(id),
  stars SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  tags JSONB DEFAULT '[]',            -- e.g. ["respectful","safe_driving","clean_vehicle"]
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_ratings_unique ON ratings(trip_id, from_role);

CREATE TABLE support_tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  category VARCHAR(20) NOT NULL CHECK (category IN
    ('rider', 'driver', 'safety', 'payment', 'trip', 'account')),
  trip_id UUID REFERENCES trips(id),
  description TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_review', 'waiting_for_user', 'resolved', 'escalated')),
  assigned_agent_id UUID REFERENCES users(id),
  resolution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE support_messages (
  id BIGSERIAL PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE safety_incidents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID REFERENCES trips(id),
  reported_by UUID NOT NULL REFERENCES users(id),
  category VARCHAR(30) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'flagged'
    CHECK (status IN ('flagged', 'review', 'action_taken', 'dismissed')),
  resolution TEXT,
  reviewed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- Driver account actions — warnings, suspensions, appeals. Nothing is a
-- silent permanent ban: every action has a reason, evidence, and an appeal path.
CREATE TABLE driver_account_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID NOT NULL REFERENCES drivers(id),
  action_type VARCHAR(20) NOT NULL CHECK (action_type IN ('warning', 'temporary_suspension', 'permanent_suspension')),
  reason TEXT NOT NULL,
  evidence TEXT,
  issued_by UUID REFERENCES users(id),
  appeal_status VARCHAR(20) DEFAULT 'none'
    CHECK (appeal_status IN ('none', 'submitted', 'under_review', 'upheld', 'overturned')),
  appeal_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- PROMOTIONS, INCENTIVES, FRAUD, CONFIG
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE promotions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(30) UNIQUE NOT NULL,
  type VARCHAR(10) NOT NULL CHECK (type IN ('percentage', 'fixed')),
  value NUMERIC(10,2) NOT NULL,
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE driver_incentives (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id UUID NOT NULL REFERENCES drivers(id),
  type VARCHAR(50) NOT NULL,           -- e.g. 'trip_milestone', 'off_peak_bonus'
  criteria JSONB NOT NULL DEFAULT '{}',
  reward_amount BIGINT NOT NULL,       -- kobo
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'earned', 'paid')),
  period VARCHAR(20),                  -- e.g. '2026-08'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE fraud_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  flag_type VARCHAR(50) NOT NULL,      -- 'multiple_accounts' | 'gps_anomaly' | 'promo_abuse' | etc
  details JSONB DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'flagged'
    CHECK (status IN ('flagged', 'review', 'action_taken', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every admin-editable platform setting (commission %, base fare, surge cap,
-- cancellation fees...) lives here — editable without a code deploy.
CREATE TABLE admin_config (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id VARCHAR(100),
  before JSONB,
  after JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  type VARCHAR(30),                    -- 'trip_status' | 'payment' | 'support' | 'safety'
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON notifications(user_id, read_at);

-- In-trip chat between rider and driver, scoped per trip (same feature
-- Spring-v5 already had — carried forward here rather than dropped).
CREATE TABLE trip_messages (
  id BIGSERIAL PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id),
  sender_role VARCHAR(10) NOT NULL CHECK (sender_role IN ('rider', 'driver')),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_trip_messages_trip ON trip_messages(trip_id, created_at);

-- ─────────────────────────────────────────────────────────────────────────
-- SEED: default admin-configurable fare/commission values
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO admin_config (key, value) VALUES
  ('fare.base_fare_kobo', '50000'),           -- ₦500
  ('fare.per_km_kobo', '37500'),               -- ₦375/km
  ('fare.per_min_kobo', '5000'),               -- ₦50/min
  ('fare.booking_fee_kobo', '10000'),          -- ₦100
  ('fare.minimum_fare_kobo', '80000'),         -- ₦800
  ('fare.commission_percent', '10'),           -- 10%
  ('fare.surge_max_multiplier', '2.0'),
  ('fare.operating_cost_per_km_kobo', '15000'),-- ₦150/km (fuel estimate)
  ('cancellation.rider_fee_kobo', '30000'),    -- ₦300
  ('cancellation.no_show_wait_minutes', '5'),
  ('cancellation.no_show_fee_kobo', '50000')   -- ₦500
ON CONFLICT (key) DO NOTHING;
