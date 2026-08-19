#!/usr/bin/env node
/**
 * คืนคำขอลาที่ถูก "ข้ามขั้นหัวหน้าสาขา" ให้กลับมาเริ่มที่ขั้นที่ 1 ตามปกติ
 *
 *   node scripts/restore-first-step-approvals.js          # dry-run
 *   node scripts/restore-first-step-approvals.js --apply  # แก้จริง
 *
 * ที่มา: เคยมีกติกาชั่วคราวว่า "ถ้าผู้ยื่นเป็นผู้อนุมัติเอง ให้ข้ามขั้น"
 * ซึ่งทำให้ใบลาไม่ได้เลขที่ (เลขที่ออกตอนผู้ตรวจสอบอนุมัติ) และหน้ารายละเอียด
 * แสดงขั้นตอนไม่ครบ ปัจจุบันอนุญาตให้อนุมัติคำขอของตนเองได้แล้ว
 *
 * เกณฑ์: เลือกเฉพาะรายการ PENDING ที่อยู่ขั้น > 1 และ "ไม่มีขั้นก่อนหน้าเลย"
 * (ถ้ามีขั้นก่อนหน้าที่อนุมัติแล้ว แปลว่าเดินตามสายมาจริง ไม่ต้องแตะ)
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

  const candidates = await prisma.leaveRequestDetail.findMany({
    where: {
      status: "PENDING",
      stepOrder: { not: 1 },
      leaveRequest: { status: "PENDING" },
    },
    include: {
      leaveRequest: {
        select: {
          id: true,
          userId: true,
          user: {
            select: {
              prefixName: true,
              firstName: true,
              lastName: true,
              department: {
                select: {
                  name: true,
                  headId: true,
                  head: {
                    select: { prefixName: true, firstName: true, lastName: true },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { leaveRequestId: "asc" },
  });

  const fixes = [];
  const skipped = [];

  for (const d of candidates) {
    const siblings = await prisma.leaveRequestDetail.count({
      where: { leaveRequestId: d.leaveRequestId },
    });

    // มีขั้นก่อนหน้าแล้ว = เดินตามสายมาจริง ไม่ใช่การข้ามขั้น
    if (siblings > 1) {
      skipped.push({ id: d.leaveRequest.id, step: d.stepOrder, why: "เดินตามสายมาจริง" });
      continue;
    }

    const dept = d.leaveRequest.user.department;
    if (!dept?.headId) {
      skipped.push({ id: d.leaveRequest.id, step: d.stepOrder, why: "สาขายังไม่มีหัวหน้า" });
      continue;
    }

    fixes.push({
      detailId: d.id,
      requestId: d.leaveRequest.id,
      fromStep: d.stepOrder,
      fromApprover: d.approverId,
      toApprover: dept.headId,
      requester: name(d.leaveRequest.user),
      dept: dept.name,
      head: name(dept.head),
    });
  }

  console.log("=== จะคืนกลับไปขั้นที่ 1 ===");
  if (!fixes.length) console.log("  (ไม่มี)");
  for (const f of fixes) {
    console.log(
      `  คำขอ #${f.requestId} | ${f.requester} (${f.dept})\n` +
        `      ขั้น ${f.fromStep} -> 1 | ผู้อนุมัติ user#${f.fromApprover} -> user#${f.toApprover} (${f.head})`
    );
  }

  if (skipped.length) {
    console.log("\n=== ไม่แตะ ===");
    for (const s of skipped) {
      console.log(`  คำขอ #${s.id} (ขั้น ${s.step}) — ${s.why}`);
    }
  }

  if (!fixes.length) return;

  if (!apply) {
    console.log(`\n(dry-run) จะคืน ${fixes.length} รายการ — ใส่ --apply เพื่อแก้จริง`);
    return;
  }

  await prisma.$transaction(
    fixes.map((f) =>
      prisma.leaveRequestDetail.update({
        where: { id: f.detailId },
        data: { stepOrder: 1, approverId: f.toApprover },
      })
    )
  );

  console.log(`\n✅ คืนกลับขั้นที่ 1 แล้ว ${fixes.length} รายการ`);
}

main()
  .catch((e) => {
    console.error("❌", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
