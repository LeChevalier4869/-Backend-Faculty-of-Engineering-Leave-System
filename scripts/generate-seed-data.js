#!/usr/bin/env node
/**
 * Generate seed data (READ-ONLY query) — ดึง master data จาก DB จริงมาสร้างไฟล์ prisma/seed-data.json
 * ที่ seed.js จะใช้เป็นข้อมูลตั้งต้น
 *
 *   node scripts/generate-seed-data.js
 *
 * - rank อ้างอิง personnelType/leaveType ด้วย "ชื่อ" (ไม่ใช่ id) เพื่อให้ seed ใหม่บน DB เปล่าได้
 * - กรองข้อมูลทดสอบ/ขยะออก (ดู JUNK_DEPARTMENTS ด้านล่าง)
 * - ไม่เขียน/แก้ไขข้อมูลใน DB
 */
try {
  require("dotenv").config();
} catch {}
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// แผนกที่เป็นข้อมูลทดสอบ หรือเป็นของที่ seed รุ่นก่อนใส่ผิด (ชื่อ "สาขาวิศวกรรม..." ซ้ำกับชื่อจริง "วิศวกรรม...")
const JUNK_DEPARTMENTS = new Set([
  "New Department",
  "Updated Department",
  "สำนักงานคณบดี",
  "สาขาวิศวกรรมไฟฟ้า",
  "สาขาวิศวกรรมโยธา",
  "สาขาวิศวกรรมอุตสาหการ",
  "สาขาวิศวกรรมเครื่องกล",
  "สาขาวิศวกรรมคอมพิวเตอร์",
  "สาขาวิศวกรรมอิเล็กทรอนิกส์",
]);

// setting ที่ไม่ใช่ค่าที่ "คำนวณได้" (fiscalYear/currentYear/runNumber/วันที่ปีงบ จะถูกสร้างใน seed.js)
// และไม่เอาค่า test ออกไป
const SKIP_SETTING_KEYS = new Set([
  "fiscalYear",
  "currentYear",
  "runNumber",
  "fiscalYearStartDate",
  "fiscalYearEndDate",
  "leave_policy_2", // ดูเหมือนข้อมูลทดสอบ
]);

async function main() {
  const [orgs, depts, pts, lts, ranks, settings] = await Promise.all([
    prisma.organization.findMany({ orderBy: { id: "asc" } }),
    prisma.department.findMany({ orderBy: { id: "asc" }, include: { organization: true } }),
    prisma.personnelType.findMany({ orderBy: { id: "asc" } }),
    prisma.leaveType.findMany({ orderBy: { id: "asc" } }),
    prisma.rank.findMany({
      orderBy: [{ personnelTypeId: "asc" }, { leaveTypeId: "asc" }, { minHireMonths: "asc" }],
      include: { leaveType: true, personnelType: true },
    }),
    prisma.setting.findMany({ orderBy: { key: "asc" } }),
  ]);

  // กรองแผนกขยะออก
  const keptDepts = depts.filter((d) => !JUNK_DEPARTMENTS.has(d.name.trim()));
  // เก็บเฉพาะองค์กรที่ยังมีแผนกอ้างอิงอยู่
  const orgNamesInUse = new Set(keptDepts.map((d) => d.organization?.name).filter(Boolean));
  const keptOrgs = orgs.filter((o) => orgNamesInUse.has(o.name));

  const data = {
    _meta: {
      note: "สร้างอัตโนมัติจาก DB จริงด้วย scripts/generate-seed-data.js — แก้ไขได้ตามต้องการ",
      generatedFromCounts: {
        organizations: keptOrgs.length,
        departments: keptDepts.length,
        personnelTypes: pts.length,
        leaveTypes: lts.length,
        ranks: ranks.length,
      },
    },
    organizations: keptOrgs.map((o) => ({ name: o.name })),
    departments: keptDepts.map((d) => ({ name: d.name, organization: d.organization?.name })),
    personnelTypes: pts.map((p) => ({ name: p.name })),
    leaveTypes: lts.map((l) => ({
      name: l.name,
      isAvailable: l.isAvailable,
      isNonDeductible: l.isNonDeductible,
      resetOnFiscalYear: l.resetOnFiscalYear,
    })),
    ranks: ranks.map((r) => ({
      rank: r.rank,
      personnelType: r.personnelType?.name,
      leaveType: r.leaveType?.name,
      minHireMonths: r.minHireMonths,
      maxHireMonths: r.maxHireMonths,
      receiveDays: r.receiveDays,
      maxDays: r.maxDays,
      isBalance: r.isBalance,
    })),
    settings: settings
      .filter((s) => !SKIP_SETTING_KEYS.has(s.key))
      .map((s) => ({ key: s.key, type: s.type, value: s.value })),
  };

  const outPath = path.resolve(__dirname, "..", "prisma", "seed-data.json");
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`✅ เขียน ${outPath}`);
  console.log("   counts:", JSON.stringify(data._meta.generatedFromCounts));
  console.log("   departments:", data.departments.map((d) => d.name).join(", "));
  console.log("   organizations:", data.organizations.map((o) => o.name).join(", "));
  console.log("   settings(static):", data.settings.map((s) => s.key).join(", "));
}

main()
  .catch((e) => {
    console.error("ERROR:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
