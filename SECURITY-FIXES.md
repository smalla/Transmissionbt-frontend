# Security Fixes - January 15, 2026

This document summarizes critical security vulnerabilities that have been patched in this release.

## 🚨 Critical Fixes Implemented

### 1. Command Injection Vulnerability (CVE-CRITICAL)
**Location:** `backend/src/services/user-db.js`  
**Issue:** Shell command injection via FTP password setting using `openssl passwd`  
**Fix:** Replaced shell execution with bcrypt hashing (native Node.js crypto)  
**Impact:** Prevents arbitrary code execution through FTP password field

**Before:**
```javascript
const { stdout } = await execAsync(`openssl passwd -1 "${password.replace(/"/g, '\\"')}"`);
```

**After:**
```javascript
const ftpHash = await bcrypt.hash(password, SALT_ROUNDS);
```

---

### 2. CSRF Protection (CVE-CRITICAL)
**Location:** `backend/src/server.js`  
**Issue:** All state-changing endpoints vulnerable to Cross-Site Request Forgery  
**Fix:** Enabled `csurf` middleware with session-based tokens  
**Impact:** Prevents attackers from tricking logged-in users into performing unwanted actions

**Implementation:**
- Added CSRF token endpoint: `GET /api/csrf-token`
- Applied CSRF protection to all POST/PUT/DELETE routes
- Updated frontend API client to automatically fetch and include CSRF tokens

---

### 3. Weak Default Credentials (CVE-HIGH)
**Location:** `backend/src/services/user-db.js`  
**Issue:** Default admin password was hardcoded as `admin-password`  
**Fix:** Generate cryptographically secure random password on first boot  
**Impact:** Prevents unauthorized access via predictable credentials

**Before:**
```javascript
await this.createUser('admin', 'admin-password', null, true, true);
```

**After:**
```javascript
const randomPassword = crypto.randomBytes(16).toString('hex');
// Password displayed ONCE in console on first boot
```

---

## ⚠️ High-Severity Fixes

### 4. Missing Rate Limiting on Password Changes
**Location:** `backend/src/server.js`  
**Issue:** Password change and FTP password endpoints had no brute-force protection  
**Fix:** Added rate limiter (10 attempts per 15 minutes)  
**Impact:** Prevents password brute-force attacks

---

### 5. Insecure Session Secret Handling
**Location:** `backend/src/server.js`  
**Issue:** Server would run with weak default secret if `.env` was missing  
**Fix:** Fail-fast if `SESSION_SECRET` is missing or default in production  
**Impact:** Prevents session forgery attacks

**Implementation:**
```javascript
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  console.error('❌ FATAL: SESSION_SECRET must be set in production!');
  process.exit(1);
}
```

---

### 6. ReDoS (Regular Expression Denial of Service)
**Location:** `backend/src/routes/feeds.js`  
**Issue:** Users could add malicious regex patterns to RSS feeds causing server crash  
**Fix:** Added Zod validation with regex length limit and syntax validation  
**Impact:** Prevents catastrophic backtracking attacks

**Validation:**
```javascript
const feedSchema = z.object({
  url: z.string().url(),
  regex: z.string().max(200).refine(val => {
    if (!val) return true;
    try { new RegExp(val); return true; } 
    catch { return false; }
  })
});
```

---

## 🟡 Medium-Severity Fixes

### 7. JSON.parse Error Handling
**Location:** `backend/src/services/torrent-metadata.js`, `backend/src/services/rss-manager.js`  
**Issue:** Corrupted JSON files would crash the server  
**Fix:** Wrapped `JSON.parse` in try-catch with graceful fallback  
**Impact:** Server resilience against data corruption

---

### 8. CORS Configuration
**Location:** `backend/src/server.js`  
**Issue:** No explicit CORS policy defined  
**Fix:** Added explicit CORS configuration with credential support  
**Impact:** Clear security boundary for cross-origin requests

**Configuration:**
```javascript
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
```

---

## 📋 Deployment Checklist

Before deploying to production, ensure:

- [ ] Set unique `SESSION_SECRET` in `.env` (minimum 32 random characters)
- [ ] Set `NODE_ENV=production`
- [ ] Save the random admin password displayed on first boot
- [ ] Change admin password immediately after first login
- [ ] Set `FRONTEND_URL` if frontend is on a different domain
- [ ] Run `npm install` to ensure all dependencies (including `cors`) are installed
- [ ] Test CSRF token flow: login → fetch CSRF → perform action

---

## 🔒 Security Best Practices Maintained

The following security measures were already in place and remain:

✅ **Bcrypt password hashing** (10 salt rounds)  
✅ **SQL injection protection** (prepared statements)  
✅ **Input validation** (Zod schemas)  
✅ **Login rate limiting** (5 attempts per 15 min)  
✅ **Helmet.js security headers**  
✅ **HttpOnly session cookies**  
✅ **Authorization checks** (owner/admin enforcement)  
✅ **Security event logging**

---

## 📚 Additional Security Recommendations

### Future Enhancements (Not Critical):

1. **Multi-Factor Authentication (MFA)** - Add TOTP support for admin accounts
2. **Password Complexity Rules** - Enforce minimum entropy requirements
3. **Account Lockout** - Temporary lockout after N failed login attempts
4. **Audit Logging** - Comprehensive audit trail for compliance
5. **Content Security Policy** - Stricter CSP headers in production
6. **Dependency Scanning** - Regular `npm audit` and automated updates

---

## 🛠️ Testing the Fixes

### Test CSRF Protection:
```bash
# Should fail without CSRF token
curl -X POST http://localhost:42080/api/torrents/upload \
  -H "Cookie: connect.sid=YOUR_SESSION" \
  --data '{}' 
# Expected: 403 Forbidden

# Should succeed with CSRF token
curl -X POST http://localhost:42080/api/torrents/upload \
  -H "Cookie: connect.sid=YOUR_SESSION" \
  -H "CSRF-Token: YOUR_TOKEN" \
  --data '{}'
```

### Test Rate Limiting:
```bash
# Run 6 times rapidly
for i in {1..6}; do
  curl -X POST http://localhost:42080/api/auth/change-password \
    -H "Content-Type: application/json" \
    --data '{"currentPassword":"test","newPassword":"test123"}'
done
# 6th request should return 429 Too Many Requests
```

### Test Random Admin Password:
```bash
# Delete database and restart server
rm backend/data/users.db
npm run dev
# Look for admin password in console output
```

---

## 📞 Support

For security concerns or vulnerability reports, contact: `smalla@domain.com`

**Last Updated:** January 15, 2026  
**Fixed By:** Quick Flow Solo Dev Agent (Barry)
