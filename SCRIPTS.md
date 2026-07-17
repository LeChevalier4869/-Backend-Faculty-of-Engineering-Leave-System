# คู่มือ Scripts — Backend (eLeave)

รวมคำสั่ง/สคริปต์ทั้งหมดของฝั่ง backend ทั้ง **npm scripts** (ใน `package.json`) และ **standalone scripts** (ในโฟลเดอร์ `scripts/` และ `prisma/`)

> ⚠️ สคริปต์หลายตัวทำงานกับฐานข้อมูลจริงตาม `DATABASE_URL` ใน `.env` — ตรวจให้แน่ใจว่าชี้ไปยัง DB ที่ถูกต้องก่อนรัน

## สิ่งที่ต้องมีก่อนใช้

- รันคำสั่งจากโฟลเดอร์ `backend/`
- ติดตั้ง dependency แล้ว: `npm install`
- มีไฟล์ `.env` ที่ตั้งค่า `DATABASE_URL` (MySQL)
- เฉพาะ backup/restore: ต้องมี **MySQL client tools** (`mysqldump`, `mysql`) อยู่ใน `PATH`

---

## 1. npm scripts (`npm run <ชื่อ>`)

| คำสั่ง | ทำอะไร |
|---|---|
| `npm start` | รันเซิร์ฟเวอร์ dev ด้วย nodemon (`src/server.js`) รีโหลดอัตโนมัติเมื่อแก้โค้ด |
| `npm test` | รันเทสทั้งหมด (Jest) |
| `npm run test:unit` | เฉพาะ unit tests |
| `npm run test:int` | เฉพาะ integration tests |
| `npm run test:e2e` | เฉพาะ system/e2e tests |
| `npm run test:watch` | รันเทสแบบ watch |
| `npm run test:cov` | รันเทสพร้อมรายงาน coverage |
| `npm run db:migrate` | ใช้ migration ล่าสุดกับ DB (`prisma migrate deploy`) |
| `npm run db:seed` | ใส่ข้อมูลตั้งต้น (master data) → เท่ากับ `node prisma/seed.js` |
| `npm run db:backup` | สำรอง DB → เท่ากับ `node scripts/backup-db.js` |
| `npm run db:restore` | กู้คืน DB → เท่ากับ `node scripts/restore-db.js` |
| `npm run setup` | ติดตั้งครั้งแรกครบชุด: `migrate deploy` + `prisma generate` + `seed` |

---

## 2. ฐานข้อมูล (backup / restore / seed)

### `scripts/backup-db.js` — สำรองฐานข้อมูล
```bash
node scripts/backup-db.js              # ลงโฟลเดอร์ backups/
node scripts/backup-db.js /path/dir    # ระบุปลายทางเอง
# หรือ: npm run db:backup
```
- ใช้ `mysqldump` แบบ `--single-transaction` (ไม่ล็อกตาราง), รวม routines/triggers/events
- ไฟล์ผลลัพธ์: `eleave-<db>-<YYYYMMDD-HHmmss>.sql`
- ส่งรหัสผ่านผ่าน env (`MYSQL_PWD`) ไม่โผล่ใน process list

### `scripts/restore-db.js` — กู้คืนฐานข้อมูล ⚠️
```bash
node scripts/restore-db.js ./backups/eleave-xxx.sql --force
# หรือ: npm run db:restore -- ./backups/eleave-xxx.sql --force
```
- **เขียนทับข้อมูลปัจจุบันทั้งหมด** — ต้องใส่ `--force` เพื่อยืนยัน (ไม่ใส่ = แสดงคำเตือนแล้วหยุด)
- หลังกู้คืน แนะนำรัน `npx prisma generate` และรีสตาร์ทเซิร์ฟเวอร์

### `prisma/seed.js` — ข้อมูลตั้งต้น (master data)
```bash
node prisma/seed.js        # หรือ npm run db:seed
```
- สร้าง system roles, องค์กร/แผนก/ประเภทบุคลากร/ประเภทลา/rank/setting จาก `prisma/seed-data.json`
- ค่าที่คำนวณได้ (ปีงบประมาณ, runNumber ฯลฯ) ถูกสร้างในตัว seed เอง

### `scripts/generate-seed-data.js` — สร้างไฟล์ seed จาก DB จริง (อ่านอย่างเดียว)
```bash
node scripts/generate-seed-data.js
```
- ดึง master data จาก DB ปัจจุบัน → เขียน `prisma/seed-data.json` (ให้ `seed.js` ใช้ต่อ)
- **ไม่แก้ไข DB** — กรองข้อมูลทดสอบ/ขยะออก, อ้างอิงด้วย "ชื่อ" เพื่อ seed บน DB เปล่าได้

---

## 3. บำรุงรักษาข้อมูล

### `scripts/cleanup-orphan-details.js` — ปิดรายการอนุมัติที่ค้าง
```bash
node scripts/cleanup-orphan-details.js          # dry-run (แสดงอย่างเดียว)
node scripts/cleanup-orphan-details.js --apply  # แก้จริง
```
- แก้ `leaveRequestDetail` ที่ยัง `PENDING` ทั้งที่คำขอแม่ถูก REJECTED/APPROVED/CANCELLED ไปแล้ว
- ตั้งสถานะ detail ให้ตรงกับคำขอแม่ · ทำงานใน transaction · ดีฟอลต์เป็น dry-run

---

## 4. จัดการสิทธิ์ผู้ใช้

### `scripts/manage-user-role.js` — เพิ่ม/ถอนบทบาทของผู้ใช้
```bash
node scripts/manage-user-role.js --user 12 --role SUPER_ADMIN
node scripts/manage-user-role.js --user 12 --role VERIFIER --action remove
node scripts/manage-user-role.js --user 8  --role ADMIN --dry-run
```
- รับ role เป็น **id หรือชื่อ**, รองรับ `add`/`remove`, มี `--dry-run`, idempotent
- ดูวิธีใช้เต็มได้จาก `node scripts/manage-user-role.js --help`

---

## ตารางสรุป dry-run / ยืนยัน

| สคริปต์ | โหมดปลอดภัย | สั่งทำจริงด้วย |
|---|---|---|
| `restore-db.js` | หยุด + เตือนถ้าไม่ใส่ flag | `--force` |
| `cleanup-orphan-details.js` | dry-run เป็นค่าเริ่มต้น | `--apply` |
| `manage-user-role.js` | มี `--dry-run` ให้ทดสอบ | (รันปกติ = เขียนจริง) |
| `backup-db.js` / `generate-seed-data.js` | ปลอดภัย (ไม่แก้ DB) | — |

> หมายเหตุ: `manage-user-role.js` เขียนตรงเข้า DB ไม่ผ่าน API จึงไม่มี guard เรื่องสิทธิ์ SUPER_ADMIN แบบในหน้าเว็บ — ใช้ `--dry-run` ตรวจก่อนเสมอสำหรับ role สำคัญ
