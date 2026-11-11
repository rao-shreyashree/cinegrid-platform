// Generate the ER diagram (Mermaid) from the live database schema.
// Run from the repo root, against a fully built and migrated DB:   node scripts/gen_erd.mjs
// Writes docs/er-diagram/erd.mmd (raw Mermaid) and docs/er-diagram/README.md (GitHub renders the diagram).
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

try {
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* no .env: rely on the environment */ }
if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is not set"); process.exit(1); }

const TYPE = { int4: "int", int8: "bigint", int2: "smallint", bool: "boolean", bpchar: "char", float8: "float", float4: "real" };
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

try {
  const tables = (await pool.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`
  )).rows.map((r) => r.table_name);

  const columns = (await pool.query(
    `SELECT c.table_name, c.column_name, c.udt_name, c.is_nullable
       FROM information_schema.columns c
       JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      ORDER BY c.table_name, c.ordinal_position`
  )).rows;

  const cons = (await pool.query(
    `SELECT con.contype, cl.relname AS tbl, fcl.relname AS ref_tbl,
            array(SELECT a.attname::text FROM unnest(con.conkey) WITH ORDINALITY k(attnum, ord)
                  JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum ORDER BY k.ord) AS cols
       FROM pg_constraint con
       JOIN pg_class cl ON cl.oid = con.conrelid
       JOIN pg_namespace n ON n.oid = cl.relnamespace
       LEFT JOIN pg_class fcl ON fcl.oid = con.confrelid
      WHERE n.nspname = 'public' AND con.contype IN ('p', 'f', 'u')
      ORDER BY cl.relname, con.conname`
  )).rows;

  const key = (t, cols) => t + "|" + [...cols].sort().join(",");
  const uniqueSets = new Set(cons.filter((c) => c.contype !== "f").map((c) => key(c.tbl, c.cols)));
  const pkCols = new Map(), fkCols = new Map(), ukCols = new Map();
  const add = (m, t, cols) => { m.set(t, new Set([...(m.get(t) ?? []), ...cols])); };
  for (const c of cons) {
    if (c.contype === "p") add(pkCols, c.tbl, c.cols);
    else if (c.contype === "f") add(fkCols, c.tbl, c.cols);
    else if (c.cols.length === 1) add(ukCols, c.tbl, c.cols);
  }
  const nullable = new Map(columns.map((c) => [c.table_name + "." + c.column_name, c.is_nullable === "YES"]));

  const out = ["erDiagram"];
  for (const t of tables) {
    out.push(`    ${t} {`);
    for (const c of columns.filter((x) => x.table_name === t)) {
      const flags = [];
      if (pkCols.get(t)?.has(c.column_name)) flags.push("PK");
      if (fkCols.get(t)?.has(c.column_name)) flags.push("FK");
      if (ukCols.get(t)?.has(c.column_name) && !pkCols.get(t)?.has(c.column_name)) flags.push("UK");
      const type = (TYPE[c.udt_name] ?? c.udt_name).replace(/[^A-Za-z0-9_]/g, "_");
      out.push(`        ${type} ${c.column_name}${flags.length ? " " + flags.join(", ") : ""}`);
    }
    out.push("    }");
  }
  out.push("");

  const rels = [];
  for (const c of cons.filter((x) => x.contype === "f")) {
    const required = c.cols.every((col) => nullable.get(c.tbl + "." + col) === false);
    const parentSide = required ? "||" : "|o";
    const childSide = uniqueSets.has(key(c.tbl, c.cols)) ? "o|" : "o{";
    rels.push(`    ${c.ref_tbl} ${parentSide}--${childSide} ${c.tbl} : "${c.cols.join(", ")}"`);
  }
  rels.sort();
  out.push(...rels);

  const mermaid = out.join("\n") + "\n";
  const dir = path.join("docs", "er-diagram");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "erd.mmd"), mermaid);
  fs.writeFileSync(
    path.join(dir, "README.md"),
    `# CineGrid ER diagram

Generated from the live PostgreSQL schema by \`node scripts/gen_erd.mjs\`. Do not edit by hand: re-run after any schema change.

\`\`\`mermaid
${mermaid}\`\`\`

**Legend:** PK primary key, FK foreign key, UK unique.
\`||--o{\` one to many (parent required), \`|o--o{\` one to many (parent optional), \`o|\` one to one.
The EXCLUDE constraints (\`no_location_overlap\`, \`no_equipment_overlap\`) are not drawn; see \`database/ddl/01_schema.sql\`.
`
  );
  console.log(`${tables.length} tables, ${rels.length} relationships -> docs/er-diagram/erd.mmd and README.md`);
} finally {
  await pool.end();
}
