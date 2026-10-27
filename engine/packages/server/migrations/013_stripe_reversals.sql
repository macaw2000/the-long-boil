-- Stripe payments taken back (GDD section 8). A bought delivery keeps the
-- PaymentIntent that a refund or dispute names; a full refund or a dispute
-- inside the lock revokes it, and a revoked delivery is never delivered. An
-- account keeps the Stripe Customer its first checkout made, so its later
-- checkouts, and a subscription, are one customer in Stripe.
ALTER TABLE crate_deliveries
  ADD COLUMN payment_intent text UNIQUE,
  ADD COLUMN revoked_at     timestamptz;
DROP INDEX crate_deliveries_waiting;
CREATE INDEX crate_deliveries_waiting ON crate_deliveries (tinker_id) WHERE delivered_at IS NULL AND revoked_at IS NULL;

ALTER TABLE accounts ADD COLUMN stripe_customer text;
