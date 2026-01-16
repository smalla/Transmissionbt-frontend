import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import SQLiteStore from 'connect-sqlite3';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { doubleCsrf } from 'csrf-csrf';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables FIRST
dotenv.config();

// Security: Fail-fast if SESSION_SECRET is missing in production
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  console.error('❌ FATAL: SESSION_SECRET must be set in production!');
  process.exit(1);
}

if (process.env.NODE_ENV === 'production' && process.env.SESSION_SECRET === 'dev-secret-change-me') {
  console.error('❌ FATAL: SESSION_SECRET cannot be the default value in production!');
  process.exit(1);
}

import authRoutes from './routes/auth.js';
import torrentsRoutes from './routes/torrents.js';
import feedsRoutes from './routes/feeds.js';
import adminRoutes from './routes/admin.js';
import linksRoutes from './routes/links.js';

// Import services to initialize them (AFTER dotenv)
import './services/rss-manager.js';
import './services/disk-monitor.js';
import './services/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 42080;
const HOST = process.env.HOST || '127.0.0.1';

// Trust proxy (HAProxy in front)
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false
}));

// Rate limiting
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: { error: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const passwordChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 password change attempts per window
  message: { error: 'Too many password change attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(process.env.SESSION_SECRET || 'dev-secret-change-me-DO-NOT-USE-IN-PROD'));

// Session configuration with SQLite store
const SqliteStore = SQLiteStore(session);
app.use(session({
  store: new SqliteStore({
    db: 'sessions.db',
    dir: path.join(__dirname, '../data')
  }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me-DO-NOT-USE-IN-PROD',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax'
  }
}));

// CSRF Protection (after session middleware)
const {
  generateToken, // Used to create a CSRF token
  validateRequest, // Used to validate a request
  doubleCsrfProtection, // Middleware for protecting routes
} = doubleCsrf({
  getSecret: () => process.env.SESSION_SECRET || 'dev-secret-change-me-DO-NOT-USE-IN-PROD',
  cookieName: '__Host-psifi.x-csrf-token',
  cookieOptions: {
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
});

// Health check endpoint for HAProxy
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// CSRF token endpoint (GET requests are excluded from CSRF protection)
app.get('/api/csrf-token', (req, res) => {
  const token = generateToken(req, res);
  res.json({ csrfToken: token });
});

// Routes
app.use('/api/auth/login', loginLimiter); // Rate limit login
app.use('/api/auth/change-password', passwordChangeLimiter); // Rate limit password changes
app.use('/api/auth/ftp-password', passwordChangeLimiter); // Rate limit FTP password changes

// Special CSRF handling for auth routes (exclude login)
const authCsrfProtection = (req, res, next) => {
  if (req.path === '/login') {
    return next();
  }
  doubleCsrfProtection(req, res, next);
};

app.use('/api/auth', authCsrfProtection, authRoutes);
app.use('/api/torrents', doubleCsrfProtection, torrentsRoutes); // CSRF protection on state-changing routes
app.use('/api/feeds', doubleCsrfProtection, feedsRoutes);
app.use('/api/admin', doubleCsrfProtection, adminRoutes);
app.use('/api/links', doubleCsrfProtection, linksRoutes);

// Serve frontend static files (production)
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendPath));
  
  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// Start server (bind to localhost only for security)
app.listen(PORT, HOST, () => {
  console.log(`Backend server running on http://${HOST}:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
