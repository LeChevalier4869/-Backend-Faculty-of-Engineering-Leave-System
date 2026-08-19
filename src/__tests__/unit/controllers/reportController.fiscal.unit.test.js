// เทส handler รายงานที่เพิ่ม/แก้ใหม่: fiscal preview/years + export รอบประเมิน/ปีงบ/เดือน (pdf+word)
jest.mock("../../../services/report-service", () => ({
  getReportData: jest.fn(),
  getReportDataForMonth: jest.fn(),
  getFiscalRange: jest.fn(),
  getAvailableFiscalYears: jest.fn(),
}));

jest.mock("../../../services/reportDoc-service", () => ({
  summaryPdfDoc: jest.fn(() => ({ kind: "summaryPdf" })),
  summaryWordDoc: jest.fn(() => ({ kind: "summaryWord" })),
  monthlyPdfDoc: jest.fn(() => ({ kind: "monthlyPdf" })),
  monthlyWordDoc: jest.fn(() => ({ kind: "monthlyWord" })),
  streamPdf: jest.fn((res) => res.setHeader("Content-Type", "application/pdf")),
  sendWord: jest.fn((res) =>
    res.setHeader("Content-Type", "application/vnd.ms-word"),
  ),
  toThaiNumber: (x) => String(x),
  formatThaiDateFull: (x) => String(x),
  formatThaiMonth: (x) => String(x),
  fiscalYearBE: () => 2569,
  SUMMARY_TYPES: [],
}));

const ReportService = require("../../../services/report-service");
const ReportDoc = require("../../../services/reportDoc-service");
const reportController = require("../../../controllers/reportController");

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.send = jest.fn(() => res);
  res.setHeader = jest.fn(() => res);
  res.headersSent = false;
  return res;
};

const withData = () =>
  ReportService.getReportData.mockResolvedValue({
    "ข้าราชการ": [{ name: "A", leaveSummary: { "ลาป่วย": { count: 1, days: 1 } } }],
  });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("getFiscalReportData (พรีวิวรอบปีงบ)", () => {
  it("400 เมื่อไม่มี organizationId", async () => {
    const res = makeRes();
    await reportController.getFiscalReportData({ query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("ส่ง fiscalYear จาก query ไป getFiscalRange และคืน rows+ช่วง", async () => {
    ReportService.getFiscalRange.mockResolvedValue({
      startDate: "2024-10-01",
      endDate: "2025-09-30T23:59:59.999",
      fiscalYearBE: 2568,
    });
    ReportService.getReportData.mockResolvedValue({ "ข้าราชการ": [] });
    const res = makeRes();

    await reportController.getFiscalReportData(
      { query: { organizationId: "1", fiscalYear: "2025" } },
      res,
    );

    expect(ReportService.getFiscalRange).toHaveBeenCalledWith("2025");
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ fiscalYearBE: 2568, startDate: "2024-10-01" }),
    );
  });
});

describe("getFiscalYears", () => {
  it("คืนรายการปีงบจาก service", async () => {
    ReportService.getAvailableFiscalYears.mockResolvedValue([2569, 2568]);
    const res = makeRes();
    await reportController.getFiscalYears({ query: {} }, res);
    expect(res.json).toHaveBeenCalledWith({ years: [2569, 2568] });
  });
});

describe("export รอบประเมิน (round)", () => {
  it("400 เมื่อไม่มี countReport", async () => {
    const res = makeRes();
    await reportController.exportRoundReportPDF(
      { body: { organizationId: 1, startDate: "a", endDate: "b" } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "กรุณาระบุ countReport" });
  });

  it("PDF สำเร็จ → เรียก summaryPdfDoc + streamPdf", async () => {
    withData();
    const res = makeRes();
    await reportController.exportRoundReportPDF(
      { body: { organizationId: 1, countReport: 1, startDate: "2024-10-01", endDate: "2025-09-30" } },
      res,
    );
    expect(ReportDoc.summaryPdfDoc).toHaveBeenCalled();
    expect(ReportDoc.streamPdf).toHaveBeenCalled();
  });

  it("WORD สำเร็จ → เรียก summaryWordDoc + sendWord", async () => {
    withData();
    const res = makeRes();
    await reportController.exportRoundReportWORD(
      { body: { organizationId: 1, countReport: 1, startDate: "2024-10-01", endDate: "2025-09-30" } },
      res,
    );
    expect(ReportDoc.summaryWordDoc).toHaveBeenCalled();
    expect(ReportDoc.sendWord).toHaveBeenCalled();
  });

  it("404 เมื่อไม่มีข้อมูล", async () => {
    ReportService.getReportData.mockResolvedValue({ "ข้าราชการ": [] });
    const res = makeRes();
    await reportController.exportRoundReportPDF(
      { body: { organizationId: 1, countReport: 1, startDate: "a", endDate: "b" } },
      res,
    );
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("export รอบปีงบ (fiscal)", () => {
  beforeEach(() => {
    ReportService.getFiscalRange.mockResolvedValue({
      startDate: "2024-10-01",
      endDate: "2025-09-30T23:59:59.999",
      fiscalYearBE: 2568,
    });
  });

  it("PDF: derive ช่วงจาก fiscalYear ใน body แล้วสร้างเอกสาร", async () => {
    withData();
    const res = makeRes();
    await reportController.exportFiscalYearReportPDF(
      { body: { organizationId: 1, fiscalYear: 2025 } },
      res,
    );
    expect(ReportService.getFiscalRange).toHaveBeenCalledWith(2025);
    expect(ReportDoc.summaryPdfDoc).toHaveBeenCalled();
    expect(ReportDoc.streamPdf).toHaveBeenCalled();
  });

  it("WORD: สร้างเอกสาร word", async () => {
    withData();
    const res = makeRes();
    await reportController.exportFiscalYearReportWORD(
      { body: { organizationId: 1, fiscalYear: 2025 } },
      res,
    );
    expect(ReportDoc.summaryWordDoc).toHaveBeenCalled();
    expect(ReportDoc.sendWord).toHaveBeenCalled();
  });
});

describe("export รอบเดือน (month)", () => {
  it("400 เมื่อขาด organizationId/month/year", async () => {
    const res = makeRes();
    await reportController.exportMonthReportPDF({ body: { organizationId: 1 } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("PDF สำเร็จ → monthlyPdfDoc + streamPdf", async () => {
    ReportService.getReportDataForMonth.mockResolvedValue({
      daysInMonth: 31,
      month: 8,
      year: 2025,
      report: { "ข้าราชการ": [{ name: "A", attendance: {} }] },
    });
    const res = makeRes();
    await reportController.exportMonthReportPDF(
      { body: { organizationId: 1, month: 8, year: 2025 } },
      res,
    );
    expect(ReportDoc.monthlyPdfDoc).toHaveBeenCalled();
    expect(ReportDoc.streamPdf).toHaveBeenCalled();
  });

  it("WORD สำเร็จ → monthlyWordDoc + sendWord", async () => {
    ReportService.getReportDataForMonth.mockResolvedValue({
      daysInMonth: 31,
      month: 8,
      year: 2025,
      report: { "ข้าราชการ": [{ name: "A", attendance: {} }] },
    });
    const res = makeRes();
    await reportController.exportMonthReportWORD(
      { body: { organizationId: 1, month: 8, year: 2025 } },
      res,
    );
    expect(ReportDoc.monthlyWordDoc).toHaveBeenCalled();
    expect(ReportDoc.sendWord).toHaveBeenCalled();
  });
});
