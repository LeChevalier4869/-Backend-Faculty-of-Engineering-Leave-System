#!/usr/bin/env node
/**
 * Cleanup orphan approval details — ปิด leaveRequestDetail ที่ค้าง PENDING
 * ทั้งที่คำขอแม่ (leaveRequest) ถูก REJECTED/APPROVED/CANCELLED ไปแล้ว
 *
 *   node scripts/cleanup-orphan-details.js          # dry-run (แสดงอย่างเดียว)
 *   node scripts/cleanup-orphan-details.js --apply  # แก้จริง
 *
 * วิธีแก้: ตั้ง detail.status ให้ตรงกับสถานะคำขอแม่ (REJECTED/APPROVED/CANCELLED)
 */
try {
  require("dotenv").config();
} catch {}
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes("--apply");

  const pending = await prisma.leaveRequestDetail.findMany({
    where: { status: "PENDING" },
    include: { leaveRequest: { select: { id: true, status: true } } },
  });
  const orphans = pending.filter(
    (d) => d.leaveRequest && d.leaveRequest.status !== "PENDING"
  );

  console.log(`พบ orphan ${orphans.length} รายการ (จาก PENDING detail ทั้งหมด ${pending.length})`);
  for (const d of orphans) {
    console.log(
      `  detailId=${d.id} step=${d.stepOrder} | คำขอ #${d.leaveRequestId} status=${d.leaveRequest.status} → จะตั้ง detail เป็น ${d.leaveRequest.status}`
    );
  }

  if (!orphans.length) {
    console.log("✅ ไม่มี orphan ให้แก้");
    return;
  }

  if (!apply) {
    console.log("\n(dry-run) ใส่ --apply เพื่อแก้จริง");
    return;
  }

  let updated = 0;
  await prisma.$transaction(async (tx) => {
    for (const d of orphans) {
      await tx.leaveRequestDetail.update({
        where: { id: d.id },
        data: { status: d.leaveRequest.status },
      });
      updated += 1;
    }
  });
  console.log(`\n✅ แก้ไขแล้ว ${updated} รายการ`);
}

main()
  .catch((e) => {
    console.error("ERROR:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
