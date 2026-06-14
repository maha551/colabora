# 🧪 Testing Guide - What Should Work Now

**Date:** 2025-01-27  
**Status:** Phase 1 & 2 Complete - Ready for Testing

---

## ✅ **What's Fixed & Should Work**

### **Phase 1: Critical Stability**

#### 1. Database Error Handling ✅
**What Changed:**
- App now fails fast if database initialization fails
- No more silent failures - app will exit with error message

**How to Test:**
- App should start normally if database is available
- If database file is corrupted/missing, app should exit with clear error

**Expected Behavior:**
- ✅ App starts successfully with valid database
- ✅ App exits immediately with error if database fails (no hanging)

---

#### 2. Email Notification TODOs Removed ✅
**What Changed:**
- Removed all TODO comments about email notifications
- Kept console.log statements for now

**How to Test:**
- Check server logs - should see notification messages but no TODOs
- No functional change expected (emails still not sent, as requested)

---

### **Phase 2: Missing Features**

#### 3. Admin/Representative Role Checks ✅
**What Changed:**
- Admins can now manage any document
- Representatives can manage documents in their organization
- Document owners can manage their documents

**How to Test:**
1. **As Admin:**
   - Login as admin user
   - Try to start/finalize voting on any document (even if not owner)
   - Should work ✅

2. **As Representative:**
   - Login as organization representative
   - Create organizational document
   - Try to start/finalize voting on org document
   - Should work ✅

3. **As Regular User:**
   - Login as regular user
   - Try to start/finalize voting on document you don't own
   - Should fail with 403 error ✅

**Endpoints to Test:**
- `POST /api/documents/:id/start-voting`
- `POST /api/documents/:id/finalize-voting`

---

#### 4. Election Creation API ✅
**What Changed:**
- Frontend hook now connected to backend API
- Elections can be created by representatives

**How to Test:**
1. Login as organization representative
2. Go to Organization Management → Governance tab
3. Click "Create Election"
4. Fill in election details:
   - Title
   - Description
   - Positions Available
   - Term Months
5. Submit

**Expected Behavior:**
- ✅ Election created successfully
- ✅ Success toast message appears
- ✅ Elections list refreshes
- ✅ Only representatives can create (regular users should see error)

**API Endpoint:**
- `POST /api/governance/:organizationId/elections`

---

#### 5. Policy Votes API ✅
**What Changed:**
- Frontend hook now loads policy votes from backend
- Policy votes display in organization management

**How to Test:**
1. Login as organization representative
2. Go to Organization Management
3. Navigate to section showing policy votes
4. Policy votes should load from database

**Expected Behavior:**
- ✅ Policy votes load and display
- ✅ No "Failed to load policy votes" errors
- ✅ Empty state if no policy votes exist

**API Endpoint:**
- `GET /api/governance/:organizationId/policy-votes`

---

#### 6. Average Decision Time Calculation ✅
**What Changed:**
- Analytics now calculate real average decision time
- Based on completed voting sessions

**How to Test:**
1. Login as organization member/representative
2. Go to Organization Management → Analytics tab
3. Check "Average Decision Time" metric

**Expected Behavior:**
- ✅ Shows real hours (not 0) if there are completed sessions
- ✅ Calculates from `voting_starts_at` to `completed_at`
- ✅ Rounded to 1 decimal place

**API Endpoint:**
- `GET /api/governance/:organizationId/analytics`

---

#### 7. Agreed View Fixed ✅
**What Changed:**
- Shows proposal with **most votes above threshold**
- If multiple proposals have same votes, shows **most recent**
- Backend selects winning proposal correctly
- Frontend sorts by approval percentage, then date

**How to Test:**
1. Create a document
2. Add multiple proposals to a paragraph
3. Vote on proposals (get some above threshold)
4. Go to "Agreed" tab

**Expected Behavior:**
- ✅ Shows paragraphs with approved proposals
- ✅ Shows the proposal with most votes (above threshold)
- ✅ If votes are equal, shows most recent
- ✅ Displays approval percentage
- ✅ No "No Approved Content Yet" when proposals are approved

**Test Scenario:**
1. Create paragraph proposal A (gets 80% approval)
2. Create paragraph proposal B (gets 85% approval) 
3. Agreed View should show proposal B (higher approval)

**Or:**
1. Create proposal A (gets 80% approval, created first)
2. Create proposal B (gets 80% approval, created second)
3. Agreed View should show proposal B (same approval, but more recent)

---

## 🚀 **How to Test Locally**

### **Step 1: Start the Server**

```bash
# Terminal 1: Start backend
npm run dev

# OR start both frontend and backend:
npm run dev:full
```

**Expected Output:**
- Server starts on port 3000
- Database initializes successfully
- No errors about missing database

---

### **Step 2: Start Frontend (if not using dev:full)**

```bash
# Terminal 2: Start frontend
npm run dev:frontend
```

**Expected Output:**
- Frontend starts on port 3001 (or configured port)
- Vite dev server running

---

### **Step 3: Access the App**

Open browser: `http://localhost:3001` (or configured frontend port)

---

### **Step 4: Test Each Feature**

#### **Test 1: Database Error Handling**
- ✅ App should start normally
- ✅ Check server logs for "Database initialized successfully"

#### **Test 2: Admin Role Checks**
1. Login as admin (or create admin: `npm run setup-admin`)
2. Create or open any document
3. Try to start voting (even if not owner)
4. Should work ✅

#### **Test 3: Representative Role Checks**
1. Create organization (as admin)
2. Add yourself as representative
3. Create organizational document
4. Try to start/finalize voting
5. Should work ✅

#### **Test 4: Election Creation**
1. Login as representative
2. Go to Organization → Governance
3. Create election
4. Should succeed and refresh list ✅

#### **Test 5: Policy Votes**
1. Login as representative
2. Go to Organization Management
3. Policy votes should load (may be empty) ✅

#### **Test 6: Average Decision Time**
1. Login as organization member
2. Go to Organization → Analytics
3. Check "Average Decision Time" - should show real value or 0 if no completed sessions ✅

#### **Test 7: Agreed View**
1. Create document
2. Add proposals to paragraphs
3. Vote on proposals (get above threshold)
4. Go to "Agreed" tab
5. Should show approved content ✅

---

## 🐛 **Known Issues (Not Fixed Yet)**

These are still broken and will be fixed in Phase 3:

- ❌ Organizational document workflow (paragraph cutoff, whole-document voting)
- ❌ Some console.log statements (will be replaced in Phase 4)

---

## 📊 **Quick Test Checklist**

- [ ] Server starts without errors
- [ ] Database initializes successfully
- [ ] Can login as admin
- [ ] Admin can manage any document
- [ ] Representative can manage org documents
- [ ] Can create elections (as representative)
- [ ] Policy votes load (may be empty)
- [ ] Analytics show real decision time
- [ ] Agreed View shows approved proposals correctly

---

## 🎯 **What to Look For**

### **Success Indicators:**
- ✅ No console errors
- ✅ Features work as described above
- ✅ No 403 errors when you have proper permissions
- ✅ Agreed View shows content when proposals are approved

### **Failure Indicators:**
- ❌ Server crashes on startup
- ❌ 500 errors when accessing features
- ❌ 403 errors when you should have access
- ❌ Agreed View always shows "No Approved Content Yet"

---

## 🔍 **Debugging Tips**

### **If Server Won't Start:**
```bash
# Check database file exists
ls server/colabora.db

# Check logs
npm run dev
# Look for error messages
```

### **If Features Don't Work:**
1. Check browser console for errors
2. Check server logs for errors
3. Verify you're logged in with correct role
4. Check network tab for API errors

### **If Agreed View Empty:**
1. Verify proposals have votes above threshold
2. Check paragraph has history entries
3. Verify document acceptance threshold is correct
4. Check server logs for "updateAgreedViewForParagraph" messages

---

## 📝 **Test Results Template**

After testing, note what works:

```
✅ Database error handling: [PASS/FAIL]
✅ Admin role checks: [PASS/FAIL]
✅ Representative role checks: [PASS/FAIL]
✅ Election creation: [PASS/FAIL]
✅ Policy votes loading: [PASS/FAIL]
✅ Average decision time: [PASS/FAIL]
✅ Agreed View: [PASS/FAIL]
```

---

**Ready to test! Start with `npm run dev:full` and work through the checklist above.**

