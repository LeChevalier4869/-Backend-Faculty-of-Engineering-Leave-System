/**
 * สร้าง/อัปเดตไฟล์ Add_Users_Template.xlsx
 *
 * ทำไมต้องมีสคริปต์นี้แทนการแก้ไฟล์มือ:
 *  - ไฟล์เทมเพลตมี dropdown (data validation) 4 จุด (คำนำหน้า/สายงาน/ประเภทบุคคล/บทบาท)
 *    ที่ SheetJS เวอร์ชัน community จะทำหาย ถ้า regenerate ทั้งไฟล์
 *  - สคริปต์นี้จึงแก้ XML ในไฟล์เดิมโดยตรง (คงชีต Lists และ dropdown ไว้)
 *    แล้วเขียนหัวคอลัมน์ balance ต่อท้ายคอลัมน์ข้อมูล user
 *
 * หัวคอลัมน์ balance ต้อง "ตรงเป๊ะ" กับ alias ใน getBalanceFieldConfig()
 * ที่ backend/src/controllers/exel-controller.js เพราะ backend อ่านค่าจากหัวคอลัมน์แบบ exact match
 *
 * รัน:  node scripts/generateAddUsersTemplate.js
 */
const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

// หัวคอลัมน์ข้อมูล user เดิม (A..L) — เรียงตามไฟล์เทมเพลตปัจจุบัน
const USER_HEADERS = [
  "คำนำหน้า",
  "ชื่อ",
  "นามสกุล",
  "อีเมล",
  "เบอร์ติดต่อ",
  "ตำแหน่งงาน",
  "เลขที่ตำแหน่ง",
  "วันที่บรรจุ",
  "สายงาน",
  "สาขา",
  "ประเภทบุคคล",
  "บทบาท",
];

// หัวคอลัมน์ balance — เรียงตามลำดับประเภทลาในระบบ (seed-data.json)
// (วันคงเหลือ) = ลาแบบหักวันได้ (deductible) — กรอกจำนวนวันที่เหลือ
// (วันที่ใช้ไปแล้ว) = ลาแบบไม่หักวัน (non-deductible) — กรอกจำนวนวันที่ใช้ไปแล้ว
// เว้นว่างได้ = ระบบใช้สิทธิ์ default ตาม rank
const BALANCE_HEADERS = [
  "ลาป่วย (วันคงเหลือ)",
  "ลาคลอดบุตร (วันคงเหลือ)",
  "ลากิจส่วนตัว (วันคงเหลือ)",
  "ลาพักผ่อน (วันคงเหลือ)",
  "ลาอุปสมบท (วันที่ใช้ไปแล้ว)",
  "ลาตรวจเลือก/เตรียมพล (วันที่ใช้ไปแล้ว)",
  "ลาไปศึกษา (วันคงเหลือ)",
  "ลาช่วยเหลือภริยาที่คลอดบุตร (วันคงเหลือ)",
  "ลาฟื้นฟูสมรรถภาพด้านอาชีพ (วันคงเหลือ)",
  "ลาถือศีล/ปฏิบัติธรรม สตรี (วันที่ใช้ไปแล้ว)",
  "ลาองค์การระหว่างประเทศ (วันที่ใช้ไปแล้ว)",
  "ลาติดตามคู่สมรส (วันคงเหลือ)",
  "ลาประกอบพิธีฮัจย์ (วันที่ใช้ไปแล้ว)",
  "ลาฝึกอบรม/วิจัย/ดูงาน (วันคงเหลือ)",
  "ไปราชการ (วันที่ใช้ไปแล้ว)",
];

const ALL_HEADERS = [...USER_HEADERS, ...BALANCE_HEADERS];

const colLetter = (n) => {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const buildHeaderRow = () => {
  const cells = ALL_HEADERS.map(
    (h, i) =>
      `<c r="${colLetter(i + 1)}1" t="inlineStr"><is><t xml:space="preserve">${esc(
        h
      )}</t></is></c>`
  ).join("");
  return `<row r="1" ht="15.6" customHeight="1">${cells}</row>`;
};

async function main() {
  const publicPath = path.resolve(
    __dirname,
    "../../frontend/public/Add_Users_Template.xlsx"
  );
  const distPath = path.resolve(
    __dirname,
    "../../frontend/dist/Add_Users_Template.xlsx"
  );

  const zip = await JSZip.loadAsync(fs.readFileSync(publicPath));
  let xml = await zip.files["xl/worksheets/sheet1.xml"].async("string");

  const lastCol = colLetter(ALL_HEADERS.length);

  // 1) แทนที่หัวแถว (row r="1") ทั้งแถว ด้วยหัวคอลัมน์ครบ 27 คอลัมน์ (idempotent)
  xml = xml.replace(/<row r="1"[^>]*>[\s\S]*?<\/row>/, buildHeaderRow());

  // 2) ขยาย dimension ให้ครอบคลุมคอลัมน์ใหม่
  xml = xml.replace(/<dimension ref="A1:[A-Z]+1"\/>/, `<dimension ref="A1:${lastCol}1"/>`);

  zip.file("xl/worksheets/sheet1.xml", xml);

  const out = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });

  fs.writeFileSync(publicPath, out);
  console.log(`✅ wrote ${publicPath} (${ALL_HEADERS.length} columns, A1:${lastCol}1)`);

  if (fs.existsSync(distPath)) {
    fs.writeFileSync(distPath, out);
    console.log(`✅ wrote ${distPath}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
