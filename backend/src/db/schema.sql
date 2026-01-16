-- Users table for both web and FTP authentication
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,  -- bcrypt for web login
    ftp_password TEXT,             -- crypt/md5 for ProFTPD compatibility
    is_admin INTEGER DEFAULT 0,
    force_password_change INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create default admin user (password: admin-password)
-- bcrypt hash for 'admin-password'
INSERT OR IGNORE INTO users (id, username, password_hash, is_admin)
VALUES (1, 'admin', '$2b$10$rGHvW8Z5xKJ5YqH5YqH5YeH5YqH5YqH5YqH5YqH5YqH5YqH5YqH5Ye', 1);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_username ON users(username);

-- Links table for sharing useful URLs
CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    description TEXT,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_links_created_at ON links(created_at DESC);
