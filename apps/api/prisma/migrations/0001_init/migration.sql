-- gen_random_uuid() lives in pgcrypto on PostgreSQL 16.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE "users" (
    "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "email"         VARCHAR(255) NOT NULL,
    "display_name"  VARCHAR(100) NOT NULL,
    "password_hash" CHAR(60)     NOT NULL,
    "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    "updated_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
    CONSTRAINT "users_email_key" UNIQUE ("email"),
    -- Normalization has to hold for rows inserted directly into the database,
    -- which the product explicitly supports, so it is a constraint rather than
    -- an application-layer convention.
    CONSTRAINT "users_email_lowercase_ck" CHECK ("email" = lower("email"))
);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW."updated_at" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_set_updated_at
    BEFORE UPDATE ON "users"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
