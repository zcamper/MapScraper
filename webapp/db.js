/**
 * SQLite database initialization for the Lead Gen SaaS.
 * Uses better-sqlite3 for synchronous, fast operations.
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'data', 'mapscraper.db');

// Ensure data directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Performance settings
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema
const schemaSQL = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schemaSQL);

export default db;
