/**
 * ลบประเภทการลา "ขยะ" ที่ใช้ทดสอบออกจากฐานข้อมูล — ปลอดภัย (ตรวจ reference ก่อนลบ)
 *
 * เป้าหมาย: ลบ 3 ประเภทที่เป็นชื่อสั้น/ซ้ำซึ่งเพิ่มไว้ตอนทดสอบ
 *   - "ลาเข้ารับการตรวจเลือก"   (ซ้ำกับ "ลาเข้ารับการตรวจเลือกเข้ารับการเตรียมพล")
 *   - "ลาศึกษาต่อ"              (ซ้ำกับ "ลาไปศึกษา ฝึกอบรม ปฏิบัติการวิจัย หรือดูงาน")
 *   - "ลาไปต่างประเทศ"
 *
 * การใช้งาน (รันที่โฟลเดอร์ backend, ใช้ DATABASE_URL จาก .env):
 *   node scripts/cleanup-junk-leavetypes.js            # dry-run: ตรวจอย่างเดียว ไม่ลบ
 *   node scripts/cleanup-junk-leavetypes.js --apply    # ลบจริง (เฉพาะตัวที่ไม่มีอะไรอ้างอิง)
 *
 * ความปลอดภัย:
 *   - จับคู่ด้วย "ชื่อเป๊ะ" เท่านั้น (ไม่แตะตัวชื่อเต็มตามระเบียบ)
 *   - นับ reference จาก rank / leaveBalance / leaveRequest ก่อน ถ้ามีอ้างอิง > 0 จะ "ข้าม" ไม่ลบ
 *   - แนะนำ backup ก่อน: npm run db:backup
 */
try {
  require("dotenv").config();
} catch {
  /* env อาจถูกตั้งจากภายนอกแล้ว */
}
const prisma = require("../src/config/prisma");

const JUNK_NAMES = ["ลาเข้ารับการตรวจเลือก", "ลาศึกษาต่อ", "ลาไปต่างประเทศ"];

async function main() {
  const apply = process.argv.includes("--apply");
  console.log("═══════════════════════════════════════════");
  console.log(`  ล้างประเภทการลาขยะ — โหมด: ${apply ? "APPLY (ลบจริง)" : "DRY-RUN (ตรวจอย่างเดียว)"}`);
  console.log("═══════════════════════════════════════════\n");

  const rows = await prisma.leaveType.findMany({
    where: { name: { in: JUNK_NAMES } },
    include: { _count: { select: { leaveBalances: true, leaveRequests: true, Rank: true } } },
    orderBy: { id: "asc" },
  });

  if (rows.length === 0) {
    console.log("✅ ไม่พบประเภทการลาขยะทั้ง 3 ตัวในฐานข้อมูลนี้ — ไม่มีอะไรต้องทำ");
    return;
  }

  const safe = [];
  const blocked = [];

  for (const lt of rows) {
    const { leaveBalances, leaveRequests, Rank } = lt._count;
    const total = leaveBalances + leaveRequests + Rank;
    const line = `#${lt.id} "${lt.name}" — refs: rank=${Rank}, balance=${leaveBalances}, request=${leaveRequests}`;
    if (total === 0) {
      console.log(`  🟢 ลบได้  ${line}`);
      safe.push(lt);
    } else {
      console.log(`  🔴 ข้าม   ${line}  (มีข้อมูลอ้างอิง — ไม่ลบเพื่อความปลอดภัย)`);
      blocked.push(lt);
    }
  }

  // เตือนถ้ามีชื่อขยะที่หาไม่เจอ (อาจถูกลบไปแล้ว)
  const foundNames = new Set(rows.map((r) => r.name));
  const missing = JUNK_NAMES.filter((n) => !foundNames.has(n));
  if (missing.length) {
    console.log(`\n  ℹ️  ไม่พบในฐานข้อมูล (อาจถูกลบไปแล้ว): ${missing.join(", ")}`);
  }

  console.log("");
  if (!apply) {
    console.log(`DRY-RUN: จะลบ ${safe.length} ตัว, ข้าม ${blocked.length} ตัว`);
    console.log("➜ เพิ่ม --apply เพื่อลบจริง (แนะนำ backup ก่อน: npm run db:backup)");
    return;
  }

  if (safe.length === 0) {
    console.log("ไม่มีตัวที่ลบได้อย่างปลอดภัย — จบการทำงาน");
    return;
  }

  const result = await prisma.leaveType.deleteMany({
    where: { id: { in: safe.map((l) => l.id) } },
  });
  console.log(`✅ ลบประเภทการลาขยะแล้ว ${result.count} ตัว: ${safe.map((l) => l.name).join(", ")}`);
  if (blocked.length) {
    console.log(`⚠️  ข้าม ${blocked.length} ตัวที่มีข้อมูลอ้างอิง: ${blocked.map((l) => l.name).join(", ")}`);
  }
}

main()
  .catch((e) => {
    console.error("❌ ผิดพลาด:", e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
