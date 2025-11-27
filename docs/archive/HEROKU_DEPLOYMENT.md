# 🏆 Deploy Colabora to Heroku

**Heroku** is the industry standard for Node.js deployments.

## Prerequisites
- Heroku CLI: `npm install -g heroku`
- Heroku account: [heroku.com](https://heroku.com)

## Quick Deploy (5 minutes)

### 1. Login to Heroku
```bash
heroku login
```

### 2. Create Heroku App
```bash
heroku create colabora-app
# OR use a custom name: heroku create your-custom-name
```

### 3. Set Environment Variables
```bash
heroku config:set NODE_ENV=production
heroku config:set SESSION_SECRET=your-super-secure-random-session-secret
```

### 4. Deploy
```bash
git push heroku main
```

### 5. Open Your App
```bash
heroku open
```

**Your app is live!** URL will be: `https://colabora-app.herokuapp.com`

## Demo Users
Test with:
- Alice Johnson (alice@example.com)
- Bob Smith (bob@example.com)
- Charlie Brown (charlie@example.com)
- Diana Prince (diana@example.com)

## Heroku Features
✅ **Free tier**: 550-1000 hours/month
✅ **Automatic scaling**: Handles multiple users
✅ **Add-ons**: PostgreSQL, Redis, etc.
✅ **Logs**: `heroku logs --tail`
✅ **Database**: Heroku Postgres available

## Troubleshooting
- **Build fails**: Check `heroku logs --tail`
- **App crashes**: Verify environment variables with `heroku config`
- **Database**: SQLite works, or upgrade to Heroku Postgres

## Cost
- **Free**: Limited hours
- **Hobby**: $7/month (always on)
- **Professional**: $25+/month

**Perfect for production collaborative apps!** 🎯
