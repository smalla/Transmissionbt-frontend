import express from 'express';
import { authenticateSession, requireAdmin } from '../middleware/auth.js';
import { getDatabase } from '../db/init.js';
import { logSecurityEvent } from '../services/logger.js';
import { z } from 'zod';

const router = express.Router();

// Validation schema
const linkSchema = z.object({
  title: z.string().min(1, 'Title required').max(200),
  url: z.string().url('Invalid URL'),
  description: z.string().max(500).optional()
});

// All routes require authentication
router.use(authenticateSession);

// Get all links (all authenticated users)
router.get('/', (req, res, next) => {
  try {
    const db = getDatabase();
    const links = db.prepare(`
      SELECT l.*, u.username as created_by_username
      FROM links l
      LEFT JOIN users u ON l.created_by = u.id
      ORDER BY l.created_at DESC
    `).all();
    
    res.json(links);
  } catch (error) {
    next(error);
  }
});

// Create link (admin only)
router.post('/', requireAdmin, (req, res, next) => {
  try {
    const { title, url, description } = linkSchema.parse(req.body);
    const db = getDatabase();
    
    const result = db.prepare(`
      INSERT INTO links (title, url, description, created_by)
      VALUES (?, ?, ?, ?)
    `).run(title, url, description || null, req.session.userId);
    
    const link = db.prepare('SELECT * FROM links WHERE id = ?').get(result.lastInsertRowid);
    
    logSecurityEvent('LINK_CREATED', {
      adminUser: req.session.username,
      linkId: link.id,
      title,
      ip: req.ip
    });
    
    res.json(link);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    next(error);
  }
});

// Update link (admin only)
router.put('/:id', requireAdmin, (req, res, next) => {
  try {
    const linkId = parseInt(req.params.id);
    const { title, url, description } = linkSchema.parse(req.body);
    const db = getDatabase();
    
    db.prepare(`
      UPDATE links 
      SET title = ?, url = ?, description = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(title, url, description || null, linkId);
    
    const link = db.prepare('SELECT * FROM links WHERE id = ?').get(linkId);
    
    if (!link) {
      return res.status(404).json({ error: 'Link not found' });
    }
    
    logSecurityEvent('LINK_UPDATED', {
      adminUser: req.session.username,
      linkId,
      title,
      ip: req.ip
    });
    
    res.json(link);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    next(error);
  }
});

// Delete link (admin only)
router.delete('/:id', requireAdmin, (req, res, next) => {
  try {
    const linkId = parseInt(req.params.id);
    const db = getDatabase();
    
    const link = db.prepare('SELECT * FROM links WHERE id = ?').get(linkId);
    
    if (!link) {
      return res.status(404).json({ error: 'Link not found' });
    }
    
    db.prepare('DELETE FROM links WHERE id = ?').run(linkId);
    
    logSecurityEvent('LINK_DELETED', {
      adminUser: req.session.username,
      linkId,
      title: link.title,
      ip: req.ip
    });
    
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
