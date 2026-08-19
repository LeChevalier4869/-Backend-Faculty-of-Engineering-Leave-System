# ตั้งค่า Google OAuth

ระบบเข้าสู่ระบบด้วย **Google OAuth เท่านั้น** — เอกสารนี้อธิบายการสร้าง OAuth Client และตั้ง redirect URIs

## 1. สร้าง OAuth 2.0 Client ID
[Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services → Credentials** → **CREATE CREDENTIALS → OAuth 2.0 Client IDs**
- **Application type:** Web application
- **Name:** eLeave (หรือชื่อที่ต้องการ)

### Authorized redirect URIs
เพิ่มให้ครบทุก environment ที่จะใช้ — รูปแบบคือ `${BACKEND_URL}/auth/google/callback`
```
http://localhost:8000/auth/google/callback            # development
https://your-app.onrender.com/auth/google/callback    # production (Render)
https://api.yourdomain.com/auth/google/callback        # custom domain
```
> ใช้ Client ID เดียวกันได้ทุก environment ถ้าใส่ redirect URIs ครบ

กด **Create** → ได้ **Client ID** (`...apps.googleusercontent.com`) และ **Client Secret** (`GOCSPX-...`)

## 2. ใส่ค่าใน `.env`
```dotenv
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
BACKEND_URL=http://localhost:8000      # ใช้ประกอบ callback URL อัตโนมัติ
FRONTEND_URL=http://localhost:5173     # redirect กลับหลัง login สำเร็จ
```
> ระบบสร้าง callback URL อัตโนมัติจาก `${BACKEND_URL}/auth/google/callback` — ไม่ต้องตั้ง `GOOGLE_CALLBACK_URL` เอง

### ตัวอย่างค่าต่อ environment
| environment | BACKEND_URL | FRONTEND_URL |
|-------------|-------------|--------------|
| Local dev | http://localhost:8000 | http://localhost:5173 |
| Render | https://your-app.onrender.com | https://your-frontend.netlify.app |
| Vercel | https://your-app.vercel.app | https://your-frontend.vercel.app |
| Custom/Docker | https://api.yourdomain.com | https://app.yourdomain.com |

## 3. ทดสอบ
รัน server แล้วดู console log:
```
NODE_ENV: development
BACKEND_URL: http://localhost:8000
Google OAuth Callback URL: http://localhost:8000/auth/google/callback
```

## 4. แก้ปัญหาที่พบบ่อย
- เปิดใช้ Google APIs ที่จำเป็น (People API)
- ตั้งค่า **OAuth consent screen** ให้ครบ
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` ไม่มีช่องว่าง/อักขระแปลกปน
- redirect URI ใน Console ต้องตรงกับ `${BACKEND_URL}/auth/google/callback` **เป๊ะ** (รวม http/https และ port)
- แนะนำสร้าง **Client ID แยกสำหรับ production** (redirect URIs เฉพาะโดเมนจริง)
