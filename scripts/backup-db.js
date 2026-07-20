#!/usr/bin/env node
/**
 * Database backup — สำรองฐานข้อมูล MySQL ของระบบ eLeave ด้วย mysqldump
 *
 * ใช้งาน:
 *   node scripts/backup-db.js              # สำรองลงโฟลเดอร์ backups/
 *   node scripts/backup-db.js /path/dir    # ระบุโฟลเดอร์ปลายทางเอง
 *
 * ต้องมี `mysqldump` ติดตั้งและอยู่ใน PATH (มากับ MySQL client tools)
 * อ่านค่าเชื่อมต่อจาก DATABASE_URL ใน .env
 *
 * หมายเหตุความปลอดภัย: ส่งรหัสผ่านผ่าน env (MYSQL_PWD) ไม่ใช่ argument
 * เพื่อไม่ให้รหัสผ่านโผล่ใน process list
 */
try {
  require("dotenv").config();
} catch {
  /* env อาจถูกตั้งจากภายนอกแล้ว */
}

const fs = require("fs");
const path = require("path");
const { spawn, execFileSync } = require("child_process");

function parseDatabaseUrl(url) {
  if (!url) throw new Error("ไม่พบ DATABASE_URL ใน environment (.env)");
  const u = new URL(url);
  if (!u.protocol.startsWith("mysql")) {
    throw new Error(`รองรับเฉพาะ MySQL — พบ protocol: ${u.protocol}`);
  }
  return {
    host: u.hostname || "localhost",
    port: u.port || "3306",
    user: decodeURIComponent(u.username || "root"),
    password: decodeURIComponent(u.password || ""),
    database: u.pathname.replace(/^\//, ""),
  };
}

function timestamp() {
  // YYYYMMDD-HHmmss (เวลาเครื่อง)
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

// MariaDB's mysqldump ไม่รู้จัก --set-gtid-purged (เป็น flag ของ MySQL แท้)
// ถ้าใส่ไปกับ client ของ MariaDB จะล้มทันที (exit 7) จึงตรวจเวอร์ชันก่อน
function supportsGtidPurged() {
  try {
    const out = execFileSync("mysqldump", ["--version"], {
      encoding: "utf8",
    });
    return !/mariadb/i.test(out);
  } catch {
    return false; // เรียกไม่ได้ก็ไม่ต้องใส่ flag — ปล่อยให้ error หลักรายงานเอง
  }
}

async function main() {
  const cfg = parseDatabaseUrl(process.env.DATABASE_URL);

  const outDir = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(__dirname, "..", "backups");
  fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, `eleave-${cfg.database}-${timestamp()}.sql`);
  const writeStream = fs.createWriteStream(outFile);

  const args = [
    `--host=${cfg.host}`,
    `--port=${cfg.port}`,
    `--user=${cfg.user}`,
    "--single-transaction", // สำรองแบบ consistent โดยไม่ lock ตาราง (InnoDB)
    "--routines",
    "--triggers",
    "--events",
    ...(supportsGtidPurged() ? ["--set-gtid-purged=OFF"] : []),
    "--no-tablespaces",
    cfg.database,
  ];

  console.log(`📦 กำลังสำรองฐานข้อมูล "${cfg.database}" จาก ${cfg.host}:${cfg.port} ...`);

  const child = spawn("mysqldump", args, {
    env: { ...process.env, MYSQL_PWD: cfg.password },
  });

  child.stdout.pipe(writeStream);

  let stderr = "";
  child.stderr.on("data", (d) => {
    stderr += d.toString();
  });

  child.on("error", (err) => {
    writeStream.destroy();
    try {
      fs.unlinkSync(outFile);
    } catch {
      /* ignore */
    }
    if (err.code === "ENOENT") {
      console.error(
        "❌ ไม่พบคำสั่ง `mysqldump` — กรุณาติดตั้ง MySQL client tools และเพิ่มลงใน PATH"
      );
    } else {
      console.error("❌ สำรองข้อมูลล้มเหลว:", err.message);
    }
    process.exit(1);
  });

  child.on("close", (code) => {
    writeStream.end();
    if (code !== 0) {
      try {
        fs.unlinkSync(outFile);
      } catch {
        /* ignore */
      }
      console.error(`❌ mysqldump exit code ${code}`);
      if (stderr.trim()) console.error(stderr.trim());
      process.exit(1);
    }
    const sizeMB = (fs.statSync(outFile).size / (1024 * 1024)).toFixed(2);
    console.log(`✅ สำรองสำเร็จ: ${outFile} (${sizeMB} MB)`);
    if (stderr.trim()) {
      // mysqldump บางเวอร์ชันเตือนเรื่อง password ทาง stderr — ไม่ใช่ error
      console.log("ℹ️ ", stderr.trim().split("\n")[0]);
    }
  });
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
