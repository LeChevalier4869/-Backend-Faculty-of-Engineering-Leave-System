/**
 * จัดการบทบาท (role) ของผู้ใช้ผ่าน CLI — ใช้ได้กับทุก user / ทุก role
 *
 * การใช้งาน:
 *   node scripts/manage-user-role.js --user <userId> --role <roleId|roleName> [--action add|remove] [--dry-run]
 *
 * ตัวอย่าง:
 *   node scripts/manage-user-role.js --user 12 --role SUPER_ADMIN
 *   node scripts/manage-user-role.js --user 12 --role 10
 *   node scripts/manage-user-role.js --user 12 --role VERIFIER --action remove
 *   node scripts/manage-user-role.js --user 12 --role ADMIN --dry-run   (ดูผลก่อน ไม่เขียนจริง)
 *
 * ปลอดภัย: ตรวจ user/role ก่อน, idempotent (เพิ่มซ้ำ/ถอนสิ่งที่ไม่มี = ข้าม), โชว์ roles ก่อน/หลัง
 */
const prisma = require("../src/config/prisma");

function parseArgs(argv) {
  const args = { action: "add", dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--user" || a === "-u") args.user = argv[++i];
    else if (a === "--role" || a === "-r") args.role = argv[++i];
    else if (a === "--action" || a === "-a") args.action = argv[++i];
    else throw new Error(`ไม่รู้จัก argument: "${a}" (ใช้ --help ดูวิธีใช้)`);
  }
  return args;
}

const USAGE = `
จัดการบทบาทผู้ใช้ผ่าน CLI

  node scripts/manage-user-role.js --user <userId> --role <roleId|roleName> [--action add|remove] [--dry-run]

  --user, -u     id ของผู้ใช้ (ตัวเลข) *จำเป็น
  --role, -r     role เป็น id (ตัวเลข) หรือชื่อ (เช่น SUPER_ADMIN) *จำเป็น
  --action, -a   add (ค่าเริ่มต้น) หรือ remove
  --dry-run      แสดงผลที่จะเกิดขึ้นโดยไม่เขียนจริง
  --help, -h     แสดงวิธีใช้
`;

async function resolveRole(roleArg) {
  if (/^\d+$/.test(roleArg)) {
    return prisma.role.findUnique({ where: { id: Number(roleArg) } });
  }
  const name = roleArg.toUpperCase();
  const matches = await prisma.role.findMany({ where: { name } });
  if (matches.length > 1) {
    throw new Error(`มี role ชื่อ "${name}" มากกว่า 1 (${matches.map((m) => m.id).join(", ")}) — ระบุด้วย id แทน`);
  }
  return matches[0] || null;
}

function rolesText(userRoles) {
  return userRoles.map((ur) => `${ur.role?.name}(${ur.roleId})`).join(", ") || "(ไม่มี)";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return console.log(USAGE);

  const userId = Number(args.user);
  if (!args.user || !Number.isInteger(userId) || userId <= 0) {
    throw new Error("ต้องระบุ --user เป็น id ตัวเลข (ใช้ --help ดูวิธีใช้)");
  }
  if (!args.role) throw new Error("ต้องระบุ --role (id หรือชื่อ)");
  const action = String(args.action).toLowerCase();
  if (action !== "add" && action !== "remove") {
    throw new Error(`--action ต้องเป็น add หรือ remove (ได้รับ "${args.action}")`);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { userRoles: { include: { role: true } } },
  });
  if (!user) throw new Error(`ไม่พบ user id ${userId}`);

  const role = await resolveRole(String(args.role));
  if (!role) throw new Error(`ไม่พบ role "${args.role}"`);

  console.log("=== ก่อนแก้ ===");
  console.log(`user ${userId}: ${user.prefixName || ""} ${user.firstName} ${user.lastName} <${user.email}>`);
  console.log(`  roles ปัจจุบัน: ${rolesText(user.userRoles)}`);
  console.log(`target role: ${role.name}(${role.id})  |  action: ${action}${args.dryRun ? "  (dry-run)" : ""}`);

  const has = user.userRoles.some((ur) => ur.roleId === role.id);

  if (action === "add" && has) return console.log(`\n=> user ${userId} มี ${role.name} อยู่แล้ว ไม่ต้องทำอะไร`);
  if (action === "remove" && !has) return console.log(`\n=> user ${userId} ไม่มี ${role.name} อยู่แล้ว ไม่ต้องทำอะไร`);

  if (args.dryRun) {
    return console.log(`\n[dry-run] จะ ${action === "add" ? "เพิ่ม" : "ถอน"} ${role.name} ${action === "add" ? "ให้" : "จาก"} user ${userId} (ยังไม่เขียนจริง)`);
  }

  if (action === "add") {
    await prisma.userRole.create({ data: { userId, roleId: role.id } });
  } else {
    await prisma.userRole.deleteMany({ where: { userId, roleId: role.id } });
  }

  const after = await prisma.user.findUnique({
    where: { id: userId },
    include: { userRoles: { include: { role: true } } },
  });
  console.log("\n=== หลังแก้ ===");
  console.log(`  roles ใหม่: ${rolesText(after.userRoles)}`);
  console.log(`\n✅ ${action === "add" ? "เพิ่ม" : "ถอน"} ${role.name} สำเร็จ`);
}

main()
  .catch((e) => {
    console.error("❌", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
