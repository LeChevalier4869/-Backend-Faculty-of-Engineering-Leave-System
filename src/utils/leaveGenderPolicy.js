// นโยบายการลาแยกตามเพศ — อ้างอิงจาก "ชื่อประเภทการลา" (schema ไม่มีคอลัมน์เพศ)
// ใช้ร่วมกันทั้งตอน gen ยอดวันลา และตอนตรวจสอบสิทธิ์ยื่นลา เพื่อให้เกณฑ์ตรงกันทั้งระบบ

function normalizeSex(sex) {
  const s = String(sex || "").trim();
  if (!s) return "";
  if (s === "ชาย" || s.toUpperCase() === "MALE") return "MALE";
  if (s === "หญิง" || s.toUpperCase() === "FEMALE") return "FEMALE";
  return s.toUpperCase();
}

// ลาเฉพาะเพศหญิง: ลาคลอด (ยกเว้น "ช่วยเหลือภริยา" ซึ่งเป็นลาของสามี) และ ลาถือศีล/ปฏิบัติธรรม (สตรี)
function isFemaleOnlyLeave(leaveTypeName) {
  const name = String(leaveTypeName || "").toLowerCase();
  const isMaternity =
    (name.includes("คลอด") &&
      !name.includes("ช่วยเหลือภริยา") &&
      !name.includes("ภริยา")) ||
    name.includes("maternity");
  const isFemaleOrdination =
    name.includes("ถือศีล") ||
    (name.includes("ปฏิบัติธรรม") && !name.includes("บวช"));
  return isMaternity || isFemaleOrdination;
}

// ลาเฉพาะเพศชาย: ลาเข้ารับการตรวจเลือก/เตรียมพล (การเกณฑ์ทหาร)
function isMaleOnlyLeave(leaveTypeName) {
  const name = String(leaveTypeName || "").toLowerCase();
  return (
    name.includes("ตรวจเลือก") ||
    name.includes("เตรียมพล") ||
    name.includes("เกณฑ์ทหาร")
  );
}

// true = เพศนี้ยื่น/ได้รับสิทธิ์ประเภทการลานี้ได้
function isSexAllowedForLeaveType(sex, leaveTypeName) {
  const s = normalizeSex(sex);
  if (!s) return true; // ไม่ทราบเพศ → ไม่บล็อก (กันข้อมูลไม่ครบทำระบบล่ม)
  if (s === "MALE" && isFemaleOnlyLeave(leaveTypeName)) return false;
  if (s === "FEMALE" && isMaleOnlyLeave(leaveTypeName)) return false;
  return true;
}

module.exports = {
  normalizeSex,
  isFemaleOnlyLeave,
  isMaleOnlyLeave,
  isSexAllowedForLeaveType,
};
