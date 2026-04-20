import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

dotenv.config();

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  throw new Error("Missing SUPABASE_DB_URL in backend/.env");
}

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "..", "..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");

function checksum(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

async function main() {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    await client.query(`
      create table if not exists public.schema_migrations (
        id text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      );
    `);

    const files = (await fs.readdir(migrationsDir))
      .filter((name) => name.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b));

    const appliedRows = await client.query<{ id: string; checksum: string }>(
      "select id, checksum from public.schema_migrations;"
    );
    const applied = new Map(appliedRows.rows.map((row) => [row.id, row.checksum]));

    if (files.length === 0) {
      console.log("No migration files found.");
      return;
    }

    for (const file of files) {
      const fullPath = path.join(migrationsDir, file);
      const sql = await fs.readFile(fullPath, "utf8");
      const hash = checksum(sql);
      const previousHash = applied.get(file);

      if (previousHash) {
        if (previousHash !== hash) {
          throw new Error(`Checksum mismatch for migration ${file}. Do not edit applied migrations.`);
        }
        console.log(`Skipping ${file} (already applied)`);
        continue;
      }

      console.log(`Applying ${file}...`);
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into public.schema_migrations (id, checksum) values ($1, $2)", [file, hash]);
        await client.query("commit");
        console.log(`Applied ${file}`);
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  const err = error as NodeJS.ErrnoException;
  if (err?.code === "ENOTFOUND") {
    console.error("Could not resolve Supabase DB host from SUPABASE_DB_URL.");
    console.error("Check the exact connection string from Supabase Dashboard -> Project Settings -> Database.");
    console.error("Tip: copy the full URI, including sslmode=require, and verify the project ref/hostname.");
    console.error(
      "If your host is db.<project-ref>.supabase.co, note it can be IPv6-only. Use the Connection Pooler (IPv4) URI instead."
    );
  }
  console.error(error);
  process.exit(1);
});
