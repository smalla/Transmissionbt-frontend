# System Configuration Guide

This project is designed to be portable across different systems. Follow this guide to adapt it to your environment.

## Overview

The application uses environment variables for all system-specific configuration. This allows you to:
- Deploy to different systems without code changes
- Keep sensitive data out of git
- Support multiple environments (dev, staging, production)

## Key System-Specific Values

### Paths
| Variable | Default | Purpose | Customizable |
|----------|---------|---------|--------------|
| `TRANSMISSION_CONFIG_DIR` | `/var/lib/transmission-daemon/.config/transmission-daemon` | Transmission daemon config | ✅ ENV |
| `DATA_DIR` | `./data` (relative) | Application data (users, feeds, metadata) | ✅ ENV |
| `DOWNLOADS_DIR` | `/mnt/crypted/downloads` | Transmission downloads folder | ✅ ENV |
| `LOG_DIR` | `./logs` | Application logs | ✅ ENV |

### Network
| Variable | Default | Purpose | Customizable |
|----------|---------|---------|--------------|
| `HOST` | `127.0.0.1` | Backend server binding address | ✅ ENV |
| `PORT` | `42080` | Backend server port | ✅ ENV |
| `TRANSMISSION_HOST` | `localhost` | Transmission RPC hostname | ✅ ENV |
| `TRANSMISSION_PORT` | `9091` | Transmission RPC port | ✅ ENV |
| `PROFTPD_PORT` | `2122` | ProFTPD FTP port | ✅ proftpd.conf |

### Security
| Variable | Default | Purpose | Customizable |
|----------|---------|---------|--------------|
| `SESSION_SECRET` | `your-secret-key-change-this-in-production` | Session signing key | ✅ ENV (REQUIRED in production) |
| `TRANSMISSION_USERNAME` | (empty) | Transmission RPC username | ✅ ENV |
| `TRANSMISSION_PASSWORD` | (empty) | Transmission RPC password | ✅ ENV |

## Configuration Steps

### 1. Backend Configuration

Copy and customize the environment file:
```bash
cp backend/.env.example backend/.env
nano backend/.env
```

Edit the following for your system:
```env
# Set paths for your system
TRANSMISSION_CONFIG_DIR=/path/to/transmission/config
DATA_DIR=/path/to/application/data
DOWNLOADS_DIR=/path/to/downloads

# Set network configuration
HOST=0.0.0.0  # or 127.0.0.1 for local only
PORT=42080

# Configure Transmission connection
TRANSMISSION_HOST=localhost
TRANSMISSION_PORT=9091
TRANSMISSION_USERNAME=myuser
TRANSMISSION_PASSWORD=mypass

# IMPORTANT: Change this in production!
SESSION_SECRET=your-random-secret-key-here
```

### 2. ProFTPD Configuration

If using ProFTPD for FTP access:
```bash
cp backend/proftpd.conf.example backend/proftpd.conf
nano backend/proftpd.conf
```

Update these paths in `proftpd.conf`:
- `SQLConnectInfo` - Point to your users database
- `DefaultRoot` - Point to your downloads directory  
- `<Directory>` - Update path patterns

Then include it in `/etc/proftpd/proftpd.conf`:
```
Include /path/to/Downloader/backend/proftpd.conf
```

### 3. Frontend Configuration

If you need custom API endpoints (optional):
```bash
cp frontend/.env.example frontend/.env
nano frontend/.env
```

By default, frontend uses `/api` (proxied by backend in production).

## Environment Variables Reference

All environment variables with defaults are documented in:
- `backend/.env.example` - Backend environment configuration
- `backend/proftpd.conf.example` - ProFTPD template with comments

## What's Generalized

✅ **Already Portable:**
- Transmission connection settings
- Server host/port binding
- Database paths
- Download directory
- ProFTPD configuration template
- Log levels and paths
- RSS poll intervals
- Disk monitoring thresholds

❌ **Still System-Specific:**
- Actual file paths need to be created on your system
- ProFTPD requires manual setup (not auto-generated)
- System service names (transmission-daemon) are hardcoded

## Deployment Notes

When deploying to a new system:

1. **Create required directories:**
   ```bash
   mkdir -p /var/www/tf/backend/data
   mkdir -p /mnt/crypted/downloads
   mkdir -p logs
   chmod 755 logs
   ```

2. **Copy essential files only** (use .gitignore):
   ```bash
   git clone <repo>
   cd Downloader
   npm install --prefix backend
   npm install --prefix frontend
   ```

3. **Configure for your environment:**
   ```bash
   # Create .env from template
   cp backend/.env.example backend/.env
   # Edit with your system paths and credentials
   nano backend/.env
   ```

4. **Start services:**
   ```bash
   # Terminal 1: Backend
   cd backend && npm start
   
   # Terminal 2: Frontend  
   cd frontend && npm run dev
   ```

## Docker/Containerization

For true portability, the application can be containerized. Key volumes that would be needed:
- `/var/www/tf/backend/data` - Application data
- `/mnt/crypted/downloads` - Downloaded files
- Transmission socket or network connection
