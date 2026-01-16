import express from 'express';
import { requireAdmin } from '../middleware/auth.js';
import userDB from '../services/user-db.js';
import { logSecurityEvent } from '../services/logger.js';
import { z } from 'zod';

const router = express.Router();

// Validation schemas
const createUserSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  email: z.string().email().optional().or(z.literal('')),
  is_admin: z.boolean().optional()
});

const updateUserSchema = z.object({
  username: z.string().min(3).max(50).optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  email: z.string().email().optional().or(z.literal('')),
  is_admin: z.boolean().optional()
});

// All routes require admin
router.use(requireAdmin);

// Get all users
router.get('/users', (req, res, next) => {
  try {
    const users = userDB.getAllUsers();
    res.json(users);
  } catch (error) {
    next(error);
  }
});

// Create user
router.post('/users', async (req, res, next) => {
  try {
    const validatedData = createUserSchema.parse(req.body);
    const { username, password, email, is_admin } = validatedData;

    const user = await userDB.createUser(username, password, email || null, is_admin || false);
    
    logSecurityEvent('USER_CREATED', {
      adminUser: req.session.username,
      newUser: username,
      isAdmin: is_admin,
      ip: req.ip
    });
    
    res.json(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    next(error);
  }
});

// Update user
router.patch('/users/:id', async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id);
    const validatedData = updateUserSchema.parse(req.body);
    const { username, password, email, is_admin } = validatedData;

    const updates = {};
    if (username) updates.username = username;
    if (password) updates.password = password;
    if (email !== undefined) updates.email = email || null;
    if (is_admin !== undefined) updates.is_admin = is_admin;

    const user = await userDB.updateUser(userId, updates);
    
    logSecurityEvent('USER_UPDATED', {
      adminUser: req.session.username,
      targetUser: user.username,
      targetUserId: userId,
      passwordChanged: !!password,
      ip: req.ip
    });
    
    res.json(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    next(error);
  }
});

// Delete user
router.delete('/users/:id', (req, res, next) => {
  try {
    const userId = parseInt(req.params.id);
    
    // Prevent deleting yourself
    if (userId === req.session.userId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const targetUser = userDB.getUserById(userId);
    userDB.deleteUser(userId);
    
    logSecurityEvent('USER_DELETED', {
      adminUser: req.session.username,
      deletedUser: targetUser?.username,
      deletedUserId: userId,
      ip: req.ip
    });
    
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Set FTP password for a user
router.post('/users/:id/ftp-password', async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id);
    const { password } = req.body;
    
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'FTP password must be at least 8 characters' });
    }
    
    const targetUser = userDB.getUserById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    await userDB.setFtpPassword(userId, password);
    
    logSecurityEvent('FTP_PASSWORD_SET', {
      adminUser: req.session.username,
      targetUser: targetUser.username,
      ip: req.ip
    });
    
    res.json({ success: true, message: 'FTP password set successfully' });
  } catch (error) {
    next(error);
  }
});

// Disable FTP access for a user
router.delete('/users/:id/ftp-password', async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id);
    
    const targetUser = userDB.getUserById(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    await userDB.setFtpPassword(userId, null);
    
    logSecurityEvent('FTP_ACCESS_DISABLED', {
      adminUser: req.session.username,
      targetUser: targetUser.username,
      ip: req.ip
    });
    
    res.json({ success: true, message: 'FTP access disabled' });
  } catch (error) {
    next(error);
  }
});

export default router;
