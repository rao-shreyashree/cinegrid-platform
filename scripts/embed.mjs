// Fill the embedding columns of location, equipment and scene.
// Run from the repo root, after all seeds:   node scripts/embed.mjs
//   --all   re-embed every row (default: only rows where embedding IS NULL, so it is safe to re-run)
import fs from "node:fs";
import pg from "pg";
import { pipeline } from "@xenova/transformers";

try {
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* no .env: rely on the environment */ }

if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is not set"); process.exit(1); }

const all = process.argv.includes("--all");
const BATCH = 32;

// The text that gets embedded for each table (null parts are skipped by concat_ws).
const TARGETS = [
  { table: "location",  idCol: "location_id",
    select: `SELECT location_id AS id, concat_ws('. ', name, replace(type, '_', ' '), description) AS text FROM location` },
  { table: "equipment", idCol: "equipment_id",
    select: `SELECT equipment_id AS id, concat_ws('. ', name, category, description) AS text FROM equipment` },
  { table: "scene",     idCol: "scene_id",
    select: `SELECT scene_id AS id, concat_ws('. ', description, 'Needs a ' || replace(required_location_type, '_', ' ') || ' location') AS text FROM scene` },
];

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
console.log("Loading model (first run downloads about 25 MB)...");
const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");

try {
  for (const t of TARGETS) {
    const { rows } = await pool.query(`${t.select} ${all ? "" : "WHERE embedding IS NULL"} ORDER BY 1`);
    const todo = rows.filter((r) => r.text && r.text.trim());
    console.log(`${t.table}: ${todo.length} to embed`);
    for (let i = 0; i < todo.length; i += BATCH) {
      const chunk = todo.slice(i, i + BATCH);
      const out = await extractor(chunk.map((r) => r.text), { pooling: "mean", normalize: true });
      const vectors = out.tolist();
      for (let j = 0; j < chunk.length; j++) {
        await pool.query(`UPDATE ${t.table} SET embedding = $2::vector WHERE ${t.idCol} = $1`,
          [chunk[j].id, "[" + vectors[j].join(",") + "]"]);
      }
      process.stdout.write(`  ${Math.min(i + BATCH, todo.length)}/${todo.length}\r`);
    }
    console.log(`${t.table}: done      `);
  }
} finally {
  await pool.end();
}
