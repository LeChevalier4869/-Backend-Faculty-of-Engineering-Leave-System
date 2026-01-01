# Environment Variables Setup

## Required Environment Variables

### Core Configuration
- `BACKEND_URL`: URL ของ backend server (default: http://localhost:8000)
- `NODE_ENV`: Environment (development/production)
- `PORT`: Server port (default: 8000)

### Google OAuth
- `GOOGLE_CLIENT_ID`: Google OAuth Client ID
- `GOOGLE_CLIENT_SECRET`: Google OAuth Client Secret
- `GOOGLE_CALLBACK_URL`: Full callback URL (optional - จะสร้างจาก BACKEND_URL อัตโนมัติ)

### Frontend
- `FRONTEND_URL`: URL ของ frontend สำหรับ redirect หลัง login

## Deployment Examples

### Local Development
```bash
BACKEND_URL=http://localhost:8000
NODE_ENV=development
GOOGLE_CLIENT_ID=your_dev_client_id
GOOGLE_CLIENT_SECRET=your_dev_client_secret
FRONTEND_URL=http://localhost:5173
```

### Render Production
```bash
BACKEND_URL=https://your-app.onrender.com
NODE_ENV=production
GOOGLE_CLIENT_ID=your_prod_client_id
GOOGLE_CLIENT_SECRET=your_prod_client_secret
FRONTEND_URL=https://your-frontend.netlify.app
```

### Vercel Production
```bash
BACKEND_URL=https://your-app.vercel.app
NODE_ENV=production
GOOGLE_CLIENT_ID=your_prod_client_id
GOOGLE_CLIENT_SECRET=your_prod_client_secret
FRONTEND_URL=https://your-frontend.vercel.app
```

### Docker/Custom Domain
```bash
BACKEND_URL=https://api.yourdomain.com
NODE_ENV=production
GOOGLE_CLIENT_ID=your_prod_client_id
GOOGLE_CLIENT_SECRET=your_prod_client_secret
FRONTEND_URL=https://app.yourdomain.com
```

## Google Console Setup

ใน Google Cloud Console → APIs & Services → Credentials:
1. เพิ่ม Authorized redirect URIs สำหรับทุก environment:
   - `http://localhost:8000/auth/google/callback` (development)
   - `https://your-app.onrender.com/auth/google/callback` (production)
   - `https://api.yourdomain.com/auth/google/callback` (custom domain)

2. สามารถใช้ Client ID เดียวกันได้ ถ้ามี redirect URIs ครบถ้วน

## Auto URL Generation

ระบบจะสร้าง callback URL อัตโนมัติจาก:
```
${BACKEND_URL}/auth/google/callback
```

ถ้าไม่ได้กำหนด GOOGLE_CALLBACK_URL ไว้
