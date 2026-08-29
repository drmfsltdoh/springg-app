const app = require("./app");
const env = require("./config/env");

app.listen(env.port, () => {
  console.log(`SPRING backend running on port ${env.port} (${env.nodeEnv})`);
  if (!env.databaseUrl) {
    console.warn("⚠️  No DATABASE_URL set — nothing will work until you configure .env and run the migration.");
  }
});
