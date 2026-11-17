// Storage: price history (one best price per product, country and day), searches (for suggestions) and alerts.
// Uses Node's built-in SQLite, so there is nothing native to compile.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
export const db = new DatabaseSync(config.dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS history (
    qkey TEXT NOT NULL, country TEXT NOT NULL, day TEXT NOT NULL, best_aed REAL NOT NULL, store TEXT,
    PRIMARY KEY (qkey, country, day)
  );
  CREATE TABLE IF NOT EXISTS searches (
    qkey TEXT PRIMARY KEY, q TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 1, last_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, q TEXT NOT NULL, qkey TEXT NOT NULL, country TEXT NOT NULL,
    target_aed REAL NOT NULL, contact TEXT, created_at TEXT NOT NULL,
    last_best_aed REAL, last_checked_at TEXT, triggered_at TEXT
  );
`);

const today = () => new Date().toISOString().slice(0, 10);

const upsertHist = db.prepare(`INSERT INTO history (qkey, country, day, best_aed, store) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(qkey, country, day) DO UPDATE SET best_aed = MIN(best_aed, excluded.best_aed),
  store = CASE WHEN excluded.best_aed < best_aed THEN excluded.store ELSE store END`);
export function recordBest(qkey, country, bestAED, store) { upsertHist.run(qkey, country, today(), bestAED, store || null); }

const getHist = db.prepare(`SELECT day, best_aed AS bestAED FROM history WHERE qkey = ? AND country = ? AND day >= date('now', '-90 day') ORDER BY day`);
export const history = (qkey, country) => getHist.all(qkey, country);

const upsertSearch = db.prepare(`INSERT INTO searches (qkey, q, count, last_at) VALUES (?, ?, 1, datetime('now'))
  ON CONFLICT(qkey) DO UPDATE SET count = count + 1, last_at = datetime('now')`);
export const logSearch = (qkey, q) => upsertSearch.run(qkey, q);

const sugg = db.prepare(`SELECT q FROM searches WHERE q LIKE ? OR qkey LIKE ? ORDER BY count DESC LIMIT 6`);
const popular = db.prepare(`SELECT q FROM searches ORDER BY count DESC, last_at DESC LIMIT 8`);
export const suggest = (term) => sugg.all(`%${term}%`, `%${term}%`).map(r => r.q);
export const popularSearches = () => popular.all().map(r => r.q);

const insAlert = db.prepare(`INSERT INTO alerts (q, qkey, country, target_aed, contact, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))`);
export const addAlert = (a) => Number(insAlert.run(a.q, a.qkey, a.country, a.targetAED, a.contact || null).lastInsertRowid);
const getAlert = db.prepare(`SELECT * FROM alerts WHERE id = ?`);
export const alertById = (id) => getAlert.get(id);
const delAlert = db.prepare(`DELETE FROM alerts WHERE id = ?`);
export const deleteAlert = (id) => delAlert.run(id);
const pending = db.prepare(`SELECT * FROM alerts WHERE triggered_at IS NULL`);
export const pendingAlerts = () => pending.all();
const updAlert = db.prepare(`UPDATE alerts SET last_best_aed = ?, last_checked_at = datetime('now'), triggered_at = ? WHERE id = ?`);
export const updateAlert = (id, bestAED, triggered) => updAlert.run(bestAED, triggered ? new Date().toISOString() : null, id);
