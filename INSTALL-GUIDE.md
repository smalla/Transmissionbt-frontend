# Files to copy to Debian server

## Essential Files Only (no node_modules):

```
Downloader/
├── backend/
│   ├── src/                    # All source files
│   ├── package.json            # Dependencies list
│   └── .env.example            # Config template
├── frontend/
│   ├── src/                    # All source files
│   ├── public/                 # Static assets (if any)
│   ├── index.html
│   ├── package.json            # Dependencies list
│   ├── vite.config.js
│   ├── .env.example
│   └── eslint.config.js (if exists)
├── install-debian.sh
└── README.md (optional)
```

## Windows PowerShell Command:

```powershell
# Create tarball with source only (excludes node_modules, data, etc.)
tar -czf transmission-frontend.tar.gz `
  --exclude='node_modules' `
  --exclude='dist' `
  --exclude='build' `
  --exclude='data' `
  --exclude='uploads' `
  --exclude='.env' `
  --exclude='_bmad' `
  --exclude='_bmad-output' `
  --exclude='.git' `
  backend/ frontend/ install-debian.sh README.md
```

This creates a ~100KB archive instead of 100MB+

The install script already runs `npm install` on the server, so node_modules will be installed fresh there.
