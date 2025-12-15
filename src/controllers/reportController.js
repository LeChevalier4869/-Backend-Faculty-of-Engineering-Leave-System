const fs = require("fs");
const PdfPrinter = require("pdfmake");
const path = require("path");
const { fillPDFTemplate } = require("../services/pdfService");
const { title } = require("process");
const LeaveBalanceService = require("../services/leaveBalance-service");
const prisma = require("../config/prisma");
const ReportService = require("../services/report-service");

const {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  WidthType,
  AlignmentType,
  BorderStyle,
  ShadingType,
  TextRun,
  TableLayoutType,
  TextDirection,
  Header, // ✅ เพิ่มอันนี้
  Footer, // ✅ ถ้าต้องการ footer ด้วย
} = require("docx");
const LeaveRequestService = require("../services/leaveRequest-service");
const { last } = require("pdf-lib");

const templateMap = {
  1: "sick_template.pdf",
  3: "personal_template.pdf",
  4: "vacation_template.pdf",
};

const ALLOWED_LEAVE_TYPES = new Set([1, 3, 4]);

exports.downloadReport = async (req, res) => {
  try {
    const leaveTypeId = Number(req.body.leaveTypeId);
    const userId = req.user.id;
    const { beforeDate } = req.body;

    const getFiscalYear = (date) => {
      const d = date instanceof Date ? date : new Date(date);
      if (Number.isNaN(d.getTime())) return null;
      return d.getMonth() >= 9 ? d.getFullYear() + 1 : d.getFullYear();
    };

    if (!ALLOWED_LEAVE_TYPES.has(leaveTypeId)) {
      return res
        .status(400)
        .json({ error: "leaveTypeId ต้อง 1 หรือ 3 หรือ 4 เท่านั้น" });
    }

    const cutoff = beforeDate ? new Date(beforeDate) : new Date();

    // ดึงข้อมูลผู้ใช้และยอดคงเหลือการลา
    const user = await ReportService.downloadReport(userId);
    const balances = await LeaveBalanceService.getLeaveSummaryByUser(userId);
    const leaves = await LeaveRequestService.getRecentLeaveBefore(userId, cutoff)
    // console.log("debug balances: ", balances);
    // console.log("debug leaves: ", leaves);
    //const currentLeave = await LeaveRequestService.getLeaveRequestsByUser(userId);

    const baseDate = req.body.startDate ?? req.body.documentDate ?? new Date();
    const currentYear = getFiscalYear(baseDate) ?? (new Date().getMonth() >= 9 ? new Date().getFullYear() + 1 : new Date().getFullYear());

    const sickBalance = balances.find((b) => b.leaveTypeId === 1 && Number(b.year) === currentYear);
    const sickLeaved = sickBalance ? sickBalance.usedDays : 0;

    const sickLeaves = leaves.find((l) => l.leaveTypeId === 1);
    const lastSickLeaved = sickLeaves ? sickLeaves.leavedDays : "-";
    const sickLeaveTotal = sickLeaves ? sickLeaves.totalDays : "-";

    const personalBalance = balances.find((b) => b.leaveTypeId === 3 && Number(b.year) === currentYear);
    const personalLeaved = personalBalance ? personalBalance.usedDays : 0;

    const personnalLeaves = leaves.find((l) => l.leaveTypeId === 3);
    const lastPersonnalLeaved = personnalLeaves ? personnalLeaves.leavedDays : "-";
    const personnalLeaveTotal = personnalLeaves ? personnalLeaves.totalDays : "-";

    // ทำ default balance เผื่อกรณี่ที่ระบบรันครั้งแรก
    const DEFAULT_BALANCE = { remainingDays: 0, usedDays: 0 };
    
    // vacation
    const vacationBalances = balances.filter((b) => b.leaveTypeId === 4);
    const vacationBalanceCurYear = vacationBalances.find((b) => Number(b.year) === currentYear);
    const vacationBalancePrevYear = vacationBalances.find((b) => Number(b.year) === currentYear - 1);
    
    const cur = vacationBalanceCurYear ? vacationBalanceCurYear : DEFAULT_BALANCE;
    const prev = vacationBalancePrevYear ? vacationBalancePrevYear : DEFAULT_BALANCE;

    // remaining prev year
    const vacationRemainingPrevYear = prev.remainingDays;
    // total
    const vacationRemainingCurYear = cur.remainingDays;
    // received
    const vacationReceiveDays = vacationRemainingCurYear - vacationRemainingPrevYear;
    // used
    const vacationLeaved = cur.usedDays;

    const vacationLeaves = leaves.find((l) => l.leaveTypeId === 4);
    const lastVacationLeaved = vacationLeaves ? vacationLeaves.leavedDays : 0;
    const vacationLeaveTotal = vacationLeaves ? vacationLeaves.totalDays : 0;

    // console.log("Debug vacation balance current year: ", vacationBalanceCurYear);
    // console.log("Debug vacation balance previous year: ", vacationBalancePrevYear);
    // console.log("Debug vacation leave: ", vacationLeaves);

    // console.log("User data:", user);
    // console.log("Leave balance:", balances);

    const organizationId =
      user?.department?.organizationId || "ไม่พบข้อมูลองค์กร";
    // console.log(leaveTypeId);
    // if (!Object.keys(templateMap).map(Number).includes(leaveTypeId)) {
    //   return res
    //     .status(400)
    //     .json({ error: "leaveTypeId ต้อง 1 หรือ 3 หรือ 4 เท่านั้น" });
    // }

    // base data
    const data = {
      documentNumber: req.body.documentNumber || "-",
      documentDate: req.body.documentDate || "-",
      title: req.body.title || "-",
      name: req.body.name || "-",
      position: req.body.position || "-",
      personalType: req.body.personalType || "-",
      employmentType: user?.employmentType || "-",
      leaveType: req.body.leaveType || "-",
      reason: req.body.reason || "-",
      startDate: req.body.startDate || "-",
      endDate: req.body.endDate || "-",
      total: req.body.total || "-",
      thisTime: req.body.thisTime || "-",
      lastLeave: req.body.lastLeave || "-",
      lastLeaveStartDate: req.body.lastLeaveStartDate || "-",
      lastLeaveEndDate: req.body.lastLeaveEndDate || "-",
      lastLeaveTotal: req.body.lastLeaveTotal || "-",
      lastLeaveThisTime: req.body.lastLeaveThisTime || "-",
      contact: req.body.contact || "-",
      phone: req.body.phone || "-",
      signature: req.body.signature || "-",
      commentApprover1: req.body.commentApprover1 || "-",
      commentApprover2: req.body.commentApprover2 || "-",
      commentApprover3: req.body.commentApprover3 || "-",
      commentApprover4: req.body.commentApprover4 || "-",
      signatureVerifier: req.body.signatureVerifier || "-",
      signatureApprover1: req.body.signatureApprover1 || "-",
      signatureApprover2: req.body.signatureApprover2 || "-",
      signatureApprover3: req.body.signatureApprover3 || "-",
      signatureApprover4: req.body.signatureApprover4 || "-",
      positionApprover1: req.body.positionApprover1 || "-",
      positionApprover2: req.body.positionApprover2 || "-",
      positionApprover3: req.body.positionApprover3 || "-",
      DateVerifier: req.body.DateVerifier || "-",
      DateApprover1: req.body.DateApprover1 || "-",
      DateApprover2: req.body.DateApprover2 || "-",
      DateApprover3: req.body.DateApprover3 || "-",
      DateApprover4: req.body.DateApprover4 || "-",
      isApprove: req.body.isApprove,
      date: req.body.date || new Date().toLocaleDateString(),

      // ส่วนที่เคยต่างกัน เอามาใส่รวมกันได้เลย
      organizationId: organizationId || "-",
      organization: req.body.organization || "-", // ถ้า template ใช้ตัวนี้แทน
      sickLeaved,
      personalLeaved,
      vacationLeaved,
      lastSickLeaved,
      lastPersonnalLeaved,
      lastVacationLeaved,
      sickLeaveTotal,
      personnalLeaveTotal,
      vacationRemainingPrevYear,
      vacationRemainingCurYear,
      vacationReceiveDays,
      vacationLeaved,
      lastVacationLeaved,
      vacationLeaveTotal,
      description: req.body.description || "-",
    };
    // console.log("Debug isApprove: ", data.isApprove);
    //con.

    console.log("ข้อมูลที่ใช้สร้าง PDF:", data);
    const templatePath = `./templates/${templateMap[leaveTypeId]}`;
    const fileName = `report${Date.now()}.pdf`;
    const outputPath = `./public/reports/${fileName}`;

    await fillPDFTemplate(data, templatePath, outputPath, leaveTypeId); // ส่ง leaveTypeId ไปด้วยถ้า template ต้องการจัดตำแหน่งต่างกัน

    //const safeName = data.name.replace(/[^\wก-๙\s\-]/gi, "").replace(/\s+/g, "_");
    const downloadFileName = `${data.date}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${downloadFileName.replace(/"/g, "")}"`
    );

    const fileStream = fs.createReadStream(outputPath);
    fileStream.pipe(res);

    fileStream.on("end", () => {
      fs.unlink(outputPath, (err) => {
        if (err) {
          console.error("ไม่สามารถลบไฟล์ PDF ชั่วคราว:", err);
        }
      });
    });

    fileStream.on("error", (err) => {
      console.error("เกิดข้อผิดพลาดในการส่งไฟล์:", err);
      res.status(500).send("ไม่สามารถเปิดไฟล์ PDF ได้");
    });
  } catch (err) {
    console.error("เกิดข้อผิดพลาดในการสร้างไฟล์ PDF:", err);
    res.status(500).send("เกิดข้อผิดพลาดในการสร้างไฟล์ PDF");
  }
};

exports.reportData = async (req, res) => {
  try {
    const { organizationId, startDate, endDate } = req.body;

    if (!organizationId) {
      return res.status(400).json({ error: "กรุณาระบุ organizationId" });
    }
    if (!startDate || !endDate) {
      return res.status(400).json({ error: "กรุณาระบุ startDate และ endDate" });
    }

    const reportData = await ReportService.getReportData(
      organizationId,
      startDate,
      endDate
    );

    res.json({
      title: "รายงานการลาของบุคลากรในคณะ",
      organizationId,
      startDate,
      endDate,
      rows: reportData,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// 📍 Export PDF หรือ Word
exports.exportReport = async (req, res) => {
  try {
    const { countReport, organizationId, startDate, endDate, format } = req.body;
    if (!organizationId) {
      return res.status(400).json({ error: "กรุณาระบุ organizationId" });
    }
    if (!countReport) {
      return res.status(400).json({ error: "กรุณาระบุ countReport" });
    }
    if (!startDate || !endDate) {
      return res.status(400).json({ error: "กรุณาระบุ startDate และ endDate" });
    }
    if (!format) {
      return res.status(400).json({ error: "กรุณาระบุ format" });
    }

    const reportData = await ReportService.getReportData(
      organizationId,
      startDate,
      endDate
    );

    if (!reportData || Object.keys(reportData).length === 0) {
      return res.status(404).json({ error: "ไม่พบข้อมูล" });
    }

    //แปลง Date
    function formatThaiDateFull(dateStr) {
      const thaiMonths = [
        "มกราคม",
        "กุมภาพันธ์",
        "มีนาคม",
        "เมษายน",
        "พฤษภาคม",
        "มิถุนายน",
        "กรกฎาคม",
        "สิงหาคม",
        "กันยายน",
        "ตุลาคม",
        "พฤศจิกายน",
        "ธันวาคม",
      ];

      const date = new Date(dateStr);
      const day = date.getDate();
      const month = thaiMonths[date.getMonth()]; // index 0 = มกราคม
      const year = date.getFullYear() + 543; // ปีพุทธศักราช
      return `${day} ${month} ${year}`;
    }

    // -------------------- กำหนดลำดับหัวข้อ --------------------
    const TYPE_ORDER = [
      "ขาด ราชการ",
      "ลาป่วย",
      "ลากิจ",
      "ลาพักผ่อน",
      "ลา คลอดบุตร",
      "ลาบวช",
    ];

    // กรองช่องว่างออกก่อน
    const filteredTypeOrder = TYPE_ORDER.filter(
      (name) => name && name.trim() !== ""
    ).map((name) => name.replace(/\s+/g, ""));

    const td = (sum, name, f) => {
      const s = sum?.[name];
      if (!s) return "-";
      const v = f === "times" ? s.count : s.days;
      return v === 0 || v ? String(v) : "-";
    };

    // -------------------- PDF --------------------
    if (format === "pdf") {
      const fonts = {
        THSarabunNew: {
          normal: path.join(__dirname, "../fonts/THSarabunNew.ttf"),
          bold: path.join(__dirname, "../fonts/THSarabunNew-Bold.ttf"),
          italics: path.join(__dirname, "../fonts/THSarabunNew-Italic.ttf"),
          bolditalics: path.join(
            __dirname,
            "../fonts/THSarabunNew-BoldItalic.ttf"
          ),
        },
      };
      const printer = new PdfPrinter(fonts);

      const makePdfTable = (list) => {
        const headerRow1 = [
          {
            text: "ที่",
            rowSpan: 3,
            style: "th",
            alignment: "center",
            margin: [0, 30, 0, 0],
          },
          {
            text: "ชื่อ - สกุล",
            rowSpan: 3,
            style: "th",
            alignment: "center",
            margin: [0, 30, 0, 0],
          },
          { text: "สาย/ครั้ง", rowSpan: 3, style: "th", alignment: "center" },
          {
            text: "จำนวนวันลา",
            colSpan: TYPE_ORDER.length * 2,
            style: "th",
            alignment: "center",
          },
          ...Array(TYPE_ORDER.length * 2 - 1).fill({}),
          {
            text: "หมายเหตุ",
            rowSpan: 3,
            style: "th",
            alignment: "center",
            margin: [0, 30, 0, 0],
          },
        ];

        const headerRow2 = [
          {},
          {},
          {},
          ...TYPE_ORDER.flatMap((name) => {
            const isGray = ["ขาด ราชการ", "ลากิจ", "ลา คลอดบุตร"].includes(
              name
            );
            return [
              {
                text: name,
                colSpan: 2,
                style: "th",
                alignment: "center",
                fillColor: isGray ? "#d9d9d9" : null,
              },
              {},
            ];
          }),
          {},
        ];

        const headerRow3 = [
          {},
          {},
          {},
          ...TYPE_ORDER.flatMap((name) => {
            const isGray = ["ขาด ราชการ", "ลากิจ", "ลา คลอดบุตร"].includes(
              name
            );
            return [
              {
                text: "ครั้ง",
                style: "th",
                alignment: "center",
                fillColor: isGray ? "#d9d9d9" : null,
              },
              {
                text: "วัน",
                style: "th",
                alignment: "center",
                fillColor: isGray ? "#d9d9d9" : null,
              },
            ];
          }),
          {},
        ];

        const body = [headerRow1, headerRow2, headerRow3];

        list.forEach((u, idx) => {
          const row = [];
          row.push({ text: String(idx + 1), alignment: "center" });
          row.push({ text: u.name, alignment: "left" });
          row.push({
            text: u.lateTimes != null ? String(u.lateTimes) : "-",
            alignment: "center",
          });

          TYPE_ORDER.forEach((name) => {
            const isGray = ["ขาด ราชการ", "ลากิจ", "ลา คลอดบุตร"].includes(
              name
            );
            row.push({
              text: td(u.leaveSummary, name, "times"),
              alignment: "center",
              fillColor: isGray ? "#d9d9d9" : null,
            });
            row.push({
              text: td(u.leaveSummary, name, "days"),
              alignment: "center",
              fillColor: isGray ? "#d9d9d9" : null,
            });
          });

          row.push({ text: u.note || "", alignment: "center" });
          body.push(row);
        });

        return {
          table: {
            headerRows: 3,
            widths: [
              16, // ที่
              120, // ชื่อ - สกุล
              16, // สาย/ครั้ง
              ...Array(TYPE_ORDER.length * 2).fill(16), // จำนวนวันลา
              70, // หมายเหตุ
            ],
            body,
          },
          layout: {
            paddingLeft: () => 3,
            paddingRight: () => 3,
            paddingTop: () => 2,
            paddingBottom: () => 2,
            hLineColor: "#000000",
            vLineColor: "#000000",
            hLineWidth: () => 1,
            vLineWidth: () => 1,
          },
          margin: [0, 10, 0, 20],
        };
      };

      const content = [];
      const MAX_USERS_PER_PAGE = 25;

      Object.entries(reportData).forEach(([typeName, users], index) => {
        // แบ่ง users เป็น chunks
        for (let i = 0; i < users.length; i += MAX_USERS_PER_PAGE) {
          const chunk = users.slice(i, i + MAX_USERS_PER_PAGE);
          const isFirstChunk = i === 0;
          console.log(chunk);

          // ขึ้นหน้าใหม่ถ้าไม่ใช่ chunk แรกของ typeName หรือ index > 0
          const pageBreakBefore =
            !isFirstChunk || index > 0 ? "before" : undefined;

          content.push({
            stack: [
              {
                text: "มหาวิทยาลัยเทคโนโลยีราชมงคลอีสาน  วิทยาเขตขอนแก่น",
                alignment: "center",
                margin: [0, 0, 0, 0],
              },
              { text: `${typeName} คณะวิศวกรรมศาสตร์`, alignment: "center" },
              { text: "รายนามผู้ลาหยุดประจำปี", alignment: "center" },
              {
                text: `ครั้งที่ ${countReport} ตั้งแต่วันที่ ${formatThaiDateFull(
                  startDate
                )} ถึงวันที่ ${formatThaiDateFull(endDate)}`,
                alignment: "center",
                margin: [0, 0, 0, -12],
              },
              makePdfTable(chunk),
            ],
            pageBreak: pageBreakBefore,
          });
        }
      });

      const docDefinition = {
        content,
        styles: {
          th: { bold: false }, // เอา fillColor ออกทั้งหมด
        },
        defaultStyle: { font: "THSarabunNew", fontSize: 14 },
      };

      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        `Content-Disposition`,
        `attachment; filename=org-report-${organizationId}.pdf`
      );
      pdfDoc.pipe(res);
      pdfDoc.end();
    }

    // -------------------- Word --------------------
    else if (format === "word") {
      const makeCell = (txt, options = {}) => {
        const {
          alignment = "center",
          fillColor = null,
          bold = false,
          columnSpan = 1,
          verticalMerge,
          textDirection,
          width,
          margins = { top: 20, bottom: 0, left: 40, right: 40 },
        } = options;

        return new TableCell({
          columnSpan,
          verticalMerge,
          width: width ? { size: width, type: WidthType.DXA } : undefined,
          margins,
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: String(txt ?? ""),
                  font: "TH Sarabun New",
                  bold,
                  size: 28,
                }),
              ],
              alignment: AlignmentType[alignment.toUpperCase()],
            }),
          ],
          shading: fillColor
            ? { type: ShadingType.CLEAR, fill: fillColor }
            : undefined,
          verticalAlign: "center",
          textDirection,
        });
      };

      const makeWordTable = (list) => {
        // กำหนดความกว้างแต่ละประเภทลา (หน่วย twip)
        const typeWidths = {
          ขาดราชการ: 500,
          ลากิจ: 500,
          ลาคลอดบุตร: 500,
          ลาพักผ่อน: 500,
          ลาป่วย: 500,
          ลาบวช: 500,
        };

        const makeHeaderRows = () => {
          const rows = [];

          // ✅ Row 1
          rows.push(
            new TableRow({
              tableHeader: true,
              children: [
                makeCell("ที่", { verticalMerge: "restart" }),
                makeCell("ชื่อ - สกุล", { verticalMerge: "restart" }),
                makeCell("สาย/ครั้ง", {
                  verticalMerge: "restart",
                  textDirection: TextDirection.BOTTOM_TO_TOP_LEFT_TO_RIGHT, // ← หมุนข้อความ
                }),
                makeCell("จำนวนวันลา", {
                  alignment: "center",
                  bold: false,
                  columnSpan: filteredTypeOrder.length * 2,
                }),
                makeCell("หมายเหตุ", { verticalMerge: "restart" }),
              ],
            })
          );

          // ✅ Row 2 — ประเภทลา
          rows.push(
            new TableRow({
              tableHeader: true,
              children: [
                makeCell("", { verticalMerge: "continue" }),
                makeCell("", { verticalMerge: "continue" }),
                makeCell("", { verticalMerge: "continue" }),
                ...filteredTypeOrder.map((type) => {
                  const w = typeWidths[type] || 1134;
                  const isGray = ["ขาดราชการ", "ลากิจ", "ลาคลอดบุตร"].includes(
                    type
                  );
                  return makeCell(type, {
                    columnSpan: 2,
                    width: w * 2, // รวม 2 ช่อง
                    fillColor: isGray ? "D9D9D9" : null,
                    alignment: "center",
                    bold: false,
                  });
                }),
                makeCell("", { verticalMerge: "continue" }),
              ],
            })
          );

          // ✅ Row 3 — ครั้ง / วัน
          rows.push(
            new TableRow({
              tableHeader: true,
              children: [
                makeCell("", { verticalMerge: "continue" }),
                makeCell("", { verticalMerge: "continue" }),
                makeCell("", { verticalMerge: "continue" }),
                ...filteredTypeOrder.flatMap((type) => {
                  const w = typeWidths[type] || 1134;
                  const isGray = ["ขาดราชการ", "ลากิจ", "ลาคลอดบุตร"].includes(
                    type
                  );
                  return [
                    makeCell("ครั้ง", {
                      width: w,
                      fillColor: isGray ? "D9D9D9" : null,
                    }),
                    makeCell("วัน", {
                      width: w,
                      fillColor: isGray ? "D9D9D9" : null,
                    }),
                  ];
                }),
                makeCell("", { verticalMerge: "continue" }),
              ],
            })
          );

          return rows;
        };

        // ✅ แบ่งหน้า
        const MAX_ROWS_PER_PAGE = 25;
        const chunks = [];
        for (let i = 0; i < list.length; i += MAX_ROWS_PER_PAGE) {
          chunks.push(list.slice(i, i + MAX_ROWS_PER_PAGE));
        }

        const tables = [];

        chunks.forEach((chunk, pageIdx) => {
          const rows = [...makeHeaderRows()];

          chunk.forEach((u, idx) => {
            rows.push(
              new TableRow({
                children: [
                  makeCell(pageIdx * MAX_ROWS_PER_PAGE + idx + 1),
                  makeCell(u.name, { alignment: "left" }),
                  makeCell(u.lateTimes != null ? u.lateTimes : "-"),
                  ...filteredTypeOrder.flatMap((name) => {
                    const isGray = [
                      "ขาดราชการ",
                      "ลากิจ",
                      "ลาคลอดบุตร",
                    ].includes(name);
                    return [
                      makeCell(td(u.leaveSummary, name, "times"), {
                        fillColor: isGray ? "D9D9D9" : null,
                      }),
                      makeCell(td(u.leaveSummary, name, "days"), {
                        fillColor: isGray ? "D9D9D9" : null,
                      }),
                    ];
                  }),
                  makeCell(u.note || "-"),
                ],
              })
            );
          });

          // ✅ คอลัมน์ทั้งหมด (รวมทุกประเภท)
          const tableColumnWidths = [
            500, // ที่
            2800, // ชื่อ - สกุล
            500, // สาย/ครั้ง
            ...filteredTypeOrder.flatMap((name) => {
              const w = typeWidths[name] || 600;
              return [w, w];
            }),
            1200, // หมายเหตุ
          ];

          const table = new Table({
            layout: TableLayoutType.FIXED, // ✅ บังคับความกว้างตายตัว
            columnWidths: tableColumnWidths,
            rows,
            borders: {
              top: { style: BorderStyle.SINGLE, size: 12, color: "000000" },
              bottom: { style: BorderStyle.SINGLE, size: 12, color: "000000" },
              left: { style: BorderStyle.SINGLE, size: 12, color: "000000" },
              right: { style: BorderStyle.SINGLE, size: 12, color: "000000" },
              insideHorizontal: {
                style: BorderStyle.SINGLE,
                size: 12,
                color: "000000",
              },
              insideVertical: {
                style: BorderStyle.SINGLE,
                size: 12,
                color: "000000",
              },
            },
          });

          if (pageIdx > 0) {
            tables.push(new Paragraph({ pageBreakBefore: true }));
          }

          tables.push(table);
        });

        return tables;
      };

      const sections = Object.entries(reportData).map(([typeName, users]) => ({
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: "มหาวิทยาลัยเทคโนโลยีราชมงคลอีสาน วิทยาเขตขอนแก่น",
                    font: "TH Sarabun New",
                    size: 28,
                  }),
                ],
                alignment: AlignmentType.CENTER,
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: `${typeName} คณะวิศวกรรมศาสตร์`,
                    font: "TH Sarabun New",
                    size: 28,
                  }),
                ],
                alignment: AlignmentType.CENTER,
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: "รายนามผู้ลาหยุดประจำปี",
                    font: "TH Sarabun New",
                    size: 28,
                  }),
                ],
                alignment: AlignmentType.CENTER,
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: `ครั้งที่ ${countReport} ตั้งแต่วันที่ ${formatThaiDateFull(
                      startDate
                    )} ถึงวันที่ ${formatThaiDateFull(endDate)}`,
                    font: "TH Sarabun New",
                    size: 28,
                  }),
                ],
                alignment: AlignmentType.CENTER,
                spacing: { after: 0 },
              }),
            ],
          }),
        },
        children: [
          ...makeWordTable(users), // ตารางอยู่ใน body ปกติ
          new Paragraph({ text: "" }),
        ],
      }));

      const doc = new Document({
        styles: {
          default: {
            document: {
              run: {
                font: "TH Sarabun New",
                size: 28,
                lang: "th-TH",
              },
              paragraph: {
                run: {
                  font: "TH Sarabun New",
                  size: 28,
                },
              },
            },
          },
        },
        sections: sections.map((section) => ({
          ...section,
          properties: {
            page: {
              margin: {
                top: 1440, // 1 inch = 1440 twip
                bottom: 1440,
                left: 543,
                right: 1440,
              },
              size: {
                orientation: "portrait", // หรือ "landscape"
                width: 11906, // หน้ากว้างสำหรับ A4 portrait = 11906 twip
                height: 16838, // หน้ายาว A4 = 16838 twip
              },
            },
          },
        })),
      });

      const buffer = await Packer.toBuffer(doc);

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=org-report-${organizationId}.docx`
      );
      res.send(buffer);
    } else {
      res.status(400).json({ error: "Invalid format, use 'pdf' or 'word'" });
    }
  } catch (err) {
    console.error("Export Report Error:", err);
    res.status(500).json({ error: err.message });
  }
};
