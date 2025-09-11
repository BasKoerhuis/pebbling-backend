import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'

// Import routes
import authRoutes from './routes/auth'
import giftsRoutes from './routes/gifts'
import partnersRoutes from './routes/partners'
import claimsRoutes from './routes/claims'

// Import database to initialize
import './models/database'
import fs from 'fs';
import path from 'path';

import https from 'https'

// Config management
const configPath = path.join(__dirname, 'config.json');

function readConfig() {
  try {
    const data = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // Fallback config
    return {
      backend_host: "192.168.68.119",
      backend_port: "3001"
    };
  }
}

function writeConfig(newConfig: any) {
  fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
  console.log(`🔧 Config updated:`, newConfig);
}

// Load configuration
const config = readConfig();
const BACKEND_HOST = config.backend_host;
const BACKEND_PORT = Number(process.env.PORT) || Number(config.backend_port);

const app = express()
const PORT = BACKEND_PORT
console.log(`🔧 Using config: IP=${BACKEND_HOST}, Port=${PORT}`);
const NODE_ENV = process.env.NODE_ENV || 'development'

// Security middleware
app.use(helmet())

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000 // limit each IP to 100 requests per windowMs
})
app.use(limiter)

// CORS configuration
app.use(cors({
  origin: [
    'http://localhost:3000', // Website
    'https://pebbling-backend.onrender.com', // Backend
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'https://pebbling-frontend.onrender.com', // Website op IP adres
    'https://pebbling-backend.onrender.com', // Backend op IP adres  
    'cadeautjesapp://', // iOS app deep links
],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))

// Body parsing middleware
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  })
})

// API routes
app.use('/api/auth', authRoutes)
app.use('/api/gifts', giftsRoutes)
app.use('/api/partners', partnersRoutes)

// Claims routes (includes the claim pages)
app.use('/api', claimsRoutes)

// Admin API endpoints
app.get('/api/admin/config', (req, res) => {
  // Alleen via localhost toegankelijk
  const host = req.get('host') || '';
  if (!host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
    return res.status(403).json({ error: 'Admin API only accessible via localhost' });
  }
  
  const currentConfig = readConfig();
  res.json({ 
    ip: currentConfig.backend_host,
    port: currentConfig.backend_port 
  });
});

app.post('/api/admin/config', (req, res) => {
  // Alleen via localhost toegankelijk
  const host = req.get('host') || '';
  if (!host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
    return res.status(403).json({ error: 'Admin API only accessible via localhost' });
  }
  
  const { ip } = req.body;
  
  if (!ip || !/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
    return res.status(400).json({ error: 'Invalid IP address format' });
  }
  
  // Update config file
  const newConfig = {
    backend_host: ip,
    backend_port: "3001"
  };
  
  writeConfig(newConfig);
  
  res.json({ 
    success: true,
    message: `IP address updated to ${ip}. Server restart required.`,
    ip: ip 
  });
});

// Public config endpoint (for website, iOS app, keyboard)
app.get('/api/config', (req, res) => {
  const currentConfig = readConfig();
  res.json({ 
    backend_host: currentConfig.backend_host,
    backend_port: currentConfig.backend_port,
    api_base: `http://${currentConfig.backend_host}:${currentConfig.backend_port}/api`
  });
});

// 🏪 NEW: Partner scanner page
app.get('/partner/scanner', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>🏪 Pebbling Partner Scanner</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; 
            margin: 0; 
            padding: 20px; 
            background: linear-gradient(135deg, #2c3e50 0%, #3498db 100%); 
            color: white; 
            min-height: 100vh; 
        }
        .container { 
            max-width: 500px; 
            margin: 0 auto; 
            background: white; 
            color: #333; 
            border-radius: 20px; 
            padding: 30px; 
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
        }
        h1 { text-align: center; margin-bottom: 30px; color: #2c3e50; }
        .emoji { font-size: 50px; text-align: center; margin: 20px 0; }
        .scanner-section { 
            text-align: center; 
            margin: 30px 0; 
        }
        .input-group { 
            margin: 20px 0; 
        }
        .input-group label { 
            display: block; 
            margin-bottom: 8px; 
            font-weight: 600; 
            color: #555;
        }
        .input-group input, .input-group textarea { 
            width: 100%; 
            padding: 12px; 
            border: 2px solid #e0e0e0; 
            border-radius: 8px; 
            font-size: 16px; 
            box-sizing: border-box;
            transition: border-color 0.3s;
        }
        .input-group input:focus, .input-group textarea:focus { 
            outline: none; 
            border-color: #3498db; 
        }
        .btn { 
            width: 100%; 
            padding: 15px; 
            border: none; 
            border-radius: 10px; 
            font-size: 16px; 
            font-weight: 600; 
            cursor: pointer; 
            transition: all 0.3s;
            margin: 10px 0;
        }
        .scan-btn { 
            background: #27ae60; 
            color: white; 
        }
        .scan-btn:hover { 
            background: #229954; 
            transform: translateY(-2px);
        }
        .scan-btn:disabled {
            background: #95a5a6;
            cursor: not-allowed;
            transform: none;
        }
        .manual-btn { 
            background: #f39c12; 
            color: white; 
        }
        .manual-btn:hover { 
            background: #e67e22; 
        }
        .result { 
            margin: 20px 0; 
            padding: 20px; 
            border-radius: 10px; 
            text-align: center;
            display: none;
        }
        .result.success { 
            background: #d4edda; 
            color: #155724; 
            border: 1px solid #c3e6cb; 
        }
        .result.error { 
            background: #f8d7da; 
            color: #721c24; 
            border: 1px solid #f5c6cb; 
        }
        .result.info { 
            background: #d1ecf1; 
            color: #0c5460; 
            border: 1px solid #bee5eb; 
        }
        .gift-preview {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 10px;
            margin: 15px 0;
            border-left: 4px solid #3498db;
        }
        .camera-container {
            position: relative;
            margin: 20px 0;
            display: none;
        }
        #video {
            width: 100%;
            border-radius: 10px;
            background: #000;
        }
        .demo-section {
            background: #fff3cd;
            padding: 15px;
            border-radius: 10px;
            margin: 20px 0;
            border: 1px solid #ffeaa7;
        }
        .demo-section h3 {
            margin-top: 0;
            color: #856404;
        }
        #loading {
            display: none;
            text-align: center;
            color: #666;
        }
        .debug-info {
            background: #f8f9fa;
            padding: 10px;
            border-radius: 5px;
            margin: 10px 0;
            font-size: 12px;
            color: #666;
            display: none;
        }
        .quick-test {
            background: #e8f5e8;
            padding: 15px;
            border-radius: 10px;
            margin: 20px 0;
            border: 1px solid #c3e6cb;
        }
        .quick-test h3 {
            margin-top: 0;
            color: #155724;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="emoji">🏪</div>
        <h1>Pebbling Partner Scanner</h1>
        
        <div class="scanner-section">
            <button id="startCamera" class="btn scan-btn">📷 Test Camera (May Not Work)</button>
            <button id="toggleDebug" class="btn" style="background: #6c757d; color: white; font-size: 14px;">🔧 Show Debug Info</button>
            <div class="camera-container" id="cameraContainer">
                <video id="video" autoplay playsinline></video>
                <canvas id="canvas" style="display: none;"></canvas>
                <button id="stopCamera" class="btn" style="background: #e74c3c; color: white; margin-top: 10px;">❌ Stop Camera</button>
            </div>
            <div id="debugInfo" class="debug-info"></div>
        </div>
        
        <div style="text-align: center; margin: 20px 0; color: #666;">
            <strong>— RECOMMENDED: Manual Input —</strong>
        </div>
        
        <div class="input-group">
            <label for="manualCode">Manual QR Code Input:</label>
            <textarea id="manualCode" rows="3" placeholder="Paste QR code data here...

Example: PEBBLE_REDEEM:GIFT-1234567890:1:1"></textarea>
        </div>
        
        <button id="processManual" class="btn manual-btn">🔍 Process Code</button>
        
        <div class="quick-test">
            <h3>⚡ Quick Test</h3>
            <p>Click below to test with a demo transaction:</p>
            <button id="loadDemo" class="btn" style="background: #28a745; color: white;">Load Demo Transaction</button>
            <button id="testConnection" class="btn" style="background: #17a2b8; color: white;">Test Server Connection</button>
        </div>
        
        <div id="loading">
            <div style="margin: 20px 0;">⏳ Processing...</div>
        </div>
        
        <div id="result" class="result"></div>
    </div>

    <script>
        let debugMode = false;
        
        // Debug info toggle
        document.getElementById('toggleDebug').addEventListener('click', function() {
            debugMode = !debugMode;
            const debugInfo = document.getElementById('debugInfo');
            debugInfo.style.display = debugMode ? 'block' : 'none';
            this.textContent = debugMode ? '🔧 Hide Debug Info' : '🔧 Show Debug Info';
            
            if (debugMode) {
                updateDebugInfo();
            }
        });
        
        function updateDebugInfo() {
            const debugInfo = document.getElementById('debugInfo');
            debugInfo.innerHTML = \`
                <strong>Debug Information:</strong><br>
                • Protocol: \${window.location.protocol}<br>
                • Host: \${window.location.host}<br>
                • Navigator: \${navigator.userAgent.substring(0, 50)}...<br>
                • Camera API: \${navigator.mediaDevices ? '✅ Available' : '❌ Not Available'}<br>
                • HTTPS: \${window.location.protocol === 'https:' ? '✅ Yes' : '❌ No (Required for camera)'}<br>
                • Time: \${new Date().toLocaleString()}<br>
            \`;
        }
        
        // Camera functionality (may not work without HTTPS)
        document.getElementById('startCamera').addEventListener('click', async function() {
            const button = this;
            const debugInfo = document.getElementById('debugInfo');
            
            try {
                button.disabled = true;
                button.textContent = '📷 Starting Camera...';
                
                if (!navigator.mediaDevices) {
                    throw new Error('MediaDevices API not available');
                }
                
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    video: { 
                        facingMode: 'environment' // Back camera preferred
                    } 
                });
                
                const video = document.getElementById('video');
                const cameraContainer = document.getElementById('cameraContainer');
                
                video.srcObject = stream;
                cameraContainer.style.display = 'block';
                button.style.display = 'none';
                
                showResult('📷 Camera started! Point at QR code (Basic detection - may not work perfectly)', 'info');
                
                // Simple QR detection (won't work well, but demonstrates camera)
                // In a real implementation, you'd use a proper QR library here
                
            } catch (error) {
                console.error('Camera error:', error);
                button.disabled = false;
                button.textContent = '📷 Camera Failed';
                
                let errorMsg = \`❌ Camera Error: \${error.message}\`;
                
                if (error.name === 'NotAllowedError') {
                    errorMsg += '\\n\\n💡 Camera permission denied. Please allow camera access and try again.';
                } else if (error.name === 'NotFoundError') {
                    errorMsg += '\\n\\n💡 No camera found. Use manual input instead.';
                } else if (window.location.protocol !== 'https:') {
                    errorMsg += '\\n\\n💡 Camera requires HTTPS. Use manual input or deploy with SSL.';
                }
                
                showResult(errorMsg, false);
                
                if (debugMode) {
                    debugInfo.innerHTML += \`<br><strong>Camera Error:</strong> \${error.name}: \${error.message}\`;
                }
            }
        });
        
        // Stop camera
        document.getElementById('stopCamera').addEventListener('click', function() {
            const video = document.getElementById('video');
            if (video.srcObject) {
                video.srcObject.getTracks().forEach(track => track.stop());
                video.srcObject = null;
            }
            document.getElementById('cameraContainer').style.display = 'none';
            document.getElementById('startCamera').style.display = 'block';
            document.getElementById('startCamera').disabled = false;
            document.getElementById('startCamera').textContent = '📷 Test Camera (May Not Work)';
        });
        
        // Test server connection
        document.getElementById('testConnection').addEventListener('click', async function() {
            const button = this;
            const originalText = button.textContent;
            
            try {
                button.disabled = true;
                button.textContent = '⏳ Testing...';
                
                const response = await fetch('/api/demo/status');
                const data = await response.json();
                
                if (response.ok) {
                    showResult(\`✅ Server Connection OK!\\n\\nAPI Status: \${data.message}\\nEndpoints available: \${Object.keys(data.endpoints).length}\`, true);
                } else {
                    showResult(\`❌ Server Error: HTTP \${response.status}\`, false);
                }
                
            } catch (error) {
                showResult(\`❌ Connection Failed: \${error.message}\\n\\nMake sure the backend server is running.\`, false);
            } finally {
                button.disabled = false;
                button.textContent = originalText;
            }
        });
        
        // Manual processing
        document.getElementById('processManual').addEventListener('click', function() {
            const code = document.getElementById('manualCode').value.trim();
            if (code) {
                processQRCode(code);
            } else {
                showResult('❌ Please enter a QR code first.', false);
            }
        });
        
        // Load demo code
        document.getElementById('loadDemo').addEventListener('click', function() {
            // Real demo transaction ID - you may need to update this
            document.getElementById('manualCode').value = 'PEBBLE_REDEEM:GIFT-1756922160-5032:1:1';
            showResult('✅ Demo QR code loaded! Click "Process Code" to test redemption.', 'info');
        });
        
        async function processQRCode(qrData) {
            console.log('Processing QR code:', qrData);
            document.getElementById('loading').style.display = 'block';
            
            try {
                // Parse QR code data
                if (qrData.startsWith('PEBBLE_REDEEM:')) {
                    const parts = qrData.split(':');
                    if (parts.length >= 4) {
                        const transactionId = parts[1];
                        const giftTypeId = parts[2];
                        const quantity = parts[3];
                        
                        // Show gift preview first
                        showGiftPreview(transactionId, giftTypeId, quantity);
                        
                        // Process redemption
                        const response = await fetch('/api/partners/redeem', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                qrCode: transactionId, // Use transaction ID as QR code
                                partnerId: 1 // Demo partner ID
                            })
                        });
                        
                        const result = await response.json();
                        
                        if (response.ok) {
                            showResult(\`🎉 REDEMPTION SUCCESSFUL!\\n\\n💰 Amount: €\${result.amount.toFixed(2)}\\n🎁 Gift: \${result.gift.emoji} \${result.gift.name}\\n👤 Customer: \${result.gift.senderName}\\n🆔 Transaction: \${result.transactionId}\\n\\n✅ Payment will be processed to partner account.\`, true);
                        } else {
                            showResult(\`❌ Redemption Failed\\n\\nError: \${result.error}\\n\\nThis gift may have already been redeemed or the transaction ID is invalid.\`, false);
                        }
                    } else {
                        showResult('❌ Invalid QR Code Format\\n\\nExpected format: PEBBLE_REDEEM:TRANSACTION:GIFT_TYPE:QUANTITY', false);
                    }
                } else {
                    showResult(\`❌ Invalid QR Code\\n\\nThis is not a valid Pebbling gift QR code.\\n\\nReceived: \${qrData.substring(0, 50)}...\`, false);
                }
                
            } catch (error) {
                console.error('Processing error:', error);
                showResult(\`❌ Processing Error\\n\\n\${error.message}\\n\\nCheck your network connection and server status.\`, false);
            }
            
            document.getElementById('loading').style.display = 'none';
        }
        
        function showGiftPreview(transactionId, giftTypeId, quantity) {
            const preview = \`
                <div class="gift-preview">
                    <h4>🎁 Processing Gift Redemption</h4>
                    <p><strong>Transaction ID:</strong> \${transactionId}</p>
                    <p><strong>Gift Type ID:</strong> \${giftTypeId}</p>
                    <p><strong>Quantity:</strong> \${quantity}</p>
                    <p><strong>Status:</strong> ⏳ Verifying with server...</p>
                </div>
            \`;
            document.getElementById('result').innerHTML = preview;
            document.getElementById('result').className = 'result info';
            document.getElementById('result').style.display = 'block';
        }
        
        function showResult(message, isSuccess) {
            const resultDiv = document.getElementById('result');
            resultDiv.innerHTML = \`<div style="white-space: pre-line;">\${message}</div>\`;
            
            if (isSuccess === true) {
                resultDiv.className = 'result success';
            } else if (isSuccess === false) {
                resultDiv.className = 'result error';
            } else if (isSuccess === 'info') {
                resultDiv.className = 'result info';
            }
            
            resultDiv.style.display = 'block';
        }
        
        // Initialize
        if (debugMode) {
            updateDebugInfo();
        }
        
        // Show initial help
        showResult('👋 Welcome to Pebbling Partner Scanner!\\n\\n• Camera may not work without HTTPS\\n• Use "Manual QR Code Input" for reliable scanning\\n• Click "Test Server Connection" to verify backend\\n• Use "Load Demo Transaction" for testing', 'info');
    </script>
</body>
</html>
  `);
});

// Admin interface (alleen via localhost toegankelijk)
app.get('/admin', (req, res) => {
  // Alleen via localhost toegankelijk
  const host = req.get('host') || '';
  if (!host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
    return res.status(403).json({ error: 'Admin interface only accessible via localhost' });
  }
  
  res.send(`<!DOCTYPE html>
    <html>
    <head>
        <title>🔧 Pebbling Admin</title>
        <style>
            body { font-family: Arial; text-align: center; padding: 50px; background: #667eea; color: white; }
            .container { background: white; color: #333; padding: 40px; border-radius: 20px; max-width: 400px; margin: 0 auto; }
            input { padding: 10px; margin: 10px; border: 1px solid #ddd; border-radius: 5px; width: 200px; }
            button { padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🔧 IP Configuratie</h1>
            <p>Huidige IP: ${BACKEND_HOST}</p>
            
            <form method="POST" action="/api/admin/config">
                <div>
                    <input type="text" name="ip" placeholder="Nieuw IP adres" value="${BACKEND_HOST}" required>
                </div>
                <button type="submit">✅ Opslaan</button>
            </form>
            
            <p style="margin-top: 20px; font-size: 12px; color: #666;">
                Voer je lokale IP adres in (bijv. 192.168.68.119)
            </p>
        </div>
    </body>
    </html>`);
});

// Demo endpoints for quick testing
app.get('/api/demo/status', (req, res) => {
  res.json({
    message: 'Cadeautjes API Demo',
    endpoints: {
      auth: {
        'POST /api/auth/demo-login': 'Quick demo login',
        'POST /api/auth/register': 'Register new user',
        'POST /api/auth/login': 'User login'
      },
      gifts: {
        'GET /api/gifts/types': 'Get all gift types',
        'POST /api/gifts/purchase': 'Purchase gifts (requires auth)',
        'GET /api/gifts/inventory': 'Get user inventory (requires auth)',
        'POST /api/gifts/send': 'Send a gift (requires auth)',
        'GET /api/gifts/sent': 'Get sent gifts history (requires auth)',
        'GET /api/gifts/claim/:id': 'Claim a gift (public)',
        'POST /api/gifts/sync': 'Sync for iOS app (requires auth)'
      },
      partners: {
        'POST /api/partners/apply': 'Partner application',
        'POST /api/partners/demo-login': 'Demo partner login',
        'POST /api/partners/redeem': 'Redeem QR code',
        'GET /api/partners/stats/:id': 'Partner statistics'
      }
    },
    demo: {
      user: 'demo@cadeautjes.app / demo123',
      partner: 'demo-partner@cadeautjes.app'
    },
    newRoutes: {
      'GET /partner/scanner': 'Partner QR code scanner page'
    }
  })
})

// Quick demo data endpoint
app.get('/api/demo/sample-purchase', async (req, res) => {
  try {
    // This endpoint simulates a purchase for demo purposes
    res.json({
      message: 'Sample purchase data',
      sampleRequest: {
        method: 'POST',
        url: '/api/gifts/purchase',
        headers: {
          'Authorization': 'Bearer YOUR_TOKEN',
          'Content-Type': 'application/json'
        },
        body: {
          items: [
            { giftTypeId: 1, quantity: 3 }, // 3 biertjes
            { giftTypeId: 2, quantity: 2 }  // 2 wijntjes
          ]
        }
      }
    })
  } catch (error) {
    res.status(500).json({ error: 'Demo error' })
  }
})

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err)
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  })
})

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not found',
    message: `Route ${req.method} ${req.path} not found`,
    availableRoutes: '/api/demo/status'
  })
})

// Start server - alleen HTTP zoals oorspronkelijk
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 HTTP Server running on http://${BACKEND_HOST}:${PORT}`)
})