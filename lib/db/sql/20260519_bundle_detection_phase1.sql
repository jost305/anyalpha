DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bundle_label') THEN
    CREATE TYPE bundle_label AS ENUM ('bundled', 'organic', 'suspicious', 'unknown');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS bundle_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain text NOT NULL,
  token_address text NOT NULL,
  token_address_normalized text NOT NULL,
  pair_address text,
  label bundle_label NOT NULL DEFAULT 'unknown',
  score integer NOT NULL DEFAULT 0,
  coordinated_wallets integer NOT NULL DEFAULT 0,
  supply_sniped_pct numeric(9, 4) NOT NULL DEFAULT 0,
  sniper_wallets integer NOT NULL DEFAULT 0,
  deployer_rugs integer NOT NULL DEFAULT 0,
  bundle_wallets_pnl numeric(12, 4),
  retail_avg_pnl numeric(12, 4),
  bundle_still_holding boolean NOT NULL DEFAULT true,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  analysed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS bundle_analysis_chain_token_idx
  ON bundle_analysis (chain, token_address_normalized);

CREATE INDEX IF NOT EXISTS bundle_analysis_label_idx
  ON bundle_analysis (label);

CREATE INDEX IF NOT EXISTS bundle_analysis_score_idx
  ON bundle_analysis (score);

CREATE INDEX IF NOT EXISTS bundle_analysis_updated_idx
  ON bundle_analysis (updated_at);

CREATE TABLE IF NOT EXISTS bundle_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid,
  chain text NOT NULL,
  token_address text NOT NULL,
  token_address_normalized text NOT NULL,
  wallet_address text NOT NULL,
  wallet_address_normalized text NOT NULL,
  block_number numeric(30, 0),
  buy_amount_native numeric(48, 18),
  buy_amount_usd_cents integer,
  supply_pct numeric(9, 4),
  funding_source text,
  wallet_age_days integer,
  is_bot boolean NOT NULL DEFAULT false,
  has_exited boolean NOT NULL DEFAULT false,
  exit_pnl_pct numeric(12, 4),
  detected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS bundle_wallets_chain_token_wallet_idx
  ON bundle_wallets (chain, token_address_normalized, wallet_address_normalized);

CREATE INDEX IF NOT EXISTS bundle_wallets_analysis_idx
  ON bundle_wallets (analysis_id);

CREATE INDEX IF NOT EXISTS bundle_wallets_wallet_idx
  ON bundle_wallets (chain, wallet_address_normalized);

CREATE INDEX IF NOT EXISTS bundle_wallets_exit_idx
  ON bundle_wallets (has_exited);

CREATE TABLE IF NOT EXISTS holder_pnl_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain text NOT NULL,
  token_address text NOT NULL,
  token_address_normalized text NOT NULL,
  in_profit_pct numeric(9, 4),
  breakeven_pct numeric(9, 4),
  in_loss_pct numeric(9, 4),
  bundle_pnl numeric(12, 4),
  retail_pnl numeric(12, 4),
  snapshot_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS holder_pnl_snapshots_token_time_idx
  ON holder_pnl_snapshots (chain, token_address_normalized, snapshot_at);

CREATE TABLE IF NOT EXISTS sniper_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain text NOT NULL,
  wallet_address text NOT NULL,
  wallet_address_normalized text NOT NULL,
  snipe_count integer NOT NULL DEFAULT 1,
  rug_rate numeric(9, 4),
  is_bot boolean NOT NULL DEFAULT false,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sniper_registry_chain_wallet_idx
  ON sniper_registry (chain, wallet_address_normalized);

CREATE INDEX IF NOT EXISTS sniper_registry_last_seen_idx
  ON sniper_registry (last_seen);

CREATE INDEX IF NOT EXISTS sniper_registry_snipe_count_idx
  ON sniper_registry (snipe_count);
