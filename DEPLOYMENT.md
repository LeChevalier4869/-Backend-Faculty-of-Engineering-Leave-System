# eLeave RMUTI — คู่มือติดตั้ง / Deploy / สำรองข้อมูล (Backend)

เอกสารนี้อธิบายขั้นตอนทำให้ระบบ "ใช้งานได้ตั้งแต่วันแรก" บนฐานข้อมูลใหม่ และวิธีสำรอง/กู้คืนข้อมูล

---

## 1. สิ่งที่ต้องมีก่อนติดตั้ง

- Node.js 18+ และ npm
- MySQL 8+ (และ MySQL client tools — `mysql`, `mysqldump` ต้องอยู่ใน PATH สำหรับ backup/restore)
- บัญชี Google OAuth (Client ID / Secret) — **ระบบ login ผ่าน Google เท่านั้น**
- อีเมล Google จริง (`@rmuti.ac.th`) ของผู้ดูแลคนแรก

---

## 2. ตั้งค่า Environment

```bash
cp .env.example .env
```

แก้ไฟล์ `.env` ให้ครบ โดยเฉพาะ:

| ตัวแปร | จำเป็น | หมายเหตุ |
|---|---|---|
| `DATABASE_URL` | ✅ | `mysql://user:pass@host:3306/dbname` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | ✅ | ถ้าไม่มี Google strategy จะไม่ถูกลงทะเบียน → login ไม่ได้ |
| `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_SECRET` | ✅ | ใช้ค่าสุ่มยาว ๆ ใน production |
| `SESSION_SECRET` | ✅ | สำหรับ express-session |
| `BACKEND_URL`, `FRONTEND_URL` | ✅ | ใช้ประกอบ OAuth callback และ redirect |
| **`BOOTSTRAP_SUPER_ADMIN_EMAIL`** | ✅ (ครั้งแรก) | **อีเมล Google จริงของผู้ดูแลคนแรก** — ดูข้อ 4 |
| `EMAIL_*`, `OAUTH_*_RMUTI` | ✅ (ถ้าต้องส่งเมล) | สำหรับแจ้งเตือนทางอีเมล |

---

## 3. ติดตั้งและเตรียมฐานข้อมูล

```bash
npm install
npm run setup       # = prisma migrate deploy + prisma generate + seed
```

หรือทำทีละขั้น:

```bash
npx prisma migrate deploy   # สร้าง/อัปเดตตารางตาม migration
npx prisma generate         # สร้าง Prisma Client
npm run db:seed             # ใส่ข้อมูลตั้งต้น (idempotent — รันซ้ำได้ปลอดภัย)
```

> ⚠️ **สำคัญ:** `prisma migrate deploy` **ไม่รัน seed อัตโนมัติ** ต้องสั่ง `npm run db:seed` เอง

### seed ใส่อะไรให้บ้าง (idempotent — มีแล้วข้าม)
ข้อมูล master data มาจากไฟล์ **`prisma/seed-data.json`** (ดึงจาก DB จริง):
- **Roles** 8 ตัว: USER, ADMIN, VERIFIER, APPROVER_1..4, SUPER_ADMIN
- **Organization** (คณะวิศวกรรมศาสตร์) + **Department** 14 แผนก
- **PersonnelType** 5 ประเภท (ตามระเบียบ) + **LeaveType** 16 ประเภท
- **Rank** 75 รายการ — เงื่อนไขวันลาของแต่ละประเภทบุคลากร × ประเภทลา (กุญแจสำคัญในการให้สิทธิ์วันลา)
- **Settings**: `fiscalYear`, `currentYear`, `runNumber`, `fiscalYearStartDate/EndDate` (คำนวณอัตโนมัติ) + `drive_template`, `leave_information`, contact ฯลฯ
- **ผู้ดูแลคนแรก** (SUPER_ADMIN) — เฉพาะเมื่อมี `BOOTSTRAP_SUPER_ADMIN_EMAIL`

> ✅ ตอนนี้ seed รวม **Rank** แล้ว → ผู้ใช้ที่ import จะได้สิทธิ์วันลาครบ
> ถ้าต้องการ **รีเฟรช seed-data.json จาก DB ปัจจุบัน**: `node scripts/generate-seed-data.js`
> (ดึงข้อมูลล่าสุด + กรองข้อมูลทดสอบออก — แก้ไฟล์ JSON เพิ่มเองได้)

---

## 4. ผู้ดูแลคนแรก (Bootstrap) — ทำไมต้องทำแบบนี้

ระบบ login ผ่าน **Google OAuth เท่านั้น** และจะปฏิเสธอีเมลที่ไม่มี user ใน DB
ดังนั้นบน DB ใหม่จะ **ไม่มีใคร login ได้เลย** จนกว่าจะมี user แรก

วิธีแก้: ตั้งค่าใน `.env`

```env
BOOTSTRAP_SUPER_ADMIN_EMAIL="ชื่อจริง.สกุล@rmuti.ac.th"
```

แล้วรัน `npm run db:seed` — seed จะสร้าง user + ให้สิทธิ์ SUPER_ADMIN กับอีเมลนี้
จากนั้นกด **Login with Google** ด้วยอีเมลเดียวกัน → ระบบจะผูกบัญชี Google ให้อัตโนมัติในครั้งแรก

> ถ้าเว้น `BOOTSTRAP_SUPER_ADMIN_EMAIL` ว่าง seed จะ "ข้าม" การสร้างผู้ดูแล (ไม่สร้างบัญชีปลอม)
> ถ้ามี SUPER_ADMIN อยู่แล้ว seed จะข้ามให้เอง (ปลอดภัยต่อการรันซ้ำ)

หลังผู้ดูแลคนแรก login ได้แล้ว สามารถใช้หน้า **นำเข้าผู้ใช้ (Excel)** เพื่อสร้างบัญชีให้คนอื่นต่อได้

---

## 5. สำรองข้อมูล (Backup) และกู้คืน (Restore)

> ต้องมี `mysqldump` / `mysql` ใน PATH (มากับ MySQL client)

### สำรอง
```bash
npm run db:backup
# ได้ไฟล์ที่ backups/eleave-<db>-<วันเวลา>.sql
# หรือระบุปลายทาง: node scripts/backup-db.js /path/to/dir
```

### กู้คืน (เขียนทับข้อมูลปัจจุบัน — ระวัง)
```bash
node scripts/restore-db.js ./backups/eleave-xxxx.sql --force
# จากนั้น: npx prisma generate แล้วรีสตาร์ทเซิร์ฟเวอร์
```

โฟลเดอร์ `backups/` ถูกใส่ใน `.gitignore` แล้ว (อย่า commit ไฟล์สำรองขึ้น git)

### แนะนำให้ตั้ง backup อัตโนมัติ (cron ระดับ OS)
ตัวอย่าง crontab (สำรองทุกวันตี 2):
```cron
0 2 * * * cd /path/to/backend && /usr/bin/node scripts/backup-db.js >> backups/backup.log 2>&1
```
และควรหมุนเวียน/ย้ายไฟล์เก่าออกไปเก็บที่อื่น (offsite) เป็นระยะ

---

## 6. งานตามเวลา (Cron ภายในแอป)

ระบบมี cron ในตัว (node-cron) ที่ทำงานอัตโนมัติเมื่อเซิร์ฟเวอร์รัน:
- **1 ต.ค.** — เลื่อนปีงบประมาณ (`fiscalYear`), reset เลขเอกสาร (`runNumber`), reset leave balance
- **1 ม.ค.** — อัปเดต `currentYear`, ขยายวันหยุด recurring
- แจ้งเตือนคำขอค้างอนุมัติ / จัดการ proxy approval

> cron เหล่านี้ **ต้องมี setting `fiscalYear` / `currentYear` / `runNumber` อยู่ใน DB** ไม่งั้นจะ error
> seed ที่อัปเดตแล้วสร้าง key เหล่านี้ให้ครบ (ก่อนหน้านี้ใช้ชื่อ key ผิดเป็น snake_case ทำให้ cron reset ล้มเหลว)

---

## 7. Checklist day-one (สรุปสั้น)

1. `cp .env.example .env` แล้วกรอกค่าให้ครบ + ใส่ `BOOTSTRAP_SUPER_ADMIN_EMAIL`
2. `npm install`
3. `npm run setup`  (migrate + generate + seed)
4. ตั้งค่า **Rank (เงื่อนไขวันลา)** ของแต่ละประเภทบุคลากรผ่านหน้าแอดมิน
5. Login with Google ด้วยอีเมลผู้ดูแล → import ผู้ใช้คนอื่นต่อ
6. ตั้ง backup อัตโนมัติระดับ OS
