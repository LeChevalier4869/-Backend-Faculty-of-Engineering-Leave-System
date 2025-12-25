jest.mock("../../../services/report-service", () => ({
  getReportData: jest.fn(),
}));

jest.mock("pdfmake", () => {
  return jest.fn().mockImplementation(() => ({
    createPdfKitDocument: jest.fn(() => ({
      pipe: jest.fn(),
      end: jest.fn(),
    })),
  }));
});

jest.mock("docx", () => {
  const passthrough = function (arg) {
    return arg;
  };

  return {
    Document: jest.fn((arg) => ({ __type: "Document", arg })),
    Packer: {
      toBuffer: jest.fn(async () => Buffer.from("docx")),
    },
    Paragraph: jest.fn(passthrough),
    Table: jest.fn(passthrough),
    TableCell: jest.fn(passthrough),
    TableRow: jest.fn(passthrough),
    TextRun: jest.fn(passthrough),
    Header: jest.fn(passthrough),
    Footer: jest.fn(passthrough),
    WidthType: { DXA: "DXA" },
    AlignmentType: {
      CENTER: "CENTER",
      LEFT: "LEFT",
      RIGHT: "RIGHT",
    },
    BorderStyle: { SINGLE: "SINGLE" },
    ShadingType: { CLEAR: "CLEAR" },
    TableLayoutType: { FIXED: "FIXED" },
    TextDirection: { BOTTOM_TO_TOP_LEFT_TO_RIGHT: "BTLR" },
  };
});

const ReportService = require("../../../services/report-service");
const { Packer } = require("docx");

const reportController = require("../../../controllers/reportController");

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.send = jest.fn(() => res);
  res.setHeader = jest.fn(() => res);
  return res;
};

describe("reportController.reportData / exportReport", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("reportData", () => {
    it("returns 400 when organizationId missing", async () => {
      const req = { body: { startDate: "2025-01-01", endDate: "2025-01-31" } };
      const res = makeRes();

      await reportController.reportData(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "กรุณาระบุ organizationId" });
      expect(ReportService.getReportData).not.toHaveBeenCalled();
    });

    it("returns 400 when startDate/endDate missing", async () => {
      const req = { body: { organizationId: 1, startDate: "2025-01-01" } };
      const res = makeRes();

      await reportController.reportData(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "กรุณาระบุ startDate และ endDate",
      });
      expect(ReportService.getReportData).not.toHaveBeenCalled();
    });

    it("returns report rows", async () => {
      ReportService.getReportData.mockResolvedValue([{ name: "A" }]);

      const req = {
        body: { organizationId: 1, startDate: "2025-01-01", endDate: "2025-01-31" },
      };
      const res = makeRes();

      await reportController.reportData(req, res);

      expect(ReportService.getReportData).toHaveBeenCalledWith(
        1,
        "2025-01-01",
        "2025-01-31"
      );
      expect(res.json).toHaveBeenCalledWith({
        title: "รายงานการลาของบุคลากรในคณะ",
        organizationId: 1,
        startDate: "2025-01-01",
        endDate: "2025-01-31",
        rows: [{ name: "A" }],
      });
    });

    it("returns 500 when ReportService throws", async () => {
      ReportService.getReportData.mockRejectedValue(new Error("boom"));

      const req = {
        body: { organizationId: 1, startDate: "2025-01-01", endDate: "2025-01-31" },
      };
      const res = makeRes();

      await reportController.reportData(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "boom" });
    });
  });

  describe("exportReport", () => {
    const baseReqBody = {
      countReport: 1,
      organizationId: 10,
      startDate: "2025-01-01",
      endDate: "2025-01-31",
      format: "pdf",
    };

    it("returns 400 when organizationId missing", async () => {
      const req = { body: { ...baseReqBody, organizationId: null } };
      const res = makeRes();

      await reportController.exportReport(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "กรุณาระบุ organizationId" });
    });

    it("returns 400 when countReport missing", async () => {
      const req = { body: { ...baseReqBody, countReport: null } };
      const res = makeRes();

      await reportController.exportReport(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "กรุณาระบุ countReport" });
    });

    it("returns 400 when startDate/endDate missing", async () => {
      const req = { body: { ...baseReqBody, startDate: null } };
      const res = makeRes();

      await reportController.exportReport(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "กรุณาระบุ startDate และ endDate",
      });
    });

    it("returns 400 when format missing", async () => {
      const req = { body: { ...baseReqBody, format: null } };
      const res = makeRes();

      await reportController.exportReport(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "กรุณาระบุ format" });
    });

    it("returns 404 when no report data", async () => {
      ReportService.getReportData.mockResolvedValue({});

      const req = { body: { ...baseReqBody } };
      const res = makeRes();

      await reportController.exportReport(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "ไม่พบข้อมูล" });
    });

    it("exports pdf when format=pdf", async () => {
      ReportService.getReportData.mockResolvedValue({
        "ลาป่วย": [
          {
            name: "A",
            lateTimes: 0,
            leaveSummary: { "ลาป่วย": { count: 1, days: 2 } },
            note: "",
          },
        ],
      });

      const req = { body: { ...baseReqBody, format: "pdf" } };
      const res = makeRes();

      await reportController.exportReport(req, res);

      expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/pdf");
      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Disposition",
        "attachment; filename=org-report-10.pdf"
      );
    });

    it("exports word when format=word", async () => {
      ReportService.getReportData.mockResolvedValue({
        "ลาป่วย": [
          {
            name: "A",
            lateTimes: 0,
            leaveSummary: { "ลาป่วย": { count: 1, days: 2 } },
            note: "",
          },
        ],
      });

      const req = { body: { ...baseReqBody, format: "word" } };
      const res = makeRes();

      await reportController.exportReport(req, res);

      expect(Packer.toBuffer).toHaveBeenCalledTimes(1);
      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        "Content-Disposition",
        "attachment; filename=org-report-10.docx"
      );
      expect(res.send).toHaveBeenCalledWith(Buffer.from("docx"));
    });

    it("returns 400 for invalid format", async () => {
      ReportService.getReportData.mockResolvedValue({
        "ลาป่วย": [],
      });

      const req = { body: { ...baseReqBody, format: "xlsx" } };
      const res = makeRes();

      await reportController.exportReport(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Invalid format, use 'pdf' or 'word'",
      });
    });

    it("returns 500 when ReportService throws", async () => {
      ReportService.getReportData.mockRejectedValue(new Error("boom"));

      const req = { body: { ...baseReqBody, format: "pdf" } };
      const res = makeRes();

      await reportController.exportReport(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "boom" });
    });
  });
});
