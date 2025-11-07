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

## Alternative Deployment Options

If Railway doesn't work for you, here are excellent alternatives:

### **🏆 Top Recommendations for Full-Stack Apps**

#### **1. Render** ⭐⭐⭐⭐⭐
**Best Railway Alternative**
- **Free tier**: 750 hours/month, static sites free
- **Pros**: Automatic builds, full-stack support, PostgreSQL database option
- **Setup**: Similar to Railway - connect GitHub, auto-deploys
- **Cost**: ~$7/month for persistent apps
- **Perfect for**: Colabora (matches Railway closely)

#### **2. Heroku** ⭐⭐⭐⭐⭐
**Industry Standard**
- **Free tier**: 550-1000 hours/month (varies by region)
- **Pros**: Mature platform, excellent docs, add-ons ecosystem
- **Setup**: `heroku create`, `git push heroku main`
- **Cost**: ~$7/month for basic dyno
- **Database**: Heroku Postgres available

#### **3. DigitalOcean App Platform** ⭐⭐⭐⭐⭐
**Developer-Friendly Cloud**
- **Free tier**: None, but $5/month minimum
- **Pros**: Simple pricing, good performance, managed databases
- **Setup**: Connect repo, auto-deploys like Railway
- **Cost**: $5/month minimum + usage
- **Database**: Managed PostgreSQL available

#### **4. Fly.io** ⭐⭐⭐⭐
**Global Deployment**
- **Free tier**: 3 shared VMs (limited resources)
- **Pros**: Global edge network, great performance, SQLite support
- **Setup**: `fly launch`, `fly deploy`
- **Cost**: ~$2.50/month per app + usage
- **Perfect for**: Apps like Colabora with SQLite

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

### **Comparison Table**

| Platform | Free Tier | Setup Complexity | Full-Stack Support | Best For |
|----------|-----------|------------------|-------------------|----------|
| **Railway** | ✅ Good | 🔧 Simple | ✅ Excellent | Colabora (current) |
| **Render** | ✅ Good | 🔧 Simple | ✅ Excellent | Colabora alternative |
| **Heroku** | ✅ Limited | 🔧 Simple | ✅ Excellent | Production apps |
| **Fly.io** | ✅ Basic | 🔧 Medium | ✅ Good | Global apps |
| **DO App Platform** | ❌ None | 🔧 Simple | ✅ Good | Simple deployments |
| **Vercel** | ✅ Excellent | 🔧 Medium | ⚠️ Needs rework | Frontend-heavy |
| **ngrok** | ✅ Basic | ⚡ Instant | ✅ Perfect | Quick testing |

### **Recommendation for Colabora**

**For your collaborative app, I recommend:**

1. **Render** - Most similar to Railway, easiest transition
2. **Heroku** - If you want maximum reliability
3. **Fly.io** - If you want global performance
4. **ngrok** - For immediate testing without deployment

### **Quick Start with Render**

1. Go to [render.com](https://render.com)
2. Connect your GitHub repo
3. Choose "Web Service" for Node.js
4. Set build command: `npm run build`
5. Set start command: `npm start`
6. Add environment variables: `NODE_ENV=production`, `SESSION_SECRET=your-secret`
7. Deploy!

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

---

**Happy collaborating!** 🎉

Share your Railway URL with others to start testing the collaborative features.
