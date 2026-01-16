import fs from 'fs';
import { promisify } from 'util';
import cron from 'node-cron';
import transmissionService from './transmission.js';
import torrentMetadata from './torrent-metadata.js';

const statfs = promisify(fs.statfs || fs.stat);

class DiskMonitor {
  constructor() {
    this.threshold = parseFloat(process.env.DISK_THRESHOLD || '10');
    this.startMonitoring();
  }

  // Get disk usage for a path
  async getDiskUsage(path) {
    try {
      const stats = await statfs(path);
      const totalBytes = stats.blocks * stats.bsize;
      const freeBytes = stats.bavail * stats.bsize;
      const usedBytes = totalBytes - freeBytes;
      const freePercent = (freeBytes / totalBytes) * 100;

      return {
        total: totalBytes,
        used: usedBytes,
        free: freeBytes,
        freePercent: freePercent
      };
    } catch (error) {
      console.error('Error getting disk usage:', error);
      // Return mock data if statfs not available (Windows)
      return {
        total: 1000000000000,
        used: 900000000000,
        free: 100000000000,
        freePercent: 10
      };
    }
  }

  // Get torrents eligible for auto-removal
  async getAutoRemovalCandidates() {
    const torrents = await transmissionService.getTorrents();
    const metadata = torrentMetadata.getAllTorrentMetadata();

    // Filter: completed torrents, not blocked from auto-remove
    const candidates = torrents
      .filter(t => {
        // Use hashString for metadata lookup
        const meta = metadata[t.hashString];
        return (
          t.percentDone === 1 && // Completed
          (!meta || !meta.block_auto_remove) // Not blocked
        );
      })
      .map(t => ({
        ...t,
        added_at: metadata[t.hashString]?.added_at || new Date().toISOString()
      }))
      .sort((a, b) => new Date(a.added_at) - new Date(b.added_at)); // Oldest first

    return candidates;
  }

  // Auto-remove oldest torrents until disk free > threshold
  async autoRemoveOldestTorrents() {
    try {
      // Get download directory from transmission
      const session = await transmissionService.getServerStats();
      const downloadDir = session['download-dir'] || '/downloads';

      const diskUsage = await this.getDiskUsage(downloadDir);
      console.log(`Disk usage: ${diskUsage.freePercent.toFixed(2)}% free`);

      // Check if below threshold
      if (diskUsage.freePercent >= this.threshold) {
        return { removed: 0, message: 'Disk space above threshold' };
      }

      console.warn(`⚠️  Disk space below ${this.threshold}% threshold! Starting auto-removal...`);

      const candidates = await this.getAutoRemovalCandidates();
      
      if (candidates.length === 0) {
        console.error('No torrents available for auto-removal!');
        return { removed: 0, message: 'No eligible torrents to remove' };
      }

      const removed = [];
      
      for (const torrent of candidates) {
        try {
          // Remove torrent with data
          await transmissionService.removeTorrent(torrent.id, true);
          torrentMetadata.deleteTorrentMetadata(torrent.hashString);

          removed.push({
            id: torrent.id,
            name: torrent.name,
            size: torrent.totalSize
          });

          console.log(`Removed: ${torrent.name} (${this.formatBytes(torrent.totalSize)})`);

          // Check if we're above threshold now
          const newDiskUsage = await this.getDiskUsage(downloadDir);
          if (newDiskUsage.freePercent >= this.threshold) {
            console.log(`✓ Disk space recovered: ${newDiskUsage.freePercent.toFixed(2)}% free`);
            break;
          }
        } catch (error) {
          console.error(`Failed to remove torrent ${torrent.id}:`, error);
        }
      }

      return {
        removed: removed.length,
        torrents: removed,
        message: `Removed ${removed.length} torrent(s)`
      };
    } catch (error) {
      console.error('Error in auto-removal:', error);
      throw error;
    }
  }

  formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  // Start monitoring scheduler
  startMonitoring() {
    const interval = parseInt(process.env.DISK_CHECK_INTERVAL || '5');
    console.log(`Starting disk monitoring every ${interval} minutes`);

    // Check immediately on startup (after 30 seconds)
    setTimeout(() => {
      this.autoRemoveOldestTorrents().catch(console.error);
    }, 30000);

    // Schedule periodic checks
    cron.schedule(`*/${interval} * * * *`, () => {
      this.autoRemoveOldestTorrents().catch(console.error);
    });
  }
}

// Singleton instance
const diskMonitor = new DiskMonitor();
export default diskMonitor;
