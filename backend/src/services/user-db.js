import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { getDatabase, initDatabase } from '../db/init.js';

const SALT_ROUNDS = 10;

class UserDB {
  constructor() {
    this.db = initDatabase();
    this.ensureAdminUser();
  }

  async ensureAdminUser() {
    const admin = this.getUser('admin');
    if (!admin) {
      // Generate cryptographically secure random password
      const randomPassword = crypto.randomBytes(16).toString('hex');
      await this.createUser('admin', randomPassword, null, true, true);
      console.log('\n' + '='.repeat(80));
      console.log('🔐 ADMIN USER CREATED');
      console.log('   Username: admin');
      console.log(`   Password: ${randomPassword}`);
      console.log('   ⚠️  SAVE THIS PASSWORD - IT WILL NOT BE SHOWN AGAIN!');
      console.log('   Change password immediately after first login.');
      console.log('='.repeat(80) + '\n');
    }
  }

  async createUser(username, password, email = null, isAdmin = false, forcePasswordChange = false) {
    // Check if username already exists
    const existing = this.db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      throw new Error('Username already exists');
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    
    const result = this.db.prepare(`
      INSERT INTO users (username, password_hash, is_admin, force_password_change)
      VALUES (?, ?, ?, ?)
    `).run(username, hashedPassword, isAdmin ? 1 : 0, forcePasswordChange ? 1 : 0);
    
    return this.getUserById(result.lastInsertRowid);
  }

  getUser(username) {
    const user = this.db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) return null;
    
    // Convert INTEGER to boolean
    user.is_admin = !!user.is_admin;
    user.force_password_change = !!user.force_password_change;
    
    return user;
  }

  getUserById(id) {
    const user = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user) return null;
    
    user.is_admin = !!user.is_admin;
    user.force_password_change = !!user.force_password_change;
    
    return user;
  }

  getAllUsers() {
    const users = this.db.prepare(`
      SELECT 
        id, 
        username, 
        is_admin, 
        force_password_change,
        ftp_password IS NOT NULL as ftp_enabled,
        created_at, 
        updated_at 
      FROM users
    `).all();
    
    return users.map(user => ({
      ...user,
      is_admin: !!user.is_admin,
      force_password_change: !!user.force_password_change,
      ftp_enabled: !!user.ftp_enabled
    }));
  }

  async updateUser(id, updates) {
    const user = this.getUserById(id);
    if (!user) {
      throw new Error('User not found');
    }

    const fieldsToUpdate = [];
    const values = [];

    if (updates.username) {
      // Check if new username already exists (excluding current user)
      const existing = this.db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(updates.username, id);
      if (existing) {
        throw new Error('Username already exists');
      }
      fieldsToUpdate.push('username = ?');
      values.push(updates.username);
    }

    if (updates.is_admin !== undefined) {
      fieldsToUpdate.push('is_admin = ?');
      values.push(updates.is_admin ? 1 : 0);
    }

    if (updates.password) {
      const hashedPassword = await bcrypt.hash(updates.password, SALT_ROUNDS);
      fieldsToUpdate.push('password_hash = ?');
      values.push(hashedPassword);
      fieldsToUpdate.push('force_password_change = ?');
      values.push(0); // Clear flag when password is changed
    }

    if (fieldsToUpdate.length > 0) {
      fieldsToUpdate.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);
      
      const sql = `UPDATE users SET ${fieldsToUpdate.join(', ')} WHERE id = ?`;
      this.db.prepare(sql).run(...values);
    }

    return this.getUserById(id);
  }

  deleteUser(id) {
    const result = this.db.prepare('DELETE FROM users WHERE id = ?').run(id);
    if (result.changes === 0) {
      throw new Error('User not found');
    }
    return true;
  }

  async verifyPassword(username, password) {
    const user = this.getUser(username);
    if (!user) {
      return null;
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return null;
    }

    // Return user without password
    const { password_hash, ftp_password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  // FTP password management (crypt/MD5 format for ProFTPD)
  async setFtpPassword(userId, password) {
    if (!password) {
      // Clear FTP password
      this.db.prepare('UPDATE users SET ftp_password = NULL WHERE id = ?').run(userId);
      return;
    }

    // Generate MD5-crypt hash for ProFTPD compatibility
    // Using bcrypt instead for better security - ProFTPD supports bcrypt via mod_auth_unix
    try {
      const ftpHash = await bcrypt.hash(password, SALT_ROUNDS);
      
      this.db.prepare('UPDATE users SET ftp_password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(ftpHash, userId);
    } catch (err) {
      throw new Error(`Failed to generate FTP password hash: ${err.message}`);
    }
  }

  // Check if user has FTP access enabled
  hasFtpAccess(userId) {
    const user = this.getUserById(userId);
    return user && user.ftp_password !== null;
  }
}

// Singleton instance
const userDB = new UserDB();
export default userDB;
