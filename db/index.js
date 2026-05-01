const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = process.env.DB_PATH || "./autoposter.db";

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    init();
  }
  return db;
}

function init() {
  db.exec(`
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
}

module.exports = { getDb };
