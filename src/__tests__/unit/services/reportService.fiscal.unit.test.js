// เทสฟีเจอร์รายงานที่เพิ่มใหม่: prorate วันในช่วง, ช่วงปีงบ, ปีงบที่มีข้อมูล
jest.mock("../../../config/prisma", () => ({
  setting: { findUnique: jest.fn() },
  leaveRequest: { aggregate: jest.fn() },
}));

const prisma = require("../../../config/prisma");
const ReportService = require("../../../services/report-service");

beforeEach(() => jest.clearAllMocks());

describe("ReportService.daysWithinWindow (prorate วันในช่วง)", () => {
  const winStart = new Date("2025-10-01");
  const winEnd = new Date("2026-09-30T23:59:59.999");

  it("ใบลาอยู่ในช่วงทั้งหมด → คืน totalDays เต็ม", () => {
    const d = ReportService.daysWithinWindow(
      new Date("2025-11-10"),
      new Date("2025-11-12"),
      3,
      winStart,
      winEnd,
    );
    expect(d).toBe(3);
  });

  it("ใบลาคาบขอบช่วง → นับเฉพาะวันในช่วง (prorate)", () => {
    // 28 ก.ย.–2 ต.ค. (5 วันปฏิทิน) total 5, ช่วงเริ่ม 1 ต.ค. → คาบ 1–2 ต.ค. = 2 → 5*2/5 = 2
    const d = ReportService.daysWithinWindow(
      new Date("2025-09-28"),
      new Date("2025-10-02"),
      5,
      winStart,
      winEnd,
    );
    expect(d).toBe(2);
  });

  it("ใบลาไม่คาบเกี่ยวช่วง → 0", () => {
    const d = ReportService.daysWithinWindow(
      new Date("2024-05-01"),
      new Date("2024-05-03"),
      3,
      winStart,
      winEnd,
    );
    expect(d).toBe(0);
  });

  it("ครึ่งวัน อยู่ในช่วง → คืน 0.5", () => {
    const d = ReportService.daysWithinWindow(
      new Date("2025-11-10"),
      new Date("2025-11-10"),
      0.5,
      winStart,
      winEnd,
    );
    expect(d).toBe(0.5);
  });
});

describe("ReportService.getFiscalRange", () => {
  it("ระบุปี ค.ศ. → คำนวณช่วง 1 ต.ค.(N-1) ถึง 30 ก.ย. N โดยไม่แตะ setting", async () => {
    const r = await ReportService.getFiscalRange(2025);
    expect(r).toEqual({
      startDate: "2024-10-01",
      endDate: "2025-09-30T23:59:59.999",
      fiscalYearCE: 2025,
      fiscalYearBE: 2568,
    });
    expect(prisma.setting.findUnique).not.toHaveBeenCalled();
  });

  it("ไม่ระบุปี → อ่านจาก setting fiscalYear", async () => {
    prisma.setting.findUnique.mockResolvedValue({ value: "2026" });
    const r = await ReportService.getFiscalRange();
    expect(prisma.setting.findUnique).toHaveBeenCalledWith({
      where: { key: "fiscalYear" },
    });
    expect(r.fiscalYearCE).toBe(2026);
    expect(r.fiscalYearBE).toBe(2569);
    expect(r.startDate).toBe("2025-10-01");
  });

  it("ปีไม่ถูกต้อง (นอกช่วง/ไม่ใช่ตัวเลข) → fallback ไป setting", async () => {
    prisma.setting.findUnique.mockResolvedValue({ value: "2026" });
    const r = await ReportService.getFiscalRange("abc");
    expect(r.fiscalYearCE).toBe(2026);
  });
});

describe("ReportService.getAvailableFiscalYears", () => {
  it("รวมปีจากข้อมูลจริง (min→max) + ปีปัจจุบัน เป็น พ.ศ. เรียงมากไปน้อย", async () => {
    prisma.setting.findUnique.mockResolvedValue({ value: "2026" });
    prisma.leaveRequest.aggregate.mockResolvedValue({
      _min: { startDate: new Date("2024-11-01") }, // ปีงบ 2025
      _max: { startDate: new Date("2025-05-01") }, // ปีงบ 2025
    });
    const years = await ReportService.getAvailableFiscalYears();
    expect(years).toEqual([2569, 2568]); // 2026+543, 2025+543
  });

  it("ไม่มีข้อมูลใบลา → เหลือแค่ปีงบปัจจุบัน", async () => {
    prisma.setting.findUnique.mockResolvedValue({ value: "2026" });
    prisma.leaveRequest.aggregate.mockResolvedValue({
      _min: { startDate: null },
      _max: { startDate: null },
    });
    const years = await ReportService.getAvailableFiscalYears();
    expect(years).toEqual([2569]);
  });
});
