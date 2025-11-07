# ⚡ Instant Public URL with ngrok

**Want to test Colabora online immediately?** Use ngrok for instant public access!

## Quick Setup (2 minutes)

### 1. Install ngrok
```bash
npm install -g ngrok
# OR download from https://ngrok.com/download
```

### 2. Start Your Local App
```bash
# In one terminal, start the app
npm run dev:full
```

### 3. Create Public Tunnel
```bash
# In another terminal, create tunnel to port 3000
ngrok http 3000
```

### 4. Get Your Public URL
ngrok will show something like:
```
Forwarding    https://abc123.ngrok.io -> http://localhost:3000
```

**Share `https://abc123.ngrok.io` with others for testing!**

## Demo Users
- Alice Johnson (alice@example.com)
- Bob Smith (bob@example.com)
- Charlie Brown (charlie@example.com)
- Diana Prince (diana@example.com)

## What Works
✅ All collaborative features
✅ Real-time updates
✅ Multiple users
✅ File uploads
✅ Everything!

## Session Persistence
- **Active**: As long as your local app runs and ngrok tunnel is active
- **Temporary**: URL changes each time you restart ngrok
- **Perfect for**: Quick demos, testing with friends

## Pro Tips
- **Custom subdomain**: `ngrok http 3000 --subdomain=mycolabora`
- **Paid plan**: Stable URLs, custom domains
- **Multiple tunnels**: Test different ports simultaneously

## Alternative: LocalTunnel
```bash
npx localtunnel --port 3000
```
Same concept, completely free, no account needed!

**Start collaborating online in under 5 minutes!** 🚀
