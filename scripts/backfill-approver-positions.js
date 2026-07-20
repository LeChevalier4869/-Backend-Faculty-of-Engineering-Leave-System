#!/usr/bin/env node
/**
 * Backfill ทะเบียนผู้ดำรงตำแหน่งผู้อนุมัติระดับคณะ (approver_position)
 * จากผู้ที่ถือบทบาทอยู่จริงในตอนนี้ (UserRole) เพื่อให้ทะเบียนไม่ว่างเปล่าในวันแรก
 *
 *   node scripts/backfill-approver-positions.js          # dry-run (แสดงอย่างเดียว)
 *   node scripts/backfill-approver-positions.js --apply  # เขียนจริง
 *
 * - ระดับ 1 (APPROVER_1 / หัวหน้าสาขา) ไม่แตะ เพราะผูกกับ Department.headId
 * - ถ้าระดับใดมีผู้ถือบทบาทมากกว่า 1 คน จะ "ไม่เดา" ให้ข้ามและรายงานให้แก้เอง
 * - ถ้ามีทะเบียน active อยู่แล้วจะข้าม (idempotent)
 */
try {
  require("dotenv").config();
} catch {
  /* env อาจถูกตั้งจากภายนอกแล้ว */
}
const prisma = require("../src/config/prisma");

const FACULTY_LEVELS = {
  2: "VERIFIER",
  3: "APPROVER_2",
  4: "APPROVER_3",
  5: "APPROVER_4",
};

const name = (u) =>
  `${u.prefixName || ""}${u.firstName || ""} ${u.lastName || ""}`.trim();

async function main() {
  const apply = process.argv.includes("--apply");

  const org = await prisma.organization.findFirst({ orderBy: { id: "asc" } });
  if (!org) throw new Error("ยังไม่มีข้อมูลหน่วยงานในระบบ");

  console.log(`หน่วยงานที่ใช้บันทึกทะเบียน: ${org.name} (id=${org.id})`);
  console.log(apply ? "โหมด: เขียนจริง (--apply)\n" : "โหมด: dry-run\n");

  const plan = [];

  for (const [levelStr, roleName] of Object.entries(FACULTY_LEVELS)) {
    const level = Number(levelStr);

    const existing = await prisma.approverPosition.findFirst({
      where: { level, isActive: true },
      include: { user: true },
    });
    if (existing) {
      console.log(
        `ระดับ ${level} (${roleName}): มีทะเบียนอยู่แล้ว -> ${name(existing.user)} — ข้าม`
      );
      continue;
    }

    const holders = await prisma.userRole.findMany({
      where: { role: { name: roleName } },
      include: { user: true },
    });

    if (holders.length === 0) {
      console.log(`ระดับ ${level} (${roleName}): ไม่มีผู้ถือบทบาท — ข้าม`);
      continue;
    }
    if (holders.length > 1) {
      console.log(
        `ระดับ ${level} (${roleName}): ⚠️ มีผู้ถือบทบาท ${holders.length} คน (${holders
          .map((h) => name(h.user))
          .join(", ")}) — ข้าม ต้องเลือกเองในหน้าจัดการผู้อนุมัติ`
      );
      continue;
    }

    const holder = holders[0];
    console.log(`ระดับ ${level} (${roleName}): จะบันทึก -> ${name(holder.user)}`);
    plan.push({ level, userId: holder.userId });
  }

  if (!plan.length) {
    console.log("\nไม่มีรายการที่ต้องบันทึกเพิ่ม");
    return;
  }

  if (!apply) {
    console.log(`\n(dry-run) จะสร้างทะเบียน ${plan.length} รายการ — ใส่ --apply เพื่อเขียนจริง`);
    return;
  }

  const now = new Date();
  await prisma.$transaction(
    plan.map((p) =>
      prisma.approverPosition.create({
        data: {
          userId: p.userId,
          organizationId: org.id,
          level: p.level,
          appointDate: now,
          isActive: true,
        },
      })
    )
  );

  console.log(`\n✅ สร้างทะเบียนแล้ว ${plan.length} รายการ`);
}

main()
  .catch((e) => {
    console.error("❌", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
