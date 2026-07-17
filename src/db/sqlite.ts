import Database from 'better-sqlite3';
import path from 'path';

import fs from 'fs';

// Create or open the SQLite database
const dbPath = process.env.DB_PATH || path.resolve(process.cwd(), 'data.db');
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}
const db = new Database(dbPath);

// Enable WAL mode for better concurrency and performance
db.pragma('journal_mode = WAL');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    dump_id TEXT,
    recipient TEXT,
    intent TEXT,
    relationship_context TEXT,
    is_actionable INTEGER,
    urgency INTEGER,
    draft TEXT,
    toneLabel TEXT,
    confidence TEXT,
    status TEXT,
    archived INTEGER DEFAULT 0,
    created_at INTEGER,
    updated_at INTEGER
  );
`);

// Safe migrations: add follow-up columns if they don't exist
try {
  db.exec('ALTER TABLE tasks ADD COLUMN follow_up_date TEXT;');
} catch (err: any) {
  if (!err.message.includes('duplicate column name')) console.warn(err);
}

try {
  db.exec('ALTER TABLE tasks ADD COLUMN follow_up_dismissed INTEGER DEFAULT 0;');
} catch (err: any) {
  if (!err.message.includes('duplicate column name')) console.warn(err);
}

try {
  db.exec("ALTER TABLE tasks ADD COLUMN task_type TEXT DEFAULT 'communication';");
} catch (err: any) {
  if (!err.message.includes('duplicate column name')) console.warn(err);
}

// Create daily_activity table for streak tracking
db.exec(`
  CREATE TABLE IF NOT EXISTS daily_activity (
    date TEXT PRIMARY KEY,
    completions INTEGER DEFAULT 1
  );
`);

export default db;
