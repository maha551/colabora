# 🚀 Deploying Colabora to Railway

This guide will help you deploy the Colabora collaborative document editing app to Railway for online testing.

## Prerequisites

- A GitHub account
- A Railway account (free tier available at [railway.app](https://railway.app))

## Step 1: Prepare Your Codebase

1. **Push to GitHub**: Make sure your code is pushed to a GitHub repository
   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push origin main
   ```

## Step 2: Deploy to Railway

1. **Connect to Railway**:
   - Go to [railway.app](https://railway.app) and sign in
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your Colabora repository
   - Click "Deploy"

2. **Railway will automatically**:
   - Detect the Node.js app
   - Install dependencies
   - Build the frontend and backend
   - Deploy the application

## Step 3: Configure Environment Variables

In your Railway project dashboard:

1. Go to "Variables" tab
2. Add these environment variables:

```
NODE_ENV=production
SESSION_SECRET=your-super-secure-random-session-secret-here-make-it-long
```

> **Important**: Generate a secure SESSION_SECRET. You can use: `openssl rand -base64 32`

## Step 4: Set Up Custom Domain (Optional)

If you want a custom domain:
1. Go to "Settings" → "Domains"
2. Add your custom domain
3. Update DNS records as instructed

## Step 5: Test the Deployment

1. **Get your Railway URL**: In the Railway dashboard, find your app's URL (something like `https://colabora-app.up.railway.app`)

2. **Test the app**:
   - Visit the URL in your browser
   - Try logging in with demo users:
     - Alice Johnson (alice@example.com)
     - Bob Smith (bob@example.com)
     - Charlie Brown (charlie@example.com)
     - Diana Prince (diana@example.com)

3. **Test collaboration**:
   - Open the app in multiple browser tabs/windows
   - Login with different demo users
   - Create or edit documents together
   - Make proposals, vote, and comment

## Demo User Credentials

The app comes with 4 pre-configured demo users:

| Name | Email | Token Format |
|------|-------|-------------|
| Alice Johnson | alice@example.com | demo-token-cmgxlfj9z0000orjgnfy3revt |
| Bob Smith | bob@example.com | demo-token-cmgxlfj9z0000orjgnfy3revu |
| Charlie Brown | charlie@example.com | demo-token-cmgxlfj9z0000orjgnfy3revv |
| Diana Prince | diana@example.com | demo-token-cmgxlfj9z0000orjgnfy3revw |

## Features to Test

✅ **Document Creation**: Create new collaborative documents
✅ **Real-time Collaboration**: Multiple users editing simultaneously
✅ **Proposal System**: Suggest changes that need approval
✅ **Voting**: PRO/NEUTRAL/CONTRA votes (75% approval needed)
✅ **Comments**: Threaded discussions on proposals
✅ **Activity Feed**: Track all activities in real-time
✅ **User Profiles**: Customize avatars and bios
✅ **Collaborator Management**: Add/remove team members

## Troubleshooting

### Build Issues
- Check Railway build logs for errors
- Ensure all dependencies are in `package.json`
- Verify the build scripts work locally

### Runtime Issues
- Check Railway deploy logs
- Verify environment variables are set correctly
- Test database initialization (SQLite file-based)

### CORS Issues
- The app is configured to work with Railway's domain
- If you add a custom domain, you may need to update CORS settings

## Alternative Deployment Options (Non-AWS)

If you want to avoid AWS servers, here are excellent alternatives that don't use AWS infrastructure:

### **🏆 Top Non-AWS Recommendations**

#### **1. DigitalOcean App Platform** ⭐⭐⭐⭐⭐
**Best Non-AWS Alternative**
- **Infrastructure**: DigitalOcean's own cloud (not AWS)
- **Free tier**: None, but $5/month minimum (very affordable)
- **Pros**: Simple pricing, good performance, managed databases
- **Setup**: Connect GitHub repo, auto-deploys
- **Cost**: $5/month minimum + usage-based pricing
- **Database**: Managed PostgreSQL or MySQL available
- **Perfect for**: Colabora - easy deployment, reliable

#### **2. Fly.io** ⭐⭐⭐⭐⭐
**Global Edge Network**
- **Infrastructure**: Fly.io's global network (not AWS)
- **Free tier**: 3 shared VMs with 256MB RAM each
- **Pros**: Excellent performance, SQLite support, global deployment
- **Setup**: `fly launch`, `fly deploy` (CLI-based)
- **Cost**: ~$2.50/month per app + usage
- **Database**: SQLite works perfectly
- **Best for**: Apps like Colabora with SQLite databases

#### **3. Heroku** ⭐⭐⭐⭐
**Industry Standard**
- **Infrastructure**: Heroku's own infrastructure (moved away from AWS)
- **Free tier**: 550-1000 hours/month (varies by region)
- **Pros**: Mature platform, excellent docs, add-ons ecosystem
- **Setup**: `heroku create`, `git push heroku main`
- **Cost**: ~$7/month for basic dyno
- **Database**: Heroku Postgres (optional)

#### **4. Railway** ⭐⭐⭐⭐
**Developer-Friendly**
- **Infrastructure**: Railway's cloud (may use multiple providers, but not AWS-only)
- **Free tier**: Generous free tier
- **Pros**: Simple setup, great DX, automatic builds
- **Setup**: Connect GitHub, auto-deploys
- **Cost**: $5+/month for persistent apps

### **Frontend-Focused (More Complex Backend)**

#### **5. Vercel** ⭐⭐⭐⭐
**Best for Frontend, Backend Needs Work**
- **Free tier**: Generous, includes serverless functions
- **Pros**: Lightning fast frontend, global CDN
- **Cons**: Backend needs serverless conversion (API routes)
- **Setup**: Connect repo, auto-deploys
- **For Colabora**: Would need to restructure backend as serverless functions

#### **6. Netlify** ⭐⭐⭐⭐
**Similar to Vercel**
- **Free tier**: Good, includes form handling
- **Pros**: Great for static sites, serverless functions
- **Cons**: Same backend limitations as Vercel
- **Setup**: Connect repo, auto-deploys

### **Cloud Providers (More Control, More Complex)**

#### **7. AWS (Lightsail/EC2)**
- **Free tier**: 12 months free for t2.micro
- **Pros**: Full control, scalable
- **Cons**: More complex setup, steeper learning curve
- **Cost**: ~$5-10/month for basic instance

#### **8. Google Cloud Run**
- **Free tier**: 2 million requests/month
- **Pros**: Serverless containers, auto-scaling
- **Cons**: Docker required, more complex
- **Cost**: Pay per use after free tier

### **Quick Testing Solutions (Temporary)**

#### **9. ngrok** ⭐⭐⭐⭐⭐
**Instant Public URL**
- **Cost**: Free tier available, paid plans for custom domains
- **Pros**: Works immediately, no deployment needed
- **Setup**: `npm install -g ngrok`, `ngrok http 3000`
- **Use**: Run locally, share the generated URL
- **Perfect for**: Quick demos and testing

#### **10. LocalTunnel** ⭐⭐⭐⭐
**Free Alternative to ngrok**
- **Cost**: Free
- **Pros**: Simple, no account needed
- **Setup**: `npx localtunnel --port 3000`
- **Use**: Same as ngrok - instant public URL

### **Comparison Table (Non-AWS Only)**

| Platform | Infrastructure | Free Tier | Setup Complexity | Cost/Month | Best For Colabora |
|----------|----------------|-----------|------------------|------------|-------------------|
| **DigitalOcean App Platform** | DigitalOcean | ❌ None ($5 min) | 🔧 Simple | $5+ | ✅ Excellent choice |
| **Fly.io** | Fly.io Global | ✅ 3 VMs | 🔧 Medium | $2.50+ | ✅ SQLite-friendly |
| **Heroku** | Heroku | ✅ 550h/month | 🔧 Simple | $7+ | ✅ Mature & reliable |
| **Railway** | Railway | ✅ Generous | 🔧 Simple | $5+ | ✅ Easy deployment |
| **ngrok** | Local tunnel | ✅ Basic | ⚡ Instant | Free/Paid | ✅ Quick testing |

### **Recommendation for Colabora (Non-AWS)**

**For your collaborative app without AWS, I recommend:**

1. **DigitalOcean App Platform** - Best balance of cost, simplicity, and reliability
2. **Fly.io** - Best for SQLite apps with global performance
3. **Heroku** - Maximum reliability and enterprise features
4. **ngrok** - For immediate testing without any deployment

### **Quick Start with DigitalOcean App Platform**

1. Go to [digitalocean.com/products/app-platform](https://digitalocean.com/products/app-platform)
2. Connect your GitHub repo
3. Choose "Autodeploy" for automatic deployments
4. Set build command: `npm run build`
5. Set run command: `npm start`
6. Add environment variables: `NODE_ENV=production`, `SESSION_SECRET=your-secret`
7. Deploy! (Minimum $5/month)

### **Quick Start with Fly.io**

1. Install Fly CLI: `curl -L https://fly.io/install.sh | sh`
2. Login: `fly auth login`
3. In your project directory: `fly launch`
4. Follow prompts, choose region
5. Deploy: `fly deploy`
6. Your app gets a `*.fly.dev` URL

All alternatives support your SQLite database approach and the collaborative features will work identically.

## Need Help?

- Check Railway's documentation: https://docs.railway.app/
- Review the app's architecture in the main README
- Test locally first: `npm run dev:full`

## Security Notes

- This demo app uses hardcoded demo users
- For production use, implement proper user authentication
- The SESSION_SECRET should be kept secure
- SQLite database is file-based (resets on redeploy)

## 🗄️ Fly.io Database Persistence

**For Fly.io deployments only**: You need persistent volumes to keep your database between deployments.

### **Option 1: CLI + Web Interface (Recommended)**

1. **Create volume first:**
   ```bash
   fly volumes create colabora_data --size 1 --region lax
   ```

2. **Deploy via web interface** - volume auto-mounts

### **Option 2: Web Interface Only**

1. **Deploy app first** via web interface
2. **Create volume in dashboard:**
   - App dashboard → "Volumes" tab
   - "Create volume" → Name: `colabora_data`, Size: `1 GB`
3. **Redeploy** to mount the volume

### **Option 3: Use Deploy Script**
```bash
npm run deploy:fly
```
**Creates volume and deploys automatically!**

---

**Happy collaborating!** 🎉

Share your Railway URL with others to start testing the collaborative features.
