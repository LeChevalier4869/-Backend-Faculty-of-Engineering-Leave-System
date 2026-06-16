const prisma = require("../config/prisma");
const { sendNotification } = require("./emailService");

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * รวมคำขอลาที่อยู่ในสถานะ PENDING และค้างเกิน thresholdDays วัน โดยจัดกลุ่มตามผู้อนุมัติ
 * @param {number} thresholdDays จำนวนวันที่ถือว่า "ค้าง"
 * @returns {Promise<Array<{approver:object, count:number, oldest:Date}>>}
 */
async function getOverduePending(thresholdDays = 3) {
  const cutoff = new Date(Date.now() - thresholdDays * DAY_MS);

  const pendingDetails = await prisma.leaveRequestDetail.findMany({
    where: {
      status: "PENDING",
      reviewedAt: { lte: cutoff },
      // นับเฉพาะ detail ที่คำขอแม่ยัง PENDING อยู่จริง
      // กัน orphan: detail ที่ค้างใต้คำขอที่ถูก REJECTED/APPROVED/CANCELLED ไปแล้ว
      leaveRequest: { status: "PENDING" },
    },
    include: {
      approver: {
        select: {
          id: true,
          email: true,
          prefixName: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  const byApprover = new Map();
  for (const d of pendingDetails) {
    if (!d.approver?.email) continue;
    const existing = byApprover.get(d.approver.id);
    if (existing) {
      existing.count += 1;
      if (d.reviewedAt && d.reviewedAt < existing.oldest) existing.oldest = d.reviewedAt;
    } else {
      byApprover.set(d.approver.id, {
        approver: d.approver,
        count: 1,
        oldest: d.reviewedAt || cutoff,
      });
    }
  }

  return [...byApprover.values()];
}

/**
 * ส่งอีเมลเตือนผู้อนุมัติที่มีคำขอลาค้างเกิน thresholdDays วัน
 * @returns {Promise<{approvers:number, emailsSent:number, thresholdDays:number}>}
 */
async function sendPendingApprovalReminders(thresholdDays = 3) {
  const groups = await getOverduePending(thresholdDays);
  let emailsSent = 0;

  for (const g of groups) {
    const oldestDays = Math.floor((Date.now() - new Date(g.oldest).getTime()) / DAY_MS);
    try {
      await sendNotification("PENDING_REMINDER", {
        to: g.approver.email,
        userName: `${g.approver.prefixName || ""} ${g.approver.firstName} ${g.approver.lastName}`.trim(),
        count: g.count,
        oldestDays,
      });
      emailsSent += 1;
    } catch (err) {
      console.error("Failed to send pending-reminder email:", err.message);
    }
  }

  return { approvers: groups.length, emailsSent, thresholdDays };
}

module.exports = { sendPendingApprovalReminders, getOverduePending };
