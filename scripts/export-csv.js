#!/usr/bin/env node
/*
  Export entries to CSV.
  Output file: exports/entries-YYYYMMDD-HHmmss.csv
*/
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const root = path.join(__dirname, '..');
const dbPath = path.join(root, 'data', 'mbtracker.sqlite');
const outDir = path.join(root, 'exports');

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const stamp = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const outPath = path.join(outDir, `entries-${stamp}.csv`);

const db = new Database(dbPath);

const rows = db.prepare(`
  SELECT e.id, h.name as house, e.kind, e.amount, e.currency, e.ts, e.ref, e.notes
  FROM entries e
  JOIN houses h ON h.id = e.house_id
  ORDER BY e.ts DESC
`).all();

const escape = (v) => {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

const header = ['id','house','kind','amount','currency','ts','ref','notes'];
const lines = [header.join(',')];
for (const r of rows) {
  lines.push([
    r.id, r.house, r.kind, r.amount, r.currency, r.ts, r.ref || '', r.notes || ''
  ].map(escape).join(','));
}

fs.writeFileSync(outPath, lines.join('\n'));
console.log(`Exported ${rows.length} rows to ${outPath}`);
