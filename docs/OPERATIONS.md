# การดำเนินการ (Operations)

สำรอง/กู้คืนข้อมูล และงานตามเวลาของระบบ — สำหรับดูแลระบบหลังติดตั้งเสร็จ
(การติดตั้งครั้งแรกดู [INSTALL.md](INSTALL.md))

## สำรองข้อมูล (Backup) และกู้คืน (Restore)
> ต้องมี `mysqldump` / `mysql` อยู่ใน `PATH` (มากับ MySQL client)

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
> โฟลเดอร์ `backups/` อยู่ใน `.gitignore` แล้ว (อย่า commit ไฟล์สำรองขึ้น git)

### ตั้ง backup อัตโนมัติ (cron ระดับ OS)
ตัวอย่าง crontab (สำรองทุกวันตี 2):
```cron
0 2 * * * cd /path/to/backend && /usr/bin/node scripts/backup-db.js >> backups/backup.log 2>&1
```
ควรหมุนเวียน/ย้ายไฟล์เก่าไปเก็บที่อื่น (offsite) เป็นระยะ

## งานตามเวลาในแอป (Cron ภายใน)
ระบบมี cron ในตัว (`node-cron`) ทำงานอัตโนมัติเมื่อเซิร์ฟเวอร์รัน:
- **1 ต.ค.** — เลื่อนปีงบประมาณ (`fiscalYear`), reset เลขเอกสาร (`runNumber`), reset leave balance
- **1 ม.ค.** — อัปเดต `currentYear`, ขยายวันหยุด recurring
- แจ้งเตือนคำขอค้างอนุมัติ / จัดการ proxy approval รายวัน

> ⚠️ cron เหล่านี้ **ต้องมี setting `fiscalYear` / `currentYear` / `runNumber` ใน DB** ไม่งั้นจะ error
> — seed สร้าง key เหล่านี้ให้ครบแล้ว
