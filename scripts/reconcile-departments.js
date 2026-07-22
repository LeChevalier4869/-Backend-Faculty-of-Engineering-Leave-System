#!/usr/bin/env node
/**
 * ปรับรายชื่อสาขาใน DB ให้ตรงกับโครงสร้างจริงของ
 * คณะวิศวกรรมศาสตร์ มทร.อีสาน วิทยาเขตขอนแก่น (eng.rmuti.ac.th)
 *
 *   node scripts/reconcile-departments.js          # dry-run
 *   node scripts/reconcile-departments.js --apply  # แก้จริง
 *
 * ที่มาของความเพี้ยน: การทดสอบระบบจัดการแผนกทำให้เกิดสาขาซ้ำที่ขึ้นต้นด้วย "สาขา..."
 * และมี "New Department" ค้างไว้ ส่วน "วิศวกรรมไฟฟ้า" ซึ่งมีจริงกลับหายไป
 *
 * ความปลอดภัย: จะไม่ลบสาขาที่ยังมีพนักงานสังกัด หรือที่ถูกตั้งเป็นหัวหน้าไว้
 */
try {
  require("dotenv").config();
} catch {
  /* env อาจถูกตั้งจากภายนอกแล้ว */
}
const prisma = require("../src/config/prisma");

// เปลี่ยนชื่อให้ตรงรูปแบบเดียวกับสาขาอื่น (ไม่มีคำนำหน้า "สาขา")
const RENAME = [{ from: "สาขาวิศวกรรมไฟฟ้า", to: "วิศวกรรมไฟฟ้า" }];

// สาขาซ้ำ/ข้อมูลทดสอบ ที่ต้องลบ
const DELETE_NAMES = [
  "New Department",
  "สาขาวิศวกรรมโยธา",
  "สาขาวิศวกรรมอุตสาหการ",
  "สาขาวิศวกรรมเครื่องกล",
  "สาขาวิศวกรรมคอมพิวเตอร์",
  "สาขาวิศวกรรมอิเล็กทรอนิกส์",
];

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(apply ? "โหมด: แก้จริง (--apply)\n" : "โหมด: dry-run\n");

  const all = await prisma.department.findMany({
    select: {
      id: true,
      name: true,
      headId: true,
      _count: { select: { users: true } },
    },
    orderBy: { id: "asc" },
  });
  const byName = new Map(all.map((d) => [d.name.trim(), d]));

  // ---------- เปลี่ยนชื่อ ----------
  const renames = [];
  console.log("=== เปลี่ยนชื่อให้ตรงรูปแบบ ===");
  for (const r of RENAME) {
    const dept = byName.get(r.from);
    if (!dept) {
      console.log(`  (ข้าม) ไม่พบ "${r.from}"`);
      continue;
    }
    if (byName.has(r.to)) {
      console.log(`  ⚠️ มี "${r.to}" อยู่แล้ว — ข้ามการเปลี่ยนชื่อ "${r.from}"`);
      continue;
    }
    console.log(`  [${dept.id}] "${r.from}" → "${r.to}"`);
    renames.push({ id: dept.id, name: r.to });
  }
  if (!renames.length) console.log("  (ไม่มี)");

  // ---------- ลบ ----------
  const deletes = [];
  console.log("\n=== ลบสาขาซ้ำ/ข้อมูลทดสอบ ===");
  for (const name of DELETE_NAMES) {
    const dept = byName.get(name);
    if (!dept) {
      console.log(`  (ข้าม) ไม่พบ "${name}"`);
      continue;
    }
    if (dept._count.users > 0) {
      console.log(`  ⚠️ "${name}" มีพนักงาน ${dept._count.users} คน — ไม่ลบ`);
      continue;
    }
    // สาขาขยะที่ถูกตั้งหัวหน้าไว้ก็ยังลบได้ (การตั้งหัวหน้าให้สาขาที่ไม่มีอยู่จริงคือข้อมูลขยะเช่นกัน)
    const headNote = dept.headId ? ` (เคลียร์หัวหน้า user#${dept.headId} ก่อนลบ)` : "";
    console.log(`  [${dept.id}] ลบ "${name}"${headNote}`);
    deletes.push(dept.id);
  }
  if (!deletes.length) console.log("  (ไม่มี)");

  if (!renames.length && !deletes.length) {
    console.log("\n✅ รายชื่อสาขาตรงกับข้อมูลจริงอยู่แล้ว");
    return;
  }

  if (!apply) {
    console.log(
      `\n(dry-run) จะเปลี่ยนชื่อ ${renames.length} รายการ และลบ ${deletes.length} รายการ — ใส่ --apply เพื่อแก้จริง`
    );
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const r of renames) {
      await tx.department.update({ where: { id: r.id }, data: { name: r.name } });
    }
    if (deletes.length) {
      // ปลดหัวหน้าออกก่อน เพื่อไม่ให้ FK ค้าง แล้วจึงลบ
      await tx.department.updateMany({
        where: { id: { in: deletes } },
        data: { headId: null },
      });
      await tx.department.deleteMany({ where: { id: { in: deletes } } });
    }
  });

  const after = await prisma.department.count();
  console.log(
    `\n✅ เรียบร้อย — เปลี่ยนชื่อ ${renames.length}, ลบ ${deletes.length} | คงเหลือ ${after} สาขา`
  );
}

main()
  .catch((e) => {
    console.error("❌", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
