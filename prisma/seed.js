// โหลด .env เผื่อกรณีรัน `node prisma/seed.js` ตรง ๆ (prisma db seed จะโหลดให้อยู่แล้ว)
try {
  require("dotenv").config();
} catch {
  /* dotenv ไม่จำเป็นถ้า env ถูกตั้งจากภายนอกแล้ว */
}

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// ข้อมูลตั้งต้น (master data) ดึงจาก DB จริง — สร้าง/รีเฟรชด้วย: node scripts/generate-seed-data.js
const seedData = require("./seed-data.json");

// =============================================
// System Roles — ห้ามเปลี่ยนชื่อหรือลบ
// =============================================
const SYSTEM_ROLES = [
  {
    name: "USER",
    description:
      "ผู้ใช้งานทั่วไป สำหรับผู้ที่ใช้งานระบบทั่วไป ไม่มีสิทธิ์แก้ไขข้อมูลของระบบ",
  },
  {
    name: "ADMIN",
    description:
      "ผู้ดูแลระบบ สำหรับผู้ที่ต้องกำหนดค่าบางอย่างเพื่อทำให้ระบบสามารถใช้งานได้ปกติ เป็นฝ่ายให้ข้อมูลผู้ใช้งานทั่วไป มีสิทธิ์แก้ไขข้อมูลบางอย่างของระบบ",
  },
  {
    name: "VERIFIER",
    description:
      "ผู้ตรวจสอบ หน้าที่ทำการกรอกเลขที่ใบลาบนระบบและทำการอนุมัติ",
  },
  {
    name: "APPROVER_1",
    description:
      "ผู้อนุมัติลำดับที่ 1 (หัวหน้าสาขา) หน้าที่ทำการพิจารณาการอนุมัติหรือปฏิเสธคำร้องขอการลาจากผู้ใช้งานทั่วไป",
  },
  {
    name: "APPROVER_2",
    description:
      "ผู้อนุมัติลำดับที่ 2 (สรรบรรณคณะ) หน้าที่ทำการพิจารณาการอนุมัติหรือปฏิเสธคำร้องขอการลาจากผู้ใช้งานทั่วไป",
  },
  {
    name: "APPROVER_3",
    description:
      "ผู้อนุมัติลำดับที่ 3 (รองคณบดี) หน้าที่ทำการพิจารณาการอนุมัติหรือปฏิเสธคำร้องขอการลาจากผู้ใช้งานทั่วไป",
  },
  {
    name: "APPROVER_4",
    description:
      "ผู้อนุมัติลำดับที่ 4 (คณบดี) หน้าที่ทำการพิจารณาการอนุมัติหรือปฏิเสธคำร้องขอการลาจากผู้ใช้งานทั่วไป",
  },
  {
    name: "SUPER_ADMIN",
    description:
      "ผู้ดูแลระบบขั้นสูง ทำหน้าที่ดูแลระบบทั้งหมด อนุญาตให้เข้าถึงและทำการแก้ไขข้อมูลที่ sensitive ต่อระบบ ซึ่งจะแก้ไขข้อมูลเหล่านี้เมื่อจำเป็นเท่านั้น",
  },
];

// =============================================
// Master data — มาจาก prisma/seed-data.json (ดึงจาก DB จริง)
// =============================================
const ORGANIZATIONS = seedData.organizations; // [{ name }]
const DEPARTMENTS = (seedData.departments || []).map((d) => ({
  name: d.name,
  organizationName: d.organization,
}));
const PERSONNEL_TYPES = seedData.personnelTypes; // [{ name }]
const LEAVE_TYPES = seedData.leaveTypes; // [{ name, isAvailable, isNonDeductible, resetOnFiscalYear }]
const RANKS = seedData.ranks || []; // [{ rank, personnelType, leaveType, minHireMonths, maxHireMonths, receiveDays, maxDays, isBalance }]
const STATIC_SETTINGS = seedData.settings || []; // [{ key, type, value }] ที่ไม่ใช่ค่าคำนวณ

// =============================================
// Settings
// ⚠️ ชื่อ key ต้องตรงกับที่โค้ดอ่านเป๊ะ ๆ (camelCase): fiscalYear / currentYear / runNumber
//    โค้ดเก็บ "ปีงบประมาณ" เป็น ค.ศ. (Gregorian) แล้วบวก 543 เองเมื่อต้องการ พ.ศ.
//    cron วันที่ 1 ต.ค. จะทำ setting.update({ key: "fiscalYear" }) — ถ้า key นี้ไม่มี cron จะ crash
//    runNumber รูปแบบ "คว.0001/69" (prefix.NNNN/YY=พ.ศ. 2 หลัก) เอกสารถัดไป = เลขปัจจุบัน + 1
// =============================================
function buildSettings(now = new Date()) {
  const gYear = now.getFullYear();
  // ปีงบประมาณพลิกเป็นปีถัดไปตั้งแต่ 1 ต.ค. (เดือน index 9) — ตรงกับ logic ของ cron
  const fiscalYear = now.getMonth() >= 9 ? gYear + 1 : gYear; // ค.ศ.
  const buddhistYear = fiscalYear + 543;
  const yearSuffix = String(buddhistYear).slice(-2); // 2569 -> "69"

  return [
    {
      key: "fiscalYear",
      type: "number",
      value: String(fiscalYear),
      description: "ปีงบประมาณปัจจุบัน (เก็บเป็น ค.ศ. — เปลี่ยนอัตโนมัติทุก 1 ต.ค.)",
    },
    {
      key: "currentYear",
      type: "number",
      value: String(gYear),
      description: "ปีปฏิทินปัจจุบัน (เก็บเป็น ค.ศ. — เปลี่ยนอัตโนมัติทุก 1 ม.ค.)",
    },
    {
      key: "runNumber",
      type: "string",
      value: `คว.0000/${yearSuffix}`, // เอกสารฉบับแรกที่ออกจะกลายเป็น คว.0001/<YY>
      description: "เลขที่เอกสารล่าสุดที่ออก (เอกสารถัดไป = +1) รูปแบบ คว.NNNN/YY",
    },
    {
      key: "fiscalYearStartDate",
      type: "string",
      value: `${fiscalYear - 1}-10-01`, // ปีงบเริ่ม 1 ต.ค. ของปีก่อนหน้า
      description: "วันเริ่มปีงบประมาณ",
    },
    {
      key: "fiscalYearEndDate",
      type: "string",
      value: `${fiscalYear}-09-30`, // ปีงบสิ้นสุด 30 ก.ย.
      description: "วันสิ้นสุดปีงบประมาณ",
    },
  ];
}

// =============================================
// Seed Functions
// =============================================

async function seedRoles() {
  console.log("🔐 Seeding roles...");
  for (const role of SYSTEM_ROLES) {
    const existing = await prisma.role.findFirst({ where: { name: role.name } });
    if (existing) {
      console.log(`   ✅ Role "${role.name}" already exists (ID: ${existing.id})`);
    } else {
      const created = await prisma.role.create({ data: role });
      console.log(`   ✨ Created role "${role.name}" (ID: ${created.id})`);
    }
  }
}

async function seedOrganizations() {
  console.log("🏢 Seeding organizations...");
  for (const org of ORGANIZATIONS) {
    const existing = await prisma.organization.findFirst({ where: { name: org.name } });
    if (existing) {
      console.log(`   ✅ Organization "${org.name}" already exists (ID: ${existing.id})`);
    } else {
      const created = await prisma.organization.create({ data: org });
      console.log(`   ✨ Created organization "${org.name}" (ID: ${created.id})`);
    }
  }
}

async function seedDepartments() {
  console.log("🏬 Seeding departments...");
  for (const dept of DEPARTMENTS) {
    const org = await prisma.organization.findFirst({
      where: { name: dept.organizationName },
    });
    if (!org) {
      console.log(`   ❌ Organization "${dept.organizationName}" not found, skipping "${dept.name}"`);
      continue;
    }

    const existing = await prisma.department.findFirst({
      where: { name: dept.name, organizationId: org.id },
    });
    if (existing) {
      console.log(`   ✅ Department "${dept.name}" already exists (ID: ${existing.id})`);
    } else {
      const created = await prisma.department.create({
        data: { name: dept.name, organizationId: org.id },
      });
      console.log(`   ✨ Created department "${dept.name}" (ID: ${created.id})`);
    }
  }
}

async function seedPersonnelTypes() {
  console.log("👤 Seeding personnel types...");
  for (const pt of PERSONNEL_TYPES) {
    const existing = await prisma.personnelType.findFirst({ where: { name: pt.name } });
    if (existing) {
      console.log(`   ✅ PersonnelType "${pt.name}" already exists (ID: ${existing.id})`);
    } else {
      const created = await prisma.personnelType.create({ data: pt });
      console.log(`   ✨ Created personnelType "${pt.name}" (ID: ${created.id})`);
    }
  }
}

async function seedLeaveTypes() {
  console.log("📋 Seeding leave types...");
  for (const lt of LEAVE_TYPES) {
    const existing = await prisma.leaveType.findFirst({ where: { name: lt.name } });
    if (existing) {
      console.log(`   ✅ LeaveType "${lt.name}" already exists (ID: ${existing.id})`);
    } else {
      const created = await prisma.leaveType.create({ data: lt });
      console.log(`   ✨ Created leaveType "${lt.name}" (ID: ${created.id})`);
    }
  }
}

async function seedRanks() {
  console.log("🎚️  Seeding ranks (เงื่อนไขวันลา)...");
  if (!RANKS.length) {
    console.log("   ⚠️  ไม่มีข้อมูล rank ใน seed-data.json — ข้าม (ผู้ใช้ใหม่จะไม่มีสิทธิ์วันลา!)");
    return;
  }

  // สร้าง map ชื่อ -> id (rank อ้างอิงด้วยชื่อใน seed-data.json)
  const pts = await prisma.personnelType.findMany();
  const lts = await prisma.leaveType.findMany();
  const ptByName = new Map(pts.map((p) => [p.name.trim(), p.id]));
  const ltByName = new Map(lts.map((l) => [l.name.trim(), l.id]));

  let created = 0;
  let skipped = 0;
  let missing = 0;

  for (const r of RANKS) {
    const personnelTypeId = ptByName.get(String(r.personnelType || "").trim());
    const leaveTypeId = ltByName.get(String(r.leaveType || "").trim());

    if (!personnelTypeId || !leaveTypeId) {
      missing += 1;
      console.log(
        `   ❌ ข้าม rank "${r.rank}" — ไม่พบ ${!personnelTypeId ? `personnelType "${r.personnelType}"` : `leaveType "${r.leaveType}"`}`
      );
      continue;
    }

    // idempotent: ถือว่าซ้ำถ้ามี rank ที่ pt+lt + ช่วงอายุงาน (min/maxHireMonths) เดียวกัน
    const existing = await prisma.rank.findFirst({
      where: {
        personnelTypeId,
        leaveTypeId,
        minHireMonths: r.minHireMonths ?? null,
        maxHireMonths: r.maxHireMonths ?? null,
      },
    });

    if (existing) {
      skipped += 1;
      continue;
    }

    await prisma.rank.create({
      data: {
        rank: r.rank,
        personnelTypeId,
        leaveTypeId,
        minHireMonths: r.minHireMonths ?? null,
        maxHireMonths: r.maxHireMonths ?? null,
        receiveDays: r.receiveDays ?? null,
        maxDays: r.maxDays ?? null,
        isBalance: r.isBalance ?? null,
      },
    });
    created += 1;
  }

  console.log(`   ✨ สร้าง ${created} rank, ข้าม(มีอยู่แล้ว) ${skipped}, ข้าม(ไม่พบ ref) ${missing}`);
}

async function seedSettings() {
  console.log("⚙️  Seeding settings...");
  // ค่าคำนวณ (ปีงบ/เลขเอกสาร) + ค่าคงที่จาก seed-data.json (drive_template, contact ฯลฯ)
  const settings = [...buildSettings(), ...STATIC_SETTINGS];
  for (const setting of settings) {
    const existing = await prisma.setting.findFirst({ where: { key: setting.key } });
    if (existing) {
      console.log(`   ✅ Setting "${setting.key}" already exists (value: ${existing.value})`);
    } else {
      const created = await prisma.setting.create({ data: setting });
      console.log(`   ✨ Created setting "${setting.key}" = "${created.value}"`);
    }
  }

  // เตือนถ้าพบ key รูปแบบเก่า (snake_case) ที่โค้ดไม่ได้ใช้ — ไม่ลบให้อัตโนมัติเพื่อความปลอดภัย
  const legacyKeys = ["fiscal_year", "current_year", "document_number_counter"];
  const legacy = await prisma.setting.findMany({ where: { key: { in: legacyKeys } } });
  if (legacy.length > 0) {
    console.log(
      `   ⚠️  พบ setting key รูปแบบเก่าที่โค้ดไม่ใช้แล้ว: ${legacy
        .map((s) => s.key)
        .join(", ")} (ปล่อยไว้ได้ ไม่กระทบระบบ หรือจะลบทิ้งภายหลังก็ได้)`
    );
  }
}

async function seedSuperAdmin() {
  console.log("🛡️  Seeding bootstrap SUPER_ADMIN user...");

  // ระบบ login ผ่าน Google OAuth เท่านั้น — ผู้ดูแลคนแรกต้องเป็น "อีเมล Google จริง" (@rmuti.ac.th)
  // เมื่อมี user row ที่ email ตรงอยู่แล้ว ระบบจะ auto-link Google account ให้ตอน login ครั้งแรกเอง
  // (ดู auth-service.loginWithOAuth) จึงไม่ต้องสร้างรหัสผ่าน/บัญชี local
  const bootstrapEmail = (process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL || "").trim().toLowerCase();

  const superAdminRole = await prisma.role.findFirst({ where: { name: "SUPER_ADMIN" } });
  const userRole = await prisma.role.findFirst({ where: { name: "USER" } });
  const adminRole = await prisma.role.findFirst({ where: { name: "ADMIN" } });

  if (!superAdminRole || !userRole || !adminRole) {
    console.log("   ❌ ไม่พบ role ที่จำเป็น (USER/ADMIN/SUPER_ADMIN) — ข้ามการสร้างผู้ดูแล");
    return;
  }

  // ถ้ามี SUPER_ADMIN อยู่แล้ว ไม่ต้องทำอะไร (idempotent)
  const existingSuperAdmin = await prisma.userRole.findFirst({
    where: { roleId: superAdminRole.id },
    include: { user: true },
  });
  if (existingSuperAdmin) {
    console.log(
      `   ✅ มี SUPER_ADMIN อยู่แล้ว: ${existingSuperAdmin.user.email} (ID: ${existingSuperAdmin.user.id}) — ข้าม`
    );
    return;
  }

  if (!bootstrapEmail) {
    console.log("   ⚠️  ยังไม่ได้ตั้งค่า env BOOTSTRAP_SUPER_ADMIN_EMAIL — ข้ามการสร้างผู้ดูแลคนแรก");
    console.log("      ➜ ตั้งค่าในไฟล์ .env เป็นอีเมล Google (@rmuti.ac.th) ของผู้ดูแล แล้วรัน seed อีกครั้ง");
    console.log('      ตัวอย่าง: BOOTSTRAP_SUPER_ADMIN_EMAIL="somchai.it@rmuti.ac.th"');
    return;
  }

  // ป้องกันซ้ำ: ถ้ามี user email นี้อยู่แล้ว ให้แค่ผูก role SUPER_ADMIN/ADMIN/USER เพิ่ม
  let user = await prisma.user.findFirst({ where: { email: bootstrapEmail } });

  if (!user) {
    const dept = await prisma.department.findFirst();
    const pt = await prisma.personnelType.findFirst();
    if (!dept || !pt) {
      console.log("   ❌ ไม่พบ department หรือ personnelType — ข้ามการสร้างผู้ดูแล (seed master data ก่อน)");
      return;
    }

    user = await prisma.user.create({
      data: {
        prefixName: process.env.BOOTSTRAP_SUPER_ADMIN_PREFIX || "นาย",
        firstName: process.env.BOOTSTRAP_SUPER_ADMIN_FIRSTNAME || "ผู้ดูแล",
        lastName: process.env.BOOTSTRAP_SUPER_ADMIN_LASTNAME || "ระบบ",
        email: bootstrapEmail,
        sex: "male",
        phone: "000-000-0000",
        position: "ผู้ดูแลระบบขั้นสูง",
        hireDate: new Date(),
        employmentType: "SUPPORT",
        departmentId: dept.id,
        personnelTypeId: pt.id,
      },
    });
    console.log(`   ✨ สร้าง user ผู้ดูแล: ${bootstrapEmail} (ID: ${user.id})`);
  } else {
    console.log(`   ℹ️  พบ user email นี้อยู่แล้ว (ID: ${user.id}) — จะผูก role ผู้ดูแลเพิ่ม`);
  }

  // ผูก roles: USER + ADMIN + SUPER_ADMIN (กันซ้ำด้วย @@unique([userId, roleId]))
  await prisma.userRole.createMany({
    data: [
      { userId: user.id, roleId: userRole.id },
      { userId: user.id, roleId: adminRole.id },
      { userId: user.id, roleId: superAdminRole.id },
    ],
    skipDuplicates: true,
  });

  console.log(`   ✅ ตั้งค่า SUPER_ADMIN ให้ ${bootstrapEmail} เรียบร้อย`);
  console.log("      ➜ เข้าสู่ระบบครั้งแรกผ่านปุ่ม Login with Google ด้วยอีเมลนี้ (ระบบจะผูกบัญชีให้อัตโนมัติ)");
}

// =============================================
// Main
// =============================================
async function main() {
  console.log("═══════════════════════════════════════════");
  console.log("  🌱 eLeave RMUTI — Seed Data");
  console.log("═══════════════════════════════════════════\n");

  await seedRoles();
  console.log("");
  await seedOrganizations();
  console.log("");
  await seedDepartments();
  console.log("");
  await seedPersonnelTypes();
  console.log("");
  await seedLeaveTypes();
  console.log("");
  await seedRanks();
  console.log("");
  await seedSettings();
  console.log("");
  await seedSuperAdmin();

  console.log("\n═══════════════════════════════════════════");
  console.log("  ✅ Seed completed successfully!");
  console.log("═══════════════════════════════════════════");
}

// รัน seed เฉพาะเมื่อเรียกไฟล์นี้ตรง ๆ (เพื่อให้ require ฟังก์ชันไปทดสอบได้โดยไม่เชื่อมต่อ DB)
if (require.main === module) {
  main()
    .catch((e) => {
      console.error("❌ Seed failed:", e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

module.exports = { buildSettings };
