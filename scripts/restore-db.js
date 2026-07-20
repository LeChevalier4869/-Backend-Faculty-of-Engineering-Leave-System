#!/usr/bin/env node
/**
 * Database restore — กู้คืนฐานข้อมูล MySQL จากไฟล์ .sql ที่สำรองไว้
 *
 * ⚠️ อันตราย: คำสั่งนี้จะ "เขียนทับ" ข้อมูลปัจจุบันด้วยข้อมูลในไฟล์สำรอง
 *
 * ใช้งาน:
 *   node scripts/restore-db.js ./backups/eleave-xxx.sql --force
 *
 * ต้องมี `mysql` client ติดตั้งและอยู่ใน PATH
 * ต้องใส่ --force เพื่อยืนยัน (กันการรันพลาด)
 */
try {
  require("dotenv").config();
} catch {
  /* env อาจถูกตั้งจากภายนอกแล้ว */
}

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

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

async function main() {
  const fileArg = process.argv[2];
  const force = process.argv.includes("--force");

  if (!fileArg) {
    console.error("❌ ใช้งาน: node scripts/restore-db.js <ไฟล์.sql> --force");
    process.exit(1);
  }

  const sqlFile = path.resolve(fileArg);
  if (!fs.existsSync(sqlFile)) {
    console.error(`❌ ไม่พบไฟล์: ${sqlFile}`);
    process.exit(1);
  }

  const cfg = parseDatabaseUrl(process.env.DATABASE_URL);

  if (!force) {
    console.error("⚠️  คำสั่งนี้จะเขียนทับฐานข้อมูล:");
    console.error(`    DB:   ${cfg.database} @ ${cfg.host}:${cfg.port}`);
    console.error(`    File: ${sqlFile}`);
    console.error("    หากแน่ใจ ให้เพิ่ม --force ต่อท้ายคำสั่ง");
    process.exit(1);
  }

  console.log(`♻️  กำลังกู้คืน "${cfg.database}" จาก ${path.basename(sqlFile)} ...`);

  const args = [
    `--host=${cfg.host}`,
    `--port=${cfg.port}`,
    `--user=${cfg.user}`,
    cfg.database,
  ];

  const child = spawn("mysql", args, {
    env: { ...process.env, MYSQL_PWD: cfg.password },
  });

  fs.createReadStream(sqlFile).pipe(child.stdin);

  let stderr = "";
  child.stderr.on("data", (d) => {
    stderr += d.toString();
  });

  child.on("error", (err) => {
    if (err.code === "ENOENT") {
      console.error("❌ ไม่พบคำสั่ง `mysql` — กรุณาติดตั้ง MySQL client tools และเพิ่มลงใน PATH");
    } else {
      console.error("❌ กู้คืนล้มเหลว:", err.message);
    }
    process.exit(1);
  });

  child.on("close", (code) => {
    if (code !== 0) {
      console.error(`❌ mysql exit code ${code}`);
      if (stderr.trim()) console.error(stderr.trim());
      process.exit(1);
    }
    console.log("✅ กู้คืนข้อมูลสำเร็จ");
    console.log("   ➜ แนะนำให้รัน `npx prisma generate` และรีสตาร์ทเซิร์ฟเวอร์");
  });
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
