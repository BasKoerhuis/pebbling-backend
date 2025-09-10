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
    
    const newGiftTypes = [
      // KROEG (was drinks)
      { name: 'Biertje', emoji: '🍺', description: 'Een lekker biertje bij deelnemende cafés', price: 3.50, category: 'kroeg' },
      { name: 'Wijntje', emoji: '🍷', description: 'Een glas wijn bij restaurants', price: 4.50, category: 'kroeg' },
      { name: 'Cocktail', emoji: '🍸', description: 'Een cocktail naar keuze', price: 7.50, category: 'kroeg' },
      { name: 'Shot', emoji: '🥃', description: 'Een shot naar keuze', price: 2.25, category: 'kroeg' },

      // ETEN & DRINKEN (was food) 
      { name: 'Koffie', emoji: '☕', description: 'Verse koffie bij coffeeshops', price: 2.75, category: 'eten-drinken' },
      { name: 'Pizza Slice', emoji: '🍕', description: 'Een punt pizza bij pizzeria', price: 3.25, category: 'eten-drinken' },
      { name: 'Lunch', emoji: '🥪', description: 'Lunch deal bij restaurants', price: 8.50, category: 'eten-drinken' },
      { name: 'IJsje', emoji: '🍨', description: 'Een bolletje ijs naar keuze', price: 2.25, category: 'eten-drinken' },
      { name: 'Taartje', emoji: '🍰', description: 'Een stuk taart bij bakkerij', price: 3.75, category: 'eten-drinken' },

      // CULTUUR & FILM (was entertainment)
      { name: 'Bioscoopkaartje', emoji: '🎬', description: 'Ticket voor voorstelling', price: 12.50, category: 'cultuur-film' },
      { name: 'Museumkaartje', emoji: '🖼️', description: 'Toegang tot museum', price: 8.00, category: 'cultuur-film' },
      { name: 'Concert Ticket', emoji: '🎵', description: 'Kaartje voor live muziek', price: 15.00, category: 'cultuur-film' },
      { name: 'Theater Show', emoji: '🎭', description: 'Theatervoorstelling', price: 18.50, category: 'cultuur-film' },

      // DUURZAAM
      { name: 'Plantje', emoji: '🌱', description: 'Een mooie kamerplant', price: 8.50, category: 'duurzaam' },
      { name: 'Herbruikbare Beker', emoji: '♻️', description: 'Duurzame coffee cup', price: 12.00, category: 'duurzaam' },
      { name: 'Biologisch Product', emoji: '🌿', description: 'Bio voedingsproduct', price: 6.75, category: 'duurzaam' },
      { name: 'Eco Cleaning', emoji: '🧽', description: 'Milieuvriendelijk schoonmaakmiddel', price: 4.50, category: 'duurzaam' },

      // GEZOND & VITAAL
      { name: 'Smoothie', emoji: '🥤', description: 'Verse fruit smoothie', price: 4.50, category: 'gezond-vitaal' },
      { name: 'Salade', emoji: '🥗', description: 'Gezonde salade', price: 7.50, category: 'gezond-vitaal' },
      { name: 'Protein Shake', emoji: '💪', description: 'Eiwitshake na workout', price: 3.75, category: 'gezond-vitaal' },
      { name: 'Yoga Class', emoji: '🧘', description: 'Yoga les bij studio', price: 15.00, category: 'gezond-vitaal' },

      // REIZEN & BELEVENISSEN  
      { name: 'Treinkaartje', emoji: '🚂', description: 'Korte treinreis', price: 8.50, category: 'reizen-belevenissen' },
      { name: 'Escape Room', emoji: '🔐', description: 'Escape room ervaring', price: 18.00, category: 'reizen-belevenissen' },
      { name: 'Minigolf', emoji: '⛳', description: 'Een rondje minigolf', price: 7.00, category: 'reizen-belevenissen' },
      { name: 'Bowling', emoji: '🎳', description: 'Een spelletje bowlen', price: 5.50, category: 'reizen-belevenissen' },

      // FYSIEK
      { name: 'Gym Pass', emoji: '🏋️', description: 'Dagpas voor sportschool', price: 12.00, category: 'fysiek' },
      { name: 'Zwemkaartje', emoji: '🏊', description: 'Toegang tot zwembad', price: 4.50, category: 'fysiek' },
      { name: 'Tennis Baan', emoji: '🎾', description: 'Uur tennisbaan huren', price: 15.00, category: 'fysiek' },
      { name: 'Fietsreparatie', emoji: '🚴', description: 'Kleine fietsreparatie', price: 8.50, category: 'fysiek' },

      // MODE
      { name: 'T-shirt', emoji: '👕', description: 'Basic t-shirt naar keuze', price: 15.00, category: 'mode' },
      { name: 'Accessoire', emoji: '👜', description: 'Mode accessoire', price: 12.50, category: 'mode' },
      { name: 'Sokken', emoji: '🧦', description: 'Paar leuke sokken', price: 6.75, category: 'mode' },
      { name: 'Pet', emoji: '🧢', description: 'Trendy pet of muts', price: 18.00, category: 'mode' },

      // BEAUTY & WELLNESS
      { name: 'Massage', emoji: '💆', description: '30 min ontspanningsmassage', price: 25.00, category: 'beauty-wellness' },
      { name: 'Gezichtsbehandeling', emoji: '🧴', description: 'Beauty behandeling', price: 35.00, category: 'beauty-wellness' },
      { name: 'Nagelstyling', emoji: '💅', description: 'Manicure behandeling', price: 20.00, category: 'beauty-wellness' },
      { name: 'Haarwas', emoji: '💇', description: 'Haarverzorging bij kapper', price: 15.00, category: 'beauty-wellness' },

      // HUIS & TUIN
      { name: 'Bloemen', emoji: '💐', description: 'Mooi boeket bloemen', price: 12.00, category: 'huis-tuin' },
      { name: 'Kaarsen', emoji: '🕯️', description: 'Geurkaars voor thuis', price: 8.50, category: 'huis-tuin' },
      { name: 'Plantenpot', emoji: '🪴', description: 'Decoratieve plantenpot', price: 15.00, category: 'huis-tuin' },
      { name: 'Tuingereedschap', emoji: '🌾', description: 'Klein tuingereedschap', price: 22.00, category: 'huis-tuin' },

      // BABY & KIND  
      { name: 'Speelgoed', emoji: '🧸', description: 'Leuk speelgoed', price: 12.50, category: 'baby-kind' },
      { name: 'Kinderboek', emoji: '📚', description: 'Mooi kinderboek', price: 8.75, category: 'baby-kind' },
      { name: 'Puzzel', emoji: '🧩', description: 'Educatieve puzzel', price: 6.50, category: 'baby-kind' },
      { name: 'Baby Product', emoji: '🍼', description: 'Baby verzorgingsproduct', price: 9.25, category: 'baby-kind' },

      // LEZEN
      { name: 'Boek', emoji: '📖', description: 'Paperback boek naar keuze', price: 12.50, category: 'lezen' },
      { name: 'Tijdschrift', emoji: '📰', description: 'Maandblad abonnement', price: 4.50, category: 'lezen' },
      { name: 'E-book', emoji: '📱', description: 'Digitaal boek', price: 8.75, category: 'lezen' },
      { name: 'Boekenbon', emoji: '🎁', description: 'Boekenwinkel tegoed', price: 15.00, category: 'lezen' },

      // STREAMING & GAMING
      { name: 'Netflix Credit', emoji: '📺', description: 'Streaming tegoed', price: 10.00, category: 'streaming-gaming' },
      { name: 'Game Credit', emoji: '🎮', description: 'Gaming platform tegoed', price: 15.00, category: 'streaming-gaming' },
      { name: 'Spotify Premium', emoji: '🎵', description: 'Muziek streaming', price: 9.99, category: 'streaming-gaming' },
      { name: 'Gaming Accessoire', emoji: '🕹️', description: 'Gaming gadget', price: 25.00, category: 'streaming-gaming' }
    ]

    // Insert nieuwe gift types (gebruik INSERT OR IGNORE om duplicaten te voorkomen)
    for (const gift of newGiftTypes) {
      await this.async.run(
        'INSERT OR IGNORE INTO gift_types (name, emoji, description, price, category) VALUES (?, ?, ?, ?, ?)',
        [gift.name, gift.emoji, gift.description, gift.price, gift.category]
      )
    }
    
    console.log(`✅ Added ${newGiftTypes.length} new gift types across 13 categories`)

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