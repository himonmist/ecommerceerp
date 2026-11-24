import { Client } from "pg";

/** Start each E2E run with empty rate-limit windows (the limiter itself is covered by integration tests). */
export default async function globalSetup() {
  const client = new Client({ connectionString: process.env.E2E_DATABASE_URL ?? "postgresql://lv:lv_local_dev@localhost:5432/lv_e2e" });
  await client.connect();
  await client.query("DELETE FROM rate_limits");
  await client.end();
}
