# Docker Deployment Guide

Complete containerization for the Transmission Frontend application. Deploy to any system with Docker installed.

## Quick Start

### 1. Prerequisites
- Docker 20.10+ and Docker Compose 1.29+
- 2+ GB RAM available
- Port access: 5173 (frontend), 42080 (backend), 9091 (transmission RPC)

### 2. Setup

```bash
# Clone and navigate
git clone <repo>
cd Downloader

# Configure environment
cp .env.docker.example .env
nano .env  # Edit with your settings
```

### 3. Start Services

```bash
# Development mode (all services)
docker-compose up -d

# Production mode (with reverse proxy)
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### 4. Access Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:42080/api
- **Transmission RPC**: http://localhost:9091

## Services

### 1. **Transmission** (Torrent Client)
- Runs transmission-daemon with optional VPN support
- Uses `haugene/transmission-openvpn` image (supports PIA, ExpressVPN, etc.)
- Volume: `downloads` - shared with backend

### 2. **Backend** (Node.js API)
- Builds from `Dockerfile.backend`
- Connects to Transmission RPC
- Stores data in `backend-data` volume
- Health checks enabled

### 3. **Frontend** (React Web UI)
- Builds from `Dockerfile.frontend`
- Pre-built static assets
- Served via `serve`
- Auto-proxies to backend

### 4. **Nginx** (Reverse Proxy - Optional)
- In production compose file
- Handles HTTPS, load balancing
- Requires `nginx.conf` setup

## Environment Variables

Edit `.env` file:

```env
# Transmission
TRANSMISSION_PASSWORD=secure-password

# Optional VPN (if using transmission-openvpn)
VPN_USERNAME=your-vpn-username
VPN_PASSWORD=your-vpn-password

# Security
SESSION_SECRET=generate-random-string-here

# Optional: Production domain
DOMAIN=yourdomain.com
LETSENCRYPT_EMAIL=your-email@example.com
```

## Volume Mappings

| Volume | Purpose | Host Path (optional) |
|--------|---------|----------------------|
| `transmission-data` | Transmission config | (auto) |
| `backend-data` | Users, feeds, metadata | (auto) |
| `downloads` | Downloaded files | `/mnt/crypted/downloads` |

To use host directories instead:

```yaml
volumes:
  downloads:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /path/on/host
```

## Common Commands

```bash
# View logs
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f transmission

# Stop services
docker-compose down

# Remove all data (⚠️ careful!)
docker-compose down -v

# Rebuild images
docker-compose build --no-cache

# Access container shell
docker exec -it transmission-backend sh

# Check health
docker ps
docker-compose ps
```

## Advanced Configuration

### Enable VPN (Optional)
Edit `.env`:
```env
VPN_PROVIDER=pia  # or expressvpn, nordvpn, etc.
VPN_USERNAME=your-vpn-username
VPN_PASSWORD=your-vpn-password
```

Supported providers: See [transmission-openvpn documentation](https://github.com/haugene/docker-transmission-openvpn)

### Custom Download Directory
Edit `docker-compose.yml`:
```yaml
volumes:
  downloads:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /your/custom/path
```

### HTTPS with Let's Encrypt
1. Create `nginx.conf` with SSL config
2. Use `docker-compose.prod.yml`
3. Set `DOMAIN` and `LETSENCRYPT_EMAIL` in `.env`

### Scale Services
For multiple backend instances with load balancing:

```yaml
backend:
  deploy:
    replicas: 3
```

Then configure nginx for upstream load balancing.

## Troubleshooting

### Transmission not accessible
```bash
# Check if service is running
docker ps | grep transmission

# View logs
docker-compose logs transmission

# Verify ports
docker port transmission
```

### Backend can't connect to Transmission
- Check `TRANSMISSION_HOST` is set to `transmission` (service name)
- Verify `TRANSMISSION_PORT` is `9091` (RPC port, not torrent port)
- Check credentials match in `.env`

### Frontend can't reach backend
- Ensure backend service is healthy: `docker-compose ps`
- Check `REACT_APP_API_URL` environment variable
- Verify port `42080` is exposed

### Out of disk space
```bash
# Clean up Docker
docker system prune -a

# Clear specific volumes
docker volume rm downloader_downloads
```

## Production Deployment

For production:

1. **Use a reverse proxy** (nginx/HAProxy)
   - Offload SSL/TLS
   - Route requests properly
   - Load balance if needed

2. **Use docker-compose.prod.yml**
   ```bash
   docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
   ```

3. **Secure secrets**
   - Don't commit `.env` to git
   - Use Docker secrets in Swarm mode
   - Use `.env` with restricted permissions

4. **Setup monitoring**
   - Use Prometheus + Grafana
   - Monitor container health
   - Set up alerts

5. **Regular backups**
   ```bash
   docker run --rm -v backend-data:/data -v $(pwd):/backup \
     busybox tar czf /backup/backend-data.tar.gz -C /data .
   ```

## Migration from VM/Bare Metal

If migrating from existing installation:

1. **Backup data**
   ```bash
   tar czf backup.tar.gz \
     /var/www/tf/backend/data \
     /mnt/crypted/downloads
   ```

2. **Create volumes and restore**
   ```bash
   docker-compose up -d
   docker exec -i downloader_backend_1 tar xzf - -C /app/data < backup.tar.gz
   ```

3. **Verify data is restored**
   ```bash
   docker exec transmission-backend ls -la /app/data
   ```

## Docker Network

Services communicate via `transmission-network`:
- `backend` → `transmission` (RPC calls)
- `frontend` → `backend` (API calls)
- `nginx` → `backend`, `frontend` (proxy)

No services exposed to host except ports in `docker-compose.yml`.

## Performance Tuning

### Memory Limits
```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M
```

### CPU Limits
```yaml
deploy:
  resources:
    limits:
      cpus: '1'
```

### Storage
- Use SSD for best performance
- Avoid network storage for downloads
- Monitor `downloads` volume size

## Support & Updates

- Check for image updates: `docker-compose pull`
- Update docker-compose: `docker-compose up -d`
- Rebuild after code changes: `docker-compose build --no-cache && docker-compose up -d`
