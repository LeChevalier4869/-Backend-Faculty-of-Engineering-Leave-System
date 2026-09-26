#!/usr/bin/env node
/**
 * Migrate สายอนุมัติ: ตัด VERIFIER → เป็น APPROVER_1..APPROVER_5 (contiguous)
 *
 *   node scripts/migrate-roles-approver5.js          # dry-run (แสดงอย่างเดียว)
 *   node scripts/migrate-roles-approver5.js --apply  # เขียนจริง
 *
 * วิธีทำงาน: "เปลี่ยนชื่อ Role rows ในที่เดิม" (คง Role.id ไว้) → UserRole/สิทธิ์ผู้ใช้ไม่หลุด
 *   APPROVER_4 → APPROVER_5,  APPROVER_3 → APPROVER_4,  APPROVER_2 → APPROVER_3,
 *   VERIFIER   → APPROVER_2,  APPROVER_1 คงชื่อเดิม (อัปเดตคำอธิบาย)
 * ทำจากบนลงล่างเพื่อกันชื่อชนกัน. idempotent: รันซ้ำจะไม่เจอชื่อเก่าแล้ว → ข้าม
 *
 * ⚠️ ควร "เคลียร์ใบลาที่ค้าง (PENDING) ก่อน" ตามที่ตกลงไว้ — สคริปต์จะเตือนถ้ายังมี
 * ⚠️ รันบน DB ที่ตั้งใจเท่านั้น (ผู้ใช้รันเอง — ไม่รันจากผู้ช่วย)
 */
try {
  require("dotenv").config();
} catch {
  /* env อาจถูกตั้งจากภายนอกแล้ว */
}
const prisma = require("../src/config/prisma");

const apply = process.argv.includes("--apply");

// ทำจากลำดับสูง → ต่ำ เพื่อกันชื่อชนกันระหว่างเปลี่ยน
const RENAMES = [
  {
    from: "APPROVER_4",
    to: "APPROVER_5",
    description:
      "ผู้อนุมัติลำดับที่ 5 (คณบดี) หน้าที่ทำการพิจารณาการอนุมัติหรือปฏิเสธคำร้องขอการลา (ขั้นสุดท้าย)",
  },
  {
    from: "APPROVER_3",
    to: "APPROVER_4",
    description:
      "ผู้อนุมัติลำดับที่ 4 (รองคณบดีฝ่ายบริหาร) หน้าที่ทำการพิจารณาการอนุมัติหรือปฏิเสธคำร้องขอการลา",
  },
  {
    from: "APPROVER_2",
    to: "APPROVER_3",
    description:
      "ผู้อนุมัติลำดับที่ 3 (หัวหน้าสำนักงานคณบดี) หน้าที่ทำการพิจารณาการอนุมัติหรือปฏิเสธคำร้องขอการลา",
  },
  {
    from: "VERIFIER",
    to: "APPROVER_2",
    description:
      "ผู้อนุมัติลำดับที่ 2 (สารบรรณคณะ) หน้าที่ตรวจสอบและออกเลขที่ใบลา แล้วพิจารณาอนุมัติหรือปฏิเสธคำร้องขอการลา",
  },
  {
    from: "APPROVER_1",
    to: "APPROVER_1",
    description:
      "ผู้อนุมัติลำดับที่ 1 (หัวหน้าสาขา) หน้าที่ทำการพิจารณาการอนุมัติหรือปฏิเสธคำร้องขอการลาจากผู้ใช้งานทั่วไป",
  },
];

const FINAL_ROLES = [
  "USER",
  "ADMIN",
  "SUPER_ADMIN",
  "APPROVER_1",
  "APPROVER_2",
  "APPROVER_3",
  "APPROVER_4",
  "APPROVER_5",
];

async function main() {
  console.log(`โหมด: ${apply ? "APPLY (เขียนจริง)" : "DRY-RUN (แสดงอย่างเดียว)"}\n`);

  // เตือนถ้ายังมีใบลาค้าง
  const pendingCount = await prisma.leaveRequest.count({
    where: { status: "PENDING" },
  });
  if (pendingCount > 0) {
    console.log(
      `⚠️ ยังมีใบลาสถานะ PENDING อยู่ ${pendingCount} ใบ — แนะนำให้เคลียร์ก่อน migrate (สายอนุมัติของใบเหล่านั้นอาจเพี้ยน)\n`,
    );
  }

  console.log("=== แผนการเปลี่ยนชื่อ Role (คง Role.id เดิม) ===");
  for (const r of RENAMES) {
    const role = await prisma.role.findFirst({ where: { name: r.from } });
    if (!role) {
      console.log(`  - ${r.from}: ไม่พบ (อาจ migrate ไปแล้ว) → ข้าม`);
      continue;
    }
    const nameChange = r.from !== r.to ? `${r.from} → ${r.to}` : `${r.from} (คงชื่อ)`;
    console.log(`  - id#${role.id}: ${nameChange} + อัปเดตคำอธิบาย`);
    if (apply) {
      await prisma.role.update({
        where: { id: role.id },
        data: { name: r.to, description: r.description },
      });
    }
  }

  // กันกรณีบาง role หายไป (เช่น prod ไม่เคยมี APPROVER_4) → สร้างที่ขาดให้ครบ
  if (apply) {
    for (const r of RENAMES) {
      const exists = await prisma.role.findFirst({ where: { name: r.to } });
      if (!exists) {
        console.log(`  + สร้าง role ที่ขาด: ${r.to}`);
        await prisma.role.create({ data: { name: r.to, description: r.description } });
      }
    }
  }

  console.log("\n=== Role ทั้งหมดในระบบ (หลังดำเนินการ) ===");
  const roles = await prisma.role.findMany({ orderBy: { id: "asc" } });
  for (const role of roles) {
    const flag = FINAL_ROLES.includes(role.name) ? "" : "  ‼️ ไม่อยู่ในชุดมาตรฐาน";
    console.log(`  id#${role.id} ${role.name}${flag}`);
  }
  const leftoverVerifier = roles.find((x) => x.name === "VERIFIER");
  if (leftoverVerifier) {
    console.log("\n‼️ ยังพบ role VERIFIER อยู่ — ตรวจสอบว่ามี user ถืออยู่หรือ role ซ้ำ");
  }

  if (!apply) {
    console.log("\n(dry-run) ใส่ --apply เพื่อเขียนจริง");
  } else {
    console.log("\n✅ migrate เสร็จ — ตรวจรายการ role ด้านบนให้เป็น APPROVER_1..5 ครบ");
  }
}

main()
  .catch((e) => {
    console.error("❌", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
