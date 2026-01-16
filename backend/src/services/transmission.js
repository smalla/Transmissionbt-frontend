import Transmission from 'transmission';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readdir, unlink, rm } from 'fs/promises';
import { join } from 'path';

const execFileAsync = promisify(execFile);

// Transmission 4.1.0-beta.2 has a bug where RPC torrent-remove doesn't work
// We need to manually delete the resume and torrent files
const TRANSMISSION_CONFIG_DIR = process.env.TRANSMISSION_CONFIG_DIR || '/var/lib/transmission-daemon/.config/transmission-daemon';

// Debounce restart - only restart once after multiple deletions
let restartTimeout = null;
let restartPromise = null;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scheduleTransmissionRestart() {
  // If a restart is already scheduled, don't schedule another
  if (restartTimeout) {
    console.log('Transmission restart already scheduled');
    return restartPromise;
  }
  
  restartPromise = new Promise((resolve) => {
    // Wait 3 seconds for any additional deletions, then restart
    restartTimeout = setTimeout(async () => {
      console.log('Restarting transmission-daemon to clear memory cache...');
      try {
        await execFileAsync('sudo', ['systemctl', 'restart', 'transmission-daemon']);
        console.log('transmission-daemon restart initiated, waiting for it to come back up...');
        // Wait for Transmission to fully start up
        await sleep(3000);
        console.log('transmission-daemon should be ready now');
      } catch (err) {
        console.error('Failed to restart transmission-daemon:', err.message);
      }
      restartTimeout = null;
      restartPromise = null;
      resolve();
    }, 3000);
  });
  
  return restartPromise;
}

class TransmissionService {
  constructor() {
    this.client = null;
  }

  // Reset client (useful after password changes or restarts)
  resetClient() {
    this.client = null;
  }

  // Lazy initialization - create client on first use
  getClient() {
    if (!this.client) {
      const config = {
        host: process.env.TRANSMISSION_HOST || 'localhost',
        port: process.env.TRANSMISSION_PORT || 9091,
        username: process.env.TRANSMISSION_USERNAME || '',
        password: process.env.TRANSMISSION_PASSWORD || ''
      };
      console.log('Initializing Transmission client with:', {
        host: config.host,
        port: config.port,
        username: config.username,
        passwordLength: config.password.length
      });
      this.client = new Transmission(config);
    }
    return this.client;
  }

  // Get all torrents
  getTorrents() {
    return new Promise((resolve, reject) => {
      this.getClient().get((err, result) => {
        if (err) return reject(err);
        resolve(result.torrents || []);
      });
    });
  }

  // Get specific torrent by ID
  getTorrentDetails(id) {
    return new Promise((resolve, reject) => {
      this.getClient().get(id, (err, result) => {
        if (err) return reject(err);
        if (!result.torrents || result.torrents.length === 0) {
          return reject(new Error('Torrent not found'));
        }
        resolve(result.torrents[0]);
      });
    });
  }

  // Add torrent from file path
  addTorrent(filePath) {
    return new Promise((resolve, reject) => {
      this.getClient().addFile(filePath, (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });
  }

  // Add torrent from URL
  addTorrentUrl(url) {
    return new Promise((resolve, reject) => {
      this.getClient().addUrl(url, (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });
  }

  // Remove torrent - tries normal removal first, falls back to workaround if needed
  async removeTorrent(id, deleteFiles = false) {
    console.log(`Removing torrent ${id}, deleteFiles=${deleteFiles}`);
    
    // Step 1: Get the torrent details before removal
    let torrentHash = null;
    let downloadDir = null;
    let torrentName = null;
    let percentDone = 0;
    try {
      const torrent = await this.getTorrentDetails(id);
      torrentHash = torrent.hashString;
      downloadDir = torrent.downloadDir;
      torrentName = torrent.name;
      percentDone = torrent.percentDone || 0;
      console.log(`Torrent ${id} hash: ${torrentHash}, name: ${torrentName}, progress: ${Math.round(percentDone * 100)}%`);
    } catch (err) {
      console.log(`Could not get torrent details for ${id}: ${err.message}`);
    }
    
    // Step 2: Try normal RPC removal first
    let normalRemovalSucceeded = false;
    try {
      await new Promise((resolve, reject) => {
        this.getClient().remove(id, deleteFiles, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
      console.log(`Torrent ${id} removed via normal RPC method`);
      normalRemovalSucceeded = true;
      
      // Verify removal by checking if torrent still exists
      await sleep(500); // Give it a moment to complete
      try {
        await this.getTorrentDetails(id);
        // If we get here, torrent still exists - removal failed
        console.warn(`Torrent ${id} still exists after RPC remove - removal may have failed`);
        normalRemovalSucceeded = false;
      } catch (err) {
        // Torrent not found - removal succeeded
        console.log(`Verified torrent ${id} was removed successfully`);
      }
    } catch (err) {
      console.warn(`Normal RPC removal failed for torrent ${id}: ${err.message}`);
      normalRemovalSucceeded = false;
    }
    
    // Step 3: If normal removal failed, use workaround
    if (!normalRemovalSucceeded && torrentHash) {
      console.log(`Using workaround removal method for torrent ${id}...`);
      
      // Stop the torrent first
      try {
        await this.stopTorrent(id);
        console.log(`Torrent ${id} stopped`);
      } catch (err) {
        console.log(`Could not stop torrent ${id}: ${err.message}`);
      }
      
      // Delete resume and torrent files directly
      const resumeFile = join(TRANSMISSION_CONFIG_DIR, 'resume', `${torrentHash}.resume`);
      const torrentFile = join(TRANSMISSION_CONFIG_DIR, 'torrents', `${torrentHash}.torrent`);
      
      try {
        await unlink(resumeFile);
        console.log(`Deleted resume file: ${resumeFile}`);
      } catch (err) {
        console.log(`Could not delete resume file: ${err.message}`);
      }
      
      try {
        await unlink(torrentFile);
        console.log(`Deleted torrent file: ${torrentFile}`);
      } catch (err) {
        console.log(`Could not delete torrent file: ${err.message}`);
      }
      
      // Delete downloaded files if requested
      if (deleteFiles && downloadDir && torrentName) {
        // Delete from download directory (completed files)
        const downloadPath = join(downloadDir, torrentName);
        try {
          await rm(downloadPath, { recursive: true, force: true });
          console.log(`Deleted downloaded files: ${downloadPath}`);
        } catch (err) {
          console.log(`Could not delete downloaded files: ${err.message}`);
        }
        
        // Also check incomplete directory for partially downloaded files
        // Get session to find incomplete-dir setting
        try {
          const session = await this.getServerStats();
          const incompleteDir = session['incomplete-dir'];
          const incompleteEnabled = session['incomplete-dir-enabled'];
          
          if (incompleteEnabled && incompleteDir && percentDone < 1) {
            const incompletePath = join(incompleteDir, torrentName);
            try {
              await rm(incompletePath, { recursive: true, force: true });
              console.log(`Deleted incomplete files: ${incompletePath}`);
            } catch (err) {
              console.log(`Could not delete incomplete files: ${err.message}`);
            }
          }
        } catch (err) {
          console.log(`Could not check incomplete directory: ${err.message}`);
        }
      }
      
      // Schedule transmission-daemon restart to clear memory cache
      // (debounced to avoid multiple restarts for batch deletions)
      console.log(`Workaround used - scheduling transmission-daemon restart`);
      scheduleTransmissionRestart();
      
      // Reset client so it reconnects after restart
      this.client = null;
    }
    
    return { success: true };
  }

  // Stop a torrent
  stopTorrent(id) {
    return new Promise((resolve, reject) => {
      this.getClient().stop(id, (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });
  }

  // Get server stats
  getServerStats() {
    return new Promise((resolve, reject) => {
      this.getClient().session((err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });
  }

  // Get session stats (total downloaded, uploaded, etc.)
  getSessionStats() {
    return new Promise((resolve, reject) => {
      this.getClient().sessionStats((err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });
  }
}

// Singleton instance
const transmissionService = new TransmissionService();
export default transmissionService;
