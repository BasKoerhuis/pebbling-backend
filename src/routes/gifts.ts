import { Router } from 'express'
import { database } from '../models/database'
import { authenticateToken } from '../middleware/auth'
import QRCode from 'qrcode'

const router = Router()

// ✨ NIEUWE CATEGORIEËN DEFINITIE
const CATEGORIES = [
  { id: 'duurzaam', name: 'Duurzaam', emoji: '🌱' },
  { id: 'gezond-vitaal', name: 'Gezond & Vitaal', emoji: '🥗' },
  { id: 'reizen-belevenissen', name: 'Reizen & Belevenissen', emoji: '✈️' },
  { id: 'cultuur-film', name: 'Cultuur & Film', emoji: '🎬' },
  { id: 'fysiek', name: 'Fysiek', emoji: '🏋️' },
  { id: 'mode', name: 'Mode', emoji: '👕' },
  { id: 'beauty-wellness', name: 'Beauty & Wellness', emoji: '💆' },
  { id: 'kroeg', name: 'Kroeg', emoji: '🍺' },
  { id: 'huis-tuin', name: 'Huis & Tuin', emoji: '🏡' },
  { id: 'baby-kind', name: 'Baby & Kind', emoji: '🧸' },
  { id: 'lezen', name: 'Lezen', emoji: '📚' },
  { id: 'streaming-gaming', name: 'Streaming & Gaming', emoji: '🎮' },
  { id: 'eten-drinken', name: 'Eten & Drinken', emoji: '🍕' }
]

// ✨ NIEUW: Get all categories
router.get('/categories', async (req, res) => {
  try {
    res.json({ categories: CATEGORIES })
  } catch (error) {
    console.error('Error fetching categories:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Get all available gift types (UPDATED: grouped by category)
router.get('/types', async (req, res) => {
  try {
    const gifts = await database.async.all(`
      SELECT id, name, emoji, description, price, category, active 
      FROM gift_types 
      WHERE active = 1 
      ORDER BY category, price ASC
    `)
    
    // Group by category
    const giftsByCategory = gifts.reduce((acc: any, gift: any) => {
      if (!acc[gift.category]) {
        acc[gift.category] = []
      }
      acc[gift.category].push(gift)
      return acc
    }, {})
    
    res.json({ 
      gifts,
      giftsByCategory,
      categories: CATEGORIES
    })
  } catch (error) {
    console.error('Error fetching gift types:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Purchase gifts - GEFIXTE VERSIE ZONDER GIFTS VARIABELE
router.post('/purchase', authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' })
    }

    const userId = req.user.userId
    const { items } = req.body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array is required' })
    }

    let totalCost = 0
    const purchasedItems = []
    
    await database.async.run('BEGIN TRANSACTION')
    
    try {
      for (const item of items) {
        const { giftTypeId, quantity } = item
        
        if (!giftTypeId || !quantity || quantity <= 0) {
          throw new Error('Invalid item data')
        }
        
        const giftType = await database.async.get(
          'SELECT * FROM gift_types WHERE id = ? AND active = 1',
          [giftTypeId]
        )
        
        if (!giftType) {
          throw new Error(`Gift type with ID ${giftTypeId} not found`)
        }
        
        const itemCost = giftType.price * quantity
        totalCost += itemCost
        
        // Check if user already owns this gift type
        const existingGift = await database.async.get(
          'SELECT * FROM user_gifts WHERE user_id = ? AND gift_type_id = ?',
          [userId, giftTypeId]
        )
        
        if (existingGift) {
          // Update existing
          await database.async.run(
            'UPDATE user_gifts SET quantity = quantity + ? WHERE user_id = ? AND gift_type_id = ?',
            [quantity, userId, giftTypeId]
          )
        } else {
          // Insert new
          await database.async.run(
            'INSERT INTO user_gifts (user_id, gift_type_id, quantity) VALUES (?, ?, ?)',
            [userId, giftTypeId, quantity]
          )
        }
        
        purchasedItems.push({
          gift: giftType,
          quantity,
          totalPrice: itemCost
        })
      }
      
      await database.async.run('COMMIT')
      
      res.json({
        success: true,
        purchased: purchasedItems,
        totalCost,
        message: `Successfully purchased ${items.length} item(s) for €${totalCost.toFixed(2)}`
      })
      
    } catch (error) {
      await database.async.run('ROLLBACK')
      throw error
    }
    
  } catch (error) {
    console.error('Purchase error:', error)
    if (error instanceof Error) {
      res.status(400).json({ error: error.message })
    } else {
      res.status(500).json({ error: 'Purchase failed' })
    }
  }
})

// Get user's gift inventory
router.get('/inventory', authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' })
    }

    const userId = req.user.userId

    const inventory = await database.async.all(`
      SELECT 
        ug.quantity,
        gt.id,
        gt.name,
        gt.emoji,
        gt.description,
        gt.price,
        gt.category
      FROM user_gifts ug
      JOIN gift_types gt ON ug.gift_type_id = gt.id
      WHERE ug.user_id = ? AND ug.quantity > 0
      ORDER BY gt.category, gt.name
    `, [userId])

    res.json({ inventory })
  } catch (error) {
    console.error('Error fetching inventory:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Send a gift
router.post('/send', authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' })
    }

    const userId = req.user.userId
    const { giftTypeId, receiverEmail, message } = req.body

    if (!giftTypeId) {
      return res.status(400).json({ error: 'Gift type ID is required' })
    }

    // Check if user has this gift
    const userGift = await database.async.get(
      'SELECT * FROM user_gifts WHERE user_id = ? AND gift_type_id = ? AND quantity > 0',
      [userId, giftTypeId]
    )

    if (!userGift) {
      return res.status(400).json({ error: 'You do not have this gift to send' })
    }

    // Get gift details
    const giftType = await database.async.get(
      'SELECT * FROM gift_types WHERE id = ?',
      [giftTypeId]
    )

    if (!giftType) {
      return res.status(404).json({ error: 'Gift type not found' })
    }

    // Generate transaction ID
    const transactionId = `send_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    await database.async.run('BEGIN TRANSACTION')

    try {
      // Create claim entry
      await database.async.run(`
        INSERT INTO claims (transaction_id, gift_type_id, sender_id, quantity, status, created_at)
        VALUES (?, ?, ?, 1, 'pending', datetime('now'))
      `, [transactionId, giftTypeId, userId])

      // Reduce user's inventory
      await database.async.run(
        'UPDATE user_gifts SET quantity = quantity - 1 WHERE user_id = ? AND gift_type_id = ?',
        [userId, giftTypeId]
      )

      await database.async.run('COMMIT')

      res.json({
        gift: {
          name: giftType.name,
          emoji: giftType.emoji
        },
        transaction: {
          id: transactionId
        }
      })

    } catch (error) {
      await database.async.run('ROLLBACK')
      throw error
    }

  } catch (error) {
    console.error('Error sending gift:', error)
    res.status(500).json({ error: 'Failed to send gift' })
  }
})

// 🚨 NIEUW: Create claim (voor iOS Keyboard Extension)
// Deze route doet hetzelfde als /send maar met de URL die het keyboard verwacht
router.post('/create-claim', async (req, res) => {
  try {
    console.log('🎯 CREATE-CLAIM called with body:', req.body)
    
    const { giftId, quantity, transactionId, recipientEmail, authToken } = req.body

    // Verificatie van required parameters
    if (!giftId || !quantity || !transactionId) {
      console.error('❌ Missing required parameters:', { giftId, quantity, transactionId })
      return res.status(400).json({ error: 'Gift ID, quantity, and transaction ID are required' })
    }

    // Authenticatie via authToken uit request body (keyboard stuurt token mee)
    if (!authToken) {
      console.error('❌ No auth token provided')
      return res.status(401).json({ error: 'Authentication token is required' })
    }

    // Verificeer authToken (zou normaal via middleware gaan, maar keyboard stuurt token in body)
    // Voor nu accepteren we alle tokens (dit zou later geïmplementeerd moeten worden)
    console.log('🔑 Auth token provided:', authToken.substring(0, 10) + '...')

    // Get gift details
    const giftType = await database.async.get(
      'SELECT * FROM gift_types WHERE id = ?',
      [giftId]
    )

    if (!giftType) {
      console.error('❌ Gift type not found:', giftId)
      return res.status(404).json({ error: 'Gift type not found' })
    }

    console.log('✅ Gift type found:', giftType.name)

    // Voor nu gebruiken we een dummy sender_id (dit zou uit de authToken moeten komen)
    const senderUserId = 1 // Demo user ID (demo@cadeautjes.app)

    await database.async.run('BEGIN TRANSACTION')

    try {
      // Create claim entry in database
      await database.async.run(`
        INSERT INTO claims (transaction_id, gift_type_id, sender_id, receiver_email, quantity, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'sent', datetime('now'))
      `, [transactionId, giftId, senderUserId, recipientEmail || null, quantity])

      console.log('✅ Claim created in database:', transactionId)

      // Update user's inventory (reduce quantity)
      try {
        const updateResult = await database.async.run(
          'UPDATE user_gifts SET quantity = quantity - ? WHERE user_id = ? AND gift_type_id = ? AND quantity >= ?',
          [quantity, senderUserId, giftId, quantity]
        )

        // Check if updateResult exists and has changes property
        if (updateResult && typeof updateResult.changes === 'number') {
          if (updateResult.changes === 0) {
            console.warn('⚠️ No inventory updated - user might not have enough gifts')
          } else {
            console.log('✅ Inventory updated: reduced by', quantity)
          }
        } else {
          console.log('✅ Inventory update attempted (changes property not available)')
        }
      } catch (inventoryError) {
        console.warn('⚠️ Inventory update failed:', inventoryError)
        // Continue anyway - claim is already created
      }

      await database.async.run('COMMIT')

      res.json({
        success: true,
        transactionId,
        gift: {
          id: giftType.id,
          name: giftType.name,
          emoji: giftType.emoji
        },
        message: `Claim created successfully for ${giftType.name}`
      })

      console.log('✅ CREATE-CLAIM completed successfully:', transactionId)

    } catch (error) {
      await database.async.run('ROLLBACK')
      throw error
    }

  } catch (error) {
    console.error('❌ Error in create-claim:', error)
    res.status(500).json({ error: 'Failed to create claim' })
  }
})

// Cancel claim (voor "ongedaan maken" functie in keyboard)
router.delete('/cancel-claim/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params
    
    console.log('🔄 CANCEL-CLAIM called for:', transactionId)

    // Find the claim
    const claim = await database.async.get(
      'SELECT * FROM claims WHERE transaction_id = ? AND status = "sent"',
      [transactionId]
    )

    if (!claim) {
      console.error('❌ Claim not found or already processed:', transactionId)
      return res.status(404).json({ error: 'Claim not found or already processed' })
    }

    await database.async.run('BEGIN TRANSACTION')

    try {
      // Delete the claim
      await database.async.run(
        'DELETE FROM claims WHERE transaction_id = ?',
        [transactionId]
      )

      // Restore user's inventory
      const existingGift = await database.async.get(
        'SELECT * FROM user_gifts WHERE user_id = ? AND gift_type_id = ?',
        [claim.sender_id, claim.gift_type_id]
      )

      if (existingGift) {
        await database.async.run(
          'UPDATE user_gifts SET quantity = quantity + ? WHERE user_id = ? AND gift_type_id = ?',
          [claim.quantity, claim.sender_id, claim.gift_type_id]
        )
      } else {
        await database.async.run(
          'INSERT INTO user_gifts (user_id, gift_type_id, quantity) VALUES (?, ?, ?)',
          [claim.sender_id, claim.gift_type_id, claim.quantity]
        )
      }

      await database.async.run('COMMIT')

      res.json({
        success: true,
        message: 'Claim cancelled and inventory restored'
      })

      console.log('✅ CANCEL-CLAIM completed successfully:', transactionId)

    } catch (error) {
      await database.async.run('ROLLBACK')
      throw error
    }

  } catch (error) {
    console.error('❌ Error cancelling claim:', error)
    res.status(500).json({ error: 'Failed to cancel claim' })
  }
})

// Sync for iOS (UPDATED: supports both old and new system)
router.post('/sync', async (req, res) => {
  try {
    const { device_id } = req.body
    
    if (!device_id) {
      return res.status(400).json({ error: 'Device ID is required' })
    }

    // For iOS sync, return available gifts that can be sent
    const availableGifts = await database.async.all(`
      SELECT DISTINCT
        gt.id,
        gt.name,
        gt.emoji,
        gt.category,
        COALESCE(ug.quantity, 0) as quantity
      FROM gift_types gt
      LEFT JOIN user_gifts ug ON gt.id = ug.gift_type_id 
      WHERE gt.active = 1 AND COALESCE(ug.quantity, 0) > 0
      ORDER BY gt.category, gt.name
    `)

    res.json({
      status: 'success',
      availableGifts,
      categories: CATEGORIES
    })
    
  } catch (error) {
    console.error('Sync error:', error)
    res.status(500).json({ error: 'Sync failed' })
  }
})

// ✨ NIEUW: Get user credits/spaarpot per category
router.get('/credits', authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' })
    }

    const userId = req.user.userId
    
    // Get credits from new spaarpot system
    const credits = await database.async.all(`
      SELECT category, credit_amount, last_updated
      FROM user_category_credits 
      WHERE user_id = ?
      ORDER BY category
    `, [userId])

    // Ensure all categories are represented (with 0.00 if no credit)
    const allCredits = CATEGORIES.map(cat => {
      const existingCredit = credits.find(c => c.category === cat.id)
      return {
        category: cat.id,
        credit_amount: existingCredit?.credit_amount || 0.00,
        last_updated: existingCredit?.last_updated || null
      }
    })

    res.json({ credits: allCredits })
    
  } catch (error) {
    console.error('Error fetching credits:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ✨ NIEUW: Claim gift with choice (spend now or save to credit)
router.post('/claim-gift', async (req, res) => {
  try {
    const { transactionId, choice } = req.body // choice: 'spend' or 'save'
    
    if (!transactionId || !choice) {
      return res.status(400).json({ error: 'Transaction ID and choice are required' })
    }

    if (!['spend', 'save'].includes(choice)) {
      return res.status(400).json({ error: 'Choice must be "spend" or "save"' })
    }

    // Find the claim
    const claim = await database.async.get(`
      SELECT c.*, gt.name, gt.price, gt.category, gt.emoji
      FROM claims c
      JOIN gift_types gt ON c.gift_type_id = gt.id
      WHERE c.transaction_id = ? AND c.status = 'sent'
    `, [transactionId])

    if (!claim) {
      return res.status(404).json({ error: 'Claim not found or already processed' })
    }

    await database.async.run('BEGIN TRANSACTION')

    try {
      if (choice === 'spend') {
        // Direct spending - generate QR code
        const qrData = {
          type: 'pebbling_gift',
          transactionId,
          giftName: claim.name,
          emoji: claim.emoji,
          value: claim.price,
          timestamp: Date.now()
        }
        
        const qrCode = await QRCode.toDataURL(JSON.stringify(qrData))
        
        // Update claim status
        await database.async.run(`
          UPDATE claims 
          SET status = 'redeemed', claimed_at = datetime('now')
          WHERE transaction_id = ?
        `, [transactionId])

        await database.async.run('COMMIT')

        res.json({
          success: true,
          choice: 'spend',
          qrCode,
          gift: {
            name: claim.name,
            emoji: claim.emoji,
            value: claim.price
          }
        })

      } else {
        // Save to credit
        const userId = 1 // TODO: Get from receiver email lookup
        
        // Check if user already has credit in this category
        const existingCredit = await database.async.get(`
          SELECT * FROM user_category_credits 
          WHERE user_id = ? AND category = ?
        `, [userId, claim.category])

        if (existingCredit) {
          // Update existing credit
          await database.async.run(`
            UPDATE user_category_credits 
            SET credit_amount = credit_amount + ?, last_updated = datetime('now')
            WHERE user_id = ? AND category = ?
          `, [claim.price, userId, claim.category])
        } else {
          // Create new credit entry
          await database.async.run(`
            INSERT INTO user_category_credits (user_id, category, credit_amount, last_updated)
            VALUES (?, ?, ?, datetime('now'))
          `, [userId, claim.category, claim.price])
        }

        // Update claim status
        await database.async.run(`
          UPDATE claims 
          SET status = 'saved_to_credit', claimed_at = datetime('now')
          WHERE transaction_id = ?
        `, [transactionId])

        await database.async.run('COMMIT')

        res.json({
          success: true,
          choice: 'save',
          creditAdded: claim.price,
          category: claim.category,
          gift: {
            name: claim.name,
            emoji: claim.emoji,
            value: claim.price
          }
        })
      }

    } catch (error) {
      await database.async.run('ROLLBACK')
      throw error
    }

  } catch (error) {
    console.error('Error claiming gift:', error)
    res.status(500).json({ error: 'Failed to claim gift' })
  }
})

// ✨ NIEUW: Spend from credit (generate QR for spending saved credit)
router.post('/spend-from-credit', authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' })
    }

    const userId = req.user.userId
    const { category, amount } = req.body

    if (!category || !amount || amount <= 0) {
      return res.status(400).json({ error: 'Category and valid amount are required' })
    }

    // Check if user has enough credit
    const userCredit = await database.async.get(`
      SELECT * FROM user_category_credits 
      WHERE user_id = ? AND category = ?
    `, [userId, category])

    if (!userCredit || userCredit.credit_amount < amount) {
      return res.status(400).json({ error: 'Insufficient credit for this category' })
    }

    // Generate QR code for spending
    const qrData = {
      type: 'pebbling_credit',
      userId,
      category,
      amount,
      timestamp: Date.now()
    }
    
    const qrCode = await QRCode.toDataURL(JSON.stringify(qrData))

    // Reduce credit
    await database.async.run(`
      UPDATE user_category_credits 
      SET credit_amount = credit_amount - ?, last_updated = datetime('now')
      WHERE user_id = ? AND category = ?
    `, [amount, userId, category])

    res.json({
      success: true,
      qrCode,
      spent: amount,
      category,
      remainingCredit: userCredit.credit_amount - amount
    })

  } catch (error) {
    console.error('Error spending from credit:', error)
    res.status(500).json({ error: 'Failed to spend from credit' })
  }
})

// Get user stats (dashboard)
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' })
    }

    const userId = req.user.userId

    // Get user for email lookup
    const user = await database.async.get('SELECT email FROM users WHERE id = ?', [userId])

    // Count purchased gifts
    const purchasedResult = await database.async.get(`
      SELECT COUNT(*) as purchased
      FROM user_gifts 
      WHERE user_id = ? AND quantity > 0
    `, [userId])
    
    const receivedResult = await database.async.get(`
      SELECT COUNT(*) as received
      FROM claims 
      WHERE receiver_email = ? AND status = 'claimed'
    `, [user?.email || ''])

    // Count sent gifts from claims where this user is sender  
    const sentResult = await database.async.get(`
      SELECT COUNT(*) as sent
      FROM claims 
      WHERE sender_id = ?
    `, [userId])

    // Count claimed gifts from claims table
    const claimedResult = await database.async.get(`
      SELECT COUNT(*) as claimed
      FROM claims 
      WHERE sender_id = ? AND status IN ('redeemed', 'saved_to_credit')
    `, [userId])

    // Count claimed from keyboard (where transaction_id pattern matches keyboard)
    const claimedFromKeyboardResult = await database.async.get(`
      SELECT COUNT(*) as claimedFromKeyboard
      FROM claims 
      WHERE sender_id = ? 
      AND status IN ('redeemed', 'saved_to_credit')
      AND transaction_id LIKE 'keyboard_%'
    `, [userId])

    // Count claimed from app (where transaction_id pattern matches app)
    const claimedFromAppResult = await database.async.get(`
      SELECT COUNT(*) as claimedFromApp
      FROM claims 
      WHERE sender_id = ? AND status IN ('redeemed', 'saved_to_credit')
      AND transaction_id LIKE 'app_%'
    `, [userId])

    res.json({
      purchased: purchasedResult?.purchased || 0,
      received: receivedResult?.received || 0,
      sent: sentResult?.sent || 0,
      claimed: claimedResult?.claimed || 0,
      claimedFromKeyboard: claimedFromKeyboardResult?.claimedFromKeyboard || 0,
      claimedFromApp: claimedFromAppResult?.claimedFromApp || 0
    })

  } catch (error) {
    console.error('Error fetching stats:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ✅ NIEUW: GET /api/gifts/sent - Voor verstuurde cadeautjes (🚨 GEFIXT: c.claimed_at als redeemed_at)
router.get('/sent', authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' })
    }

    const userId = req.user.userId

    // Get sent gifts from claims table joined with gift_types
    const sentGifts = await database.async.all(`
      SELECT 
        c.id, 
        c.transaction_id,
        c.created_at,
        c.status,
        c.claimed_at as redeemed_at,
        gt.name,
        gt.emoji,
        gt.description,
        gt.price,
        c.quantity,
        '' as receiver_email,
        '' as message
      FROM claims c
      JOIN gift_types gt ON c.gift_type_id = gt.id
      WHERE c.sender_id = ?
      ORDER BY c.created_at DESC
    `, [userId])

    res.json({ sentGifts })

  } catch (error) {
    console.error('Error fetching sent gifts:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// ✅ NIEUW: GET /api/gifts/received - Voor ontvangen cadeautjes (CONSISTENT WITH INVENTORY)
router.get('/received', authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'User not authenticated' })
    }

    const userId = req.user.userId

    // ✅ FIXED: Use gt.id instead of c.gift_type_id for consistency with /inventory
    const receivedGifts = await database.async.all(`
      SELECT 
        gt.id,
        gt.name,
        gt.emoji,
        gt.category,
        c.quantity,
        c.claimed_at,
        u.name as sender_name
      FROM claims c
      JOIN gift_types gt ON c.gift_type_id = gt.id
      JOIN users u ON c.sender_id = u.id
      WHERE c.receiver_email = ? AND c.status = 'claimed'
      ORDER BY c.claimed_at DESC
    `, [req.user.email])

    res.json({ receivedGifts })

  } catch (error) {
    console.error('Error fetching received gifts:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router