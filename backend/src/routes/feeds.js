import express from 'express';
import { authenticateSession, requireAdmin } from '../middleware/auth.js';
import rssManager from '../services/rss-manager.js';
import { z } from 'zod';

const router = express.Router();

// Validation schema to prevent ReDoS attacks
const feedSchema = z.object({
  url: z.string().url('Invalid RSS feed URL'),
  regex: z.string().max(200, 'Regex pattern too long').optional().refine(
    (val) => {
      if (!val) return true;
      try {
        new RegExp(val);
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Invalid regular expression' }
  ),
  minSize: z.number().int().positive().optional(),
  maxSize: z.number().int().positive().optional(),
  category: z.string().max(100).optional()
});

// All routes require admin access (prevents SSRF by limiting who can add feed URLs)
router.use(authenticateSession);
router.use(requireAdmin);

// Get all feeds
router.get('/', (req, res, next) => {
  try {
    const feeds = rssManager.getFeeds();
    res.json(feeds);
  } catch (error) {
    next(error);
  }
});

// Add feed
router.post('/', (req, res, next) => {
  try {
    // Validate input to prevent ReDoS and injection attacks
    const validatedData = feedSchema.parse({
      url: req.body.url,
      regex: req.body.regex,
      minSize: req.body.minSize ? parseInt(req.body.minSize) : undefined,
      maxSize: req.body.maxSize ? parseInt(req.body.maxSize) : undefined,
      category: req.body.category
    });

    const feed = rssManager.addFeed(validatedData.url, {
      regex: validatedData.regex,
      minSize: validatedData.minSize,
      maxSize: validatedData.maxSize,
      category: validatedData.category
    });

    res.json(feed);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    next(error);
  }
});

// Update feed
router.put('/:id', (req, res, next) => {
  try {
    const feedId = parseInt(req.params.id);
    
    // Validate input
    const validatedData = feedSchema.partial().parse({
      url: req.body.url,
      regex: req.body.regex,
      minSize: req.body.minSize !== undefined ? parseInt(req.body.minSize) : undefined,
      maxSize: req.body.maxSize !== undefined ? parseInt(req.body.maxSize) : undefined,
      category: req.body.category
    });

    const feed = rssManager.updateFeed(feedId, {
      url: validatedData.url,
      rules: {
        regex: validatedData.regex,
        minSize: validatedData.minSize,
        maxSize: validatedData.maxSize,
        category: validatedData.category
      }
    });

    res.json(feed);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    next(error);
  }
});

// Delete feed
router.delete('/:id', (req, res, next) => {
  try {
    const feedId = parseInt(req.params.id);
    rssManager.deleteFeed(feedId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Manual poll trigger
router.post('/poll', async (req, res, next) => {
  try {
    const results = await rssManager.pollAllFeeds();
    res.json(results);
  } catch (error) {
    next(error);
  }
});

// Poll specific feed
router.post('/:id/poll', async (req, res, next) => {
  try {
    const feedId = parseInt(req.params.id);
    const results = await rssManager.pollFeed(feedId);
    res.json(results);
  } catch (error) {
    next(error);
  }
});

export default router;
