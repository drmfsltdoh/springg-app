// Run this once to set up your database: `node src/db/migrate.js`
// Safe to re-run — every statement in schema.sql uses IF NOT EXISTS /
// ON CONFLICT DO NOTHING where it matters, so re-running won't duplicate data.
const fs = require("fs");
const path = require("path");
const { pool } = require("../config/db");

async function migrate() {
  const schemaPath = path.join(__dirname, "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");

  console.log("Running SPRING database migration...");
  try {
    await pool.query(schema);
    console.log("✅ Migration complete. All tables and seed config are in place.");
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
