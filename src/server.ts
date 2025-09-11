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

const app = express()

// Use Render's PORT or default to 3001
const PORT = parseInt(process.env.PORT || '3001')
const NODE_ENV = process.env.NODE_ENV || 'development'

console.log(`Starting server on port ${PORT} in ${NODE_ENV} mode`)

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false // Disable CSP for simpler deployment
}))

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000
})
app.use(limiter)

// CORS - allow all origins for demo
app.use(cors({
  origin: true,
  credentials: true
}))

// Body parsing
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    port: PORT
  })
})

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Pebbling Backend API',
    endpoints: {
      health: '/health',
      auth: '/api/auth/*',
      gifts: '/api/gifts/*',
      partners: '/api/partners/*'
    }
  })
})

// API routes
app.use('/api/auth', authRoutes)
app.use('/api/gifts', giftsRoutes)
app.use('/api/partners', partnersRoutes)
app.use('/api', claimsRoutes)

// Error handling
app.use((err: any, req: any, res: any, next: any) => {
  console.error('Error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

// Start server on all interfaces
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on 0.0.0.0:${PORT}`)
})
