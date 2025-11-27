# 🚀 How to Start the Server

## **Current Status**

The server **should be running** if you started it earlier with `npm run dev` or `npm run dev:full`.

---

## **Quick Check**

### **Is it running?**

Open your browser and go to:
- **Frontend:** http://localhost:3001 (or check your terminal for the Vite port)
- **Backend API:** http://localhost:3000/api/health/ready

If you see a response, it's running! ✅

---

## **If Server is NOT Running**

### **Option 1: Start Both Frontend & Backend (Recommended)**

```bash
npm run dev:full
```

This starts:
- ✅ Backend server on port 3000
- ✅ Frontend dev server (usually port 3001)

**Keep this terminal open!**

---

### **Option 2: Start Separately**

**Terminal 1 - Backend:**
```bash
npm run dev
```

**Terminal 2 - Frontend:**
```bash
npm run dev:frontend
```

---

## **What You Should See**

### **When Server Starts Successfully:**

```
✅ Database schema initialized
✅ Demo users created
✅ Database fully initialized
Server running on port 3000
```

### **Frontend Should Show:**
```
VITE v5.x.x  ready in xxx ms

➜  Local:   http://localhost:3001/
➜  Network: use --host to expose
```

---

## **After Starting**

1. **Open browser:** http://localhost:3001
2. **Login with:**
   - Email: `alice@example.com`
   - Password: `SecurePass123!`

---

## **Troubleshooting**

### **Port Already in Use?**
```bash
# Kill process on port 3000
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### **Database Errors?**
The database should auto-create. If you see errors:
```bash
# Delete old database (will recreate)
rm server/colabora.db
npm run dev
```

---

## **Quick Commands**

| Command | What It Does |
|---------|--------------|
| `npm run dev:full` | Start both frontend & backend |
| `npm run dev` | Start backend only |
| `npm run dev:frontend` | Start frontend only |
| `npm start` | Start production server |

---

**The server needs to be running for the app to work!** 🚀

