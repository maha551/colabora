# 🗄️ Creating Fly.io Volumes via Web Interface

**Complete guide to create persistent volumes for Colabora's database when deploying via web interface.**

---

## 🎯 **Why You Need Volumes**

- **Database Persistence**: Keep SQLite database between deployments
- **Data Survival**: Documents and paragraphs won't disappear on redeploy
- **Fly.io Requirement**: Containers wipe data on restart without volumes

---

## 📋 **Method 1: Create Volume First (Recommended)**

### **Step 1: Install Fly CLI**
```bash
# Download and install
curl -L https://fly.io/install.sh | sh

# Verify installation
fly version
```

### **Step 2: Login to Fly.io**
```bash
fly auth login
```

### **Step 3: Create Volume**
```bash
# Create 1GB volume in Los Angeles region
fly volumes create colabora_data --size 1 --region lax

# Verify creation
fly volumes list
```

### **Step 4: Deploy via Web Interface**
1. Go to [fly.io](https://fly.io) → "New App"
2. Connect your GitHub repository
3. Deploy (volume auto-mounts to `/data`)

---

## 🌐 **Method 2: Web Interface Only**

### **Step 1: Deploy App First**
1. Go to [fly.io](https://fly.io)
2. Click **"Launch an app"**
3. Choose **"Connect from GitHub"**
4. Select your Colabora repository
5. Click **"Deploy"**
6. Wait for deployment to complete

### **Step 2: Access App Dashboard**
- Go to your deployed app in Fly.io dashboard
- Click on your app name

### **Step 3: Create Volume**
1. In app dashboard, click **"Volumes"** tab
2. Click **"Create volume"** button
3. Fill in details:
   - **Name**: `colabora_data`
   - **Size**: `1` (GB)
   - **Region**: Select same region as your app (usually `lax`)
4. Click **"Create volume"**

### **Step 4: Redeploy to Mount Volume**
1. Go back to **"Deployments"** tab
2. Click **"Deploy latest commit"** or **"Redeploy"**
3. Fly.io will restart with volume mounted
4. Volume mounts at `/data` automatically

### **Step 5: Verify Volume Works**
```bash
# Check if volume is attached
fly volumes list

# Check app logs for database initialization
fly logs -a your-app-name
```

---

## 🔧 **Method 3: CLI Deploy Script (Easiest)**

```bash
# One command does everything
npm run deploy:fly
```

**Script automatically:**
- Creates Fly CLI account
- Creates persistent volume
- Deploys app with volume mounted

---

## ✅ **Verification Steps**

### **Check Volume Creation**
```bash
fly volumes list
```
Should show: `colabora_data` with size `1GB`

### **Check App Logs**
```bash
fly logs
```
Should show: `Connected to SQLite database.` (no errors)

### **Test Database Persistence**
1. Create a document
2. Add some paragraphs
3. Redeploy app
4. Check if data still exists

---

## 🚨 **Troubleshooting**

### **Volume Not Attaching**
- Check region matches app region
- Try redeploying after volume creation
- Check `fly volumes list` for volume status

### **Database Errors**
- Check `/data` directory permissions
- Verify volume size (1GB minimum)
- Check app logs for SQLite errors

### **Deployment Fails**
- Ensure volume name matches: `colabora_data`
- Check mount point: `/data`
- Try CLI deployment: `fly deploy`

---

## 💰 **Cost & Limits**

- **Free Tier**: 3GB total volume space
- **Volume Cost**: $0.15/GB/month
- **1GB Volume**: ~$0.15/month
- **Included**: Basic usage in free tier

---

## 🎯 **Quick Reference**

**For web interface deployment:**

1. **Deploy app first** → Web interface
2. **Create volume** → App dashboard → Volumes tab
3. **Redeploy** → Volume mounts automatically
4. **Test persistence** → Data survives redeploys

**For CLI deployment:**
```bash
npm run deploy:fly  # Does everything automatically
```

---

## 📞 **Need Help?**

**Check these commands:**
```bash
# List volumes
fly volumes list

# Check app status
fly status

# View logs
fly logs

# SSH into app
fly ssh console
```

**Volume issues?** Delete and recreate volume if needed:
```bash
fly volumes delete colabora_data
fly volumes create colabora_data --size 1 --region lax
```

**Your database will now persist between deployments!** 🎉
