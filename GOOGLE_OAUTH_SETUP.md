# Google OAuth Setup Guide

## 1. สร้าง OAuth 2.0 Client ID

### ไปที่ Google Cloud Console:
1. เข้า https://console.cloud.google.com/
2. เลือก project ของคุณ
3. ไปที่ APIs & Services → Credentials
4. คลิก + CREATE CREDENTIALS → OAuth 2.0 Client IDs

### ตั้งค่า Application type:
- **Application type**: Web application
- **Name**: eLeave Development (หรือชื่อที่ต้องการ)

### Authorized redirect URIs:
เพิ่ม URLs ต่อไปนี้:
```
http://localhost:8000/auth/google/callback
https://backend-faculty-of-engineering-leave.onrender.com/auth/google/callback
```

### กด Create จะได้:
- **Client ID** (เช่น: 123456789-abcdef.apps.googleusercontent.com)
- **Client Secret** (เช่น: GOCSPX-xxxxxxxxxxx)

## 2. อัปเดต Environment Variables

### Development (.env.development):
```bash
GOOGLE_CLIENT_ID=your_new_client_id
GOOGLE_CLIENT_SECRET=your_new_client_secret
```

### Production (.env.production):
```bash
GOOGLE_CLIENT_ID=your_production_client_id
GOOGLE_CLIENT_SECRET=your_production_client_secret
```

## 3. ทดสอบ

```bash
# Restart server
npm run dev

# ตรวจสอบ console log ว่าแสดง:
# NODE_ENV: development
# BACKEND_URL: http://localhost:8000
# Google OAuth Callback URL: http://localhost:8000/auth/google/callback
```

## 4. ถ้ายังไม่ได้

ตรวจสอบ:
1. Google APIs enabled (Google+ API, People API)
2. OAuth consent screen ตั้งค่าครบถ้วน
3. Client ID และ Secret ไม่มีช่องว่างหรือตัวอักษรพิเศษ

## 5. สำหรับ Production

สร้าง Client ID แยกสำหรับ production:
- Application type: Web application
- Redirect URIs: เฉพาะ production URL
- ใช้ใน Render dashboard เท่านั้น
