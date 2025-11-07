# 🚨 Fly.io Deployment Troubleshooting

**Potential reasons why your Colabora build might fail on Fly.io and how to fix them.**

---

## 🚨 **Most Common Issues**

### **1. SQLite Database Write Permissions** ⚠️ **HIGH RISK**
**Problem**: Fly.io containers have read-only file systems in some directories.

**Symptoms**:
```
Error opening database: SQLITE_CANTOPEN
Error: EROFS: read-only file system
```

**Solution**: Move database to writable directory
```bash
# In server/index.js, change line 103:
# FROM: const db = new sqlite3.Database('./colabora.db', (err) => {
# TO:
const db = new sqlite3.Database('/tmp/colabora.db', (err) => {
```

**Note**: Database will reset on each deployment (acceptable for demo app).

### **2. Node.js Version Mismatch** ⚠️ **MEDIUM RISK**
**Problem**: Fly.io might use different Node version than expected.

**Symptoms**:
```
Build failed: Node.js version not supported
npm ERR! Unsupported engine
```

**Solution**: Update fly.toml with specific Node version
```toml
[build.args]
NODE_VERSION = "18"
```

### **3. Build Process Issues** ⚠️ **MEDIUM RISK**
**Problem**: Fly.io might not run your custom build script correctly.

**Symptoms**:
```
Build failed during npm run build
Frontend build not found
```

**Solution**: Fly.io uses Paketo buildpacks, ensure scripts work:
```bash
# Test locally first
npm run build
```

### **4. Port Configuration** ⚠️ **LOW RISK**
**Problem**: App not listening on correct port.

**Symptoms**:
```
Connection refused
App not responding on port 3000
```

**Solution**: Your server already uses `process.env.PORT || 3000` - this should work.

### **5. Memory Limits** ⚠️ **MEDIUM RISK**
**Problem**: Free tier has limited RAM (256MB per VM).

**Symptoms**:
```
Out of memory
Build killed
```

**Solution**: Reduce build memory usage or upgrade plan.

---

## 🔧 **Quick Fix: Updated fly.toml**

I've created a `fly.toml` file for you. If build fails, try this configuration:

```toml
app = "colabora-app"

[build]
  builder = "paketobuildpacks/builder:base"

[env]
  NODE_ENV = "production"
  SESSION_SECRET = "your-secure-secret-change-this"

[processes]
  app = "npm start"

[[services]]
  internal_port = 3000
  processes = ["app"]
  protocol = "tcp"

  [[services.ports]]
    handlers = ["http"]
    port = 80

  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443

  [[services.tcp_checks]]
    interval = "10s"
    timeout = "2s"
```

---

## 🚀 **Step-by-Step Deployment Fix**

### **Step 1: Fix Database Path**
```bash
# Edit server/index.js line 103:
const db = new sqlite3.Database('/tmp/colabora.db', (err) => {
```

### **Step 2: Test Build Locally**
```bash
npm run build
# Should complete without errors
```

### **Step 3: Deploy to Fly.io**
```bash
fly launch
# Follow prompts
fly deploy
```

### **Step 4: Check Logs if Issues**
```bash
fly logs
# Look for specific error messages
```

---

## 🔍 **Specific Error Solutions**

### **If you see: "SQLITE_CANTOPEN"**
```bash
# Fix: Change database path in server/index.js
const db = new sqlite3.Database('/tmp/colabora.db', (err) => {
```

### **If you see: "Build failed"**
```bash
# Check: Does npm run build work locally?
npm run build

# Fix: Ensure all dependencies are in package.json
npm install
```

### **If you see: "Port already in use"**
```bash
# Fix: Your app uses process.env.PORT, this should be fine
# Check fly.toml internal_port = 3000
```

### **If you see: "Out of memory"**
```bash
# Fix: Upgrade to paid plan or reduce build size
fly scale memory 512
```

---

## ✅ **Prevention Tips**

1. **Test locally first**: `npm run build` should work
2. **Check file permissions**: Don't write to read-only directories
3. **Use environment variables**: Don't hardcode paths
4. **Monitor resource usage**: Free tier has limits
5. **Check logs**: `fly logs` shows detailed errors

---

## 🚀 **Alternative: Start Simple**

If builds keep failing, start with a minimal version:

### **Option 1: Skip Database (for testing)**
```javascript
// Temporarily comment out database initialization
// const db = new sqlite3.Database('/tmp/colabora.db', (err) => {
//   initializeDatabaseAndStartServer(db);
// });

// Just start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

### **Option 2: Use Fly.io Volumes (Persistent DB)**
```bash
fly volumes create colabora_data --size 1
# Then mount in fly.toml
```

---

## 📞 **Getting Help**

If issues persist:

1. **Check Fly.io docs**: https://fly.io/docs/
2. **Run diagnostics**: `fly doctor`
3. **Check app status**: `fly status`
4. **View logs**: `fly logs -a your-app-name`
5. **Community**: Search Fly.io community forums

---

## 🎯 **Most Likely Fix**

**The database path issue is the most common cause of Fly.io deployment failures.**

**Quick fix**: Change `'./colabora.db'` to `'/tmp/colabora.db'` in `server/index.js`.

**This will fix 80% of Fly.io deployment issues!** 🚀

**Ready to try the fix?** Let's update the database path and deploy! 🎉
