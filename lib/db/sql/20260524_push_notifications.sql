CREATE TABLE IF NOT EXISTS user_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  endpoint text NOT NULL,
  endpoint_hash text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  content_encoding text NOT NULL DEFAULT 'aes128gcm',
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_enabled boolean NOT NULL DEFAULT true,
  failure_count integer NOT NULL DEFAULT 0,
  last_error text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_push_subscriptions_user_endpoint_idx
  ON user_push_subscriptions (user_id, endpoint_hash);

CREATE INDEX IF NOT EXISTS user_push_subscriptions_user_enabled_idx
  ON user_push_subscriptions (user_id, is_enabled);

CREATE INDEX IF NOT EXISTS user_push_subscriptions_updated_idx
  ON user_push_subscriptions (updated_at);
