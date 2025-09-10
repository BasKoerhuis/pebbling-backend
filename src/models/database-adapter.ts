import sqlite3 from 'sqlite3'
import { promisify } from 'util'

interface Database {
  get: (sql: string, params?: any[]) => Promise<any>
  all: (sql: string, params?: any[]) => Promise<any[]>
  run: (sql: string, params?: any[]) => Promise<{ lastID?: number; changes?: number }>
}

class DatabaseAdapter {
  private db: any
  public async: Database

  constructor() {
    // Voor nu gebruiken we SQLite, later kunnen we PostgreSQL toevoegen
    console.log('🗄️ Initializing SQLite database...')
    this.db = new sqlite3.Database(':memory:') // In-memory voor Render
    
    this.async = {
      get: promisify(this.db.get.bind(this.db)),
      all: promisify(this.db.all.bind(this.db)),
      run: promisify(this.db.run.bind(this.db))
    }
    
    this.initializeTables()
  }

  private async initializeTables() {
    // Simplified schema voor demo
    await this.async.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        device_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)
    
    await this.async.run(`
      CREATE TABLE IF NOT EXISTS gift_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        emoji TEXT NOT NULL,
        description TEXT,
        price DECIMAL(10,2) NOT NULL,
        category TEXT NOT NULL,
        active BOOLEAN DEFAULT 1
      )
    `)
    
    console.log('✅ Database initialized')
  }
}

const database = new DatabaseAdapter()
export default database
export { database }
