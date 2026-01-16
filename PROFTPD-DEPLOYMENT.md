# ProFTPD Integration - Deployment Guide

This guide covers migrating from JSON-based user storage to SQLite and enabling FTP access.

## Overview

The new system:
- **SQLite database** for unified user storage (web + FTP)
- **ProFTPD** authenticates against the same database
- **Per-user FTP access** - admins enable FTP and set passwords individually
- **Secure chroot** - users can only access their download folder

## Prerequisites

- Existing installation with users.json
- Root/sudo access on the server

## Step 1: Stop the Backend Service

```bash
sudo systemctl stop transmission-frontend
```

## Step 2: Backup Existing Data

```bash
cd /var/www/tf/backend
cp data/users.json data/users.json.backup
cp data/sessions.db data/sessions.db.backup 2>/dev/null || true
```

## Step 3: Deploy Updated Code

From your local machine:

```bash
# Backend files
scp -r backend/src smalla@tf.bitz.hu:/var/www/tf/backend/
scp backend/migrate-users-to-sqlite.js smalla@tf.bitz.hu:/var/www/tf/backend/
scp backend/proftpd.conf smalla@tf.bitz.hu:/var/www/tf/backend/

# Frontend (if updated)
cd frontend
npm run build
scp -r dist/* smalla@tf.bitz.hu:/var/www/tf/frontend/dist/
```

## Step 4: Run Migration

On the server:

```bash
cd /var/www/tf/backend
node migrate-users-to-sqlite.js
```

Expected output:
```
=== User Migration: JSON -> SQLite ===

Reading users.json...
Found 2 user(s)

Creating SQLite database...
✓ Schema created

Migrating users...
  ✓ Migrated user: admin (ID: 1)
  ✓ Migrated user: smalla (ID: 2)

✓ Migration complete: 2 users in database
✓ Backup created: /var/www/tf/backend/data/users.json.backup

=== Migration Successful ===
```

## Step 5: Verify Database

```bash
sqlite3 data/users.db "SELECT id, username, is_admin FROM users;"
```

Should output:
```
1|admin|1
2|smalla|0
```

## Step 6: Install ProFTPD (Optional)

```bash
sudo apt-get update
sudo apt-get install -y proftpd-basic proftpd-mod-sqlite
```

When prompted, choose **standalone** mode.

## Step 7: Configure ProFTPD

```bash
# Copy config
sudo cp /var/www/tf/backend/proftpd.conf /etc/proftpd/conf.d/transmission-frontend.conf

# Update database path if different
sudo nano /etc/proftpd/conf.d/transmission-frontend.conf
# Ensure SQLConnectInfo points to correct users.db path

# Update download directory if needed
# Default: /mnt/crypted/downloads

# Test configuration
sudo proftpd -t
```

## Step 8: Set Permissions

```bash
# ProFTPD needs read access to users.db
sudo chown www-data:www-data /var/www/tf/backend/data/users.db
sudo chmod 644 /var/www/tf/backend/data/users.db

# Ensure download directory is accessible
sudo chmod 755 /mnt/crypted/downloads
sudo chgrp debian-transmission /mnt/crypted/downloads
```

## Step 9: Start Services

```bash
# Start backend
sudo systemctl start transmission-frontend
sudo systemctl status transmission-frontend

# Start ProFTPD
sudo systemctl enable proftpd
sudo systemctl start proftpd
sudo systemctl status proftpd
```

## Step 10: Configure Firewall (if using UFW)

```bash
sudo ufw allow 21/tcp comment 'FTP'
sudo ufw allow 49152:65534/tcp comment 'FTP Passive'
```

## Step 11: Enable FTP for Users

1. Login to admin panel: https://tf.bitz.hu
2. Go to Admin → User Management
3. Click "Enable FTP" for desired users
4. Set FTP password (can be different from web password)

## Testing FTP Access

```bash
# From another machine
ftp tf.bitz.hu
# Username: smalla
# Password: [ftp password set in admin panel]

# List files
ls

# Download a file
get filename.mkv
```

## Troubleshooting

### ProFTPD can't read database

```bash
# Check permissions
ls -l /var/www/tf/backend/data/users.db

# Should be readable by www-data (ProFTPD runs as www-data)
sudo chown www-data:www-data /var/www/tf/backend/data/users.db
```

### Users can't login via FTP

1. Check FTP password is set in admin panel
2. Check ProFTPD logs: `sudo tail -f /var/log/proftpd/proftpd.log`
3. Verify SQL query:
```bash
sqlite3 /var/www/tf/backend/data/users.db \
  "SELECT username, ftp_password FROM users WHERE username='smalla';"
```

### FTP user can see all downloads

Check ProFTPD config has:
```
DefaultRoot /mnt/crypted/downloads/%u
```

This chroo ts user to `/mnt/crypted/downloads/username/`

### Backend can't write to users.db

```bash
sudo chown www-data:www-data /var/www/tf/backend/data/
sudo chown www-data:www-data /var/www/tf/backend/data/users.db
```

## Rollback (if needed)

If migration fails:

```bash
# Stop services
sudo systemctl stop transmission-frontend
sudo systemctl stop proftpd

# Restore backup
cd /var/www/tf/backend
rm data/users.db
mv data/users.json.backup data/users.json

# Revert code (deploy old version)

# Start service
sudo systemctl start transmission-frontend
```

## Database Schema

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,      -- bcrypt for web
    ftp_password TEXT,                 -- crypt/MD5 for ProFTPD
    is_admin INTEGER DEFAULT 0,
    force_password_change INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Security Notes

1. **FTP passwords are separate** from web passwords (can be different)
2. **FTP is disabled by default** - admin must explicitly enable per user
3. **MD5 hashes** for FTP (ProFTPD limitation) - use strong passwords
4. **Users are chrooted** to their own folder in downloads directory
5. **Consider FTP over TLS** (FTPS) for production - see ProFTPD TLS docs

## Maintenance

### Add new user with FTP access

1. Admin panel → Add User
2. Click "Enable FTP" 
3. Set FTP password

### Disable FTP for a user

1. Admin panel → User list
2. Click "Disable FTP"

### View FTP logins

```bash
sudo tail -f /var/log/proftpd/xferlog
```

### Database backup

```bash
# Automated backup
sqlite3 /var/www/tf/backend/data/users.db ".backup /var/www/tf/backend/data/users.db.$(date +%Y%m%d)"
```
