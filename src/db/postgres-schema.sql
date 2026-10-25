-- ============================================================================
-- SocialPulse Studio - Enterprise PostgreSQL Production Schema
-- Includes Row-Level Security (RLS), Connection Pooling, & Multi-Tenant Scoping
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Clients / Tenant Organizations
CREATE TABLE IF NOT EXISTS clients (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    color_code VARCHAR(10) DEFAULT '#3B82F6',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Users & RBAC
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'EDITOR' CHECK (role IN ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER')),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Social Accounts
CREATE TABLE IF NOT EXISTS social_accounts (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    account_handle VARCHAR(255),
    avatar_url TEXT,
    encrypted_tokens TEXT,
    is_active SMALLINT DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Posts & Editorial Schedule
CREATE TABLE IF NOT EXISTS posts (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL DEFAULT 1 REFERENCES clients(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'completed',
    scheduled_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    master_text TEXT NOT NULL,
    master_hashtags TEXT,
    media_path TEXT,
    media_filename TEXT,
    media_mimetype VARCHAR(100),
    media_overrides JSONB DEFAULT '{}'::jsonb,
    platforms JSONB NOT NULL DEFAULT '[]'::jsonb,
    youtube_title VARCHAR(255),
    youtube_tags TEXT,
    youtube_privacy VARCHAR(50) DEFAULT 'unlisted',
    x_post TEXT,
    linkedin_post TEXT,
    instagram_caption TEXT,
    threads_post TEXT,
    facebook_post TEXT,
    results JSONB DEFAULT '{}'::jsonb,
    error_summary TEXT,
    first_comment TEXT,
    worker_id VARCHAR(100),
    locked_until BIGINT DEFAULT 0,
    attempts INTEGER DEFAULT 0,
    youtube_category_id VARCHAR(20) DEFAULT '28',
    youtube_made_for_kids SMALLINT DEFAULT 0,
    youtube_synthetic_media SMALLINT DEFAULT 0,
    youtube_notify_subscribers SMALLINT DEFAULT 1,
    youtube_custom_thumb_path TEXT,
    x_alt_text TEXT,
    linkedin_disable_reshare SMALLINT DEFAULT 0,
    linkedin_doc_path TEXT,
    instagram_audio_name VARCHAR(255),
    instagram_is_trial SMALLINT DEFAULT 0,
    workflow_state VARCHAR(50) DEFAULT 'APPROVED',
    approval_token_hash VARCHAR(255),
    token_expires_at BIGINT
);

-- 5. Queue Rules
CREATE TABLE IF NOT EXISTS queue_rules (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',
    iso_weekday SMALLINT NOT NULL CHECK (iso_weekday BETWEEN 1 AND 7),
    local_time VARCHAR(10) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. Metrics Snapshots
CREATE TABLE IF NOT EXISTS post_metrics_snapshots (
    id SERIAL PRIMARY KEY,
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL,
    snapshot_type VARCHAR(50) NOT NULL,
    snapshot_time BIGINT NOT NULL,
    impression_count BIGINT DEFAULT 0,
    reach_count BIGINT DEFAULT 0,
    like_count BIGINT DEFAULT 0,
    reply_count BIGINT DEFAULT 0,
    repost_count BIGINT DEFAULT 0,
    raw_metrics JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 7. Community Engagement Tasks
CREATE TABLE IF NOT EXISTS engagement_tasks (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL,
    external_comment_id VARCHAR(255) NOT NULL,
    parent_post_id VARCHAR(255) NOT NULL,
    author_name VARCHAR(255) NOT NULL,
    comment_text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_replied SMALLINT DEFAULT 0,
    reply_text TEXT,
    replied_at TIMESTAMPTZ,
    CONSTRAINT uq_engagement_task UNIQUE(platform, external_comment_id)
);

-- 8. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100),
    metadata JSONB,
    ip_address VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 9. Idempotency Keys
CREATE TABLE IF NOT EXISTS idempotency_keys (
    idempotency_key VARCHAR(255) PRIMARY KEY,
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    response_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at BIGINT NOT NULL
);

-- 10. Key-Value Settings
CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(255) PRIMARY KEY,
    value TEXT NOT NULL,
    encrypted SMALLINT DEFAULT 0
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_posts_client_id ON posts(client_id);
CREATE INDEX IF NOT EXISTS idx_posts_status_scheduled ON posts(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_social_accounts_client ON social_accounts(client_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_client ON audit_logs(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_engagement_tasks_client ON engagement_tasks(client_id, is_replied);
CREATE INDEX IF NOT EXISTS idx_metrics_post_id ON post_metrics_snapshots(post_id);

-- Row-Level Security (RLS) Configuration
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Note: RLS Policies can be enforced by setting session variable:
-- SET LOCAL app.current_client_id = '1';
CREATE POLICY tenant_isolation_posts ON posts
    FOR ALL
    USING (
        current_setting('app.is_owner', true) = 'true' OR
        client_id = NULLIF(current_setting('app.current_client_id', true), '')::integer
    );

CREATE POLICY tenant_isolation_social_accounts ON social_accounts
    FOR ALL
    USING (
        current_setting('app.is_owner', true) = 'true' OR
        client_id = NULLIF(current_setting('app.current_client_id', true), '')::integer
    );
