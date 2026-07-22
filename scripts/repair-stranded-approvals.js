#!/usr/bin/env node
/**
 * ซ่อมคำขอลาที่ "ค้าง" เพราะผู้อนุมัติที่บันทึกไว้ไม่มีสิทธิ์อนุมัติแล้ว
 *
 *   node scripts/repair-stranded-approvals.js          # dry-run
 *   node scripts/repair-stranded-approvals.js --apply  # แก้จริง
 *
 * ที่มา: คิวอนุมัติกรองด้วย "ผู้ที่ถือบทบาทระดับนั้นอยู่ตอนนี้" ตัดกับ approverId ที่บันทึกไว้
 * เมื่อเปลี่ยนหัวหน้าสาขา ระบบถอดบทบาทจากคนเก่า คำขอที่ค้างจึงหลุดจากคิวทั้งของคนเก่าและคนใหม่
 * (แก้ที่ต้นเหตุแล้วใน admin-service.assignHead / updateDepartment — สคริปต์นี้ล้างของเก่าที่ค้างไว้)
 *
 * ขั้นที่ 1 (หัวหน้าสาขา) -> โอนให้หัวหน้าสาขาปัจจุบันของผู้ยื่น
 * ขั้นอื่น ๆ              -> โอนให้ผู้ถือบทบาทระดับนั้นในปัจจุบัน
 * ทุกกรณีจะไม่โอนให้ผู้ยื่นคำขอเอง
 */
try {
  require("dotenv").config();
} catch {
  /* env อาจถูกตั้งจากภายนอกแล้ว */
}
const prisma = require("../src/config/prisma");

// stepOrder -> ชื่อบทบาทที่รับผิดชอบขั้นนั้น
const STEP_ROLE = {
  1: "APPROVER_1",
  2: "VERIFIER",
  4: "APPROVER_2",
  5: "APPROVER_3",
  6: "APPROVER_4",
};

const name = (u) =>
  u ? `${u.prefixName || ""}${u.firstName || ""} ${u.lastName || ""}`.trim() : "-";

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "โหมด: แก้จริง (--apply)\n" : "โหมด: dry-run\n");

  // ผู้ถือบทบาทปัจจุบันของแต่ละระดับ
  const roleHolders = {};
  for (const [step, roleName] of Object.entries(STEP_ROLE)) {
    const rows = await prisma.userRole.findMany({
      where: { role: { name: roleName } },
      select: { userId: true },
    });
    roleHolders[step] = new Set(rows.map((r) => r.userId));
  }

  const pending = await prisma.leaveRequestDetail.findMany({
    where: { status: "PENDING", leaveRequest: { status: "PENDING" } },
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
              departmentId: true,
              department: {
                select: {
                  name: true,
                  headId: true,
                  head: {
                    select: { id: true, prefixName: true, firstName: true, lastName: true },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { id: "asc" },
  });

  const fixes = [];
  const unfixable = [];

  for (const d of pending) {
    const holders = roleHolders[d.stepOrder];
    if (!holders) continue; // ขั้นที่ไม่รู้จัก ข้ามไป

    const stillValid = holders.has(d.approverId);
    const isSelf = d.approverId === d.leaveRequest.userId;
    if (stillValid && !isSelf) continue; // ปกติดี

    let target = null;
    let newStep = d.stepOrder;

    if (d.stepOrder === 1) {
      const head = d.leaveRequest.user.department?.head;
      if (head && head.id !== d.leaveRequest.userId) {
        target = head.id;
      } else {
        // ผู้ยื่นเป็นหัวหน้าสาขาเอง (หรือสาขาไม่มีหัวหน้า)
        // -> ไล่ขึ้นตามสายอนุมัติจนเจอผู้รับผิดชอบที่ไม่ใช่ผู้ยื่นเอง
        //    (ตรงกับ LeaveRequestService.resolveFirstPendingStep)
        for (const step of [2, 4, 5, 6]) {
          const holder = await prisma.userRole.findFirst({
            where: {
              role: { name: STEP_ROLE[step] },
              userId: { not: d.leaveRequest.userId },
            },
            orderBy: { id: "asc" },
          });
          if (holder) {
            target = holder.userId;
            newStep = step;
            break;
          }
        }
      }
    } else {
      // ขั้นอื่น: ลองขั้นเดิมก่อน ถ้าผู้ถือบทบาทเป็นผู้ยื่นเอง ให้ไล่ขึ้นขั้นถัดไป
      const chain = [2, 4, 5, 6].filter((s) => s >= d.stepOrder);
      for (const step of chain) {
        const holder = await prisma.userRole.findFirst({
          where: {
            role: { name: STEP_ROLE[step] },
            userId: { not: d.leaveRequest.userId },
          },
          orderBy: { id: "asc" },
        });
        if (holder) {
          target = holder.userId;
          newStep = step;
          break;
        }
      }
    }

    const info = {
      detailId: d.id,
      requestId: d.leaveRequest.id,
      step: d.stepOrder,
      newStep,
      requester: name(d.leaveRequest.user),
      dept: d.leaveRequest.user.department?.name || "-",
      from: d.approverId,
      to: target,
      reason: isSelf ? "ผู้อนุมัติคือผู้ยื่นเอง" : "ผู้อนุมัติไม่มีบทบาทนี้แล้ว",
    };
    if (target) fixes.push(info);
    else unfixable.push(info);
  }

  console.log(`ตรวจคำขอที่รอดำเนินการ ${pending.length} รายการ\n`);

  console.log("=== ค้างและซ่อมได้ ===");
  if (!fixes.length) console.log("  (ไม่มี)");
  for (const f of fixes) {
    const stepNote =
      f.newStep !== f.step
        ? ` -> ข้ามไปขั้น ${f.newStep} (${STEP_ROLE[f.newStep]})`
        : "";
    console.log(
      `  คำขอ #${f.requestId} ขั้น ${f.step}${stepNote} | ${f.requester} (${f.dept})\n` +
        `      ${f.reason} — โอน user#${f.from} -> user#${f.to}`
    );
  }

  if (unfixable.length) {
    console.log("\n=== ค้างแต่ยังซ่อมไม่ได้ (ต้องกำหนดผู้รับผิดชอบก่อน) ===");
    for (const f of unfixable) {
      console.log(
        `  ⚠️ คำขอ #${f.requestId} ขั้น ${f.step} | ${f.requester} (${f.dept}) — ${f.reason}`
      );
    }
  }

  if (!fixes.length) return;

  if (!apply) {
    console.log(`\n(dry-run) จะโอน ${fixes.length} รายการ — ใส่ --apply เพื่อแก้จริง`);
    return;
  }

  await prisma.$transaction(
    fixes.map((f) =>
      prisma.leaveRequestDetail.update({
        where: { id: f.detailId },
        data: { approverId: f.to, stepOrder: f.newStep },
      })
    )
  );

  console.log(`\n✅ โอนผู้อนุมัติแล้ว ${fixes.length} รายการ`);
}

main()
  .catch((e) => {
    console.error("❌", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
