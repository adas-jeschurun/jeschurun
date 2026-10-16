/** Escape a JS value for embedding in a SQLite SQL literal. */
export function sqlLit(v) {
  if (v == null) return "NULL";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  return `'${String(v).replace(/'/g, "''")}'`;
}

export function sqlBatch(statements, maxChars = 80_000) {
  const batches = [];
  let cur = [];
  let size = 0;
  for (const s of statements) {
    const stmt = s.trim().replace(/;$/, "") + ";";
    if (size + stmt.length > maxChars && cur.length) {
      batches.push(cur.join("\n"));
      cur = [];
      size = 0;
    }
    cur.push(stmt);
    size += stmt.length + 1;
  }
  if (cur.length) batches.push(cur.join("\n"));
  return batches;
}
