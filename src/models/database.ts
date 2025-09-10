import sqlite3 from 'sqlite3'
import { promisify } from 'util'

interface Database {
  get: (sql: string, params?: any[]) => Promise<any>
  all: (sql: string, params?: any[]) => Promise<any[]>
  run: (sql: string, params?: any[]) => Promise<{ lastID?: number; changes?: number }>
}

class DatabaseManager {
  private db: sqlite3.Database
  public async: Database

  constructor() {
    this.db = new sqlite3.Database('./cadeautjes.db')
    
    // Promisify database methods
    this.async = {
      get: promisify(this.db.get.bind(this.db)),
      all: promisify(this.db.all.bind(this.db)),
      run: promisify(this.db.run.bind(this.db))
    }
    
    this.initializeTables()
  }

  private async initializeTables() {
    try {
      console.log('🗄️ Initializing database tables...')

      // Users table
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

      // Gift types table
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

      // User gift inventory (OUDE SYSTEEM - blijft voor backwards compatibility)
      await this.async.run(`
        CREATE TABLE IF NOT EXISTS user_gifts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          gift_type_id INTEGER NOT NULL,
          quantity INTEGER NOT NULL DEFAULT 0,
          purchased_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id),
          FOREIGN KEY (gift_type_id) REFERENCES gift_types (id)
        )
      `)

      // ✨ NIEUWE TABEL: User Category Credits (SPAARPOT SYSTEEM)
      await this.async.run(`
        CREATE TABLE IF NOT EXISTS user_category_credits (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          category TEXT NOT NULL,
          credit_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id),
          UNIQUE(user_id, category)
        )
      `)

      // Transactions table
      await this.async.run(`
        CREATE TABLE IF NOT EXISTS transactions (
          id TEXT PRIMARY KEY,
          sender_id INTEGER NOT NULL,
          receiver_email TEXT,
          gift_type_id INTEGER NOT NULL,
          status TEXT DEFAULT 'sent',
          qr_code TEXT UNIQUE,
          message TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          redeemed_at DATETIME,
          partner_id INTEGER,
          FOREIGN KEY (sender_id) REFERENCES users (id),
          FOREIGN KEY (gift_type_id) REFERENCES gift_types (id)
        )
      `)

      // Claims table voor echte tracking
      await this.async.run(`
        CREATE TABLE IF NOT EXISTS claims (
          id TEXT PRIMARY KEY,
          transaction_id TEXT UNIQUE NOT NULL,
          gift_type_id INTEGER NOT NULL,
          sender_id INTEGER NOT NULL,
          receiver_email TEXT,
          quantity INTEGER DEFAULT 1,
          status TEXT DEFAULT 'sent', -- 'sent', 'claimed', 'expired'
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            claimed_at DATETIME,
            redeemed_at DATETIME,
            claim_ip TEXT,
          
          FOREIGN KEY (gift_type_id) REFERENCES gift_types (id),
          FOREIGN KEY (sender_id) REFERENCES users (id)
        )
      `)

      // Partners table
      await this.async.run(`
        CREATE TABLE IF NOT EXISTS partners (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          business_name TEXT NOT NULL,
          owner_name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          phone TEXT,
          address TEXT,
          city TEXT,
          business_type TEXT,
          status TEXT DEFAULT 'pending',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `)

      // Purchases table (for website purchases)
      await this.async.run(`
        CREATE TABLE IF NOT EXISTS purchases (
          id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL,
          items TEXT NOT NULL, -- JSON string
          total_amount DECIMAL(10,2) NOT NULL,
          status TEXT DEFAULT 'completed',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          items_count INTEGER DEFAULT 0,
          FOREIGN KEY (user_id) REFERENCES users (id)
        )
      `)

      console.log('✅ Basic database tables initialized')

      // ✨ UPDATE bestaande categorieën naar nieuwe systeem
      const oldCategories = await this.async.get("SELECT COUNT(*) as count FROM gift_types WHERE category IN ('drinks', 'food', 'entertainment', 'lifestyle')")

      if (oldCategories.count > 0) {
        console.log('🔄 Updating old categories to new system...')
        
        await this.async.run("UPDATE gift_types SET category = 'kroeg' WHERE category = 'drinks'")
        await this.async.run("UPDATE gift_types SET category = 'eten-drinken' WHERE category = 'food'") 
        await this.async.run("UPDATE gift_types SET category = 'cultuur-film' WHERE category = 'entertainment'")
        await this.async.run("UPDATE gift_types SET category = 'mode' WHERE category = 'lifestyle'")
        
        console.log('✅ Categories updated to new system')
      }

      // ✨ TRIGGERS voor automatische timestamp updates
      await this.async.run(`
        CREATE TRIGGER IF NOT EXISTS update_credit_timestamp
        AFTER UPDATE ON user_category_credits
        BEGIN
          UPDATE user_category_credits 
          SET last_updated = CURRENT_TIMESTAMP 
          WHERE id = NEW.id;
        END
      `)

      // ✨ INDEXES voor performance
      await this.async.run('CREATE INDEX IF NOT EXISTS idx_user_category_credits_user_id ON user_category_credits(user_id)')
      await this.async.run('CREATE INDEX IF NOT EXISTS idx_user_category_credits_category ON user_category_credits(category)')
      await this.async.run('CREATE INDEX IF NOT EXISTS idx_gift_types_category ON gift_types(category)')

      console.log('✅ Spaarpot system database setup completed')

      // Insert sample data
      await this.insertSampleData()
      
    } catch (error) {
      console.error('❌ Database initialization error:', error)
    }
  }

  private async insertSampleData() {
    // Check if gift types already exist
    const existingGifts = await this.async.get('SELECT COUNT(*) as count FROM gift_types')
    
    console.log('🎁 Adding gift types for all 13 categories...')
    
    console.log('🗑️ Resetting gift_types table for ShopView matching...')
    
    // 1. RESET: Clear existing data to avoid conflicts
    await this.async.run('DELETE FROM gift_types')
    //await this.async.run('DELETE FROM user_gifts')  
    await this.async.run("DELETE FROM sqlite_sequence WHERE name='gift_types'")
    
    console.log('✅ Cleared existing gift_types')
    
    // 2. SEED NIEUWE GIFT_TYPES - EXACTE MATCHES MET SHOPVIEW.SWIFT
    const shopViewGiftTypes = [
      // ===== IDs 1-4: DUURZAAM 🌱 =====
      { id: 1, name: 'Herbruikbare fles', emoji: '🍼', description: 'Duurzame waterfles', price: 12.50, category: 'duurzaam' },
      { id: 2, name: 'Bamboe tandenborstel', emoji: '🪥', description: 'Eco-vriendelijke tandenborstel', price: 4.50, category: 'duurzaam' },
      { id: 3, name: 'Plantje', emoji: '🌱', description: 'Kleine kamerplant', price: 8.75, category: 'duurzaam' },
      { id: 4, name: 'Bio zeep', emoji: '🧼', description: 'Natuurlijke zeep', price: 6.25, category: 'duurzaam' },
    
      // ===== IDs 5-8: GEZOND & VITAAL 🥗 =====
      { id: 5, name: 'Smoothie', emoji: '🥤', description: 'Verse groente smoothie', price: 5.50, category: 'gezond-vitaal' },
      { id: 6, name: 'Salade', emoji: '🥗', description: 'Verse gemengde salade', price: 8.25, category: 'gezond-vitaal' },
      { id: 7, name: 'Yoga les', emoji: '🧘', description: 'Één yoga sessie', price: 15.00, category: 'gezond-vitaal' },
      { id: 8, name: 'Vitamine pack', emoji: '💊', description: 'Natuurlijke vitamines', price: 12.75, category: 'gezond-vitaal' },
    
      // ===== IDs 9-12: REIZEN & BELEVENISSEN ✈️ =====
      { id: 9, name: 'Treinkaartje', emoji: '🚂', description: 'Dagretour treinreis', price: 25.00, category: 'reizen-belevenissen' },
      { id: 10, name: 'Museumkaart', emoji: '🖼️', description: 'Entree voor museum', price: 18.50, category: 'reizen-belevenissen' },
      { id: 11, name: 'Escape room', emoji: '🔐', description: 'Escape room ervaring', price: 22.00, category: 'reizen-belevenissen' },
      { id: 12, name: 'Stadsrondleiding', emoji: '🛏️', description: 'Begeleide stadstour', price: 16.75, category: 'reizen-belevenissen' },
    
      // ===== IDs 13-15: CULTUUR & FILM 🎬 =====
      { id: 13, name: 'Bioscoop', emoji: '🎬', description: 'Bioscoopkaartje', price: 12.50, category: 'cultuur-film' },
      { id: 14, name: 'Theater', emoji: '🎭', description: 'Theatervoorstelling', price: 18.50, category: 'cultuur-film' },
      { id: 15, name: 'Concert', emoji: '🎵', description: 'Concert ticket', price: 15.00, category: 'cultuur-film' },
    
      // ===== IDs 16-17: FYSIEK 🏋️ =====
      { id: 16, name: 'Sportschool', emoji: '🏋️', description: 'Dagpas sportschool', price: 12.00, category: 'fysiek' },
      { id: 17, name: 'Zwemles', emoji: '🏊', description: 'Zwemles sessie', price: 8.50, category: 'fysiek' },
    
      // ===== IDs 18-19: MODE 👕 =====
      { id: 18, name: 'T-shirt', emoji: '👕', description: 'Basic t-shirt', price: 15.00, category: 'mode' },
      { id: 19, name: 'Sokken', emoji: '🧦', description: 'Paar leuke sokken', price: 5.00, category: 'mode' },
    
      // ===== IDs 20-21: BEAUTY & WELLNESS 💆 =====
      { id: 20, name: 'Massage', emoji: '💆', description: '30 min ontspanningsmassage', price: 25.00, category: 'beauty-wellness' },
      { id: 21, name: 'Haarknipbeurt', emoji: '💇', description: 'Haarverzorging bij kapper', price: 8.00, category: 'beauty-wellness' },
    
      // ===== IDs 22-23: KROEG 🍺 =====
      { id: 22, name: 'Biertje', emoji: '🍺', description: 'Een lekker biertje bij deelnemende cafés', price: 3.50, category: 'kroeg' },
      { id: 23, name: 'Wijntje', emoji: '🍷', description: 'Een glas wijn bij restaurants', price: 4.50, category: 'kroeg' },
    
      // ===== IDs 24-25: HUIS & TUIN 🏡 =====
      { id: 24, name: 'Bloemen', emoji: '💐', description: 'Mooi boeket bloemen', price: 12.00, category: 'huis-tuin' },
      { id: 25, name: 'Plant', emoji: '🪴', description: 'Decoratieve plantenpot', price: 15.00, category: 'huis-tuin' },
    
      // ===== IDs 26-27: BABY & KIND 🧸 =====
      { id: 26, name: 'Speelgoed', emoji: '🧸', description: 'Leuk speelgoed', price: 12.50, category: 'baby-kind' },
      { id: 27, name: 'Knuffel', emoji: '🧸', description: 'Zachte knuffel', price: 12.50, category: 'baby-kind' },
    
      // ===== IDs 28-29: LEZEN 📚 =====
      { id: 28, name: 'Boek', emoji: '📖', description: 'Paperback boek naar keuze', price: 12.50, category: 'lezen' },
      { id: 29, name: 'Magazine', emoji: '📰', description: 'Maandblad abonnement', price: 4.50, category: 'lezen' },
    
      // ===== IDs 30-31: STREAMING & GAMING 🎮 =====
      { id: 30, name: 'Netflix tegoed', emoji: '📺', description: 'Streaming tegoed', price: 10.00, category: 'streaming-gaming' },
      { id: 31, name: 'Game', emoji: '🎮', description: 'Gaming platform tegoed', price: 15.00, category: 'streaming-gaming' },
    
      // ===== IDs 32-34: ETEN & DRINKEN 🍕 + JOUW FRISJE =====
      { id: 32, name: 'Pizza', emoji: '🍕', description: 'Een punt pizza bij pizzeria', price: 3.25, category: 'eten-drinken' },
      { id: 33, name: 'Coffee', emoji: '☕', description: 'Verse koffie bij coffeeshops', price: 2.75, category: 'eten-drinken' },
      { id: 34, name: 'Frisje', emoji: '🥤', description: 'Verfrissende frisdrank', price: 2.50, category: 'eten-drinken' }, // 🆕 JOUW FRISJE!
    ];
    
    // 3. INSERT MET EXPLICIETE IDs VOOR EXACTE MATCHING
    for (const gift of shopViewGiftTypes) {
      await this.async.run(
        'INSERT INTO gift_types (id, name, emoji, description, price, category, active) VALUES (?, ?, ?, ?, ?, ?, 1)',
        [gift.id, gift.name, gift.emoji, gift.description, gift.price, gift.category]
      );
    }
    
    console.log(`✅ Seeded ${shopViewGiftTypes.length} gift types with EXACT ShopView matching!`);
    console.log('🎯 Mapping is now simple 1-on-1');
    console.log('🥤 BONUS: Added "Frisje" as DB ID 34!');

    // Insert nieuwe gift types (gebruik INSERT OR IGNORE om duplicaten te voorkomen)
    for (const gift of shopViewGiftTypes) {
      await this.async.run(
        'INSERT OR IGNORE INTO gift_types (name, emoji, description, price, category) VALUES (?, ?, ?, ?, ?)',
        [gift.name, gift.emoji, gift.description, gift.price, gift.category]
      )
    }
    
    console.log(`✅ Added ${shopViewGiftTypes.length} new gift types across 13 categories`)

    // Create demo user als die er nog niet is
    const existingUser = await this.async.get('SELECT id FROM users WHERE email = ?', ['demo@cadeautjes.app'])
    
    if (!existingUser) {
      const bcrypt = require('bcryptjs')
      const hashedPassword = await bcrypt.hash('demo123', 10)
      
      await this.async.run(
        'INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)',
        ['demo@cadeautjes.app', 'Demo User', hashedPassword]
      )
      
      console.log('✅ Demo user created: demo@cadeautjes.app / demo123')
    }
  }

  // ✨ NIEUWE FUNCTIE: Claim gift method (voor het spaarpot systeem)
  async claimGift(transactionId: string, claimIp: string = '') {
    try {
      // Check if claim exists and is valid
      const claim = await this.async.get(
        'SELECT c.*, gt.name, gt.emoji, u.name as sender_name FROM claims c JOIN gift_types gt ON c.gift_type_id = gt.id JOIN users u ON c.sender_id = u.id WHERE c.transaction_id = ? AND c.status = "sent"',
        [transactionId]
      )

      if (!claim) {
        return { success: false, error: 'Claim not found or already used' }
      }

      // Reduce quantity in user_gifts
      await this.async.run(
        'UPDATE user_gifts SET quantity = quantity - ? WHERE user_id = ? AND gift_type_id = ?',
        [claim.quantity, claim.sender_id, claim.gift_type_id]
      )

      // Update claim status to 'claimed'
      await this.async.run(
        'UPDATE claims SET status = ?, claimed_at = CURRENT_TIMESTAMP, claim_ip = ? WHERE transaction_id = ?',
        ['claimed', claimIp, transactionId]
      )

      console.log(`📦 Reduced ${claim.quantity}× ${claim.name} from user ${claim.sender_id} inventory`)

      return {
        success: true,
        gift: {
          name: claim.name,
          emoji: claim.emoji,
          quantity: claim.quantity
        },
        sender: claim.sender_name,
        claimedAt: new Date().toISOString()
      }
    } catch (error) {
      console.error('Claim error:', error)
      return { success: false, error: 'Database error' }
    }
  }

  async close() {
    return new Promise<void>((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }
}

export const database = new DatabaseManager()
export default database