/**
 * สร้าง/เลื่อนบัญชีเป็น SUPER_ADMIN ผ่าน CLI — สำหรับ bootstrap ระบบครั้งแรกหลัง deploy
 * (ตอน deploy ฐานข้อมูลใหม่จะยังไม่มีผู้ใช้ ต้องมีผู้ดูแลคนแรกก่อนจึงจะ setup ต่อได้)
 *
 * การใช้งาน:
 *   node scripts/create-super-admin.js --email someone@rmuti.ac.th
 *   node scripts/create-super-admin.js --email a@rmuti.ac.th --first สมชาย --last ใจดี --prefix นาย
 *   node scripts/create-super-admin.js --email a@rmuti.ac.th --dry-run
 *
 * พฤติกรรม:
 *   - ต้องรัน seed (roles) มาก่อน — ถ้ายังไม่มี role USER/ADMIN/SUPER_ADMIN จะเตือนให้ seed ก่อน
 *   - ถ้ายังไม่มี user email นี้ จะสร้างให้ (ใช้ department/personnelType แรกที่มีในระบบ)
 *   - ผูก role USER + ADMIN + SUPER_ADMIN (idempotent — รันซ้ำได้ ไม่เพิ่มซ้ำ)
 *   - ระบบ login ผ่าน Google OAuth เท่านั้น: เข้าครั้งแรกด้วยอีเมลนี้ ระบบจะ auto-link บัญชี Google ให้เอง
 *   - ต่างจาก seed: เพิ่ม super_admin ได้เสมอ (ไม่ข้ามแม้มี super_admin อยู่แล้ว) และรับ email ทาง argument
 */
try {
  require("dotenv").config();
} catch {
  /* env อาจถูกตั้งจากภายนอกแล้ว */
}
const prisma = require("../src/config/prisma");

function parseArgs(argv) {
  const args = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--email" || a === "-e") args.email = argv[++i];
    else if (a === "--first") args.first = argv[++i];
    else if (a === "--last") args.last = argv[++i];
    else if (a === "--prefix") args.prefix = argv[++i];
    else throw new Error(`ไม่รู้จัก argument: "${a}" (ใช้ --help ดูวิธีใช้)`);
  }
  return args;
}

const USAGE = `
สร้าง/เลื่อนบัญชีเป็น SUPER_ADMIN (bootstrap ระบบครั้งแรก)

  node scripts/create-super-admin.js --email <email> [--first <ชื่อ>] [--last <สกุล>] [--prefix <คำนำหน้า>] [--dry-run]

  --email, -e   อีเมล Google (@rmuti.ac.th) ของผู้ดูแล *จำเป็น
  --first       ชื่อ (ถ้าต้องสร้าง user ใหม่; ค่าเริ่มต้น "ผู้ดูแล")
  --last        นามสกุล (ค่าเริ่มต้น "ระบบ")
  --prefix      คำนำหน้า (ค่าเริ่มต้น "นาย")
  --dry-run     แสดงผลที่จะเกิดขึ้นโดยไม่เขียนจริง
  --help, -h    แสดงวิธีใช้
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return;
  }

  const email = (args.email || "").trim().toLowerCase();
  if (!email) {
    console.error("❌ ต้องระบุ --email");
    console.log(USAGE);
    process.exitCode = 1;
    return;
  }

  // ต้องมี role หลักก่อน (มาจาก seed)
  const [superAdminRole, adminRole, userRole] = await Promise.all([
    prisma.role.findFirst({ where: { name: "SUPER_ADMIN" } }),
    prisma.role.findFirst({ where: { name: "ADMIN" } }),
    prisma.role.findFirst({ where: { name: "USER" } }),
  ]);
  if (!superAdminRole || !adminRole || !userRole) {
    console.error(
      "❌ ไม่พบ role USER/ADMIN/SUPER_ADMIN — กรุณารัน seed ก่อน (npm run db:seed) แล้วลองใหม่"
    );
    process.exitCode = 1;
    return;
  }

  let user = await prisma.user.findFirst({ where: { email } });
  const willCreate = !user;

  if (willCreate) {
    const [dept, pt] = await Promise.all([
      prisma.department.findFirst(),
      prisma.personnelType.findFirst(),
    ]);
    if (!dept || !pt) {
      console.error(
        "❌ ไม่พบ department/personnelType — กรุณา seed master data ก่อน (npm run db:seed)"
      );
      process.exitCode = 1;
      return;
    }
    console.log(`• จะสร้าง user ใหม่: ${email} (dept=${dept.name}, personnelType=${pt.name})`);
    if (!args.dryRun) {
      user = await prisma.user.create({
        data: {
          prefixName: args.prefix || "นาย",
          firstName: args.first || "ผู้ดูแล",
          lastName: args.last || "ระบบ",
          email,
          sex: "male",
          phone: "000-000-0000",
          position: "ผู้ดูแลระบบขั้นสูง",
          hireDate: new Date(),
          employmentType: "SUPPORT",
          departmentId: dept.id,
          personnelTypeId: pt.id,
        },
      });
    }
  } else {
    console.log(`• พบ user อยู่แล้ว: ${email} (ID: ${user.id}) — จะผูก role ผู้ดูแลเพิ่ม`);
  }

  const targetRoles = [userRole, adminRole, superAdminRole];
  if (args.dryRun) {
    console.log(
      `• (dry-run) จะผูก role: ${targetRoles.map((r) => r.name).join(", ")} ให้ ${email} — ไม่เขียนจริง`
    );
    console.log("\nℹ️  ลบ --dry-run เพื่อดำเนินการจริง");
    return;
  }

  await prisma.userRole.createMany({
    data: targetRoles.map((r) => ({ userId: user.id, roleId: r.id })),
    skipDuplicates: true,
  });

  const after = await prisma.userRole.findMany({
    where: { userId: user.id },
    include: { role: true },
  });
  console.log(`\n✅ ตั้งค่า SUPER_ADMIN ให้ ${email} เรียบร้อย (ID: ${user.id})`);
  console.log(`   roles ปัจจุบัน: ${after.map((ur) => ur.role?.name).join(", ")}`);
  console.log(
    "   ➜ เข้าสู่ระบบครั้งแรกผ่านปุ่ม Login with Google ด้วยอีเมลนี้ (ระบบจะผูกบัญชีให้อัตโนมัติ)"
  );
}

main()
  .catch((e) => {
    console.error("❌ ผิดพลาด:", e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
