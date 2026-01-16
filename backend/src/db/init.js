import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = process.env.USER_DB_PATH || join(__dirname, '../../data/users.db');

export function initDatabase() {
  const db = new Database(DB_PATH);
  
  // Enable foreign keys
  db.pragma('foreign_keys = ON');
  
  // Read and execute schema
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  
  console.log('Database initialized:', DB_PATH);
  
  return db;
}

export function getDatabase() {
  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');
  return db;
}
