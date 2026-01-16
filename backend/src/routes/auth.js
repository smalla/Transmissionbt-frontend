import express from 'express';
import userDB from '../services/user-db.js';
import { logSecurityEvent } from '../services/logger.js';
import { z } from 'zod';

const router = express.Router();

// Validation schemas
const loginSchema = z.object({
  username: z.string().min(1, 'Username required').max(100),
  password: z.string().min(1, 'Password required')
});

// Login
router.post('/login', async (req, res, next) => {
  try {
    // Validate input
    const { username, password } = loginSchema.parse(req.body);

    const user = await userDB.verifyPassword(username, password);
    
    if (!user) {
      logSecurityEvent('LOGIN_FAILED', {
        username,
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Check if password change required
    if (user.force_password_change) {
      logSecurityEvent('LOGIN_PASSWORD_CHANGE_REQUIRED', {
        username,
        userId: user.id,
        ip: req.ip
      });
      return res.status(403).json({ 
        error: 'Password change required',
        requirePasswordChange: true,
        userId: user.id
      });
    }

    // Regenerate session to prevent session fixation attacks
    await new Promise((resolve, reject) => {
      req.session.regenerate((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Create session
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.isAdmin = user.is_admin;

    // Save session to ensure it's persisted before responding
    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    logSecurityEvent('LOGIN_SUCCESS', {
      username,
      userId: user.id,
      ip: req.ip
    });

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      is_admin: user.is_admin
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    next(error);
  }
});

// Logout
router.post('/logout', (req, res) => {
  const username = req.session?.username;
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.clearCookie('connect.sid');
    
    if (username) {
      logSecurityEvent('LOGOUT', { username, ip: req.ip });
    }
    
    res.json({ message: 'Logged out successfully' });
  });
});

// Get current user
router.get('/me', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const user = userDB.getUserById(req.session.userId);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    is_admin: user.is_admin,
    ftp_enabled: user.ftp_password !== null
  });
});

// Change password (for logged-in users)
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters')
});

router.post('/change-password', async (req, res, next) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Validate input
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

    const user = userDB.getUserById(req.session.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isValid = await userDB.verifyPassword(user.username, currentPassword);
    
    if (!isValid) {
      logSecurityEvent('PASSWORD_CHANGE_FAILED', {
        username: user.username,
        userId: user.id,
        ip: req.ip,
        reason: 'Invalid current password'
      });
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Update password
    await userDB.updateUser(user.id, { password: newPassword });

    logSecurityEvent('PASSWORD_CHANGED', {
      username: user.username,
      userId: user.id,
      ip: req.ip
    });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    next(error);
  }
});

// Set/change FTP password (for logged-in users)
const ftpPasswordSchema = z.object({
  ftpPassword: z.string().min(8, 'FTP password must be at least 8 characters')
});

router.post('/ftp-password', async (req, res, next) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Validate input
    const { ftpPassword } = ftpPasswordSchema.parse(req.body);

    const user = userDB.getUserById(req.session.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Set FTP password
    await userDB.setFtpPassword(user.id, ftpPassword);

    logSecurityEvent('FTP_PASSWORD_SET_SELF', {
      username: user.username,
      userId: user.id,
      ip: req.ip
    });

    res.json({ message: 'FTP password set successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    next(error);
  }
});

// Disable FTP access (for logged-in users)
router.delete('/ftp-password', async (req, res, next) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = userDB.getUserById(req.session.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Disable FTP access
    await userDB.setFtpPassword(user.id, null);

    logSecurityEvent('FTP_ACCESS_DISABLED_SELF', {
      username: user.username,
      userId: user.id,
      ip: req.ip
    });

    res.json({ message: 'FTP access disabled successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
