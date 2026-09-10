#!/usr/bin/env node
/**
 * จัดเรียง Role.id ของสายอนุมัติให้เรียงตามลำดับ: APPROVER_1 ต้องมี id น้อยกว่า APPROVER_2
 * (หลัง migrate-roles-approver5 มักได้ APPROVER_2=id3, APPROVER_1=id4 ซึ่งสลับกัน)
 *
 *   node scripts/swap-role-ids-order.js          # dry-run
 *   node scripts/swap-role-ids-order.js --apply  # เขียนจริง
 *
 * ทำการสลับค่า Role.id ของ APPROVER_1 <-> APPROVER_2 ผ่าน temp id 3 สเต็ปในทรานแซกชันเดียว
 * อาศัย FK ON UPDATE CASCADE (Prisma default) → user_role.roleId ตามให้อัตโนมัติ สิทธิ์ผู้ใช้ไม่หลุด
 * ปลอดภัยแบบ fail-safe: ถ้า DB ไม่ cascade จะ error แล้ว rollback ทั้งก้อน (ไม่ทำข้อมูลพัง)
 *
 * ⚠️ เป็นการแก้ Primary Key บน prod — แนะนำ backup DB ก่อน และรันเอง (ผู้ช่วยไม่แตะ prod)
 * ⚠️ ต้องรัน migrate-roles-approver5.js --apply ให้เสร็จก่อน (มี APPROVER_1 และ APPROVER_2 แล้ว)
 */
try {
  require("dotenv").config();
} catch {
  /* env อาจถูกตั้งจากภายนอกแล้ว */
}
const prisma = require("../src/config/prisma");

const apply = process.argv.includes("--apply");

async function main() {
  console.log(`โหมด: ${apply ? "APPLY (เขียนจริง)" : "DRY-RUN (แสดงอย่างเดียว)"}\n`);

  const a1 = await prisma.role.findFirst({ where: { name: "APPROVER_1" } });
  const a2 = await prisma.role.findFirst({ where: { name: "APPROVER_2" } });

  if (await prisma.role.findFirst({ where: { name: "VERIFIER" } })) {
    console.log("‼️ ยังพบ role VERIFIER — กรุณารัน migrate-roles-approver5.js --apply ก่อน");
    return;
  }
  if (!a1 || !a2) {
    console.log("‼️ ไม่พบ APPROVER_1 หรือ APPROVER_2 — ตรวจสอบว่า migrate เสร็จแล้ว");
    return;
  }

  console.log(`ปัจจุบัน: APPROVER_1 = id ${a1.id}, APPROVER_2 = id ${a2.id}`);

  if (a1.id < a2.id) {
    console.log("✅ เรียงถูกต้องอยู่แล้ว (APPROVER_1 < APPROVER_2) — ไม่ต้องทำอะไร");
    return;
  }

  const smallId = a2.id; // APPROVER_2 ถือ id น้อยอยู่ (ต้องเป็นของ APPROVER_1)
  const bigId = a1.id; // APPROVER_1 ถือ id มากอยู่ (ต้องเป็นของ APPROVER_2)

  const maxRole = await prisma.role.aggregate({ _max: { id: true } });
  const TEMP = (maxRole._max.id || 0) + 1000; // temp id ที่ไม่ชนกับใคร

  console.log(
    `แผน: สลับให้ APPROVER_1 = id ${smallId}, APPROVER_2 = id ${bigId} (ใช้ temp id ${TEMP})`,
  );
  console.log("  1) APPROVER_2: " + smallId + " → " + TEMP);
  console.log("  2) APPROVER_1: " + bigId + " → " + smallId);
  console.log("  3) APPROVER_2: " + TEMP + " → " + bigId);
  console.log("  (user_role.roleId จะตามอัตโนมัติผ่าน FK ON UPDATE CASCADE)");

  if (!apply) {
    console.log("\n(dry-run) ใส่ --apply เพื่อเขียนจริง — แนะนำ backup DB ก่อน");
    return;
  }

  await prisma.$transaction([
    prisma.role.update({ where: { id: smallId }, data: { id: TEMP } }),
    prisma.role.update({ where: { id: bigId }, data: { id: smallId } }),
    prisma.role.update({ where: { id: TEMP }, data: { id: bigId } }),
  ]);

  const after = await prisma.role.findMany({
    where: { name: { in: ["APPROVER_1", "APPROVER_2", "APPROVER_3", "APPROVER_4", "APPROVER_5"] } },
    orderBy: { id: "asc" },
  });
  console.log("\n✅ สลับเสร็จ — สายอนุมัติเรียงตาม id:");
  for (const r of after) console.log(`  id#${r.id} ${r.name}`);
}

main()
  .catch((e) => {
    console.error("❌", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
