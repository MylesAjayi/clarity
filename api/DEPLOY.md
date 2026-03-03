# Clarity API — Deployment Guide

## Quick Setup (5 minutes)

### 1. Create a Cloudflare account
- Go to [dash.cloudflare.com](https://dash.cloudflare.com) and sign up (free)

### 2. Install Wrangler CLI
```bash
npm install -g wrangler
```

### 3. Login to Cloudflare
```bash
npx wrangler login
```

### 4. Deploy the worker
```bash
cd api/
npx wrangler deploy
```

### 5. Set the API key as a secret
```bash
npx wrangler secret put OPENROUTER_API_KEY
# Paste: REDACTED_KEY
```

### 6. Note your worker URL
After deploy, Wrangler will show something like:
```
https://clarity-api.YOUR-SUBDOMAIN.workers.dev
```

### 7. Update the frontend
In `js/app.js`, update the API URL at the bottom of the file:
```javascript
window.CLARITY_API_URL = 'https://clarity-api.YOUR-SUBDOMAIN.workers.dev';
```

Then push to GitHub:
```bash
git add -A && git commit -m "Connect to live AI backend" && git push
```

## Done! 🎉

The app is now fully functional with real AI powering the process documentation.

## Costs
- Cloudflare Workers: Free (100,000 requests/day)
- OpenRouter (Gemini 3.1 Flash Lite): ~£0.001 per generation
- £5 credit = ~5,000 process generations
