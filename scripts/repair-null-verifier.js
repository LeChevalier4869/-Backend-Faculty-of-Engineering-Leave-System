#!/usr/bin/env node
/**
 * เติม verifierId ให้คำขอลาที่ค้างเป็น null
 *
 *   node scripts/repair-null-verifier.js          # dry-run
 *   node scripts/repair-null-verifier.js --apply  # แก้จริง
 *
 * ที่มา: เคยมีช่วงที่ระบบตั้ง verifierId = null เมื่อผู้ยื่นเป็นผู้ตรวจสอบเอง
 * ทำให้หน้ารายละเอียดการลาโหลดไม่ได้ (getUserByIdWithRoles(null) โยน error -> 500)
 * ปัจจุบันระบบกำหนดผู้ตรวจสอบให้เสมอแล้ว สคริปต์นี้ล้างของเก่าที่ค้าง
 *
 * เกณฑ์: ตั้งเป็นผู้ถือบทบาท VERIFIER ปัจจุบัน (ระบบมีคนเดียว)
 */
try {
  require("dotenv").config();
} catch {
  /* env อาจถูกตั้งจากภายนอกแล้ว */
}
const prisma = require("../src/config/prisma");

const name = (u) =>
  u ? `${u.prefixName || ""}${u.firstName || ""} ${u.lastName || ""}`.trim() : "-";

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "โหมด: แก้จริง (--apply)\n" : "โหมด: dry-run\n");

  const nullVerifier = await prisma.leaveRequest.findMany({
    where: { verifierId: null },
    select: {
      id: true,
      userId: true,
      status: true,
      user: { select: { prefixName: true, firstName: true, lastName: true } },
    },
    orderBy: { id: "asc" },
  });

  if (!nullVerifier.length) {
    console.log("✅ ไม่มีคำขอที่ verifierId ว่าง");
    return;
  }

  const verifiers = await prisma.userRole.findMany({
    where: { role: { name: "VERIFIER" } },
    select: { userId: true, user: { select: { prefixName: true, firstName: true, lastName: true } } },
    orderBy: { userId: "asc" },
  });

  if (!verifiers.length) {
    console.log("⚠️ ไม่มีผู้ถือบทบาท VERIFIER ในระบบ — กำหนดผู้ตรวจสอบก่อนจึงจะซ่อมได้");
    return;
  }

  console.log(`คำขอที่ verifierId ว่าง: ${nullVerifier.length}`);
  for (const r of nullVerifier) {
    // ถ้าเป็นได้ให้เลือก VERIFIER ที่ไม่ใช่ผู้ยื่น แต่ถ้าไม่มีก็ใช้คนที่มี
    const target =
      verifiers.find((v) => v.userId !== r.userId) || verifiers[0];
    console.log(
      `  #${r.id} (${name(r.user)}, ${r.status}) -> verifier user#${target.userId} (${name(target.user)})`
    );
    r._target = target.userId;
  }

  if (!apply) {
    console.log(`\n(dry-run) จะเติม verifierId ให้ ${nullVerifier.length} รายการ — ใส่ --apply`);
    return;
  }

  await prisma.$transaction(
    nullVerifier.map((r) =>
      prisma.leaveRequest.update({
        where: { id: r.id },
        data: { verifierId: r._target },
      })
    )
  );

  console.log(`\n✅ เติม verifierId แล้ว ${nullVerifier.length} รายการ`);
}

main()
  .catch((e) => {
    console.error("❌", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
