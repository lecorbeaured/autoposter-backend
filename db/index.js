const path = require("path");
const fs = require("fs");
const initSqlJs = require("sql.js");

const DB_PATH = process.env.DB_PATH || "./autoposter.db";

let db;

async function getDb() {
  if (db) return db;
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }
  init();
  return db;
}

function save() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function init() {
  db.run(`
    CREATE TABLE IF NOT EXISTS posts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      filename    TEXT NOT NULL,
      filepath    TEXT NOT NULL,
      type        TEXT NOT NULL DEFAULT 'video',
      niche       TEXT,
      caption     TEXT,
      tags        TEXT,
      platforms   TEXT NOT NULL DEFAULT '[]',
      status      TEXT NOT NULL DEFAULT 'draft',
      scheduled_at TEXT,
      posted_at   TEXT,
      results     TEXT DEFAULT '{}',
      created_at  TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id     INTEGER,
      platform    TEXT,
      success     INTEGER,
      message     TEXT,
      created_at  TEXT DEFAULT (datetime('now'))
    );
  `);
  save();
}

module.exports = { getDb, save };
