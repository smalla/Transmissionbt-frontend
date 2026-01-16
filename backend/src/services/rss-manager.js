import FeedParser from 'feedparser';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dns from 'dns';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import cron from 'node-cron';
import transmissionService from './transmission.js';
import torrentMetadata from './torrent-metadata.js';

const dnsLookup = promisify(dns.lookup);

// Security: Block private/internal IP ranges to prevent SSRF
const PRIVATE_IP_RANGES = [
  /^127\./,                    // Loopback
  /^10\./,                     // Private Class A
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private Class B
  /^192\.168\./,               // Private Class C
  /^169\.254\./,               // Link-local
  /^0\./,                      // Current network
  /^224\./,                    // Multicast
  /^240\./,                    // Reserved
  /^::1$/,                     // IPv6 loopback
  /^fe80:/i,                   // IPv6 link-local
  /^fc00:/i,                   // IPv6 unique local
  /^fd00:/i,                   // IPv6 unique local
];

function isPrivateIP(ip) {
  return PRIVATE_IP_RANGES.some(regex => regex.test(ip));
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class RSSManager {
  constructor() {
    const feedsPath = process.env.FEEDS_PATH || path.join(__dirname, '../../data/rss-feeds.json');
    this.feedsPath = feedsPath;
    const feedsDir = path.dirname(feedsPath);
    
    if (!fs.existsSync(feedsDir)) {
      fs.mkdirSync(feedsDir, { recursive: true });
    }

    this.initFeeds();
    this.startPolling();
  }

  initFeeds() {
    if (!fs.existsSync(this.feedsPath)) {
      this.save({ feeds: [], seenItems: {}, nextId: 1 });
    }
  }

  load() {
    try {
      const data = fs.readFileSync(this.feedsPath, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      console.error(`Failed to load RSS feeds: ${err.message}`);
      console.log('Initializing with empty feeds...');
      return { feeds: [], seenItems: {}, nextId: 1 };
    }
  }

  save(data) {
    fs.writeFileSync(this.feedsPath, JSON.stringify(data, null, 2), 'utf8');
  }

  // Add new feed
  addFeed(url, rules = {}) {
    const data = this.load();
    
    const feed = {
      id: data.nextId++,
      url,
      rules: {
        regex: rules.regex || '.*',
        minSize: rules.minSize || 0,
        maxSize: rules.maxSize || Number.MAX_SAFE_INTEGER,
        category: rules.category || ''
      },
      added_at: new Date().toISOString(),
      last_poll: null,
      matched_count: 0
    };
    
    data.feeds.push(feed);
    this.save(data);
    
    return feed;
  }

  // Get all feeds
  getFeeds() {
    const data = this.load();
    return data.feeds;
  }

  // Get feed by ID
  getFeed(id) {
    const data = this.load();
    return data.feeds.find(f => f.id === id);
  }

  // Update feed
  updateFeed(id, updates) {
    const data = this.load();
    const feedIndex = data.feeds.findIndex(f => f.id === id);
    
    if (feedIndex === -1) {
      throw new Error('Feed not found');
    }

    const feed = data.feeds[feedIndex];
    
    if (updates.url) feed.url = updates.url;
    if (updates.rules) {
      feed.rules = {
        regex: updates.rules.regex !== undefined ? updates.rules.regex : feed.rules.regex,
        minSize: updates.rules.minSize !== undefined ? updates.rules.minSize : feed.rules.minSize,
        maxSize: updates.rules.maxSize !== undefined ? updates.rules.maxSize : feed.rules.maxSize,
        category: updates.rules.category !== undefined ? updates.rules.category : feed.rules.category
      };
    }

    this.save(data);
    return feed;
  }

  // Delete feed
  deleteFeed(id) {
    const data = this.load();
    const feedIndex = data.feeds.findIndex(f => f.id === id);
    
    if (feedIndex === -1) {
      throw new Error('Feed not found');
    }
    
    data.feeds.splice(feedIndex, 1);
    this.save(data);
    
    return true;
  }

  // Parse RSS feed with security protections
  async parseFeed(url) {
    return new Promise(async (resolve, reject) => {
      try {
        // Parse and validate URL
        const parsedUrl = new URL(url);
        
        // Only allow http and https protocols
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          throw new Error('Only HTTP and HTTPS URLs are allowed');
        }

        // Resolve hostname to IP and check for private IPs (SSRF protection)
        try {
          const { address } = await dnsLookup(parsedUrl.hostname);
          if (isPrivateIP(address)) {
            throw new Error('Access to private/internal networks is not allowed');
          }
        } catch (dnsError) {
          if (dnsError.message.includes('private')) {
            throw dnsError;
          }
          throw new Error(`DNS lookup failed: ${dnsError.message}`);
        }

        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Transmission-Frontend-RSS/1.0'
          },
          size: 5 * 1024 * 1024, // 5MB max response size
          follow: 3 // Max 3 redirects
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const feedparser = new FeedParser();
        const items = [];

        feedparser.on('error', reject);
        feedparser.on('readable', function() {
          let item;
          while (item = this.read()) {
            items.push({
              title: item.title,
              link: item.link,
              guid: item.guid || item.link,
              pubDate: item.pubdate,
              description: item.description,
              enclosures: item.enclosures
            });
          }
        });
        feedparser.on('end', () => resolve(items));

        response.body.pipe(feedparser);
      } catch (error) {
        reject(error);
      }
    });
  }

  // Check if item matches rules
  matchesRules(item, rules) {
    try {
      // Check regex match on title
      const regex = new RegExp(rules.regex, 'i');
      if (!regex.test(item.title)) {
        return { matches: false, reason: 'regex' };
      }

      // Extract torrent URL - try multiple methods
      let torrentUrl = null;
      let torrentSize = null;

      // Method 1: Check enclosures (standard RSS torrent feeds)
      const torrentEnclosure = item.enclosures?.find(e => 
        e.type === 'application/x-bittorrent' || e.url?.endsWith('.torrent')
      );

      if (torrentEnclosure) {
        torrentUrl = torrentEnclosure.url;
        torrentSize = torrentEnclosure.length;
      }

      // Method 2: Use the item link directly if it's a .torrent file
      if (!torrentUrl && item.link && item.link.endsWith('.torrent')) {
        torrentUrl = item.link;
      }

      // Method 3: Check if link contains download endpoints (common for private trackers)
      if (!torrentUrl && item.link && (
        item.link.includes('/download/') || 
        item.link.includes('action=download') ||
        item.link.includes('rss_dl.php') ||
        item.link.includes('/dl/') ||
        item.link.includes('download.php')
      )) {
        torrentUrl = item.link;
      }

      if (!torrentUrl) {
        return { matches: false, reason: 'no-torrent-link' };
      }

      // Size check (if provided)
      if (torrentSize) {
        const size = parseInt(torrentSize);
        if (size < rules.minSize || size > rules.maxSize) {
          return { matches: false, reason: 'size' };
        }
      }

      return { matches: true, torrentUrl };
    } catch (error) {
      return { matches: false, reason: 'error', error: error.message };
    }
  }

  // Get hash of item for deduplication
  getItemHash(item) {
    const hashContent = item.guid || item.link || item.title;
    return crypto.createHash('md5').update(hashContent).digest('hex');
  }

  // Check if item was seen before
  wasItemSeen(hash) {
    const data = this.load();
    return !!data.seenItems[hash];
  }

  // Mark item as seen
  markItemSeen(hash, feedId) {
    const data = this.load();
    data.seenItems[hash] = {
      feed_id: feedId,
      seen_at: new Date().toISOString()
    };
    this.save(data);
  }

  // Poll single feed
  async pollFeed(feedId) {
    const data = this.load();
    const feed = data.feeds.find(f => f.id === feedId);
    
    if (!feed) {
      throw new Error('Feed not found');
    }

    try {
      const items = await this.parseFeed(feed.url);
      console.log(`Feed ${feedId}: Parsed ${items.length} items from RSS`);
      const results = [];

      // Get existing torrents to avoid re-adding deleted ones
      const existingTorrents = await transmissionService.getTorrents();
      const existingTorrentUrls = new Set(existingTorrents.map(t => t.magnetLink || t.name));

      let skippedAlreadySeen = 0;
      let skippedNoMatch = 0;
      let skippedAlreadyExists = 0;
      let addedNew = 0;
      let failedToAdd = 0;

      for (const item of items) {
        const hash = this.getItemHash(item);
        
        // Skip if already seen
        if (data.seenItems[hash]) {
          skippedAlreadySeen++;
          continue;
        }

        // Mark as seen immediately in memory to prevent re-processing
        data.seenItems[hash] = {
          feed_id: feedId,
          seen_at: new Date().toISOString()
        };

        // Check if matches rules
        const matchResult = this.matchesRules(item, feed.rules);
        
        if (!matchResult.matches) {
          skippedNoMatch++;
          continue;
        }
        
        // Check if this torrent already exists (by URL or name)
        const alreadyExists = existingTorrents.some(t => t.name === item.title);
        
        if (alreadyExists) {
          console.log(`Skipping "${item.title}" - already exists in Transmission`);
          skippedAlreadyExists++;
          continue;
        }
        
        try {
          // Add torrent
          const torrent = await transmissionService.addTorrentUrl(matchResult.torrentUrl);
          
          // Store metadata by hashString (mark as RSS-added by system)
          torrentMetadata.setTorrentMetadata(
            torrent.hashString,
            0, // system user ID
            'rss-auto',
            { feed_id: feedId, feed_url: feed.url }
          );

          results.push({
            success: true,
            title: item.title,
            torrentId: torrent.id
          });

          // Only increment matched_count when successfully added
          feed.matched_count++;
          addedNew++;
        } catch (error) {
          results.push({
            success: false,
            title: item.title,
            error: error.message
          });
          failedToAdd++;
        }
      }
      
      console.log(`Feed ${feedId} poll summary: ${skippedAlreadySeen} already seen, ${skippedNoMatch} no match, ${skippedAlreadyExists} already exists, ${addedNew} newly added, ${failedToAdd} failed`);

      // Update last poll time
      feed.last_poll = new Date().toISOString();
      
      // Save all changes at once (seenItems + matched_count + last_poll)
      this.save(data);

      return results;
    } catch (error) {
      console.error(`Error polling feed ${feedId}:`, error);
      throw error;
    }
  }

  // Poll all feeds
  async pollAllFeeds() {
    const feeds = this.getFeeds();
    console.log(`Polling ${feeds.length} RSS feeds...`);

    const results = {};
    for (const feed of feeds) {
      try {
        results[feed.id] = await this.pollFeed(feed.id);
        console.log(`Feed ${feed.id}: ${results[feed.id].length} new matches`);
      } catch (error) {
        results[feed.id] = { error: error.message };
        console.error(`Feed ${feed.id} failed:`, error.message);
      }
    }

    return results;
  }

  // Start polling scheduler
  startPolling() {
    const interval = parseInt(process.env.RSS_POLL_INTERVAL || '30');
    console.log(`Starting RSS polling every ${interval} minutes`);

    // Poll immediately on startup
    setTimeout(() => {
      this.pollAllFeeds().catch(console.error);
    }, 10000); // 10 seconds after startup

    // Schedule periodic polling
    cron.schedule(`*/${interval} * * * *`, () => {
      this.pollAllFeeds().catch(console.error);
    });
  }
}

// Singleton instance
const rssManager = new RSSManager();
export default rssManager;
