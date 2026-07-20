#!/usr/bin/env node
/**
 * สุ่มจัดสรรพนักงานเข้าสาขา และแต่งตั้งหัวหน้าสาขา 1 คนต่อ 1 สาขา
 * (ใช้จัดระเบียบข้อมูลตัวอย่างให้ดูสมจริง — ไม่ใช่งานประจำวัน)
 *
 *   node scripts/randomize-department-staffing.js          # dry-run
 *   node scripts/randomize-department-staffing.js --apply  # แก้จริง
 *
 * กติกา:
 * - ผู้ใช้ทุกคนถูกสุ่มสังกัดใหม่ ยกเว้น KEEP_USER_IDS (ผู้ดำรงตำแหน่งระดับคณะ)
 * - ไม่สุ่มใครเข้า "แผนกชั่วคราว" (เป็นที่พักสำหรับคนที่ยังไม่ถูกจัดสรร)
 * - ทุกสาขาได้หัวหน้า 1 คน และ 1 คนเป็นหัวหน้าได้ไม่เกิน 1 สาขา
 * - หัวหน้าต้องเป็นคนที่สังกัดสาขานั้นจริง
 * - sync บทบาท APPROVER_1 ให้ตรงกับหัวหน้าชุดใหม่เสมอ
 */
try {
  require("dotenv").config();
} catch {
  /* env อาจถูกตั้งจากภายนอกแล้ว */
}
const prisma = require("../src/config/prisma");

const KEEP_USER_IDS = [10, 11, 12]; // คงสังกัดเดิม (ถือตำแหน่งระดับคณะ)
const PLACEHOLDER_DEPT = "แผนกชั่วคราว (รอจัดสรรคนเข้าแผนก)";

const fullName = (u) =>
  `${u.prefixName || ""}${u.firstName || ""} ${u.lastName || ""}`.trim();

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "โหมด: แก้จริง (--apply)\n" : "โหมด: dry-run\n");

  const allDepts = await prisma.department.findMany({
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });
  const targetDepts = allDepts.filter((d) => d.name.trim() !== PLACEHOLDER_DEPT);
  if (!targetDepts.length) throw new Error("ไม่พบสาขาปลายทางสำหรับจัดสรร");

  const users = await prisma.user.findMany({
    select: {
      id: true,
      prefixName: true,
      firstName: true,
      lastName: true,
      departmentId: true,
    },
    orderBy: { id: "asc" },
  });

  const keep = users.filter((u) => KEEP_USER_IDS.includes(u.id));
  const movable = users.filter((u) => !KEEP_USER_IDS.includes(u.id));

  console.log(`สาขาปลายทาง ${targetDepts.length} สาขา | ผู้ใช้ ${users.length} คน`);
  console.log(`คงสังกัดเดิม ${keep.length} คน: ${keep.map((u) => "user#" + u.id).join(", ")}`);
  console.log(`สุ่มสังกัดใหม่ ${movable.length} คน\n`);

  // ---------- 1) กระจายคนลงสาขา ----------
  // แจกคนละ 1 คนให้ครบทุกสาขาก่อน เพื่อให้ทุกสาขามีคน (จะได้ตั้งหัวหน้าได้)
  const pool = shuffle(movable);
  const assignment = new Map(); // userId -> departmentId
  const membersOf = new Map(targetDepts.map((d) => [d.id, []]));

  // คนที่คงเดิม ให้ถือว่าเป็นสมาชิกสาขาเดิมของตัวเอง
  for (const u of keep) {
    if (membersOf.has(u.departmentId)) membersOf.get(u.departmentId).push(u);
  }

  targetDepts.forEach((d, i) => {
    if (i < pool.length) {
      const u = pool[i];
      assignment.set(u.id, d.id);
      membersOf.get(d.id).push(u);
    }
  });
  for (let i = targetDepts.length; i < pool.length; i++) {
    const u = pool[i];
    const d = targetDepts[Math.floor(Math.random() * targetDepts.length)];
    assignment.set(u.id, d.id);
    membersOf.get(d.id).push(u);
  }

  // ---------- 2) เลือกหัวหน้า 1 คนต่อสาขา ----------
  const usedHeads = new Set();
  const heads = new Map(); // departmentId -> user

  // ให้ผู้ที่คงสังกัดเดิมได้เป็นหัวหน้าสาขาตัวเองก่อน (รักษาโครงสร้างเดิมไว้)
  for (const u of keep) {
    if (membersOf.has(u.departmentId) && !heads.has(u.departmentId)) {
      heads.set(u.departmentId, u);
      usedHeads.add(u.id);
    }
  }
  for (const d of targetDepts) {
    if (heads.has(d.id)) continue;
    const candidate = shuffle(membersOf.get(d.id)).find((u) => !usedHeads.has(u.id));
    if (candidate) {
      heads.set(d.id, candidate);
      usedHeads.add(candidate.id);
    }
  }

  console.log("=== ผลการจัดสรร ===");
  for (const d of targetDepts) {
    const head = heads.get(d.id);
    console.log(
      `  ${d.name.padEnd(32)} | คน ${String(membersOf.get(d.id).length).padStart(3)} | หัวหน้า: ${
        head ? fullName(head) + " (user#" + head.id + ")" : "— ไม่มีผู้เหมาะสม"
      }`
    );
  }

  const withoutHead = targetDepts.filter((d) => !heads.get(d.id));
  if (withoutHead.length) {
    console.log(`\n⚠️ สาขาที่ยังไม่มีหัวหน้า: ${withoutHead.length}`);
  }

  if (!apply) {
    console.log(
      `\n(dry-run) จะย้ายสังกัด ${assignment.size} คน และตั้งหัวหน้า ${heads.size} สาขา — ใส่ --apply เพื่อแก้จริง`
    );
    return;
  }

  // ---------- 3) เขียนลงฐานข้อมูล ----------
  const approver1 = await prisma.role.findFirst({ where: { name: "APPROVER_1" } });
  if (!approver1) throw new Error("ไม่พบบทบาท APPROVER_1 ในระบบ");

  const headIds = [...heads.values()].map((u) => u.id);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // ย้ายสังกัด (จัดกลุ่มตามสาขาเพื่อลดจำนวน query)
    const byDept = new Map();
    for (const [userId, deptId] of assignment) {
      if (!byDept.has(deptId)) byDept.set(deptId, []);
      byDept.get(deptId).push(userId);
    }
    for (const [deptId, userIds] of byDept) {
      await tx.user.updateMany({
        where: { id: { in: userIds } },
        data: { departmentId: deptId },
      });
    }

    // ล้างหัวหน้าเดิมทั้งหมด แล้วตั้งใหม่
    await tx.department.updateMany({ data: { headId: null } });
    for (const [deptId, head] of heads) {
      await tx.department.update({
        where: { id: deptId },
        data: { headId: head.id, appointDate: now },
      });
    }

    // sync บทบาท APPROVER_1 ให้ตรงกับหัวหน้าชุดใหม่
    await tx.userRole.deleteMany({
      where: { roleId: approver1.id, userId: { notIn: headIds } },
    });
    await tx.userRole.createMany({
      data: headIds.map((userId) => ({ userId, roleId: approver1.id })),
      skipDuplicates: true,
    });
  });

  console.log(
    `\n✅ เรียบร้อย — ย้ายสังกัด ${assignment.size} คน, ตั้งหัวหน้า ${heads.size} สาขา, sync บทบาท APPROVER_1 ${headIds.length} คน`
  );
}

main()
  .catch((e) => {
    console.error("❌", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
