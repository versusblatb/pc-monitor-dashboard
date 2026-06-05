import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('[migrate] DATABASE_URL is not set');
  process.exit(1);
}

const { default: pg } = await import('pg');
const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : undefined });

const dir = path.join(__dirname, '../migrations');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
for (const file of files) {
  const sql = fs.readFileSync(path.join(dir, file), 'utf8');
  await pool.query(sql);
  console.log(`[migrate] applied ${file}`);
}
await pool.end();
