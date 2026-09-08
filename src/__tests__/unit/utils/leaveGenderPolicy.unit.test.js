// เทสนโยบายการลาแยกตามเพศ (ชายลาคลอดไม่ได้ / หญิงลาตรวจเลือกทหารไม่ได้)
const {
  normalizeSex,
  isFemaleOnlyLeave,
  isMaleOnlyLeave,
  isSexAllowedForLeaveType,
} = require("../../../utils/leaveGenderPolicy");

describe("normalizeSex", () => {
  it("แปลงไทย/อังกฤษ → MALE/FEMALE", () => {
    expect(normalizeSex("ชาย")).toBe("MALE");
    expect(normalizeSex("MALE")).toBe("MALE");
    expect(normalizeSex("หญิง")).toBe("FEMALE");
    expect(normalizeSex("female")).toBe("FEMALE");
  });

  it("ค่าว่าง → ''", () => {
    expect(normalizeSex("")).toBe("");
    expect(normalizeSex(null)).toBe("");
    expect(normalizeSex(undefined)).toBe("");
  });
});

describe("isFemaleOnlyLeave", () => {
  it("ลาคลอดบุตร = เฉพาะหญิง", () => {
    expect(isFemaleOnlyLeave("ลาคลอดบุตร")).toBe(true);
  });

  it("ลาไปถือศีล ปฏิบัติธรรม (สตรี) = เฉพาะหญิง", () => {
    expect(isFemaleOnlyLeave("ลาไปถือศีล ปฏิบัติธรรม (สตรี)")).toBe(true);
  });

  it("ลาไปช่วยเหลือภริยาที่คลอดบุตร = ไม่ใช่เฉพาะหญิง (เป็นลาของสามี)", () => {
    expect(isFemaleOnlyLeave("ลาไปช่วยเหลือภริยาที่คลอดบุตร")).toBe(false);
  });

  it("ลาป่วย / ลาตรวจเลือก = ไม่ใช่เฉพาะหญิง", () => {
    expect(isFemaleOnlyLeave("ลาป่วย")).toBe(false);
    expect(isFemaleOnlyLeave("ลาเข้ารับการตรวจเลือกเข้ารับการเตรียมพล")).toBe(false);
  });
});

describe("isMaleOnlyLeave", () => {
  it("ลาเข้ารับการตรวจเลือก/เตรียมพล = เฉพาะชาย", () => {
    expect(isMaleOnlyLeave("ลาเข้ารับการตรวจเลือกเข้ารับการเตรียมพล")).toBe(true);
  });

  it("ประเภทอื่น = ไม่ใช่เฉพาะชาย", () => {
    expect(isMaleOnlyLeave("ลาคลอดบุตร")).toBe(false);
    expect(isMaleOnlyLeave("ลาป่วย")).toBe(false);
  });
});

describe("isSexAllowedForLeaveType", () => {
  const MATERNITY = "ลาคลอดบุตร";
  const MILITARY = "ลาเข้ารับการตรวจเลือกเข้ารับการเตรียมพล";
  const PATERNITY = "ลาไปช่วยเหลือภริยาที่คลอดบุตร";
  const SICK = "ลาป่วย";

  it("ชาย ลาคลอด → ไม่อนุญาต", () => {
    expect(isSexAllowedForLeaveType("ชาย", MATERNITY)).toBe(false);
    expect(isSexAllowedForLeaveType("MALE", MATERNITY)).toBe(false);
  });

  it("หญิง ลาคลอด → อนุญาต", () => {
    expect(isSexAllowedForLeaveType("หญิง", MATERNITY)).toBe(true);
  });

  it("หญิง ลาตรวจเลือกทหาร → ไม่อนุญาต", () => {
    expect(isSexAllowedForLeaveType("หญิง", MILITARY)).toBe(false);
    expect(isSexAllowedForLeaveType("FEMALE", MILITARY)).toBe(false);
  });

  it("ชาย ลาตรวจเลือกทหาร → อนุญาต", () => {
    expect(isSexAllowedForLeaveType("ชาย", MILITARY)).toBe(true);
  });

  it("ชาย ลาช่วยเหลือภริยาคลอด → อนุญาต (ลาของสามี)", () => {
    expect(isSexAllowedForLeaveType("ชาย", PATERNITY)).toBe(true);
  });

  it("ประเภททั่วไป (ลาป่วย) → อนุญาตทุกเพศ", () => {
    expect(isSexAllowedForLeaveType("ชาย", SICK)).toBe(true);
    expect(isSexAllowedForLeaveType("หญิง", SICK)).toBe(true);
  });

  it("ไม่ทราบเพศ → ไม่บล็อก (กันข้อมูลไม่ครบ)", () => {
    expect(isSexAllowedForLeaveType("", MATERNITY)).toBe(true);
    expect(isSexAllowedForLeaveType(null, MILITARY)).toBe(true);
  });
});
