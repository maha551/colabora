# 🚀 Quick Test Steps

## ✅ **Those Console Errors Are Normal!**

The errors you see are **expected behavior** when not logged in:
- `API Request to /api/auth/me, token: none` - App checking if you're logged in
- `AuthError: Not authenticated` - Normal when no token exists
- `background.js` error - Chrome extension issue, ignore it

**These will disappear once you log in!**

---

## 🔐 **Step 1: Login**

### **Option A: Use Demo Users (Easiest)**

On the login page, you should see demo user buttons. Click one:

- **Alice Johnson** - `alice@example.com` / `SecurePass123!`
- **Bob Smith** - `bob@example.com` / `SecurePass123!`
- **Charlie Brown** - `charlie@example.com` / `SecurePass123!`
- **Diana Prince** - `diana@example.com` / `SecurePass123!`

### **Option B: Manual Login**

1. Enter email: `alice@example.com`
2. Enter password: `SecurePass123!`
3. Click "Login"

### **Option C: Create Admin User (For Admin Testing)**

```bash
npm run setup-admin
```

Then login as:
- Email: `admin@colabora.local`
- Password: `AdminSecurePass123!`

---

## ✅ **Step 2: Test Fixed Features**

### **Test 1: Agreed View** ⭐ **Easiest to Test**

1. **Create a document** (or open existing)
2. **Add a paragraph** with some text
3. **Create a proposal** to change the paragraph
4. **Vote on the proposal** - get it above 75% approval
   - You may need multiple users or adjust threshold
5. **Go to "Agreed" tab**
6. **Should see:** The approved proposal content ✅

**Expected:** Agreed View shows the proposal with most votes above threshold

---

### **Test 2: Admin/Representative Permissions**

**As Admin:**
1. Login as admin (`admin@colabora.local`)
2. Open any document (even if you didn't create it)
3. Try to **start voting** or **finalize voting**
4. **Should work** ✅ (previously would fail)

**As Representative:**
1. Create organization (as admin)
2. Add yourself as representative
3. Create organizational document
4. Try to start/finalize voting
5. **Should work** ✅

---

### **Test 3: Election Creation**

1. Login as organization representative
2. Go to **Organization Management** → **Governance** tab
3. Click **"Create Election"** button
4. Fill in:
   - Title: "Test Election"
   - Positions: 2
   - Term: 12 months
5. Submit

**Expected:**
- ✅ Election created successfully
- ✅ Success toast appears
- ✅ Elections list refreshes

---

### **Test 4: Policy Votes**

1. Login as organization representative
2. Go to **Organization Management**
3. Navigate to section showing policy votes
4. **Should see:** Policy votes load (may be empty list) ✅

**Expected:** No "Failed to load policy votes" error

---

### **Test 5: Average Decision Time**

1. Login as organization member
2. Go to **Organization Management** → **Analytics** tab
3. Check **"Average Decision Time"** metric

**Expected:**
- ✅ Shows real hours (not 0) if completed sessions exist
- ✅ Or shows 0 if no completed sessions (normal)

---

## 🐛 **If You See Real Errors**

### **Server Won't Start:**
```bash
# Check if database exists
ls server/colabora.db

# Check server logs
npm run dev
```

### **Can't Login:**
- Verify demo users exist in database
- Try creating admin: `npm run setup-admin`
- Check server logs for errors

### **Features Don't Work:**
1. Check browser console for errors (after login)
2. Check server terminal for errors
3. Verify you're logged in with correct role
4. Check network tab for API errors

---

## 📊 **Quick Success Checklist**

After logging in, you should see:
- [ ] No more "Not authenticated" errors (after login)
- [ ] Can create/view documents
- [ ] Can vote on proposals
- [ ] Agreed View shows approved content
- [ ] Admin can manage any document
- [ ] Representatives can create elections
- [ ] Policy votes load without errors

---

## 🎯 **Focus Test Areas**

**Most Important to Test:**
1. ✅ **Agreed View** - Create proposals, vote, check Agreed tab
2. ✅ **Admin Permissions** - Admin managing documents
3. ✅ **Election Creation** - Representatives creating elections

**These are the main fixes we made!**

---

**Once logged in, the console errors should stop. Focus on testing the features above!**

