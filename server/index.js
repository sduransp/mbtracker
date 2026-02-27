#!/usr/bin/env node
/**
 * MBTracker Server
 *
 * Express API + static web server with SQLite storage (better-sqlite3).
 * Local-only by default (binds to 127.0.0.1). See README.server.md.
 */
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

    -- Bets: track matched betting operations for analytics
    CREATE TABLE IF NOT EXISTS bets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      house_id INTEGER NOT NULL,
      exchange_house_id INTEGER, -- optional (e.g., Betfair)
      event TEXT NOT NULL,
      league TEXT,
      market TEXT NOT NULL, -- e.g., O/U 2.5, BTTS
      selection TEXT NOT NULL,
      odds_back REAL NOT NULL,
      stake_back REAL NOT NULL,
      odds_lay REAL,
      stake_lay REAL,
      commission REAL DEFAULT 0, -- exchange commission % (e.g., 0.02)
      liability REAL, -- computed for lay, optional store
      is_freebet INTEGER DEFAULT 0,
      freebet_value REAL,
      ev_est REAL, -- estimated EV at placement
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','settled','canceled')),
      result TEXT CHECK(result IN ('win','lose','push')), -- when settled
      pnl_net REAL, -- final net PnL including commission, when settled
      ts_placed INTEGER NOT NULL,
      ts_settled INTEGER,
      notes TEXT,
      promo_ref TEXT,
      FOREIGN KEY(house_id) REFERENCES houses(id) ON DELETE CASCADE,
      FOREIGN KEY(exchange_house_id) REFERENCES houses(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_bets_status ON bets(status);
    CREATE INDEX IF NOT EXISTS idx_bets_house_placed ON bets(house_id, ts_placed);

    CREATE VIEW IF NOT EXISTS v_house_balances AS
      SELECT h.id as house_id, h.name,
             SUM(CASE WHEN kind='deposit' THEN amount WHEN kind='withdrawal' THEN -amount ELSE 0 END) as net_cash,
             SUM(CASE WHEN kind IN ('profit','bonus') THEN amount WHEN kind='loss' THEN -amount ELSE 0 END) as net_pnl,
             SUM(CASE WHEN kind='fee' THEN -amount ELSE 0 END) as net_fees,
             SUM(CASE WHEN kind IN ('deposit','withdrawal','profit','loss','bonus','fee') THEN amount ELSE 0 END) as gross_flow
      FROM houses h
      LEFT JOIN entries e ON e.house_id = h.id
      GROUP BY h.id, h.name;

    -- Exposure: outstanding liabilities for open bets
    CREATE VIEW IF NOT EXISTS v_exposure AS
      SELECT COALESCE(SUM(liability),0) AS total_liability, COUNT(*) AS open_bets
      FROM bets WHERE status='open';

    CREATE VIEW IF NOT EXISTS v_house_exposure AS
      SELECT house_id, COALESCE(SUM(liability),0) AS total_liability, COUNT(*) AS open_bets
      FROM bets WHERE status='open'
      GROUP BY house_id;
  `);
};

migrate();

// Seed defaults if empty
const count = db.prepare('SELECT COUNT(*) as c FROM houses').get().c;
if (!count) {
  db.prepare('INSERT INTO houses(name, country, notes, active) VALUES(?,?,?,?)').run('Retabet', 'ES', 'Main house', 1);
  db.prepare('INSERT INTO houses(name, country, notes, active) VALUES(?,?,?,?)').run('Betfair', 'EU', 'Exchange 2% commission', 1);
}

// API routes
/**
 * GET /api/houses — list houses
 * Response: Array<House>
 */
app.get('/api/houses', (req, res) => {
  const rows = db.prepare('SELECT * FROM houses ORDER BY active DESC, name ASC').all();
  res.json(rows);
});

// Bets CRUD
/**
 * GET /api/bets
 * Query params: { status?: 'open'|'settled'|'canceled', from?: number(ms), to?: number(ms) }
 * Response: Array<Bet>
 */
app.get('/api/bets', (req, res) => {
  const { status, from, to } = req.query;
  let sql = 'SELECT * FROM bets WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (from) { sql += ' AND ts_placed >= ?'; params.push(Number(from)); }
  if (to) { sql += ' AND ts_placed <= ?'; params.push(Number(to)); }
  sql += ' ORDER BY ts_placed DESC LIMIT 1000';
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

/**
 * POST /api/bets — create bet
 * Body: Bet fields (see schema); numeric fields should be numbers.
 * Response: { id }
 */
app.post('/api/bets', (req, res) => {
  const b = req.body;
  try {
    const info = db.prepare(`
      INSERT INTO bets(house_id, exchange_house_id, event, league, market, selection,
        odds_back, stake_back, odds_lay, stake_lay, commission, liability,
        is_freebet, freebet_value, ev_est, status, ts_placed, notes, promo_ref)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      b.house_id, b.exchange_house_id || null, b.event, b.league || null, b.market, b.selection,
      b.odds_back, b.stake_back, b.odds_lay || null, b.stake_lay || null, b.commission || 0,
      b.liability || null, b.is_freebet?1:0, b.freebet_value || null, b.ev_est || null,
      b.status || 'open', b.ts_placed || Date.now(), b.notes || null, b.promo_ref || null
    );
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * PUT /api/bets/:id/settle — settle a bet
 * Body: { result: 'win'|'lose'|'push', pnl_net: number, ts_settled?: number }
 * Response: { changes }
 */
app.put('/api/bets/:id/settle', (req, res) => {
  const { id } = req.params;
  const { result, pnl_net, ts_settled = Date.now() } = req.body;
  try {
    const info = db.prepare(`
      UPDATE bets SET status='settled', result=?, pnl_net=?, ts_settled=? WHERE id=?
    `).run(result, pnl_net, ts_settled, id);
    res.json({ changes: info.changes });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * PUT /api/bets/:id/cancel — cancel a bet
 * Response: { changes }
 */
app.put('/api/bets/:id/cancel', (req, res) => {
  const { id } = req.params;
  try {
    const info = db.prepare(`UPDATE bets SET status='canceled' WHERE id=?`).run(id);
    res.json({ changes: info.changes });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * POST /api/houses — create house
 * Body: { name: string, country?: string, notes?: string, active?: 0|1 }
 * Response: { id }
 */
app.post('/api/houses', (req, res) => {
  const { name, country, notes, active = 1 } = req.body;
  try {
    const info = db.prepare('INSERT INTO houses(name, country, notes, active) VALUES(?,?,?,?)').run(name, country, notes, active ? 1 : 0);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * PUT /api/houses/:id — update house fields
 * Body: partial House fields
 * Response: { changes }
 */
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

/**
 * GET /api/entries — list entries
 * Query params: { house_id?: number, from?: number, to?: number }
 * Response: Array<Entry>
 */
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

/**
 * POST /api/entries — create entry
 * Body: { house_id, kind, amount, currency?, ts?, ref?, notes? }
 * Response: { id }
 */
app.post('/api/entries', (req, res) => {
  const { house_id, kind, amount, currency = 'EUR', ts = Date.now(), ref, notes } = req.body;
  try {
    const info = db.prepare('INSERT INTO entries(house_id, kind, amount, currency, ts, ref, notes) VALUES(?,?,?,?,?,?,?)').run(house_id, kind, amount, currency, ts, ref, notes);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * GET /api/analytics/house/:id — per-house balance + 30-day totals
 * Response: { balance, last30 }
 */
app.get('/api/analytics/house/:id', (req, res) => {
  const { id } = req.params;
  const bal = db.prepare('SELECT * FROM v_house_balances WHERE house_id = ?').get(id);
  const last30 = db.prepare('SELECT kind, SUM(amount) as total FROM entries WHERE house_id = ? AND ts >= ? GROUP BY kind').all(id, Date.now() - 30*24*3600*1000);
  res.json({ balance: bal, last30 });
});

/**
 * GET /api/analytics/summary — balances for all houses + totals
 * Response: { rows, total, exposure, houseExposure }
 */
app.get('/api/analytics/summary', (req, res) => {
  const rows = db.prepare('SELECT * FROM v_house_balances').all();
  const total = rows.reduce((acc, r) => ({
    net_cash: acc.net_cash + (r.net_cash || 0),
    net_pnl: acc.net_pnl + (r.net_pnl || 0),
    net_fees: acc.net_fees + (r.net_fees || 0),
    gross_flow: acc.gross_flow + (r.gross_flow || 0)
  }), { net_cash:0, net_pnl:0, net_fees:0, gross_flow:0 });
  const exposure = db.prepare('SELECT * FROM v_exposure').get();
  const houseExposure = db.prepare(`
    SELECT COALESCE(exchange_house_id, house_id) AS house_id,
           COALESCE(SUM(liability),0) AS total_liability,
           COUNT(*) AS open_bets
    FROM bets WHERE status='open'
    GROUP BY COALESCE(exchange_house_id, house_id)
  `).all();
  res.json({ rows, total, exposure, houseExposure });
});

/**
 * GET /api/analytics/monthly — monthly KPIs
 * Response: { month, invested, generated, roi, bets_settled, markets }
 */
app.get('/api/analytics/monthly', (req, res) => {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const to = new Date(now.getFullYear(), now.getMonth()+1, 1).getTime()-1;
  const cash = db.prepare(`
    SELECT
      SUM(CASE WHEN kind='deposit' THEN amount WHEN kind='withdrawal' THEN -amount ELSE 0 END) AS invested
    FROM entries WHERE ts BETWEEN ? AND ?
  `).get(from, to);
  const pnl = db.prepare(`
    SELECT SUM(pnl_net) AS generated, COUNT(*) AS settled
    FROM bets WHERE status='settled' AND ts_settled BETWEEN ? AND ?
  `).get(from, to);
  const invested = cash.invested || 0;
  const generated = pnl.generated || 0;
  const roi = invested ? (generated / invested) : null;
  const count = pnl.settled || 0;
  // Market breakdown
  const markets = db.prepare(`
    SELECT market, COUNT(*) AS n, SUM(pnl_net) AS pnl, AVG(ev_est) AS ev
    FROM bets WHERE status='settled' AND ts_settled BETWEEN ? AND ?
    GROUP BY market ORDER BY n DESC
  `).all(from, to);
  res.json({ month: now.toISOString().slice(0,7), invested, generated, roi, bets_settled: count, markets });
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
