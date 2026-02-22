#!/usr/bin/env node
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

const dbPath = path.join(__dirname, '..', 'data', 'mbtracker.sqlite');
const db = new Database(dbPath);

// Migrations
const migrate = () => {
  db.exec(`
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS houses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      country TEXT,
      notes TEXT,
      active INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      house_id INTEGER NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('deposit','withdrawal','profit','loss','bonus','fee')),
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'EUR',
      ts INTEGER NOT NULL,
      ref TEXT,
      notes TEXT,
      FOREIGN KEY(house_id) REFERENCES houses(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_entries_house_ts ON entries(house_id, ts);
    CREATE VIEW IF NOT EXISTS v_house_balances AS
      SELECT h.id as house_id, h.name,
             SUM(CASE WHEN kind='deposit' THEN amount WHEN kind='withdrawal' THEN -amount ELSE 0 END) as net_cash,
             SUM(CASE WHEN kind IN ('profit','bonus') THEN amount WHEN kind='loss' THEN -amount ELSE 0 END) as net_pnl,
             SUM(CASE WHEN kind='fee' THEN -amount ELSE 0 END) as net_fees,
             SUM(CASE WHEN kind IN ('deposit','withdrawal','profit','loss','bonus','fee') THEN amount ELSE 0 END) as gross_flow
      FROM houses h
      LEFT JOIN entries e ON e.house_id = h.id
      GROUP BY h.id, h.name;
  `);
};

migrate();

// Seed defaults if empty
const count = db.prepare('SELECT COUNT(*) as c FROM houses').get().c;
if (!count) {
  db.prepare('INSERT INTO houses(name, country, notes, active) VALUES(?,?,?,?)').run('Retabet', 'ES', 'Casa principal', 1);
  db.prepare('INSERT INTO houses(name, country, notes, active) VALUES(?,?,?,?)').run('Betfair', 'EU', 'Exchange 2% comisión', 1);
}

// API routes
app.get('/api/houses', (req, res) => {
  const rows = db.prepare('SELECT * FROM houses ORDER BY active DESC, name ASC').all();
  res.json(rows);
});

app.post('/api/houses', (req, res) => {
  const { name, country, notes, active = 1 } = req.body;
  try {
    const info = db.prepare('INSERT INTO houses(name, country, notes, active) VALUES(?,?,?,?)').run(name, country, notes, active ? 1 : 0);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/houses/:id', (req, res) => {
  const { id } = req.params;
  const { name, country, notes, active } = req.body;
  try {
    const info = db.prepare('UPDATE houses SET name=COALESCE(?,name), country=COALESCE(?,country), notes=COALESCE(?,notes), active=COALESCE(?,active) WHERE id=?').run(name, country, notes, typeof active === 'number' ? active : undefined, id);
    res.json({ changes: info.changes });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/entries', (req, res) => {
  const { house_id, from, to } = req.query;
  let sql = 'SELECT * FROM entries WHERE 1=1';
  const params = [];
  if (house_id) { sql += ' AND house_id = ?'; params.push(Number(house_id)); }
  if (from) { sql += ' AND ts >= ?'; params.push(Number(from)); }
  if (to) { sql += ' AND ts <= ?'; params.push(Number(to)); }
  sql += ' ORDER BY ts DESC LIMIT 1000';
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

app.post('/api/entries', (req, res) => {
  const { house_id, kind, amount, currency = 'EUR', ts = Date.now(), ref, notes } = req.body;
  try {
    const info = db.prepare('INSERT INTO entries(house_id, kind, amount, currency, ts, ref, notes) VALUES(?,?,?,?,?,?,?)').run(house_id, kind, amount, currency, ts, ref, notes);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/analytics/house/:id', (req, res) => {
  const { id } = req.params;
  const bal = db.prepare('SELECT * FROM v_house_balances WHERE house_id = ?').get(id);
  const last30 = db.prepare('SELECT kind, SUM(amount) as total FROM entries WHERE house_id = ? AND ts >= ? GROUP BY kind').all(id, Date.now() - 30*24*3600*1000);
  res.json({ balance: bal, last30 });
});

app.get('/api/analytics/summary', (req, res) => {
  const rows = db.prepare('SELECT * FROM v_house_balances').all();
  const total = rows.reduce((acc, r) => ({
    net_cash: acc.net_cash + (r.net_cash || 0),
    net_pnl: acc.net_pnl + (r.net_pnl || 0),
    net_fees: acc.net_fees + (r.net_fees || 0),
    gross_flow: acc.gross_flow + (r.gross_flow || 0)
  }), { net_cash:0, net_pnl:0, net_fees:0, gross_flow:0 });
  res.json({ rows, total });
});

// Health endpoints
app.get('/api/health', (req,res)=>res.json({ ok:true, ts: Date.now() }));
app.get('/health', (req,res)=>res.type('text/plain').send('ok'));

// Serve web app (static)
const distDir = path.join(__dirname, '..', 'web', 'dist');
app.use('/', express.static(distDir));
// SPA fallback
app.get(/^(?!\/api\/).*/, (req,res)=>{
  try { res.sendFile(path.join(distDir, 'index.html')); }
  catch { res.status(404).send('Not built yet'); }
});

const port = process.env.PORT || 5174;
app.listen(port, '127.0.0.1', () => console.log(`MBTracker server listening on http://127.0.0.1:${port}`));
