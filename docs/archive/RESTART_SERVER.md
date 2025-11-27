# 🔄 How to Restart the Local Server

## **Quick Steps**

### **Step 1: Stop the Server**

In the terminal where the server is running:
- Press `Ctrl + C` (Windows/Linux)
- Or `Cmd + C` (Mac)

This will stop the server.

---

### **Step 2: Start the Server Again**

Choose one of these options:

#### **Option A: Start Both Frontend & Backend (Recommended)**
```bash
npm run dev:full
```

#### **Option B: Start Backend Only**
```bash
npm run dev
```

#### **Option C: Start Frontend Only** (if backend is already running)
```bash
npm run dev:frontend
```

---

## **What You Should See**

When the server starts successfully, you should see:
```
✅ Database schema initialized
✅ Demo users created
✅ Database fully initialized
🚀 Server successfully started on 0.0.0.0:3000
```

---

## **After Restart**

1. **Wait for the server to start** (usually 2-5 seconds)
2. **Refresh your browser** (or open http://localhost:3001)
3. **Try logging in** with:
   - Email: `alice@example.com`
   - Password: `SecurePass123!`

---

## **Troubleshooting**

### **If Server Won't Stop:**
- Press `Ctrl + C` multiple times
- Or close the terminal window and open a new one

### **If Port is Still in Use:**
```bash
# Windows PowerShell
netstat -ano | findstr :3000
taskkill /PID <PID_NUMBER> /F
```

### **If Database Errors:**
The database was just fixed, so you shouldn't see errors. If you do:
```bash
# Verify database is fixed
node scripts/fix-root-database.js
```

---

**That's it! Just Ctrl+C to stop, then `npm run dev:full` to start again.** 🚀

