import { Router } from 'express';
import { database } from '../models/database';
const QRCode = require('qrcode');

// 🔧 CONFIGURATIE: Verander dit IP adres naar je huidige werklocatie
const BACKEND_HOST = '192.168.68.119'  // ← UPDATE DIT IP ADRES
const BACKEND_PORT = '3001'
const BASE_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}`

const router = Router();

// Handle gift claim with real database
// Handle gift claim with preview-safe system
router.get('/claim/:transactionId', async (req, res) => {
    const { transactionId } = req.params;
    const { action } = req.query; // ?action=claim voor echte claim
    const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
    
    console.log(`🎁 Claim request for: ${transactionId} from IP: ${clientIp}, action: ${action || 'preview'}`);
    
    try {
        // 🔧 FIXED: First check if claim exists - ACCEPT BEIDE 'sent' EN 'pending' status
        const claimCheck = await database.async.get(
            `SELECT c.*, gt.name, gt.emoji, gt.description, gt.price, gt.category, u.name as sender_name 
             FROM claims c 
             JOIN gift_types gt ON c.gift_type_id = gt.id 
             JOIN users u ON c.sender_id = u.id 
             WHERE c.transaction_id = ? 
             AND c.status IN ('sent', 'pending', 'claimed')`,
            [transactionId]
        );
        
        if (!claimCheck) {
            console.log('❌ Claim not found');
            return res.status(404).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>❌ Claim Error</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    body { font-family: Arial; text-align: center; padding: 50px; background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%); color: white; }
                    .container { background: white; color: #333; padding: 40px; border-radius: 20px; max-width: 400px; margin: 0 auto; }
                    .emoji { font-size: 80px; margin: 20px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="emoji">❌</div>
                    <h1>Cadeau niet gevonden</h1>
                    <p>Deze claim link is ongeldig of verlopen.</p>
                </div>
            </body>
            </html>
            `);
        }

        // If ?action=claim, show choice page with CSS-only wallet toggle
        if (action === 'claim') {
            console.log('👀 Showing choice page with CSS toggle');
            return res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>🎁 Hoe wil je je cadeau gebruiken?</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    body { font-family: Arial; text-align: center; padding: 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; min-height: 100vh; }
                    .container { background: white; color: #333; padding: 30px; border-radius: 20px; max-width: 400px; margin: 0 auto; }
                    .emoji { font-size: 60px; margin: 20px 0; }
                    .gift-info { background: #f5f5f5; padding: 15px; border-radius: 15px; margin: 20px 0; }
                    .choice-btn { display: block; width: calc(100% - 20px); padding: 15px; margin: 10px 10px; border: none; border-radius: 10px; font-size: 16px; cursor: pointer; text-decoration: none; color: white; box-sizing: border-box; }
                    .direct-btn { background: #4CAF50; }
                    .wallet-btn { background: #2196F3; }
                    .description { font-size: 14px; color: #666; margin: 10px 0; }
                    
                    /* CSS-only toggle */
                    .wallet-toggle { display: none; }
                    .wallet-form { display: none; background: #f9f9f9; padding: 20px; border-radius: 10px; margin: 20px 0; }
                    .wallet-toggle:checked ~ .wallet-form { display: block; }
                    .wallet-toggle:checked ~ .wallet-label { display: none; }
                    
                    .input-group { margin: 15px 0; text-align: left; }
                    .input-group label { display: block; margin-bottom: 5px; font-weight: bold; }
                    .input-group input { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; font-size: 16px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="emoji">${claimCheck.emoji}</div>
                    <h2>🎁 Hoe wil je je cadeau gebruiken?</h2>
                    <div class="gift-info">
                        <p><strong>${claimCheck.quantity > 1 ? claimCheck.quantity + '× ' : 'Een '}${claimCheck.name}</strong></p>
                        <div style="color: #666; font-size: 14px;">Van: ${claimCheck.sender_name}</div>
                    </div>
                    
                    <a href="${BASE_URL}/api/claim/${transactionId}?action=redeem" class="choice-btn direct-btn">
                        📲 Direct Inwisselen
                    </a>
                    <p class="description">Laat partner QR code scannen voor direct gebruik</p>
                    
                    <input type="checkbox" id="walletToggle" class="wallet-toggle">
                    <label for="walletToggle" class="choice-btn wallet-btn wallet-label">
                        💰 Toevoegen aan Mijn Tegoed
                    </label>
                    <p class="description wallet-label">Bewaar in je persoonlijke wallet (account vereist)</p>
                    
                    <div class="wallet-form">
                        <h3>💰 Account Required</h3>
                        <p>Om cadeautjes aan je tegoed toe te voegen, heb je een account nodig.</p>
                        
                        <div class="input-group">
                            <label for="email">Email:</label>
                            <input type="email" id="email" value="demo@cadeautjes.app" readonly>
                        </div>
                        <div class="input-group">
                            <label for="password">Wachtwoord:</label>
                            <input type="password" id="password" value="demo123" readonly>
                        </div>
                        
                        <a href="${BASE_URL}/api/claim/${transactionId}?action=process-wallet&email=demo@cadeautjes.app&password=demo123" class="choice-btn wallet-btn">
                            ✅ Toevoegen aan Tegoed
                        </a>
                    </div>
                </div>
            </body>
            </html>
            `);
        }

        // If ?action=redeem, show QR code for direct redemption
        if (action === 'redeem') {
            console.log('📲 Generating QR code for direct redemption...');
            
            try {
                // Generate QR code
                const qrData = {
                    type: 'pebbling_claim',
                    transactionId,
                    giftId: claimCheck.gift_type_id,
                    quantity: claimCheck.quantity,
                    timestamp: Date.now()
                };
                
                const qrCode = await QRCode.toDataURL(JSON.stringify(qrData));
                
                return res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>📱 Toon QR aan Partner</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <style>
                        body { font-family: Arial; text-align: center; padding: 20px; background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; }
                        .container { background: white; color: #333; padding: 30px; border-radius: 20px; max-width: 400px; margin: 0 auto; }
                        .emoji { font-size: 60px; margin: 20px 0; }
                        .qr-code { width: 250px; height: 250px; margin: 20px auto; background: white; padding: 20px; border-radius: 15px; }
                        .status { background: #e3f2fd; padding: 15px; border-radius: 10px; margin: 20px 0; color: #1976d2; }
                        .instructions { background: #fff3e0; padding: 15px; border-radius: 10px; margin: 20px 0; color: #ef6c00; }
                        .back-btn { background: #2196F3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="emoji">${claimCheck.emoji}</div>
                        <h2>📱 Laat Partner Scannen</h2>
                        <div class="status">
                            <strong>${claimCheck.quantity > 1 ? claimCheck.quantity + '× ' : ''}${claimCheck.name}</strong>
                            <div style="font-size: 14px; margin-top: 5px;">Van: ${claimCheck.sender_name}</div>
                        </div>
                        <div class="qr-code">
                            <img src="${qrCode}" alt="QR Code" style="width: 100%; height: 100%;">
                        </div>
                        <div class="instructions">
                            🔍 Partner scant deze QR code om je cadeau in te wisselen
                        </div>
                        <a href="${BASE_URL}/api/claim/${transactionId}?action=claim" class="back-btn">← Andere Optie</a>
                        
                        <div style="margin-top: 30px; font-size: 12px; color: #666;">
                            Status wordt automatisch bijgewerkt...
                        </div>
                    </div>
                    
                    <script>
                    // Auto-refresh every 30 seconds to check if redeemed
                    const refreshInterval = setInterval(() => {
                        fetch('${BASE_URL}/api/claim/${transactionId}/status')
                            .then(response => response.json())
                            .then(data => {
                                if (data.status === 'redeemed') {
                                    clearInterval(refreshInterval);
                                    window.location.href = '${BASE_URL}/api/claim/${transactionId}?action=partner-redeemed';
                                }
                            })
                            .catch(err => console.log('Status check failed:', err));
                    }, 30000);
                    </script>
                </body>
                </html>
                `);
                
            } catch (qrError) {
                console.error('QR generation failed:', qrError);
                return res.status(500).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>❌ QR Error</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <style>
                        body { font-family: Arial; text-align: center; padding: 50px; background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%); color: white; }
                        .container { background: white; color: #333; padding: 40px; border-radius: 20px; max-width: 400px; margin: 0 auto; }
                        .emoji { font-size: 80px; margin: 20px 0; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="emoji">❌</div>
                        <h1>QR Code Error</h1>
                        <p>Er is een fout opgetreden bij het genereren van de QR code.</p>
                        <a href="${BASE_URL}/api/claim/${transactionId}?action=claim" style="background: #2196F3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">← Try Again</a>
                    </div>
                </body>
                </html>
                `);
            }
        }

        // If ?action=process-wallet, handle login and wallet addition
        if (action === 'process-wallet') {
            console.log('💰 Processing wallet login and addition...');
            
            // Get form data from GET request
            const { email, password } = req.query;
            
            console.log('📧 Login attempt:', email);
            
            // Simple demo validation
            if (email === 'demo@cadeautjes.app' && password === 'demo123') {
                console.log('✅ Login successful, adding to wallet');
                
                try {
                    // 1. Get the user ID from the email
                    const user = await database.async.get('SELECT id FROM users WHERE email = ?', [email]);
                    
                    if (!user) {
                        throw new Error('User not found');
                    }
                    
                    const userId = user.id;
                    console.log(`👤 Found user ID: ${userId}`);
                    
                    // 2. Add the gift to user's inventory (user_gifts table)
                    const existingInventory = await database.async.get(
                        'SELECT * FROM user_gifts WHERE user_id = ? AND gift_type_id = ?',
                        [userId, claimCheck.gift_type_id]
                    );
                    
                    if (existingInventory) {
                        // Add to existing quantity
                        await database.async.run(
                            'UPDATE user_gifts SET quantity = quantity + ? WHERE user_id = ? AND gift_type_id = ?',
                            [claimCheck.quantity, userId, claimCheck.gift_type_id]
                        );
                        console.log(`📈 Updated inventory: +${claimCheck.quantity} ${claimCheck.name}`);
                    } else {
                        // Create new inventory entry
                        await database.async.run(
                            'INSERT INTO user_gifts (user_id, gift_type_id, quantity) VALUES (?, ?, ?)',
                            [userId, claimCheck.gift_type_id, claimCheck.quantity]
                        );
                        console.log(`➕ Added to inventory: ${claimCheck.quantity} ${claimCheck.name}`);
                    }
                    
                    // 3. Update the claim to mark it as claimed and set receiver email
                    await database.async.run(
                        'UPDATE claims SET status = ?, claimed_at = CURRENT_TIMESTAMP, receiver_email = ? WHERE transaction_id = ?',
                        ['claimed', email, transactionId]
                    );
                    console.log('🎯 Claim marked as claimed with receiver email');
                    
                    // 4. Reduce quantity from sender's inventory
                    await database.async.run(
                        'UPDATE user_gifts SET quantity = quantity - ? WHERE user_id = ? AND gift_type_id = ?',
                        [claimCheck.quantity, claimCheck.sender_id, claimCheck.gift_type_id]
                    );
                    console.log('📉 Reduced sender inventory');
                    
                    // 🆕 5. ADD EURO VALUE TO CATEGORY CREDITS (MISSING CODE FIXED!)
                    const existingCredit = await database.async.get(`
                        SELECT * FROM user_category_credits
                        WHERE user_id = ? AND category = ?
                    `, [userId, claimCheck.category]);
                    
                 if (existingCredit) {
    // Update existing credit
    await database.async.run(`
        UPDATE user_category_credits
        SET credit_amount = credit_amount + ?, last_updated = datetime('now')
        WHERE user_id = ? AND category = ?
    `, [claimCheck.price * claimCheck.quantity, userId, claimCheck.category]);
    console.log(`💰 Updated existing credit: +€${claimCheck.price * claimCheck.quantity} to ${claimCheck.category} (total: €${existingCredit.credit_amount + (claimCheck.price * claimCheck.quantity)})`);
} else {
    // Create new credit entry
    await database.async.run(`
        INSERT INTO user_category_credits (user_id, category, credit_amount, last_updated)
        VALUES (?, ?, ?, datetime('now'))
    `, [userId, claimCheck.category, claimCheck.price * claimCheck.quantity]);
    console.log(`💰 Created new credit entry: €${claimCheck.price * claimCheck.quantity} for ${claimCheck.category}`);
}

console.log(`🎉 SUCCESS: Added €${claimCheck.price * claimCheck.quantity} to ${claimCheck.category} credits for user ${userId}`);
                    // Redirect to success page
                    return res.redirect(`${BASE_URL}/api/claim/${transactionId}?action=wallet-success`);
                    
                } catch (walletError) {
                    console.error('Wallet addition failed:', walletError);
                    const errorMessage = walletError instanceof Error ? walletError.message : 'Unknown wallet error';
                    return res.status(500).send(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>❌ Wallet Error</title>
                        <meta name="viewport" content="width=device-width, initial-scale=1">
                        <style>
                            body { font-family: Arial; text-align: center; padding: 50px; background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%); color: white; }
                            .container { background: white; color: #333; padding: 40px; border-radius: 20px; max-width: 400px; margin: 0 auto; }
                            .emoji { font-size: 80px; margin: 20px 0; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="emoji">❌</div>
                            <h1>Wallet Error</h1>
                            <p>Er is een fout opgetreden bij het toevoegen aan je tegoed.</p>
                            <p style="font-size: 12px; color: #666;">${errorMessage}</p>
                            <a href="${BASE_URL}/api/claim/${transactionId}?action=claim" style="background: #2196F3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">← Try Again</a>
                        </div>
                    </body>
                    </html>
                    `);
                }
                
            } else {
                console.log('❌ Login failed');
                
                // Return to wallet form with error
                return res.redirect(`${BASE_URL}/api/claim/${transactionId}?action=add-to-wallet&error=login`);
            }
        }

        // If ?action=wallet-success, show success for wallet addition
        if (action === 'wallet-success') {
            console.log('✅ Wallet success page');
            
            return res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>✅ Toegevoegd aan Tegoed!</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    body { font-family: Arial; text-align: center; padding: 50px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
                    .container { background: white; color: #333; padding: 40px; border-radius: 20px; max-width: 400px; margin: 0 auto; }
                    .emoji { font-size: 80px; margin: 20px 0; }
                    h1 { color: #2196F3; margin: 20px 0; }
                    .gift-info { background: #f5f5f5; padding: 20px; border-radius: 15px; margin: 20px 0; }
                    .sender { color: #666; font-size: 14px; margin: 10px 0; }
                    .app-btn { background: #4CAF50; color: white; padding: 15px 30px; border: none; border-radius: 10px; font-size: 16px; cursor: pointer; margin: 20px 0; text-decoration: none; display: inline-block; }
                    .success-indicator { 
                        background: #d4edda; 
                        color: #155724; 
                        padding: 15px; 
                        border-radius: 10px; 
                        border: 1px solid #c3e6cb; 
                        margin: 20px 0;
                    }
                    .credits-info {
                        background: #fff3e0;
                        color: #ef6c00;
                        padding: 15px;
                        border-radius: 10px;
                        border: 1px solid #ffcc02;
                        margin: 20px 0;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="emoji">💰</div>
                    <h1>✅ Toegevoegd aan Tegoed!</h1>
                    <div class="gift-info">
                        <p>Je <strong>${claimCheck.quantity > 1 ? claimCheck.quantity + '× ' : ''}${claimCheck.name}</strong> is toegevoegd aan je persoonlijke tegoed!</p>
                        <div class="sender">Van: ${claimCheck.sender_name}</div>
                        <div class="sender">Toegevoegd op: ${new Date().toLocaleString('nl-NL')}</div>
                    </div>
                    <div class="success-indicator">
                        ✅ Dit cadeautje staat nu in je toegoed en kan je besteden!
                    </div>
                   <div class="credits-info">
    💰 <strong>€${claimCheck.price * claimCheck.quantity}</strong> toegevoegd aan je <strong>${claimCheck.category}</strong> tegoed!
</div>
                    <a href="cadeautjesapp://home" class="app-btn">📱 Open in App</a>
                    <p style="font-size: 12px; color: #666;">Je cadeautje is nu beschikbaar in de Pebbling app</p>
                </div>
            </body>
            </html>
            `);
        }

        // If ?action=partner-redeemed, show success for partner redemption
        if (action === 'partner-redeemed') {
            return res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>✅ Cadeau Ingewisseld!</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    body { font-family: Arial; text-align: center; padding: 50px; background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; }
                    .container { background: white; color: #333; padding: 40px; border-radius: 20px; max-width: 400px; margin: 0 auto; }
                    .emoji { font-size: 80px; margin: 20px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="emoji">🎉</div>
                    <h1>✅ Cadeau Ingewisseld!</h1>
                    <p>Je <strong>${claimCheck.name}</strong> is succesvol ingewisseld bij de partner.</p>
                    <p style="color: #666; font-size: 14px;">Van: ${claimCheck.sender_name}</p>
                    <p style="color: #4CAF50; font-weight: bold;">Geniet ervan! 🎁</p>
                </div>
            </body>
            </html>
            `);
        }

        // Default preview behavior (no action parameter)
        console.log('👁️ Showing preview page');
        return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>🎁 Je hebt een cadeau ontvangen!</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body { font-family: Arial; text-align: center; padding: 50px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
                .container { background: white; color: #333; padding: 40px; border-radius: 20px; max-width: 400px; margin: 0 auto; }
                .emoji { font-size: 80px; margin: 20px 0; }
                .gift-info { background: #f5f5f5; padding: 20px; border-radius: 15px; margin: 20px 0; }
                .claim-btn { background: #4CAF50; color: white; padding: 15px 30px; border: none; border-radius: 10px; font-size: 18px; cursor: pointer; margin: 20px 0; text-decoration: none; display: block; }
                .description { font-size: 14px; color: #666; margin: 20px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="emoji">${claimCheck.emoji}</div>
                <h1>🎁 Je hebt een cadeau ontvangen!</h1>
                <div class="gift-info">
                    <h2>${claimCheck.quantity > 1 ? claimCheck.quantity + '× ' : ''}${claimCheck.name}</h2>
                    <div class="sender">Van: ${claimCheck.sender_name}</div>
                    <p style="color: #666; font-size: 14px; margin-top: 15px;">${claimCheck.description}</p>
                </div>
                <a href="${BASE_URL}/api/claim/${transactionId}?action=claim" class="claim-btn">
                    🎯 Cadeau Claimen
                </a>
                <div class="description">
                    Klik hier om je cadeau te claimen en te kiezen hoe je het wilt gebruiken!
                </div>
            </div>
        </body>
        </html>
        `);

    } catch (error) {
        console.error('Claim error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>❌ Server Error</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                body { font-family: Arial; text-align: center; padding: 50px; background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%); color: white; }
                .container { background: white; color: #333; padding: 40px; border-radius: 20px; max-width: 400px; margin: 0 auto; }
                .emoji { font-size: 80px; margin: 20px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="emoji">❌</div>
                <h1>Server Error</h1>
                <p>Er is een fout opgetreden bij het verwerken van je verzoek.</p>
                <p style="font-size: 12px; color: #666;">${errorMessage}</p>
            </div>
        </body>
        </html>
        `);
    }
});

// Status check endpoint for auto-refresh
router.get('/claim/:transactionId/status', async (req, res) => {
    const { transactionId } = req.params;
    
    try {
        const claim = await database.async.get(
            'SELECT status FROM claims WHERE transaction_id = ?',
            [transactionId]
        );
        
        if (!claim) {
            return res.status(404).json({ error: 'Claim not found' });
        }
        
        res.json({ status: claim.status });
        
    } catch (error) {
        console.error('Status check error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DEBUG: Get all claims
router.get('/debug/all-claims', async (req, res) => {
    try {
        const claims = await database.async.all(`
            SELECT c.*, gt.name, gt.emoji, gt.price, gt.category, u.name as sender_name
            FROM claims c 
            JOIN gift_types gt ON c.gift_type_id = gt.id 
            JOIN users u ON c.sender_id = u.id 
            ORDER BY c.created_at DESC
        `);
        
        res.json({
            total: claims.length,
            claims: claims.map(claim => ({
                id: claim.id,
                transaction_id: claim.transaction_id,
                status: claim.status,
                gift: `${claim.emoji} ${claim.name}`,
                price: `€${claim.price}`,
                category: claim.category,
                sender: claim.sender_name,
                receiver: claim.receiver_email || 'not set',
                created: claim.created_at,
                claimed: claim.claimed_at
            }))
        });
        
    } catch (error) {
        console.error('Debug error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown debug error';
        res.status(500).json({ error: 'Debug error: ' + errorMessage });
    }
});

// DEBUG: Get user received gifts
router.get('/debug/received/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const receivedGifts = await database.async.all(`
            SELECT c.*, gt.name, gt.emoji, gt.price, gt.category, u.name as sender_name
            FROM claims c 
            JOIN gift_types gt ON c.gift_type_id = gt.id 
            JOIN users u ON c.sender_id = u.id 
            WHERE c.status = 'claimed'
            AND c.receiver_email = (SELECT email FROM users WHERE id = ?)
            ORDER BY c.claimed_at DESC
        `, [userId]);
        
        res.json({
            userId: userId,
            total: receivedGifts.length,
            receivedGifts: receivedGifts.map(gift => ({
                id: gift.id,
                transaction_id: gift.transaction_id,
                gift: `${gift.emoji} ${gift.name}`,
                price: `€${gift.price}`,
                category: gift.category,
                sender: gift.sender_name,
                claimed_at: gift.claimed_at
            }))
        });
        
    } catch (error) {
        console.error('Debug error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown debug error';
        res.status(500).json({ error: 'Debug error: ' + errorMessage });
    }
});

// ADMIN: Manual fix for existing claims
router.post('/admin/fix-received-gifts', async (req, res) => {
    try {
        // Fix existing claims without receiver_email
        const result = await database.async.run(`
            UPDATE claims 
            SET receiver_email = 'demo@cadeautjes.app' 
            WHERE status = 'claimed' AND (receiver_email IS NULL OR receiver_email = '')
        `);
        
        res.json({
            message: 'Fixed received gifts',
            fixedClaims: result.changes || 0,
            note: 'All claimed gifts without receiver_email have been assigned to demo@cadeautjes.app'
        });
        
    } catch (error) {
        console.error('Fix error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown fix error';
        res.status(500).json({ error: 'Fix error: ' + errorMessage });
    }
});

export default router;