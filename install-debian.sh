#!/bin/bash

#############################################################################
# Multi-User Transmission Frontend - Debian Installation Script
# 
# Usage: sudo ./install-debian.sh /path/to/install/directory
#
# This script will:
# - Check and install dependencies (Node.js, Transmission)
# - Install the application to specified directory
# - Set up systemd services
# - Configure firewall (optional)
#############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Error: This script must be run as root (use sudo)${NC}"
    exit 1
fi

# Check if target directory is provided
if [ -z "$1" ]; then
    echo -e "${RED}Error: Target directory not specified${NC}"
    echo "Usage: sudo $0 /path/to/install/directory"
    echo "Example: sudo $0 /opt/transmission-frontend"
    exit 1
fi

TARGET_DIR="$1"
INSTALL_USER="${SUDO_USER:-$USER}"
SERVICE_USER="www-data"  # User that runs the backend service

echo -e "${GREEN}=== Multi-User Transmission Frontend Installation ===${NC}"
echo "Target directory: $TARGET_DIR"
echo "Install user: $INSTALL_USER"
echo "Service user: $SERVICE_USER"
echo ""

# Function to print step
print_step() {
    echo -e "${YELLOW}==>${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Step 1: Check/Install Node.js
print_step "Checking Node.js installation..."
if command_exists node; then
    NODE_VERSION=$(node -v)
    echo "Node.js found: $NODE_VERSION"
    
    # Check if version is >= 18
    MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
    if [ "$MAJOR_VERSION" -lt 18 ]; then
        echo -e "${YELLOW}Warning: Node.js 18+ recommended. Current version: $NODE_VERSION${NC}"
        read -p "Continue anyway? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
else
    echo "Node.js not found. Installing Node.js 20 LTS..."
    
    # Install Node.js using NodeSource repository
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    
    echo "Node.js installed: $(node -v)"
fi

# Step 2: Check/Install Transmission
print_step "Checking Transmission daemon..."
if command_exists transmission-daemon; then
    echo "Transmission daemon found: $(transmission-daemon --version | head -n1)"
else
    echo "Transmission not found. Installing..."
    apt-get update
    apt-get install -y transmission-daemon transmission-cli
    
    # Stop the daemon to configure it
    systemctl stop transmission-daemon
    
    echo -e "${YELLOW}Note: You'll need to configure Transmission settings later${NC}"
fi

# Step 2b: Install jq for parsing JSON
print_step "Checking jq installation..."
if ! command_exists jq; then
    echo "Installing jq..."
    apt-get install -y jq
fi

# Step 2c: Check/Install ProFTPD with SQLite support
print_step "Checking ProFTPD installation..."
read -p "Install ProFTPD for FTP access to downloads? (y/n) " -n 1 -r
echo
INSTALL_PROFTPD=0
if [[ $REPLY =~ ^[Yy]$ ]]; then
    INSTALL_PROFTPD=1
    if command_exists proftpd; then
        echo "ProFTPD found: $(proftpd -v | head -n1)"
    else
        echo "Installing ProFTPD with SQLite support..."
        apt-get install -y proftpd-basic proftpd-mod-sqlite
        
        # Stop ProFTPD for configuration
        systemctl stop proftpd || true
    fi
fi

# Step 3: Create target directory
print_step "Creating installation directory..."
mkdir -p "$TARGET_DIR"

# Step 4: Copy application files
print_step "Copying application files..."

# Find source directory - check current directory first, then script directory
SOURCE_DIR=""
CURRENT_DIR="$(pwd)"
if [ -d "$CURRENT_DIR/backend" ] && [ -d "$CURRENT_DIR/frontend" ]; then
    SOURCE_DIR="$CURRENT_DIR"
else
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    if [ -d "$SCRIPT_DIR/backend" ] && [ -d "$SCRIPT_DIR/frontend" ]; then
        SOURCE_DIR="$SCRIPT_DIR"
    fi
fi

if [ -z "$SOURCE_DIR" ]; then
    echo -e "${RED}Error: backend and frontend directories not found${NC}"
    echo "Please run this script from the application root directory"
    echo "Current directory: $(pwd)"
    echo "Script directory: $(dirname "${BASH_SOURCE[0]}")"
    exit 1
fi

echo "Source directory: $SOURCE_DIR"

# Copy backend
cp -r "$SOURCE_DIR/backend" "$TARGET_DIR/"
cp -r "$SOURCE_DIR/frontend" "$TARGET_DIR/"
cp "$SOURCE_DIR/README.md" "$TARGET_DIR/" 2>/dev/null || true

echo "Files copied to $TARGET_DIR"

# Step 5: Set proper permissions BEFORE npm install
print_step "Setting permissions..."
chown -R "$INSTALL_USER:$INSTALL_USER" "$TARGET_DIR"
chmod -R 755 "$TARGET_DIR"

# Step 6: Install backend dependencies
print_step "Installing backend dependencies..."
cd "$TARGET_DIR/backend"
sudo -u "$INSTALL_USER" npm install --omit=dev

# Step 7: Install frontend dependencies and build
print_step "Installing frontend dependencies and building..."
cd "$TARGET_DIR/frontend"
sudo -u "$INSTALL_USER" npm install
sudo -u "$INSTALL_USER" npm run build

# Step 8: Configure environment
print_step "Setting up configuration..."
cd "$TARGET_DIR/backend"

if [ ! -f .env ]; then
    cp .env.example .env
    
    # Generate random session secret
    SESSION_SECRET=$(openssl rand -hex 32)
    sed -i "s/your-secret-key-change-this-in-production/$SESSION_SECRET/" .env
    
    echo -e "${GREEN}Created .env file with random session secret${NC}"
    echo -e "${YELLOW}Please edit $TARGET_DIR/backend/.env to configure Transmission connection${NC}"
fi

# Create data directories
mkdir -p "$TARGET_DIR/backend/data"
mkdir -p "$TARGET_DIR/backend/uploads"
mkdir -p "$TARGET_DIR/backend/logs"

# Copy mount check script
cp "$SOURCE_DIR/backend/check-mounts.sh" "$TARGET_DIR/backend/"
chmod +x "$TARGET_DIR/backend/check-mounts.sh"

# Step 9: Secure permissions on sensitive files
print_step "Securing configuration files..."
# Service user needs to own data directories for read/write
chown -R "$SERVICE_USER:$SERVICE_USER" "$TARGET_DIR/backend/data"
chown -R "$SERVICE_USER:$SERVICE_USER" "$TARGET_DIR/backend/uploads"
chown -R "$SERVICE_USER:$SERVICE_USER" "$TARGET_DIR/backend/logs"
chown "$SERVICE_USER:$SERVICE_USER" "$TARGET_DIR/backend/.env"
chmod 600 "$TARGET_DIR/backend/.env"

# Add www-data to debian-transmission group for Transmission file access
print_step "Configuring Transmission access for service user..."
usermod -aG debian-transmission "$SERVICE_USER"

# Make Transmission directories group-writable (workaround for 4.1.0-beta.2 bug)
chmod g+w /var/lib/transmission-daemon/.config/transmission-daemon/resume/ 2>/dev/null || true
chmod g+w /var/lib/transmission-daemon/.config/transmission-daemon/torrents/ 2>/dev/null || true

# Create sudoers rule for www-data to restart transmission-daemon
print_step "Configuring sudo permissions for service user..."
echo "$SERVICE_USER ALL=(ALL) NOPASSWD: /bin/systemctl restart transmission-daemon" > /etc/sudoers.d/transmission-frontend
chmod 0440 /etc/sudoers.d/transmission-frontend

# Step 10: Create systemd service for backend
print_step "Creating systemd service..."

cat > /etc/systemd/system/transmission-frontend.service <<EOF
[Unit]
Description=Transmission Frontend Backend
After=network.target transmission-daemon.service

[Service]
Type=simple
ExecStartPre=$TARGET_DIR/backend/check-mounts.sh
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$TARGET_DIR/backend
Environment=NODE_ENV=production
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

echo "Systemd service created: transmission-frontend.service"

# Step 11: Reload systemd
systemctl daemon-reload

# Step 11b: Configure ProFTPD (if installing)
if [ "$INSTALL_PROFTPD" -eq 1 ]; then
    print_step "Configuring ProFTPD..."
    
    # Copy ProFTPD configuration
    cp "$SOURCE_DIR/backend/proftpd.conf" /etc/proftpd/conf.d/transmission-frontend.conf
    
    # Update paths in config
    sed -i "s|/var/www/tf/backend|$TARGET_DIR/backend|g" /etc/proftpd/conf.d/transmission-frontend.conf
    
    # Get download directory from user or use default
    read -p "Enter download directory path [/mnt/crypted/downloads]: " DOWNLOAD_DIR
    DOWNLOAD_DIR=${DOWNLOAD_DIR:-/mnt/crypted/downloads}
    
    sed -i "s|/mnt/crypted/downloads|$DOWNLOAD_DIR|g" /etc/proftpd/conf.d/transmission-frontend.conf
    
    # Ensure download directory exists
    mkdir -p "$DOWNLOAD_DIR"
    chown debian-transmission:debian-transmission "$DOWNLOAD_DIR"
    chmod 775 "$DOWNLOAD_DIR"
    
    # Test ProFTPD configuration
    proftpd -t
    
    echo "ProFTPD configuration created"
    echo -e "${YELLOW}Note: Users must set FTP password in admin panel before FTP access${NC}"
    
    # Ask about enabling ProFTPD
    read -p "Start ProFTPD service now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        systemctl enable proftpd
        systemctl start proftpd
        echo "ProFTPD started"
    fi
fi

# Step 12: Configure reverse proxy
print_step "Reverse proxy configuration..."

echo ""
echo -e "${YELLOW}HAProxy Configuration (recommended):${NC}"
echo ""
echo "Add this backend to your HAProxy config (/etc/haproxy/haproxy.cfg):"
echo ""
cat <<'HAPROXY_CONFIG'
backend tf
    mode http
    balance source
    option httpclose
    option forwardfor
    http-request set-header X-Forwarded-Port %[dst_port]
    http-request add-header X-Forwarded-Proto https if { ssl_fc }
    cookie SERVERID insert indirect nocache
    server transfe 127.0.0.1:42080 check cookie transfe

# Example frontend ACL:
# frontend https_frontend
#     bind *:443 ssl crt /etc/ssl/certs/your-cert.pem
#     acl is_tf hdr(host) -i tf.yourdomain.com
#     use_backend tf if is_tf
HAPROXY_CONFIG
echo ""
echo "After updating HAProxy config, reload it:"
echo "  sudo systemctl reload haproxy"
echo ""

if command_exists nginx; then
    read -p "Configure Nginx reverse proxy instead? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Enter domain name (e.g., tf.example.com): " DOMAIN_NAME
        
        cat > "/etc/nginx/sites-available/transmission-frontend" <<EOF
server {
    listen 80;
    server_name $DOMAIN_NAME;

    # Frontend static files
    location / {
        root $TARGET_DIR/frontend/dist;
        try_files \$uri \$uri/ /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:42080/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Session cookies need these
        proxy_set_42080/tcp comment 'Transmission Frontend'
        if command_exists nginx; then
            ufw allow 'Nginx Full'
        fi
        if command_exists haproxy; then
            ufw allow 80/tcp comment 'HTTP'
            ufw allow 443/tcp comment 'HTTPS
    # Health check
    location /health {
        proxy_pass http://localhost:42080/health;
    }
}
EOF
        
        ln -sf /etc/nginx/sites-available/transmission-frontend /etc/nginx/sites-enabled/
        
        echo -e "${GREEN}Nginx configuration created${NC}"
        echo "Testing Nginx configuration..."
        nginx -t && systemctl reload nginx
        
        echo -e "${YELLOW}To enable SSL, run: sudo certbot --nginx -d $DOMAIN_NAME${NC}"
    fi
else
    echo "Nginx not found. Using HAProxy is recommended."
fi

# Step 13: Firewall configuration (optional)
print_step "Firewall configuration..."
if command_exists ufw; then
    read -p "Configure UFW firewall? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        ufw allow 42080/tcp comment 'Transmission Frontend'
        if command_exists nginx; then
            ufw allow 'Nginx Full'
        fi
        if command_exists haproxy; then
            ufw allow 80/tcp comment 'HTTP'
            ufw allow 443/tcp comment 'HTTPS'
        fi
        if [ "$INSTALL_PROFTPD" -eq 1 ]; then
            ufw allow 21/tcp comment 'FTP'
            ufw allow 49152:65534/tcp comment 'FTP Passive'
        fi
        echo -e "${GREEN}Firewall rules added${NC}"
    fi
fi

# Final instructions
echo ""
echo -e "${GREEN}=== Installation Complete! ===${NC}"
echo ""
echo "Installation directory: $TARGET_DIR"
echo "Service user: $SERVICE_USER"
if [ "$INSTALL_PROFTPD" -eq 1 ]; then
    echo "FTP: Enabled (ProFTPD)"
fi
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo ""
echo "1. Configure Transmission connection:"
echo "   sudo nano $TARGET_DIR/backend/.env"
echo "   Set TRANSMISSION_HOST, TRANSMISSION_PORT, TRANSMISSION_USERNAME, TRANSMISSION_PASSWORD"
echo ""
echo "2. Configure Transmission daemon to allow RPC connections:"
echo "   sudo systemctl stop transmission-daemon"
echo "   sudo nano /etc/transmission-daemon/settings.json"
echo "   Set: \"rpc-whitelist-enabled\": false (or add 127.0.0.1)"
echo "   Set: \"umask\": 2  (for group-write permissions)"
echo "   sudo systemctl start transmission-daemon"
echo ""
echo "3. If using a custom download directory, ensure $SERVICE_USER can access it:"
echo "   sudo usermod -aG debian-transmission $SERVICE_USER"
echo "   sudo chmod g+w /path/to/downloads"
echo "   sudo chgrp debian-transmission /path/to/downloads"
echo ""
echo "4. Start the backend service:"
echo "   sudo systemctl start transmission-frontend"
echo "   sudo systemctl enable transmission-frontend  # Auto-start on boot"
echo ""
echo "5. Check service status:"
echo "   sudo systemctl status transmission-frontend"
echo "   sudo journalctl -u transmission-frontend -f  # View logs"
echo ""
echo "6. Configure HAProxy (if using):"
echo "   See HAProxy config shown above"
echo ""
if command_exists nginx; then
    echo "7. Access the application:"
    echo "   http://your-server-ip  (via Nginx)"
    echo "   http://your-server-ip:42080  (direct to backend)"
else
    echo "7. Access the application:"
    echo "   http://your-server-ip:42080  (or via HAProxy)"
fi
echo ""
if [ "$INSTALL_PROFTPD" -eq 1 ]; then
    echo "8. FTP Access:"
    echo "   - Login to admin panel and set FTP password for each user"
    echo "   - FTP users will be chrooted to: $DOWNLOAD_DIR/username"
    echo "   - Connect: ftp://username@your-server-ip"
    echo ""
fi
echo ""
echo "Default credentials:"
echo "   Username: admin"
echo "   Password: admin-password"
echo ""
echo -e "${RED}⚠️  IMPORTANT: Change the admin password immediately after first login!${NC}"
echo ""
echo "For more information, see: $TARGET_DIR/README.md"
