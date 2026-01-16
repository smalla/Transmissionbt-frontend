import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class TorrentMetadata {
  constructor() {
    const metadataPath = process.env.METADATA_PATH || path.join(__dirname, '../../data/torrent-metadata.json');
    this.metadataPath = metadataPath;
    const metadataDir = path.dirname(metadataPath);
    
    // Ensure data directory exists
    if (!fs.existsSync(metadataDir)) {
      fs.mkdirSync(metadataDir, { recursive: true });
    }

    this.initMetadata();
  }

  initMetadata() {
    if (!fs.existsSync(this.metadataPath)) {
      this.save({ torrents: {} });
    }
  }

  load() {
    try {
      const data = fs.readFileSync(this.metadataPath, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      console.error(`Failed to load torrent metadata: ${err.message}`);
      console.log('Initializing with empty metadata...');
      return { torrents: {} };
    }
  }

  save(data) {
    fs.writeFileSync(this.metadataPath, JSON.stringify(data, null, 2), 'utf8');
  }

  // Store torrent ownership and metadata BY HASH (permanent identifier)
  setTorrentMetadata(hashString, userId, username, extraData = {}) {
    const data = this.load();
    data.torrents[hashString] = {
      owner_id: userId,
      owner_username: username,
      added_at: new Date().toISOString(),
      block_auto_remove: false,
      ...extraData
    };
    this.save(data);
  }

  // Get torrent metadata by hash
  getTorrentMetadata(hashString) {
    const data = this.load();
    return data.torrents[hashString] || null;
  }

  // Get all torrent metadata
  getAllTorrentMetadata() {
    const data = this.load();
    return data.torrents;
  }

  // Update torrent metadata by hash
  updateTorrentMetadata(hashString, updates) {
    const data = this.load();
    if (!data.torrents[hashString]) {
      throw new Error('Torrent metadata not found');
    }
    data.torrents[hashString] = {
      ...data.torrents[hashString],
      ...updates
    };
    this.save(data);
  }

  // Delete torrent metadata by hash
  deleteTorrentMetadata(hashString) {
    const data = this.load();
    delete data.torrents[hashString];
    this.save(data);
  }

  // Check if user owns torrent by hash
  isOwner(hashString, userId) {
    const metadata = this.getTorrentMetadata(hashString);
    return metadata && metadata.owner_id === userId;
  }
}

// Singleton instance
const torrentMetadata = new TorrentMetadata();
export default torrentMetadata;
