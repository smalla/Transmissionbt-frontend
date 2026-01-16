import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { authenticateSession } from '../middleware/auth.js';
import transmissionService from '../services/transmission.js';
import torrentMetadata from '../services/torrent-metadata.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Helper function to convert Transmission status codes to readable labels
function getStatusLabel(status) {
  const statusMap = {
    0: 'stopped',
    1: 'queued-to-check',
    2: 'checking',
    3: 'queued-to-download',
    4: 'downloading',
    5: 'queued-to-seed',
    6: 'seeding'
  };
  return statusMap[status] || 'unknown';
}

// Configure multer for file uploads
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max per file
    files: 10 // Max 10 files per request
  },
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() === '.torrent') {
      cb(null, true);
    } else {
      cb(new Error('Only .torrent files are allowed'));
    }
  }
});

// All routes require authentication
router.use(authenticateSession);

// Get all torrents with ownership info
router.get('/', async (req, res, next) => {
  try {
    const torrents = await transmissionService.getTorrents();
    const metadata = torrentMetadata.getAllTorrentMetadata();

    // Merge torrent data with metadata (keyed by hashString, not id)
    const torrentsWithOwnership = torrents.map(torrent => ({
      ...torrent,
      owner: metadata[torrent.hashString]?.owner_username || 'unknown',
      owner_id: metadata[torrent.hashString]?.owner_id,
      added_at: metadata[torrent.hashString]?.added_at,
      block_auto_remove: metadata[torrent.hashString]?.block_auto_remove || false,
      is_own: metadata[torrent.hashString]?.owner_id === req.session.userId,
      statusLabel: getStatusLabel(torrent.status)
    }));

    res.json(torrentsWithOwnership);
  } catch (error) {
    next(error);
  }
});

// Upload torrent file
router.post('/upload', upload.array('torrents', 10), async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No torrent files uploaded' });
    }

    const results = [];
    
    for (const file of req.files) {
      try {
        const result = await transmissionService.addTorrent(file.path);
        
        // Store metadata by hashString (permanent identifier)
        torrentMetadata.setTorrentMetadata(
          result.hashString,
          req.session.userId,
          req.session.username
        );

        results.push({
          success: true,
          filename: file.originalname,
          torrentId: result.id,
          name: result.name
        });

        // Clean up uploaded file
        fs.unlinkSync(file.path);
      } catch (error) {
        results.push({
          success: false,
          filename: file.originalname,
          error: error.message
        });
      }
    }

    res.json(results);
  } catch (error) {
    next(error);
  }
});

// Delete torrent
router.delete('/:id', async (req, res, next) => {
  try {
    const torrentId = parseInt(req.params.id);
    const isAdmin = req.session.isAdmin;
    
    // Get torrent details to find hashString
    let torrentHash = null;
    try {
      const torrent = await transmissionService.getTorrentDetails(torrentId);
      torrentHash = torrent.hashString;
    } catch (err) {
      console.log(`Could not get torrent details for ${torrentId}: ${err.message}`);
    }
    
    const isOwner = torrentHash ? torrentMetadata.isOwner(torrentHash, req.session.userId) : false;

    console.log(`Delete request: torrentId=${torrentId}, hash=${torrentHash}, isAdmin=${isAdmin}, isOwner=${isOwner}, userId=${req.session.userId}`);

    // Check permission
    if (!isAdmin && !isOwner) {
      return res.status(403).json({ error: 'You can only delete your own torrents' });
    }

    // Delete from transmission
    console.log(`Attempting to remove torrent ${torrentId} from Transmission...`);
    await transmissionService.removeTorrent(torrentId, true);
    console.log(`Torrent ${torrentId} removed from Transmission successfully`);
    
    // Delete metadata by hash
    if (torrentHash) {
      torrentMetadata.deleteTorrentMetadata(torrentHash);
      console.log(`Metadata for torrent ${torrentId} (hash: ${torrentHash}) deleted`);
    }

    res.json({ success: true, message: 'Torrent deleted' });
  } catch (error) {
    console.error('Error deleting torrent:', error);
    next(error);
  }
});

// Toggle block auto-remove flag
router.patch('/:id/block-auto-remove', async (req, res, next) => {
  try {
    const torrentId = parseInt(req.params.id);
    const { block } = req.body;
    const isAdmin = req.session.isAdmin;
    
    // Get torrent details to find hashString
    const torrent = await transmissionService.getTorrentDetails(torrentId);
    const torrentHash = torrent.hashString;
    
    const isOwner = torrentMetadata.isOwner(torrentHash, req.session.userId);

    // Check permission
    if (!isAdmin && !isOwner) {
      return res.status(403).json({ error: 'You can only modify your own torrents' });
    }

    torrentMetadata.updateTorrentMetadata(torrentHash, {
      block_auto_remove: !!block
    });

    res.json({ success: true, block_auto_remove: !!block });
  } catch (error) {
    next(error);
  }
});

// Get stats
router.get('/stats', async (req, res, next) => {
  try {
    const [torrents, sessionStats] = await Promise.all([
      transmissionService.getTorrents(),
      transmissionService.getSessionStats()
    ]);

    const metadata = torrentMetadata.getAllTorrentMetadata();
    
    // Count by owner
    const ownerCounts = {};
    torrents.forEach(torrent => {
      const owner = metadata[torrent.hashString]?.owner_username || 'unknown';
      ownerCounts[owner] = (ownerCounts[owner] || 0) + 1;
    });

    res.json({
      total_torrents: torrents.length,
      active_torrents: torrents.filter(t => t.status === 4).length, // 4 = downloading
      completed_torrents: torrents.filter(t => t.percentDone === 1).length,
      total_downloaded: sessionStats?.['cumulative-stats']?.downloadedBytes || 0,
      total_uploaded: sessionStats?.['cumulative-stats']?.uploadedBytes || 0,
      download_speed: sessionStats?.downloadSpeed || 0,
      upload_speed: sessionStats?.uploadSpeed || 0,
      owner_counts: ownerCounts
    });
  } catch (error) {
    next(error);
  }
});

// Get disk usage stats
router.get('/disk-usage', async (req, res, next) => {
  try {
    const { statfs } = await import('fs/promises');

    // Get disk usage for both download directories
    const downloadDir = '/mnt/crypted/downloads';
    const incompleteDir = '/mnt/crypted/downloads-incomplete';

    const getDiskStats = async (path) => {
      try {
        const stats = await statfs(path);
        const total = stats.blocks * stats.bsize;
        const available = stats.bavail * stats.bsize; // Available to non-root
        const used = (stats.blocks - stats.bfree) * stats.bsize;
        const percent = total > 0 ? Math.round((used / total) * 100) : 0;
        
        return { total, used, available, percent };
      } catch (err) {
        console.error(`Disk usage error for ${path}:`, err.message);
        return null; // Return null if mount point missing or inaccessible
      }
    };

    const [downloadStats, incompleteStats] = await Promise.all([
      getDiskStats(downloadDir),
      getDiskStats(incompleteDir)
    ]);

    res.json({
      downloads: downloadStats,
      incomplete: incompleteStats
    });
  } catch (error) {
    next(error);
  }
});

export default router;
