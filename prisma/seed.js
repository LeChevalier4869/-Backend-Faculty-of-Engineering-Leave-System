const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

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
// Organization & Department
// =============================================
const ORGANIZATIONS = [
  { name: "คณะวิศวกรรมศาสตร์" },
];

const DEPARTMENTS = [
  { name: "สำนักงานคณบดี", organizationName: "คณะวิศวกรรมศาสตร์" },
  { name: "สาขาวิศวกรรมไฟฟ้า", organizationName: "คณะวิศวกรรมศาสตร์" },
  { name: "สาขาวิศวกรรมโยธา", organizationName: "คณะวิศวกรรมศาสตร์" },
  { name: "สาขาวิศวกรรมอุตสาหการ", organizationName: "คณะวิศวกรรมศาสตร์" },
  { name: "สาขาวิศวกรรมเครื่องกล", organizationName: "คณะวิศวกรรมศาสตร์" },
  { name: "สาขาวิศวกรรมคอมพิวเตอร์", organizationName: "คณะวิศวกรรมศาสตร์" },
  { name: "สาขาวิศวกรรมอิเล็กทรอนิกส์", organizationName: "คณะวิศวกรรมศาสตร์" },
];

// =============================================
// Personnel Types
// =============================================
const PERSONNEL_TYPES = [
  { name: "ข้าราชการ" },
  { name: "พนักงานราชการ" },
  { name: "พนักงานในสถาบันอุดมศึกษา" },
];

// =============================================
// Leave Types
// =============================================
const LEAVE_TYPES = [
  { name: "ลาป่วย", isAvailable: true, isNonDeductible: false, resetOnFiscalYear: true },
  { name: "ลากิจส่วนตัว", isAvailable: true, isNonDeductible: false, resetOnFiscalYear: true },
  { name: "ลาพักผ่อน", isAvailable: true, isNonDeductible: false, resetOnFiscalYear: true },
  { name: "ลาคลอดบุตร", isAvailable: true, isNonDeductible: true, resetOnFiscalYear: false },
  { name: "ลาอุปสมบท", isAvailable: true, isNonDeductible: true, resetOnFiscalYear: false },
  { name: "ลาเข้ารับการตรวจเลือก", isAvailable: true, isNonDeductible: true, resetOnFiscalYear: false },
  { name: "ลาศึกษาต่อ", isAvailable: true, isNonDeductible: true, resetOnFiscalYear: false },
  { name: "ลาไปต่างประเทศ", isAvailable: true, isNonDeductible: true, resetOnFiscalYear: false },
];

// =============================================
// Settings
// =============================================
const SETTINGS = [
  {
    key: "fiscal_year",
    type: "number",
    value: "2568",
    description: "ปีงบประมาณปัจจุบัน",
  },
  {
    key: "current_year",
    type: "number",
    value: "2568",
    description: "ปีปฏิทินปัจจุบัน",
  },
  {
    key: "document_number_counter",
    type: "number",
    value: "0",
    description: "ตัวนับเลขที่เอกสาร",
  },
];

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

async function seedSettings() {
  console.log("⚙️  Seeding settings...");
  for (const setting of SETTINGS) {
    const existing = await prisma.setting.findFirst({ where: { key: setting.key } });
    if (existing) {
      console.log(`   ✅ Setting "${setting.key}" already exists (value: ${existing.value})`);
    } else {
      const created = await prisma.setting.create({ data: setting });
      console.log(`   ✨ Created setting "${setting.key}" = "${created.value}"`);
    }
  }
}

async function seedSuperAdmin() {
  console.log("🛡️  Seeding SUPER_ADMIN user...");

  // ตรวจสอบว่ามี SUPER_ADMIN user อยู่แล้วหรือไม่
  const superAdminRole = await prisma.role.findFirst({ where: { name: "SUPER_ADMIN" } });
  const userRole = await prisma.role.findFirst({ where: { name: "USER" } });
  const adminRole = await prisma.role.findFirst({ where: { name: "ADMIN" } });

  if (!superAdminRole || !userRole || !adminRole) {
    console.log("   ❌ Required roles not found, skipping SUPER_ADMIN user creation");
    return;
  }

  const existingSuperAdmin = await prisma.userRole.findFirst({
    where: { roleId: superAdminRole.id },
    include: { user: true },
  });

  if (existingSuperAdmin) {
    console.log(`   ✅ SUPER_ADMIN user already exists: ${existingSuperAdmin.user.firstName} ${existingSuperAdmin.user.lastName} (ID: ${existingSuperAdmin.user.id})`);
    return;
  }

  // ดึง department และ personnelType แรกที่มี
  const dept = await prisma.department.findFirst();
  const pt = await prisma.personnelType.findFirst();

  if (!dept || !pt) {
    console.log("   ❌ No department or personnelType found, skipping SUPER_ADMIN user creation");
    return;
  }

  // สร้าง SUPER_ADMIN user
  const hashedPassword = await bcrypt.hash("superadmin@1234", 10);

  const user = await prisma.user.create({
    data: {
      prefixName: "นาย",
      firstName: "ผู้ดูแล",
      lastName: "ระบบ",
      email: "superadmin@eleave.rmuti.ac.th",
      sex: "male",
      phone: "000-000-0000",
      position: "ผู้ดูแลระบบขั้นสูง",
      hireDate: new Date(),
      employmentType: "SUPPORT",
      departmentId: dept.id,
      personnelTypeId: pt.id,
    },
  });

  // กำหนด roles: USER + ADMIN + SUPER_ADMIN
  await prisma.userRole.createMany({
    data: [
      { userId: user.id, roleId: userRole.id },
      { userId: user.id, roleId: adminRole.id },
      { userId: user.id, roleId: superAdminRole.id },
    ],
  });

  // สร้าง account (local provider)
  await prisma.account.create({
    data: {
      userId: user.id,
      provider: "local",
      providerAccountId: hashedPassword,
    },
  });

  console.log(`   ✨ Created SUPER_ADMIN user (ID: ${user.id})`);
  console.log(`      Email: superadmin@eleave.rmuti.ac.th`);
  console.log(`      Password: superadmin@1234`);
  console.log(`      ⚠️  กรุณาเปลี่ยนรหัสผ่านทันทีหลัง login ครั้งแรก!`);
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
  await seedSettings();
  console.log("");
  await seedSuperAdmin();

  console.log("\n═══════════════════════════════════════════");
  console.log("  ✅ Seed completed successfully!");
  console.log("═══════════════════════════════════════════");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
