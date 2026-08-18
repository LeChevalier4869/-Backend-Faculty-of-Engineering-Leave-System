# eLeave — Backend

ระบบลาออนไลน์ คณะวิศวกรรมศาสตร์ มทร.อีสาน (วิทยาเขตขอนแก่น)
API: **Express + Prisma (MySQL)** · เข้าสู่ระบบด้วย **Google OAuth เท่านั้น**

## เริ่มต้นเร็ว (Native)
```bash
cp .env.example .env       # เติมค่าให้ครบ (ดู docs/GOOGLE_OAUTH.md เรื่อง OAuth)
npm install
npm run setup              # prisma migrate deploy + generate + seed
npm run create-super-admin -- --email you@rmuti.ac.th
npm start                  # http://localhost:8000
```
> ติดตั้งแบบละเอียดทีละขั้น หรือด้วย **Docker** → ดู [docs/INSTALL.md](docs/INSTALL.md)

## เอกสาร
| ไฟล์ | เนื้อหา |
|------|---------|
| [docs/INSTALL.md](docs/INSTALL.md) | ติดตั้งครั้งแรก — Native (Part A) + Docker (Part B) |
| [docs/GOOGLE_OAUTH.md](docs/GOOGLE_OAUTH.md) | ตั้งค่า Google OAuth (redirect URIs, callback) |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | สำรอง/กู้คืนข้อมูล + งานตามเวลา (cron) |
| [docs/SCRIPTS.md](docs/SCRIPTS.md) | อ้างอิงคำสั่ง/สคริปต์ทั้งหมด |
| [.env.example](.env.example) | รายการ environment variables |

## Stack
- Node.js 18+ (แนะนำ 20 LTS) · Express
- Prisma + **MySQL 8.0+ / MariaDB 10.5+** (10.4 migrate ไม่ผ่าน)
- Auth: Google OAuth + JWT
- อื่นๆ: Cloudinary (รูปโปรไฟล์ตอน production), nodemailer (แจ้งเตือน)

## หมายเหตุสำคัญ
- login ด้วย Google OAuth เท่านั้น → DB ใหม่ต้องสร้างผู้ดูแลคนแรกก่อน (ผ่าน `BOOTSTRAP_SUPER_ADMIN_EMAIL` ตอน seed หรือ `npm run create-super-admin`)
- `CLOUDINARY_SECRET` ขาดไม่ได้ — ไม่มีแล้ว server ไม่ start
