// smoke test ตัวสร้างเอกสารรายงาน (ใช้ pdfmake/docx จริง) — ครอบคลุมจุดที่แก้ silent bug
const ReportDoc = require("../../../services/reportDoc-service");

describe("reportDoc-service helpers", () => {
  it("toThaiNumber แปลงเลขอารบิก → ไทย", () => {
    expect(ReportDoc.toThaiNumber(2569)).toBe("๒๕๖๙");
  });

  it("fiscalYearBE: เดือน ต.ค.+ นับปีงบถัดไป (พ.ศ.)", () => {
    expect(ReportDoc.fiscalYearBE("2025-10-01")).toBe(2569); // ต.ค. → +1 → 2026 +543
    expect(ReportDoc.fiscalYearBE("2025-05-01")).toBe(2568); // พ.ค. → 2025 +543
  });

  it("SUMMARY_TYPES ใช้ key 'ลากิจส่วนตัว' (ตรง DB) แต่ label 'ลากิจ'", () => {
    const personal = ReportDoc.SUMMARY_TYPES.find((t) => t.label === "ลากิจ");
    expect(personal).toBeDefined();
    expect(personal.key).toBe("ลากิจส่วนตัว");
  });
});

describe("reportDoc-service builders (สร้างเอกสารได้จริง)", () => {
  const grouped = {
    "ข้าราชการ": [
      {
        userId: 1,
        positionNo: "ก-001",
        name: "นายสมชาย ใจดี",
        leaveSummary: {
          "ลาป่วย": { count: 2, days: 3 },
          "ลากิจส่วนตัว": { count: 1, days: 1.5 },
        },
      },
    ],
    "พนักงานราชการ": [],
  };
  const monthResult = {
    daysInMonth: 31,
    month: 1,
    year: 2026,
    report: {
      "ข้าราชการ": [
        { userId: 1, name: "นายสมชาย ใจดี", totalWorkDays: 20, attendance: { 5: "SICK", 12: "PERSONAL" } },
      ],
    },
  };
  const heading = (t) => ["มหาวิทยาลัย", "รายงาน", "สังกัดคณะ", "ช่วงเวลา", `ประเภท ${t}`];

  it("summaryPdfDoc คืน docDefinition ที่มีเนื้อหา + ค่าลากิจส่วนตัวปรากฏ (ไม่ใช่ค่าว่าง)", () => {
    const doc = ReportDoc.summaryPdfDoc(grouped, heading);
    expect(Array.isArray(doc.content)).toBe(true);
    expect(doc.content.length).toBeGreaterThan(0);
    const json = JSON.stringify(doc);
    expect(json).toContain("นายสมชาย ใจดี");
    expect(json).toContain("ลากิจ"); // หัวคอลัมน์
    expect(json).toContain("1.5"); // จำนวนวันลากิจส่วนตัว → พิสูจน์ว่า lookup key ถูก
  });

  it("monthlyPdfDoc คืน docDefinition ที่มีเนื้อหา", () => {
    const doc = ReportDoc.monthlyPdfDoc(monthResult, heading);
    expect(doc.content.length).toBeGreaterThan(0);
    expect(JSON.stringify(doc)).toContain("นายสมชาย ใจดี");
  });

  it("summaryWordDoc สร้าง .docx buffer ได้", async () => {
    const { Packer } = require("docx");
    const buf = await Packer.toBuffer(ReportDoc.summaryWordDoc(grouped, heading));
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });

  it("monthlyWordDoc สร้าง .docx buffer ได้", async () => {
    const { Packer } = require("docx");
    const buf = await Packer.toBuffer(ReportDoc.monthlyWordDoc(monthResult, heading));
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });
});
