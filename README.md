# Transmissionbt-frontend
A very simple multi user frontend for the transmission-daemon   
Made by AI, thank You Claude and Gemini and bmad-method

# Multi-User Transmission Frontend

A modern web interface for Transmission torrent client with multi-user support, RSS feed automation, and intelligent disk management.

## Features

- **Multi-User Authentication**: Session-based login with admin/regular user roles
- **Torrent Management**: Upload, view, and delete torrents with ownership tracking
- **RSS Feed Automation**: Auto-download torrents matching custom rules (regex, size filters)
- **Smart Disk Management**: Auto-remove oldest torrents when disk space < 10%
- **Permission System**: Users can only delete own torrents; admins can manage all
- **Real-time Updates**: Auto-refreshing torrent list and stats
- **Responsive UI**: Clean, modern interface built with React

## Tech Stack

### Backend
- Node.js 18+ with Express
- Session-based auth (express-session + bcrypt)
- Transmission RPC client
- node-cron for scheduling
- feedparser for RSS
- JSON file storage (users, metadata, feeds)

### Frontend
- React 18 with Vite
- React Router for navigation
- Axios for API calls
- CSS3 for styling

## Installation

### Prerequisites

- Node.js 18 or higher
- Transmission daemon running and accessible
- HAProxy, nginx (optional, for production deployment)

### Setup

use the install script after cloning: 
debian-install.sh <target directory>
or

1. **Clone the repository**

```bash
git clone <repo-url>
cd Transmissionbt-frontend
```

2. **Backend Setup**

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your configuration
npm run dev
```

3. **Frontend Setup**

```bash
cd frontend
npm install
npm run dev
```

### Environment Configuration

Edit `backend/.env`:

```env
# Transmission daemon connection
TRANSMISSION_HOST=localhost
TRANSMISSION_PORT=9091
TRANSMISSION_USERNAME=
TRANSMISSION_PASSWORD=

# Server configuration
PORT=42080
NODE_ENV=development

# Session configuration (CHANGE IN PRODUCTION!)
SESSION_SECRET=your-secret-key-change-this-in-production

# Database paths
DB_PATH=./data/users.json

# RSS polling interval (minutes)
RSS_POLL_INTERVAL=30

# Disk monitoring interval (minutes)
DISK_CHECK_INTERVAL=5

# Disk free space threshold (percentage)
DISK_THRESHOLD=10
```

## Default Credentials

**Username:** `admin`
**Password:** `admin-password` or not, maybe randomized by the install script and displayed once.

⚠️ **Change immediately after first login!**

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user

### Torrents
- `GET /api/torrents` - List all torrents with ownership
- `POST /api/torrents/upload` - Upload torrent file(s)
- `DELETE /api/torrents/:id` - Delete torrent (owner or admin only)
- `PATCH /api/torrents/:id/block-auto-remove` - Toggle auto-remove protection
- `GET /api/torrents/stats` - Get torrent statistics

### RSS Feeds
- `GET /api/feeds` - List all feeds
- `POST /api/feeds` - Add new feed
- `PUT /api/feeds/:id` - Update feed
- `DELETE /api/feeds/:id` - Delete feed
- `POST /api/feeds/poll` - Trigger manual poll
- `POST /api/feeds/:id/poll` - Poll specific feed

### Admin (requires admin role)
- `GET /api/admin/users` - List all users
- `POST /api/admin/users` - Create user
- `PATCH /api/admin/users/:id` - Update user
- `DELETE /api/admin/users/:id` - Delete user

### Health
- `GET /health` - Health check for HAProxy

## Production Deployment with HAProxy

### HAProxy Configuration Example

```haproxy
frontend https_front
    bind *:443 ssl crt /path/to/cert.pem
    acl is_tf_app hdr(host) -i tf.example.com
    use_backend tf_backend if is_tf_app

backend tf_backend
    balance source
    option httpclose
    option forwardfor
    cookie SERVERID insert indirect nocache
    server tf_app1 127.0.0.1:3000 check cookie tf_app1
```

### Important Notes

1. **Sticky Sessions Required**: Use `balance source` or cookie-based session affinity
2. **Trust Proxy**: Backend automatically trusts proxy (express `trust proxy` enabled)
3. **Health Checks**: HAProxy should monitor `/health` endpoint
4. **SSL Termination**: HAProxy handles HTTPS, backend receives HTTP

## Features in Detail

### RSS Feed Rules

When adding an RSS feed, you can specify:

- **Regex Pattern**: Match torrent title (default: `.*` matches all)
- **Min/Max Size**: Filter by torrent size in bytes
- **Category**: Optional category label

Items matching all rules are automatically downloaded. Duplicate detection prevents re-downloading the same item.

### Disk Auto-Removal

The disk monitor checks free space every 5 minutes (configurable). When free space drops below 10%:

1. Identifies completed torrents
2. Filters out torrents with "block auto-remove" flag
3. Removes oldest torrents first until space > 10%
4. Logs all removal actions

### Permission Model

- **Regular Users**: Can upload torrents, view all torrents, delete own torrents only
- **Admins**: Full access - manage any torrent, create/delete users, access admin panel

## Development

### Backend Development

```bash
cd backend
npm run dev  # Runs with --watch flag for auto-reload
```

### Frontend Development

```bash
cd frontend
npm run dev  # Vite dev server with HMR
```

### Building for Production

```bash
# Frontend
cd frontend
npm run build

# Backend (no build needed, runs directly)
cd backend
npm start
```

## Troubleshooting

### Cannot connect to Transmission

- Verify Transmission daemon is running: `transmission-daemon --version`
- Check RPC settings in Transmission config
- Ensure `TRANSMISSION_HOST` and `TRANSMISSION_PORT` are correct

### Session issues / frequent logouts

- Check `SESSION_SECRET` is set and consistent
- Verify HAProxy sticky sessions are configured
- Ensure cookies are enabled in browser

### RSS feeds not polling

- Check logs for errors
- Verify feed URL is accessible
- Confirm `RSS_POLL_INTERVAL` environment variable is set

### Disk auto-removal not working

- Check Transmission download directory permissions
- Verify `DISK_THRESHOLD` is set correctly
- Review logs for disk check errors (may not work on Windows - mock data used)


