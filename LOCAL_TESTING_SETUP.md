# 🚀 Local Testing Setup Guide

**Last Updated:** 2025-01-27  
**Status:** Ready for Local Development

---

## ✅ Prerequisites

- Node.js (v18 or higher recommended)
- npm (comes with Node.js)
- Git (for cloning the repository)

---

## 📋 Quick Start (5 minutes)

### Step 1: Install Dependencies

```bash
# Install root dependencies
npm install

# Install client dependencies
cd client
npm install
cd ..
```

### Step 2: Configure Environment

The `.env` file should already exist. If not, create it:

```bash
# Copy the example file
cp env.example .env
```

**Important:** The `.env` file is already configured with:
- ✅ Auto-generated secure secrets (if not set)
- ✅ Development database path
- ✅ Local frontend URL (http://localhost:3001)
- ✅ Development mode settings

**No manual configuration needed for basic local testing!**

### Step 3: Start the Application

```bash
# Start both frontend and backend together (recommended)
npm run dev:full
```

**OR** start them separately:

```bash
# Terminal 1: Backend
npm run dev

# Terminal 2: Frontend
npm run dev:frontend
```

### Step 4: Access the Application

- **Frontend:** http://localhost:3001
- **Backend API:** http://localhost:3000
- **Health Check:** http://localhost:3000/api/health/ready

---

## 🎯 What to Expect

### When Server Starts Successfully:

```
✅ Database schema initialized
✅ Demo users created
✅ Database fully initialized
Server running on port 3000
```

### When Frontend Starts:

```
VITE v6.x.x  ready in xxx ms

➜  Local:   http://localhost:3001/
➜  Network: use --host to expose
```

---

## 🔑 Demo User Credentials

The application automatically creates demo users. You can login with:

| Email | Password | Role |
|-------|----------|------|
| `alice@example.com` | `SecurePass123!` | Regular User |
| `bob@example.com` | `SecurePass123!` | Regular User |
| `admin@example.com` | `SecurePass123!` | Admin |

**Note:** If you need to reset or create admin users:

```bash
npm run setup-admin
```

---

## 🧪 Testing Checklist

### Basic Functionality Tests:

- [ ] **Login** - Can login with demo credentials
- [ ] **Document Creation** - Can create a new document
- [ ] **Document Editing** - Can edit document paragraphs
- [ ] **Proposals** - Can create proposals for paragraphs
- [ ] **Voting** - Can vote on proposals (PRO/NEUTRAL/CONTRA)
- [ ] **Comments** - Can add comments to proposals
- [ ] **Activity Feed** - Can view activity feed
- [ ] **Profile** - Can view and edit profile

### Advanced Features:

- [ ] **Organizations** - Can create and manage organizations
- [ ] **Agreed View** - Can view approved content
- [ ] **WebSocket Updates** - Real-time updates work for votes
- [ ] **Admin Dashboard** - Admin features accessible

---

## 🛠️ Troubleshooting

### Port Already in Use

**Windows:**
```powershell
# Find process using port 3000
netstat -ano | findstr :3000

# Kill the process (replace PID with actual process ID)
taskkill /PID <PID> /F
```

**Mac/Linux:**
```bash
# Find process using port 3000
lsof -ti:3000

# Kill the process
kill -9 $(lsof -ti:3000)
```

### Database Errors

If you see database errors:

```bash
# Delete the database (it will be recreated automatically)
rm colabora.db
# Or on Windows:
del colabora.db

# Restart the server
npm run dev
```

### Frontend Not Connecting to Backend

1. **Check backend is running:**
   ```bash
   curl http://localhost:3000/api/health/ready
   ```

2. **Check CORS configuration:**
   - Verify `FRONTEND_URL` in `.env` matches frontend port
   - Default: `http://localhost:3001`

3. **Check browser console:**
   - Look for CORS errors
   - Check network tab for failed requests

### Dependencies Issues

```bash
# Clean install
rm -rf node_modules package-lock.json
npm install

# Client dependencies
cd client
rm -rf node_modules package-lock.json
npm install
cd ..
```

---

## 📝 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev:full` | Start both frontend and backend |
| `npm run dev` | Start backend only |
| `npm run dev:frontend` | Start frontend only |
| `npm start` | Start production server |
| `npm run build` | Build for production |
| `npm test` | Run tests |
| `npm run setup-admin` | Create/reset admin user |
| `npm run validate-env` | Validate environment variables |

---

## 🗄️ Database Management

### Database Location

- **Development:** `./colabora.db` (project root)
- **Auto-created:** Database is automatically created on first run
- **Auto-migrated:** Schema is automatically applied
- **Demo data:** Demo users are automatically created

### Reset Database

```bash
# Delete database file
rm colabora.db  # or del colabora.db on Windows

# Restart server (database will be recreated)
npm run dev
```

### Database Backup

```bash
# Create backup
cp colabora.db colabora.db.backup

# Restore backup
cp colabora.db.backup colabora.db
```

---

## 🔒 Security Notes

### Development Mode

- ✅ Auto-generated secrets (safe for local development)
- ✅ HTTP (not HTTPS) - fine for local testing
- ✅ CORS enabled for localhost
- ✅ Detailed error messages enabled

### Production Considerations

- ⚠️ Set strong `SESSION_SECRET` and `JWT_SECRET`
- ⚠️ Use HTTPS
- ⚠️ Configure proper CORS origins
- ⚠️ Set `NODE_ENV=production`
- ⚠️ Use secure database (PostgreSQL recommended)

---

## 📚 Additional Resources

- **Codebase Summary:** `docs/active/CODEBASE_SUMMARY.md`
- **Testing Guide:** `docs/active/TESTING_GUIDE.md`
- **Usage Guide:** `docs/active/USAGE_GUIDE.md`
- **Architecture:** `docs/ARCHITECTURE.md`
- **Quick Start:** `QUICK_START.md`

---

## ✅ Verification

After setup, verify everything works:

1. **Backend Health Check:**
   ```bash
   curl http://localhost:3000/api/health/ready
   ```
   Should return: `{"status":"ready","database":true,...}`

2. **Frontend Loads:**
   - Open http://localhost:3001
   - Should see login page

3. **Can Login:**
   - Use demo credentials
   - Should see document dashboard

4. **Database Works:**
   - Create a document
   - Should save successfully

---

## 🎉 You're Ready!

Everything should be set up for local testing. If you encounter any issues, check the troubleshooting section above or review the error logs.

**Happy Testing!** 🚀

