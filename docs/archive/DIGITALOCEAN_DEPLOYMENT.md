# 🌊 Deploy Colabora to DigitalOcean App Platform

**DigitalOcean App Platform** is the best non-AWS alternative for Colabora - simple, affordable, and reliable.

## Why DigitalOcean?

✅ **No AWS infrastructure** - Runs on DigitalOcean's own cloud
✅ **Simple pricing** - $5/month minimum, pay for what you use
✅ **Managed databases** - PostgreSQL/MySQL available if needed
✅ **Auto-scaling** - Handles multiple collaborative users
✅ **Global CDN** - Fast worldwide performance

## Quick Deploy (5 minutes)

### 1. Create DigitalOcean Account
- Go to [digitalocean.com](https://digitalocean.com)
- Sign up (they often have $100+ credits for new users)

### 2. Create App Platform App
1. Click **"Create"** → **"Apps"**
2. Choose **"GitHub"** as source
3. Connect your GitHub account and select your Colabora repository
4. Click **"Next"**

### 3. Configure App Settings
```
Service Name: colabora-app (or your choice)
Source Directory: / (root directory)
Environment: Node.js

Build Command: npm run build
Run Command: npm start
```

### 4. Set Environment Variables
```
NODE_ENV = production
SESSION_SECRET = your-super-secure-random-session-secret-here
```

### 5. Choose Resources & Deploy
- **Plan**: Basic ($5/month) or Pro ($12/month)
- **Region**: Choose closest to your users
- Click **"Create Resources"**

## Demo Users
Test with these accounts:
- Alice Johnson (alice@example.com)
- Bob Smith (bob@example.com)
- Charlie Brown (charlie@example.com)
- Diana Prince (diana@example.com)

## What Works Perfectly
✅ Full collaborative features
✅ Real-time document editing
✅ Proposal voting system (75% approval)
✅ SQLite database
✅ Multiple simultaneous users
✅ Activity feeds and profiles

## Database Options
- **SQLite**: Works out-of-the-box (file-based)
- **PostgreSQL**: $7/month managed database (optional upgrade)
- **MySQL**: Also available if preferred

## Scaling
- **Automatic scaling**: Handles traffic spikes
- **Global CDN**: Fast worldwide delivery
- **Resource monitoring**: Built-in metrics

## Cost Breakdown
- **App Platform**: $5/month minimum
- **Bandwidth**: First 1GB free, then $0.02/GB
- **Database**: Optional ($7/month for PostgreSQL)

## Custom Domain (Optional)
1. Go to app settings
2. Add your domain in "Domains" section
3. Update DNS records as instructed

**That's it!** Your collaborative app is live on DigitalOcean. 🎉

**URL format**: `https://colabora-app-abcde.ondigitalocean.app`

## Troubleshooting
- **Build fails**: Check app logs in DigitalOcean dashboard
- **App won't start**: Verify environment variables
- **Database issues**: SQLite initializes automatically

**Perfect for collaborative testing without AWS!** 🚀

