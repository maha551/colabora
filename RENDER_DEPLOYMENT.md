# 🚀 Deploy Colabora to Render

**Render** is the easiest Railway alternative for full-stack apps like Colabora.

## Quick Deploy (5 minutes)

### 1. Create Render Account
- Go to [render.com](https://render.com) and sign up
- Connect your GitHub account

### 2. Deploy Your App
1. Click **"New"** → **"Web Service"**
2. Connect your GitHub repository (`colabora-app`)
3. Configure the service:
   - **Name**: `colabora-app` (or your choice)
   - **Environment**: `Node`
   - **Build Command**: `npm run build`
   - **Start Command**: `npm start`

### 3. Set Environment Variables
In the service settings, add:
```
NODE_ENV=production
SESSION_SECRET=your-super-secure-random-session-secret-here
```

### 4. Deploy!
- Click **"Create Web Service"**
- Render will build and deploy automatically
- Your app will be live at: `https://colabora-app.onrender.com`

## Demo Users
Test with these pre-configured accounts:
- Alice Johnson (alice@example.com)
- Bob Smith (bob@example.com)
- Charlie Brown (charlie@example.com)
- Diana Prince (diana@example.com)

## Features That Work
✅ Full-stack deployment
✅ SQLite database
✅ Real-time collaboration
✅ All collaborative features
✅ Automatic HTTPS
✅ Global CDN

## Cost
- **Free tier**: 750 hours/month
- **Paid**: $7/month for persistent apps

## Troubleshooting
- **Build fails**: Check Render build logs
- **App won't start**: Verify environment variables
- **Database issues**: SQLite initializes automatically

**That's it!** Share your Render URL for collaborative testing. 🎉
