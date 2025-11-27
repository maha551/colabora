# 🔧 Troubleshooting CORS and WebSocket Issues

**Issue Date:** 2025-01-27  
**Status:** Fixed

---

## 🐛 Issues Found

### 1. **Backend Server Not Running** ⚠️
**Symptom:** CORS errors when trying to access `http://localhost:3000/api/auth/me`

**Error Message:**
```
Quellübergreifende (Cross-Origin) Anfrage blockiert: Die Gleiche-Quelle-Regel verbietet das Lesen der externen Ressource auf http://localhost:3000/api/auth/me. (Grund: CORS-Anfrage schlug fehl). Statuscode: (null).
```

**Root Cause:** The backend server is not running on port 3000.

**Solution:** Start the backend server:
```bash
# In the project root directory
npm run dev
```

Or start both frontend and backend together:
```bash
npm run dev:full
```

---

### 2. **WebSocket Connecting to Wrong Port** ⚠️
**Symptom:** WebSocket trying to connect to `ws://localhost:3001` instead of `ws://localhost:3000`

**Root Cause:** Using `process.env.NODE_ENV` in browser code. In Vite, you must use `import.meta.env` instead.

**Files Fixed:**
- ✅ `client/src/hooks/useWebSocket.ts` - Changed to use `import.meta.env.PROD`
- ✅ `client/src/hooks/useOrganizationWebSocket.ts` - Changed to use `import.meta.env.PROD`
- ✅ `client/src/lib/api.ts` - Changed to use `import.meta.env.PROD`

---

## ✅ Fixes Applied

### 1. WebSocket URL Configuration
Changed from:
```typescript
const wsUrl = process.env.NODE_ENV === 'production'
  ? window.location.origin
  : 'http://localhost:3000';
```

To:
```typescript
const wsUrl = import.meta.env.PROD
  ? window.location.origin
  : 'http://localhost:3000';
```

### 2. API Base URL Configuration
Changed from:
```typescript
const API_BASE_URL = process.env.NODE_ENV === 'production'
  ? ''
  : 'http://localhost:3000'
```

To:
```typescript
const API_BASE_URL = import.meta.env.PROD
  ? ''
  : 'http://localhost:3000'
```

---

## 🚀 How to Fix and Test

### Step 1: Start the Backend Server

**Option A: Start Both Frontend and Backend**
```bash
npm run dev:full
```

**Option B: Start Separately**
```bash
# Terminal 1: Backend
npm run dev

# Terminal 2: Frontend (if not already running)
npm run dev:frontend
```

### Step 2: Verify Backend is Running

Check if the backend is responding:
```bash
# Windows PowerShell
curl http://localhost:3000/api/health/ready

# Or open in browser
# http://localhost:3000/api/health/ready
```

**Expected Response:**
```json
{
  "status": "ready",
  "database": true,
  "timestamp": "...",
  "uptime": ...
}
```

### Step 3: Verify Frontend Can Connect

1. Open browser: http://localhost:3001
2. Check browser console - should see:
   - ✅ API requests succeeding (no CORS errors)
   - ✅ WebSocket connecting to `ws://localhost:3000` (not 3001)
   - ✅ Login working

### Step 4: Test WebSocket Connection

1. Login to the application
2. Open a document
3. Check browser console - should see:
   - ✅ "WebSocket connected" message
   - ✅ No connection errors

---

## 🔍 Verification Checklist

- [ ] Backend server running on port 3000
- [ ] Frontend can make API calls (no CORS errors)
- [ ] WebSocket connects to `ws://localhost:3000` (check Network tab)
- [ ] Login works
- [ ] Documents load
- [ ] Real-time updates work (if applicable)

---

## 📝 Notes

### Vite Environment Variables

In Vite, use:
- `import.meta.env.MODE` - Current mode (development/production)
- `import.meta.env.DEV` - Boolean, true in development
- `import.meta.env.PROD` - Boolean, true in production
- `import.meta.env.VITE_*` - Custom env variables (must be prefixed with `VITE_`)

**NOT:**
- ❌ `process.env.NODE_ENV` - Not available in browser
- ❌ `process.env.*` - Not available in browser (unless prefixed with `VITE_`)

### CORS Configuration

The backend CORS is configured to allow:
- ✅ All `localhost` origins in development
- ✅ All `127.0.0.1` origins in development
- ✅ Origins listed in `ALLOWED_ORIGINS` env variable

If you still see CORS errors:
1. Check backend is running
2. Check backend logs for CORS warnings
3. Verify `FRONTEND_URL` in `.env` matches frontend port

---

## 🎯 Expected Behavior After Fix

1. **Backend Running:**
   ```
   ✅ Database schema initialized
   ✅ Demo users created
   ✅ Database fully initialized
   Server running on port 3000
   ```

2. **Frontend Console:**
   ```
   ✅ No CORS errors
   ✅ API requests succeed
   ✅ WebSocket connects to ws://localhost:3000
   ✅ "WebSocket connected" message appears
   ```

3. **Network Tab:**
   - API requests: `http://localhost:3000/api/*` - Status 200
   - WebSocket: `ws://localhost:3000` - Status 101 (Switching Protocols)

---

## 🔗 Related Files

- `client/src/hooks/useWebSocket.ts` - Document WebSocket hook
- `client/src/hooks/useOrganizationWebSocket.ts` - Organization WebSocket hook
- `client/src/lib/api.ts` - API client configuration
- `server/modules/server.js` - CORS configuration
- `LOCAL_TESTING_SETUP.md` - Complete setup guide

---

**Last Updated:** 2025-01-27  
**Status:** ✅ Fixed - Ready for testing

