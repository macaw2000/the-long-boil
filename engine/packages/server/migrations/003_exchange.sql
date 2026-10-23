-- The Brass Exchange and the Counting-House window (milestone 5).
-- An open order holds its escrow: a sell order its items, a buy order its
-- Crowns at the limit price. A fill pays the taker at once; the resting
-- side's half waits in exchange_fills until that Tinker is next touched.

-- GDD section 10: one trading Tinker per account, fixed by its first order.
ALTER TABLE accounts ADD COLUMN trading_tinker_id bigint REFERENCES tinkers (id);

CREATE TABLE exchange_orders (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tinker_id     bigint NOT NULL REFERENCES tinkers (id),
  item          text NOT NULL,
  side          text NOT NULL CHECK (side IN ('buy', 'sell')),
  price         bigint NOT NULL CHECK (price >= 1),
  qty_total     bigint NOT NULL CHECK (qty_total >= 1),
  qty_open      bigint NOT NULL CHECK (qty_open >= 0 AND qty_open <= qty_total),
  placed_at     timestamptz NOT NULL,
  expires_at    timestamptz NOT NULL,
  closed_at     timestamptz,
  closed_reason text CHECK (closed_reason IN ('filled', 'cancelled', 'expired'))
);
CREATE INDEX exchange_orders_book ON exchange_orders (item, side, price, id) WHERE closed_at IS NULL;
CREATE INDEX exchange_orders_tinker ON exchange_orders (tinker_id) WHERE closed_at IS NULL;

CREATE TABLE exchange_fills (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item              text NOT NULL,
  price             bigint NOT NULL,
  qty               bigint NOT NULL CHECK (qty >= 1),
  tax               bigint NOT NULL CHECK (tax >= 0),
  buy_order_id      bigint NOT NULL REFERENCES exchange_orders (id),
  sell_order_id     bigint NOT NULL REFERENCES exchange_orders (id),
  buyer_id          bigint NOT NULL REFERENCES tinkers (id),
  seller_id         bigint NOT NULL REFERENCES tinkers (id),
  at                timestamptz NOT NULL,
  buyer_collected   boolean NOT NULL,
  seller_collected  boolean NOT NULL
);
CREATE INDEX exchange_fills_buyer_due ON exchange_fills (buyer_id) WHERE NOT buyer_collected;
CREATE INDEX exchange_fills_seller_due ON exchange_fills (seller_id) WHERE NOT seller_collected;

-- Collectors buy a capped amount per account per week (GDD section 5,
-- Curios: "capped per player per week").
CREATE TABLE collector_sales (
  account_id  bigint NOT NULL REFERENCES accounts (id),
  item        text NOT NULL,
  week_start  timestamptz NOT NULL,
  qty         bigint NOT NULL CHECK (qty >= 0),
  PRIMARY KEY (account_id, item, week_start)
);
