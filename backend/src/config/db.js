const { Pool } = require("pg");
const env = require("./env");

if (!env.databaseUrl) {
  console.warn(
    "⚠️  DATABASE_URL is not set. Copy .env.example to .env and fill in your Postgres connection string before starting the server."
  );
}

// A single shared pool — every service imports { query } from here rather
// than opening its own connections. Use query() for simple statements and
// getClient() when you need an explicit transaction (see walletService.js
// for the pattern: BEGIN, several statements, COMMIT/ROLLBACK).
// SSL requirement depends on WHERE the database is, not what NODE_ENV is —
// Supabase/Neon/Render Postgres all require SSL even when you're migrating
// from your own laptop in development. A plain local Postgres (localhost/
// 127.0.0.1) usually isn't configured for SSL at all, so forcing it on
// there would break local dev. Detect from the actual host instead.
function needsSsl(connectionString) {
  if (!connectionString) return false;
  try {
    const host = new URL(connectionString).hostname;
    return host !== "localhost" && host !== "127.0.0.1";
  } catch {
    return true; // if we can't parse it, assume it's a remote managed database
  }
}

const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: needsSsl(env.databaseUrl) ? { rejectUnauthorized: false } : false,
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle Postgres client", err);
});

async function query(text, params) {
  return pool.query(text, params);
}

async function getClient() {
  return pool.connect();
}

module.exports = { pool, query, getClient };
