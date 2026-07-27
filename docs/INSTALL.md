# คู่มือติดตั้งระบบ eLeave (ฉบับลงมือเอง)

ติดตั้งระบบใหม่ตั้งแต่ต้นบนเครื่องเปล่า — เหมาะสำหรับทดสอบและทำความเข้าใจการทำงานทั้งหมด
เอกสารนี้เน้นการติดตั้งแบบ **Native (ไม่ใช้ Docker)** ด้วย **MySQL 8** และ **Google OAuth จริง**
ส่วน Docker อยู่ท้ายเอกสาร (Part B)

---

## ⚠️ อ่านก่อนเริ่ม — ข้อควรระวัง

- **เวอร์ชันฐานข้อมูล:** ต้องเป็น **MySQL 8.0+** หรือ **MariaDB 10.5+** เท่านั้น
  สคริปต์ migration ใช้คำสั่ง `ALTER TABLE ... RENAME INDEX` ที่ **MariaDB 10.4 (เช่นที่มากับ XAMPP) รันไม่ผ่าน** (error 1064)
- ระบบ **เข้าสู่ระบบด้วย Google OAuth เท่านั้น** — ผู้ดูแลคนแรกต้องเป็นอีเมล Google จริงที่ล็อกอินได้
- โปรเจกต์แยกเป็น **2 repo:** `backend/` และ `frontend/`

---

## 🗺️ ภาพรวมขั้นตอน (Native)

| Phase | ทำอะไร | ผลที่ควรได้ |
|-------|--------|-------------|
| 0 | ติดตั้งเครื่องมือ: Git, Node.js, MySQL 8 | คำสั่งพื้นฐานใช้งานได้ |
| 1 | สร้างฐานข้อมูลเปล่า | มี database `eleave` |
| 2 | ตั้งค่า Backend (`.env` + `npm install`) | `.env` ครบ, ติดตั้ง dependency แล้ว |
| 3 | สร้าง schema + ข้อมูลหลัก (`npm run setup`) | ตารางมี roles/แผนก/ประเภทการลา ฯลฯ |
| 4 | สร้างผู้ดูแลคนแรก (CLI) | มีบัญชี SUPER_ADMIN |
| 5 | รัน Backend + Frontend | เห็นหน้า Login |
| 6 | ตั้งค่า Google OAuth | ล็อกอินเข้าระบบได้จริง |
| 7 | นำเข้าผู้ใช้ + มอบบทบาทผู้อนุมัติ | ระบบพร้อมใช้งานจริง |

---

# Part A — ติดตั้งแบบ Native

## 📦 Phase 0 — ติดตั้งเครื่องมือพื้นฐาน

ต้องมี 3 อย่าง:

| เครื่องมือ | เวอร์ชัน | ตรวจสอบ |
|-----------|---------|---------|
| **Git** | ล่าสุด | `git --version` |
| **Node.js** | 18 ขึ้นไป (แนะนำ LTS 20+) | `node -v` และ `npm -v` |
| **MySQL Server** | 8.0+ | `mysql --version` |

**ติดตั้ง MySQL 8:**
1. ดาวน์โหลด **MySQL Installer** จาก <https://dev.mysql.com/downloads/installer/>
2. ติดตั้งแบบ *Server only* (หรือ *Custom* → เลือก MySQL Server 8.x)
3. ตั้ง **root password** และจดจำไว้ · เลือก authentication แบบ *Strong Password Encryption*
4. ปล่อย port เป็น **3306**
5. ถ้าพิมพ์ `mysql` แล้วไม่เจอ ให้เพิ่ม `C:\Program Files\MySQL\MySQL Server 8.0\bin` เข้า PATH

> ✅ **Checkpoint:** `node -v`, `git --version`, `mysql --version` ต้องขึ้นครบทั้งสาม

---

## 🗄️ Phase 1 — สร้างฐานข้อมูลเปล่า

เปิด PowerShell แล้วเข้า MySQL:
```powershell
mysql -u root -p
```
ใส่ root password จากนั้นรันใน mysql prompt:
```sql
CREATE DATABASE eleave CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
SHOW DATABASES;   -- ต้องเห็น eleave
EXIT;
```

> 💡 **utf8mb4 สำคัญมาก** — ทำให้ภาษาไทยไม่เพี้ยน

> ✅ **Checkpoint:** เห็น database `eleave` ใน `SHOW DATABASES;`

---

## ⚙️ Phase 2 — ตั้งค่า Backend

**2.1 ติดตั้ง dependencies**
```powershell
cd "c:\Users\assaw\Projects\Eleave System\backend"
npm install
```

**2.2 สร้างไฟล์ `.env`** — คัดลอกจาก `.env.example` แล้วแก้เป็นชุดขั้นต่ำที่รันได้:
```dotenv
DATABASE_URL="mysql://root:ใส่รหัสroot@localhost:3306/eleave"
NODE_ENV="development"
PORT=8000
BACKEND_URL="http://localhost:8000"
FRONTEND_URL="http://localhost:5173"

JWT_SECRET="<สุ่ม>"
JWT_ACCESS_SECRET="<สุ่ม>"
JWT_REFRESH_SECRET="<สุ่ม>"
JWT_EXPIRESIN="1d"
SESSION_SECRET="<สุ่ม>"

# Google OAuth — เว้นว่างไว้ก่อน จะเติมใน Phase 6
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# ผู้ดูแลคนแรก — เว้นว่าง (จะใช้ CLI ใน Phase 4 แทน)
BOOTSTRAP_SUPER_ADMIN_EMAIL=""
```

**สุ่มค่า secret** (รัน 4 ครั้ง เอาไปใส่ JWT_SECRET / JWT_ACCESS_SECRET / JWT_REFRESH_SECRET / SESSION_SECRET):
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> ⚠️ **รหัส root มีอักขระพิเศษ** (`@ # : / ?`) ต้อง URL-encode ใน `DATABASE_URL` เช่น `@`→`%40`, `#`→`%23`
> ทางง่าย: ตั้งรหัส root เป็นตัวอักษร+ตัวเลขล้วน

> ℹ️ **key ที่ไม่ต้องใส่ตอนทดสอบ** (ระบบ boot ได้โดยไม่ต้องมี): Email (`EMAIL_*`, `OAUTH_*_RMUTI`), `CLOUDINARY_SECRET`, `SHADOW_DATABASE_URL` (ใช้เฉพาะ `prisma migrate dev` ไม่ใช่ `setup`)

> ✅ **Checkpoint:** มีไฟล์ `backend/.env` ครบทุก key ด้านบน

---

## 🌱 Phase 3 — สร้าง schema + ข้อมูลหลัก

```powershell
npm run setup
```
เท่ากับ `prisma migrate deploy` + `prisma generate` + `seed`
จะสร้าง: 8 roles · 1 องค์กร · 16 แผนก · 5 ประเภทบุคคล · 13 ประเภทการลา · 75 rank · settings
(**ไม่** สร้าง user / ยอดวันลา / คำขอลา — ปกติ)

**ตรวจผลด้วย Prisma Studio** (GUI ดูตารางในเบราว์เซอร์):
```powershell
npx prisma studio
```
เปิด <http://localhost:5555> → ดูตาราง `Role` (8 แถว), `LeaveType` (13), `Department` (16) แล้วปิดด้วย `Ctrl+C`

> ✅ **Checkpoint:** จบด้วย `✅ Seed completed successfully!` และตารางมีข้อมูล

> 🐞 **error 1064 ... RENAME INDEX** = ฐานข้อมูลเป็น MariaDB < 10.5 → ต้องเปลี่ยนเป็น MySQL 8 / MariaDB 10.5+

---

## 👤 Phase 4 — สร้างผู้ดูแลคนแรก

ใช้ **อีเมล Google จริง** ที่คุณจะล็อกอิน (Gmail ส่วนตัวก็ได้):
```powershell
npm run create-super-admin -- --email อีเมลคุณ@gmail.com --first ชื่อ --last สกุล --prefix นาย
```
- ดูก่อนเขียนจริง: เติม `--dry-run`
- รันซ้ำได้ ไม่เพิ่ม role ซ้ำ (idempotent)

> ✅ **Checkpoint:** ขึ้น `✅ ตั้งค่า SUPER_ADMIN ให้ ... เรียบร้อย · roles ปัจจุบัน: USER, ADMIN, SUPER_ADMIN`

---

## 🚀 Phase 5 — รัน Backend + Frontend

**5.1 Backend** (เปิด terminal ที่ 1 ค้างไว้):
```powershell
cd "c:\Users\assaw\Projects\Eleave System\backend"
npm start
```
รอเห็น `Server is running on port 8000`

**5.2 Frontend** (terminal ที่ 2):
```powershell
cd "c:\Users\assaw\Projects\Eleave System\frontend"
npm install
```
สร้าง `frontend/.env`:
```dotenv
VITE_BACKEND_URL=http://localhost:8000
```
> 💡 ตอนรันบน `localhost` ระบบตั้ง API เป็น `http://localhost:8000` ให้อัตโนมัติ ค่านี้มีผลเฉพาะตอน deploy โดเมนจริง

รัน:
```powershell
npm run dev
```
เปิด <http://localhost:5173>

> ✅ **Checkpoint:** เห็น**หน้า Login** ("เข้าสู่ระบบด้วย Google") — ยังกดเข้าไม่ได้จนกว่าจะทำ Phase 6 ✔️

---

## 🔑 Phase 6 — ตั้งค่า Google OAuth ให้ล็อกอินได้จริง

ระบบล็อกอินด้วย Google เท่านั้น จึงต้องสร้าง OAuth Client บน Google Cloud (ทำครั้งเดียว)

**6.1 สร้างโปรเจกต์ + OAuth Client**
1. เข้า <https://console.cloud.google.com/> → สร้างโปรเจกต์ใหม่ (หรือใช้ที่มีอยู่)
2. เมนู **APIs & Services → OAuth consent screen**
   - เลือก **External** → กรอกชื่อแอป, อีเมลติดต่อ
   - ในหัวข้อ **Test users** เพิ่มอีเมล Google ที่คุณจะล็อกอิน (อีเมลเดียวกับ Phase 4)
3. เมนู **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - **Authorized JavaScript origins:** `http://localhost:5173`
   - **Authorized redirect URIs:** `http://localhost:8000/auth/google/callback`  *(ต้องตรงเป๊ะ)*
4. กด Create แล้ว **คัดลอก Client ID และ Client Secret**

**6.2 ใส่ค่าใน `backend/.env`**
```dotenv
GOOGLE_CLIENT_ID="เลขที่คัดลอกมา.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="ค่าที่คัดลอกมา"
```

**6.3 รีสตาร์ท backend** (ที่ terminal ที่ 1 กด `Ctrl+C` แล้ว `npm start` ใหม่)

**6.4 ล็อกอิน**
เปิด <http://localhost:5173> → กด **เข้าสู่ระบบด้วย Google** → เลือกบัญชี Gmail ที่ตั้งไว้ Phase 4
ระบบจะผูกบัญชี Google เข้ากับผู้ใช้ SUPER_ADMIN ให้อัตโนมัติในการล็อกอินครั้งแรก

> ✅ **Checkpoint:** เข้าสู่แดชบอร์ดได้ และเห็นเมนู "ผู้ดูแลระบบ / ผู้ดูแลระดับสูง" ที่แถบซ้าย

> 🐞 **redirect_uri_mismatch** = redirect URI ใน Google Console ไม่ตรงกับ `http://localhost:8000/auth/google/callback` (ตรวจ http/https, พอร์ต, ตัวสะกด)
> 🐞 **Access blocked / app not verified** = ยังไม่ได้เพิ่มอีเมลของคุณใน **Test users** ของ consent screen

---

## 👥 Phase 7 — นำเข้าผู้ใช้ + มอบบทบาทผู้อนุมัติ

ตอนนี้มีแค่ผู้ดูแล 1 คน ต้องเพิ่มผู้ใช้อื่นและตั้งผู้อนุมัติก่อนระบบจะทำงานครบวงจร

1. ล็อกอินเป็นผู้ดูแล → เมนู **การจัดการ → จัดการผู้ใช้งาน**
2. **ดาวน์โหลดเทมเพลต Excel** → กรอกข้อมูลผู้ใช้ (คอลัมน์ **เลขที่ตำแหน่ง** จำเป็นทุกคน)
   - ใส่คอลัมน์ยอดคงเหลือ (ลาป่วย/ลากิจ/ลาพักผ่อนคงเหลือ) หรือไม่ก็ได้ — ถ้าไม่ใส่ ระบบตั้งยอดเริ่มต้นตามสิทธิ์ให้
3. **นำเข้าไฟล์ Excel** → ระบบแจ้งจำนวนสำเร็จ/ล้มเหลว พร้อมเหตุผลรายแถว (เช่น สาขาสะกดผิด → แนะนำชื่อที่ใกล้เคียง)
4. **มอบบทบาทผู้อนุมัติ** (แท็บ *จัดการผู้อนุมัติ*): กำหนด `VERIFIER`, `APPROVER_1` (หัวหน้าสาขา), `APPROVER_2/3/4`

> ⚠️ **จำเป็นเสมอ:** ต้องมี **VERIFIER** อย่างน้อย 1 คน ไม่งั้น**การยื่นลาจะล้มเหลว** (ระบบต้องมีผู้ตรวจสอบเพื่อออกเลขที่ใบลา)

> ✅ **Checkpoint:** ผู้ใช้ทั่วไปล็อกอินแล้วยื่นลาได้ และคำขอไหลไปถึงผู้อนุมัติ

---

## 🧰 แก้ปัญหาที่พบบ่อย (Native)

| อาการ | สาเหตุ / วิธีแก้ |
|-------|-----------------|
| `npm run setup` error **1064 RENAME INDEX** | DB เป็น MariaDB < 10.5 → ใช้ MySQL 8 / MariaDB 10.5+ |
| เชื่อม DB ไม่ได้ (`P1001` / `ECONNREFUSED`) | MySQL ไม่ได้รัน, host/port/รหัสผิด, หรือรหัสมีอักขระพิเศษไม่ได้ URL-encode |
| ภาษาไทยเพี้ยนใน DB | database ไม่ได้ตั้ง `utf8mb4` → สร้าง database ใหม่ด้วย charset ที่ถูก |
| `Port 8000 already in use` | มีโปรเซสอื่นใช้พอร์ต → ปิด หรือเปลี่ยน `PORT` |
| `redirect_uri_mismatch` ตอน login | redirect URI ใน Google Console ไม่ตรง `http://localhost:8000/auth/google/callback` |
| Google ขึ้น "Access blocked" | ยังไม่เพิ่มอีเมลใน **Test users** ของ OAuth consent screen |
| ยื่นลาแล้วขึ้น "ไม่พบผู้ตรวจสอบในระบบ" | ยังไม่ได้มอบบทบาท `VERIFIER` (Phase 7) |

---

## 📋 อ้างอิง: ตัวแปร .env (Backend)

| กลุ่ม | Key | จำเป็น? |
|------|-----|--------|
| Database | `DATABASE_URL` | ✅ จำเป็น |
| Server | `PORT`, `NODE_ENV`, `BACKEND_URL`, `FRONTEND_URL` | ✅ จำเป็น |
| JWT/Session | `JWT_SECRET`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_EXPIRESIN`, `SESSION_SECRET` | ✅ จำเป็น |
| Login | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | ✅ จำเป็นเพื่อ login |
| Bootstrap | `BOOTSTRAP_SUPER_ADMIN_EMAIL` (+ PREFIX/FIRSTNAME/LASTNAME) | ทางเลือก (หรือใช้ CLI) |
| Email แจ้งเตือน | `EMAIL_*`, `OAUTH_*_RMUTI` | ทางเลือก |
| อัปโหลดไฟล์ | `CLOUDINARY_SECRET` | ทางเลือก |
| Migrate dev | `SHADOW_DATABASE_URL` | เฉพาะ `prisma migrate dev` |

**Frontend:** `VITE_BACKEND_URL` (มีผลเฉพาะเมื่อไม่ได้รันบน localhost)

---

# Part B — ติดตั้งด้วย Docker

> 🚧 **จะเพิ่มหลังทดสอบ Native เสร็จ** — จะมี `Dockerfile` ของ backend/frontend และ `docker-compose.yml`
> ที่รวม MySQL 8 + backend + frontend ให้ขึ้นทั้งชุดด้วยคำสั่งเดียว (`docker compose up`)
> โดยย้ายค่าตั้งทั้งหมดไปไว้ใน environment ของ compose แทนการติดตั้ง MySQL เองในเครื่อง

---

*จัดทำเพื่อการติดตั้งและทดสอบระบบด้วยตนเอง — หากติดปัญหาขั้นตอนใด ให้ดูตาราง "แก้ปัญหาที่พบบ่อย" ก่อน*
