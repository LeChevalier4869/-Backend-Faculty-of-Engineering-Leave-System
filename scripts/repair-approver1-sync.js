#!/usr/bin/env node
/**
 * ซ่อมความสอดคล้องของบทบาท APPROVER_1 กับหัวหน้าสาขา
 *
 * กติกาที่ควรเป็นจริงเสมอ:
 *   ผู้ใช้มีบทบาท APPROVER_1  ⟺  เป็นหัวหน้าอย่างน้อย 1 สาขา
 *
 * ทำไมถึงเพี้ยนได้: เดิมมีหลายเส้นทางที่เปลี่ยนหัวหน้าสาขาโดยไม่ sync บทบาท
 * (แก้แล้วใน fix(admin): repair approver role integrity around department heads)
 * สคริปต์นี้ใช้ล้างข้อมูลที่ค้างมาจากก่อนหน้านั้น
 *
 *   node scripts/repair-approver1-sync.js          # dry-run (แสดงอย่างเดียว)
 *   node scripts/repair-approver1-sync.js --apply  # แก้จริง
 *
 * ความปลอดภัย: จะไม่ถอดบทบาทจากผู้ที่ยังมีงานอนุมัติขั้นที่ 1 ค้างอยู่ (PENDING)
 */
try {
  require("dotenv").config();
} catch {
  /* env อาจถูกตั้งจากภายนอกแล้ว */
}
const prisma = require("../src/config/prisma");

const fullName = (u) =>
  `${u.prefixName || ""}${u.firstName || ""} ${u.lastName || ""}`.trim();

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "โหมด: แก้จริง (--apply)\n" : "โหมด: dry-run\n");

  const role = await prisma.role.findFirst({ where: { name: "APPROVER_1" } });
  if (!role) throw new Error("ไม่พบบทบาท APPROVER_1 ในระบบ");

  const [departments, holderRows] = await Promise.all([
    prisma.department.findMany({
      where: { headId: { not: null } },
      select: {
        id: true,
        name: true,
        headId: true,
        head: { select: { id: true, prefixName: true, firstName: true, lastName: true } },
        _count: { select: { users: true } },
      },
      orderBy: { id: "asc" },
    }),
    prisma.userRole.findMany({
      where: { roleId: role.id },
      include: {
        user: { select: { id: true, prefixName: true, firstName: true, lastName: true } },
      },
    }),
  ]);

  const holderIds = new Set(holderRows.map((r) => r.userId));
  const headIds = new Set(departments.map((d) => d.headId));

  // 1) หัวหน้าสาขาที่ยังไม่มีบทบาท -> ต้องเพิ่ม
  const missing = [];
  const seen = new Set();
  for (const d of departments) {
    if (holderIds.has(d.headId) || seen.has(d.headId)) continue;
    seen.add(d.headId);
    const owned = departments.filter((x) => x.headId === d.headId);
    const staff = owned.reduce((n, x) => n + x._count.users, 0);
    missing.push({ user: d.head, departments: owned, staff });
  }

  console.log("=== หัวหน้าสาขาที่ยังไม่มีบทบาท APPROVER_1 ===");
  if (!missing.length) console.log("  (ไม่มี)");
  for (const m of missing) {
    console.log(
      `  + ${fullName(m.user)} (user#${m.user.id}) — เป็นหัวหน้า ${m.departments.length} สาขา, พนักงานรวม ${m.staff} คน`
    );
    m.departments.forEach((d) =>
      console.log(`      • ${d.name} (พนักงาน ${d._count.users})`)
    );
  }

  // 2) ผู้ถือบทบาทที่ไม่ได้เป็นหัวหน้าสาขาใดเลย -> ควรถอด (ถ้าไม่มีงานค้าง)
  const orphans = [];
  for (const r of holderRows) {
    if (headIds.has(r.userId)) continue;
    const pending = await prisma.leaveRequestDetail.count({
      where: { approverId: r.userId, stepOrder: 1, status: "PENDING" },
    });
    orphans.push({ user: r.user, pending });
  }

  console.log("\n=== ผู้ถือบทบาท APPROVER_1 ที่ไม่ได้เป็นหัวหน้าสาขาใดเลย ===");
  if (!orphans.length) console.log("  (ไม่มี)");
  for (const o of orphans) {
    console.log(
      `  - ${fullName(o.user)} (user#${o.user.id})` +
        (o.pending
          ? `  ⚠️ มีงานอนุมัติขั้นที่ 1 ค้าง ${o.pending} รายการ — จะไม่ถอด`
          : "  → จะถอดบทบาท")
    );
  }

  const toAdd = missing.map((m) => m.user.id);
  const toRemove = orphans.filter((o) => o.pending === 0).map((o) => o.user.id);

  if (!toAdd.length && !toRemove.length) {
    console.log("\n✅ ข้อมูลสอดคล้องกันอยู่แล้ว ไม่ต้องแก้");
    return;
  }

  if (!apply) {
    console.log(
      `\n(dry-run) จะเพิ่มบทบาทให้ ${toAdd.length} คน และถอดออกจาก ${toRemove.length} คน — ใส่ --apply เพื่อแก้จริง`
    );
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (toAdd.length) {
      await tx.userRole.createMany({
        data: toAdd.map((userId) => ({ userId, roleId: role.id })),
        skipDuplicates: true,
      });
    }
    if (toRemove.length) {
      await tx.userRole.deleteMany({
        where: { userId: { in: toRemove }, roleId: role.id },
      });
    }
  });

  console.log(
    `\n✅ แก้ไขแล้ว — เพิ่มบทบาท ${toAdd.length} คน, ถอดบทบาท ${toRemove.length} คน`
  );
}

main()
  .catch((e) => {
    console.error("❌", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
