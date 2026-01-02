# Database Scripts

Scripts สำหรับจัดการข้อมูลใน database แบ่งตามตาราง

## 📁 โครงสร้างไฟล์

```
scripts/database/
├── README.md                           # ไฟล์นี้
├── proxy_approval/                     # Scripts สำหรับตาราง proxy_approval
│   ├── check-proxy-dates.js           # ตรวจสอบข้อมูล proxy และวันที่
│   ├── clean-all-proxies.js           # ลบข้อมูล proxy ทั้งหมดของ user ที่ระบุ
│   ├── fix-proxy-time.js              # แก้ไขเวลา proxy ให้เป็น 00:00:00
│   ├── quick-test.js                  # ทดสอบ validation แบบรวดเร็ว
│   ├── remove-wrong-proxy.js          # ลบข้อมูล proxy ที่ผิด
│   └── test-validation-logic.js        # ทดสอบ validation logic แบบละเอียด
├── users/                             # Scripts สำหรับตาราง users (สำหรับอนาคต)
├── leave_requests/                    # Scripts สำหรับตาราง leave_requests (สำหรับอนาคต)
└── [other_tables]/                    # Scripts สำหรับตารางอื่นๆ (สำหรับอนาคต)
```

## 🚀 วิธีใช้งาน

```bash
# Proxy Approval Scripts
node scripts/database/proxy_approval/check-proxy-dates.js
node scripts/database/proxy_approval/quick-test.js
node scripts/database/proxy_approval/fix-proxy-time.js
node scripts/database/proxy_approval/clean-all-proxies.js
node scripts/database/proxy_approval/remove-wrong-proxy.js
node scripts/database/proxy_approval/test-validation-logic.js
```

## 📋 รายละเอียดสคริปต์

### 🎯 proxy_approval/ (Scripts สำหรับตาราง proxy_approval)

#### ✅ ที่ใช้แล้ว
- **fix-proxy-time.js** - แก้ไขเวลา proxy จาก 14:00:00 → 00:00:00 ✅
- **quick-test.js** - ทดสอบ validation แบบรวดเร็ว ✅
- **clean-all-proxies.js** - ลบข้อมูล proxy ทั้งหมดของ User11 ✅
- **remove-wrong-proxy.js** - ลบข้อมูล proxy ที่เพิ่มผิด ✅

#### 📖 ที่ยังใช้ได้
- **check-proxy-dates.js** - ตรวจสอบข้อมูล proxy และวันที่
- **test-validation-logic.js** - ทดสอบ validation logic แบบละเอียด

## 🎯 สถานะปัจจุบัน

✅ **Backend Validation:** ทำงานถูกต้องแล้ว
- Level 2 (VERIFIER): User11 เป็น proxy ✅
- Level 3 (APPROVER_2): User11 เป็น proxy ✅  
- Level 1 (APPROVER_1): User11 ไม่เป็น proxy ✅

✅ **Database Time:** ใช้ 00:00:00 แล้ว
✅ **Proxy Data:** 2 รายการ (Level 2, 3)

## 🏗️ หลักการจัดหมวดหมู่

1. **ตามชื่อตาราง:** แบ่งตามตารางใน database (proxy_approval, users, leave_requests)
2. **ตามฟังก์ชัน:** แบ่งตามการทำงาน (create, read, update, delete, test)
3. **ตามสถานะ:** ทำเครื่องหมายว่าใช้แล้วหรือยัง (✅, 📖, ❌)
