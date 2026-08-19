const fs = require("fs");
const PdfPrinter = require("pdfmake");
const path = require("path");
const { fillPDFTemplate } = require("../services/pdfService");
const { title } = require("process");
const LeaveBalanceService = require("../services/leaveBalance-service");
const prisma = require("../config/prisma");
const ReportService = require("../services/report-service");
const ReportDoc = require("../services/reportDoc-service");
const { isWeekend } = require("date-fns");
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
  PageOrientation,
  VerticalAlign,
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
function arabicToThaiNumber(input) {
  const thaiDigits = ["๐", "๑", "๒", "๓", "๔", "๕", "๖", "๗", "๘", "๙"];
  return input.toString().replace(/\d/g, (d) => thaiDigits[d]);
}

//แปลง Date
// ฟังก์ชันช่วยแปลงชื่อเดือนไทย
function formatThaiMonth(m) {
  const months = [
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
  return months[m - 1];
}

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

function getThaiYear(year) {
  const thaiYear = parseInt(year) + 543;
  // หากมีฟังก์ชัน arabicToThaiNumber อยู่แล้วให้ใช้ครอบ: return arabicToThaiNumber(thaiYear);
  return stringToThaiNumber(String(thaiYear));
}

// แปลงเดือนเป็นชื่อไทย
function getThaiMonthName(month) {
  const months = [
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
  return months[parseInt(month) - 1];
}

// ฟังก์ชันแปลงเลขจารบีเป็นเลขไทยแบบง่ายๆ (ถ้าคุณมีฟังก์ชันหลักอยู่แล้วให้ใช้ตัวนั้นแทน)
function stringToThaiNumber(str) {
  const thaiDigits = ["๐", "๑", "๒", "๓", "๔", "๕", "๖", "๗", "๘", "๙"];
  return str.replace(/[0-9]/g, (w) => thaiDigits[w]);
}
const REPORT_YEAR = 2026; // ค.ศ.
const REPORT_MONTH = 0; // 0 = มกราคม (แก้ตามเดือนจริง)

const checkIsWeekend = (day) => {
  const d = new Date(REPORT_YEAR, REPORT_MONTH, Number(day));
  const w = d.getDay(); // 0 = อา, 6 = ส
  return w === 0 || w === 6;
};

// -------------------- กำหนดลำดับหัวข้อ --------------------
const TYPE_ORDER = ["ลาป่วย", "ลากิจ", "ลาพักผ่อน"];
const DAY_ORDER = Array.from({ length: 31 }, (_, i) => String(i + 1));

exports.downloadReport = async (req, res) => {
  try {
    const leaveTypeId = Number(req.body.leaveTypeId);
    const requestedUserId =
      req.body?.userId != null ? Number(req.body.userId) : null;
    const requesterId = req.user?.id;
    const roles = Array.isArray(req.user?.role)
      ? req.user.role
      : Array.isArray(req.user?.roles)
        ? req.user.roles
        : [];

    const userId = requestedUserId || requesterId;
    if (!userId || Number.isNaN(userId)) {
      return res.status(400).json({ error: "userId ไม่ถูกต้อง" });
    }

    // Allow exporting report for:
    // - owner (same user)
    // - ADMIN (export on behalf)
    if (
      requestedUserId &&
      requestedUserId !== requesterId &&
      !roles.includes("ADMIN")
    ) {
      return res.status(403).json({ error: "Forbidden" });
    }
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

    // ดึงข้อมูลผู้ใช้และยอดคงเหลือการลา (ต้องอิงเจ้าของใบลา)
    const user = await ReportService.downloadReport(userId);
    const balances = await LeaveBalanceService.getLeaveSummaryByUser(userId);
    const leaves = await LeaveRequestService.getRecentLeaveBefore(
      userId,
      cutoff,
    );
    // console.log("debug balances: ", balances);
    // console.log("debug leaves: ", leaves);
    //const currentLeave = await LeaveRequestService.getLeaveRequestsByUser(userId);

    const baseDate = req.body.startDate ?? req.body.documentDate ?? new Date();
    const currentYear =
      getFiscalYear(baseDate) ??
      (new Date().getMonth() >= 9
        ? new Date().getFullYear() + 1
        : new Date().getFullYear());

    const sickBalance = balances.find(
      (b) => b.leaveTypeId === 1 && Number(b.year) === currentYear,
    );
    const sickLeaved = sickBalance ? sickBalance.usedDays : 0;

    const sickLeaves = leaves.find((l) => l.leaveTypeId === 1);
    const lastSickLeaved = sickLeaves ? sickLeaves.leavedDays : "-";
    const sickLeaveTotal = sickLeaves ? sickLeaves.totalDays : "-";

    const personalBalance = balances.find(
      (b) => b.leaveTypeId === 3 && Number(b.year) === currentYear,
    );
    const personalLeaved = personalBalance ? personalBalance.usedDays : 0;

    const personnalLeaves = leaves.find((l) => l.leaveTypeId === 3);
    const lastPersonnalLeaved = personnalLeaves
      ? personnalLeaves.leavedDays
      : "-";
    const personnalLeaveTotal = personnalLeaves
      ? personnalLeaves.totalDays
      : "-";

    // ทำ default balance เผื่อกรณี่ที่ระบบรันครั้งแรก
    const DEFAULT_BALANCE = { remainingDays: 0, usedDays: 0 };

    // vacation
    const vacationBalances = balances.filter((b) => b.leaveTypeId === 4);
    const vacationBalanceCurYear = vacationBalances.find(
      (b) => Number(b.year) === currentYear,
    );
    const vacationBalancePrevYear = vacationBalances.find(
      (b) => Number(b.year) === currentYear - 1,
    );

    const cur = vacationBalanceCurYear
      ? vacationBalanceCurYear
      : DEFAULT_BALANCE;
    const prev = vacationBalancePrevYear
      ? vacationBalancePrevYear
      : DEFAULT_BALANCE;

    // remaining prev year
    const vacationRemainingPrevYear = prev.remainingDays;
    // total
    const vacationRemainingCurYear = cur.remainingDays;
    // received
    const vacationReceiveDays =
      vacationRemainingCurYear - vacationRemainingPrevYear;
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
      `inline; filename="${downloadFileName.replace(/"/g, "")}"`,
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
      endDate,
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

exports.getReportDataForMonth = async (req, res) => {
  try {
    const { organizationId, month, year } = req.query;

    // แปลงเป็นตัวเลข
    const organizationIdNumber = Number(organizationId);
    const monthNumber = Number(month);
    const yearNumber = Number(year);

    // Validation
    if (!organizationIdNumber) {
      return res.status(400).json({
        success: false,
        error: "กรุณาระบุ organizationId",
      });
    }

    if (!monthNumber || monthNumber < 1 || monthNumber > 12) {
      return res.status(400).json({
        success: false,
        error: "กรุณาระบุเดือนที่ถูกต้อง (1-12)",
      });
    }

    if (!yearNumber) {
      return res.status(400).json({
        success: false,
        error: "กรุณาระบุปี ค.ศ. (เช่น 2026)",
      });
    }

    // เรียก Service
    const reportData = await ReportService.getReportDataForMonth(
      organizationIdNumber,
      monthNumber,
      yearNumber,
    );

    // ตรวจสอบว่ามีข้อมูลจริงหรือไม่
    const hasData = Object.values(reportData.report).some(
      (users) => users.length > 0,
    );

    if (!hasData) {
      return res.status(404).json({
        success: false,
        message: "ไม่พบข้อมูลบุคลากรหรือข้อมูลการลาในเงื่อนไขที่ระบุ",
        month: monthNumber,
        year: yearNumber,
      });
    }

    // ส่งข้อมูลกลับ
    return res.status(200).json({
      success: true,
      message: `ดึงข้อมูลรายงานประจำเดือน ${monthNumber}/${yearNumber} สำเร็จ`,
      data: reportData,
    });
  } catch (err) {
    console.error("Controller Error (getReportDataForMonth):", err);

    return res.status(500).json({
      success: false,
      error: "เกิดข้อผิดพลาดที่ Server",
      message: err.message,
    });
  }
};

// ============================================================================
// Export รายงานสรุป (PDF/Word) — ใช้ตัวสร้างเอกสารกลางใน reportDoc-service
// รอบประเมิน (round) และ รอบปีงบประมาณ (fiscal) ใช้ตารางสรุปแบบเดียวกัน
// รอบเดือน (month) ใช้ตารางลงเวลารายวัน
// ============================================================================

const FACULTY = "คณะวิศวกรรมศาสตร์";
const UNIVERSITY = "มหาวิทยาลัยเทคโนโลยีราชมงคลอีสาน  วิทยาเขตขอนแก่น";
const SUMMARY_TITLE = "รายงานสรุปการลาและการลงเวลาปฏิบัติราชการของบุคลากร";

const hasData = (grouped) =>
  grouped && Object.values(grouped).some((list) => Array.isArray(list) && list.length);

const roundHeading = (countReport, s, e) => (typeName) =>
  [
    UNIVERSITY,
    SUMMARY_TITLE,
    `สังกัด ${FACULTY}`,
    `ประจำรอบการประเมิน ครั้งที่ ${ReportDoc.toThaiNumber(countReport)} ระหว่างวันที่ ${ReportDoc.toThaiNumber(
      ReportDoc.formatThaiDateFull(s),
    )} - ${ReportDoc.toThaiNumber(ReportDoc.formatThaiDateFull(e))}`,
    `ประเภทบุคลากร ${typeName}`,
  ];

const fiscalHeading = (s, e) => {
  const fy = ReportDoc.fiscalYearBE(s);
  return (typeName) => [
    UNIVERSITY,
    SUMMARY_TITLE,
    `สังกัด ${FACULTY}`,
    `ประจำปีงบประมาณ พ.ศ. ${ReportDoc.toThaiNumber(fy ?? "")} ระหว่างวันที่ ${ReportDoc.toThaiNumber(
      ReportDoc.formatThaiDateFull(s),
    )} - ${ReportDoc.toThaiNumber(ReportDoc.formatThaiDateFull(e))}`,
    `ประเภทบุคลากร ${typeName}`,
  ];
};

const monthHeading = (month, yearCE) => (typeName) =>
  [
    SUMMARY_TITLE,
    `ประจำเดือน ${ReportDoc.formatThaiMonth(month)} พ.ศ. ${ReportDoc.toThaiNumber(Number(yearCE) + 543)}`,
    `สังกัด ${FACULTY} มหาวิทยาลัยเทคโนโลยีราชมงคลอีสาน`,
    `ประเภทบุคลากร ${typeName}`,
  ];

const fail = (res, err, where) => {
  console.error(`${where}:`, err);
  if (!res.headersSent) res.status(500).json({ error: err.message });
};

// สร้าง+ส่งเอกสารตารางสรุป (รอบประเมิน/ปีงบ) — รับช่วงวันที่มาตรง ๆ
async function buildSummary(res, { organizationId, startDate, endDate, format, heading, fileName }) {
  if (!organizationId) return res.status(400).json({ error: "กรุณาระบุ organizationId" });
  if (!startDate || !endDate)
    return res.status(400).json({ error: "กรุณาระบุ startDate และ endDate" });

  const reportData = await ReportService.getReportData(organizationId, startDate, endDate);
  if (!hasData(reportData)) return res.status(404).json({ error: "ไม่พบข้อมูล" });

  if (format === "word") {
    const doc = ReportDoc.summaryWordDoc(reportData, heading);
    return ReportDoc.sendWord(res, doc, { en: `${fileName}.docx`, thai: `${fileName}.docx` });
  }
  const doc = ReportDoc.summaryPdfDoc(reportData, heading);
  return ReportDoc.streamPdf(res, doc, { en: `${fileName}.pdf`, thai: `${fileName}.pdf` });
}

// ---------------------------------------- รอบประเมิน (round) ----------------
async function handleRound(req, res, format, where) {
  try {
    const { organizationId, countReport, startDate, endDate } = req.body;
    if (!countReport) return res.status(400).json({ error: "กรุณาระบุ countReport" });
    return await buildSummary(res, {
      organizationId,
      startDate,
      endDate,
      format,
      heading: roundHeading(countReport, startDate, endDate),
      fileName: `Report_Round_${countReport}`,
    });
  } catch (err) {
    return fail(res, err, where);
  }
}
exports.exportRoundReportPDF = (req, res) => handleRound(req, res, "pdf", "exportRoundReportPDF");
exports.exportRoundReportWORD = (req, res) => handleRound(req, res, "word", "exportRoundReportWORD");

// ---------------------------------------- รอบปีงบประมาณ (fiscal) ------------
// ช่วงวันที่ derive จาก setting "fiscalYear" ในระบบ — client ส่งแค่ organizationId
async function handleFiscal(req, res, format, where) {
  try {
    const { organizationId, fiscalYear } = req.body;
    const { startDate, endDate, fiscalYearBE } = await ReportService.getFiscalRange(fiscalYear);
    return await buildSummary(res, {
      organizationId,
      startDate,
      endDate,
      format,
      heading: fiscalHeading(startDate, endDate),
      fileName: `Report_Fiscal_${fiscalYearBE}`,
    });
  } catch (err) {
    return fail(res, err, where);
  }
}
exports.exportFiscalYearReportPDF = (req, res) => handleFiscal(req, res, "pdf", "exportFiscalYearReportPDF");
exports.exportFiscalYearReportWORD = (req, res) => handleFiscal(req, res, "word", "exportFiscalYearReportWORD");

// พรีวิวรอบปีงบ — คืน rows + ช่วงวันที่ที่ derive ไว้ (ให้ frontend แสดงหัวรายงาน)
exports.getFiscalReportData = async (req, res) => {
  try {
    const organizationId = Number(req.query.organizationId);
    if (!organizationId) return res.status(400).json({ error: "กรุณาระบุ organizationId" });
    const { startDate, endDate, fiscalYearBE } = await ReportService.getFiscalRange(req.query.fiscalYear);
    const rows = await ReportService.getReportData(organizationId, startDate, endDate);
    return res.json({ organizationId, startDate, endDate, fiscalYearBE, rows });
  } catch (err) {
    return fail(res, err, "getFiscalReportData");
  }
};

// ปีงบที่มีข้อมูลจริง (+ ปีปัจจุบัน) เป็น พ.ศ. — ให้ frontend ทำ dropdown filter
exports.getFiscalYears = async (req, res) => {
  try {
    const years = await ReportService.getAvailableFiscalYears();
    return res.json({ years });
  } catch (err) {
    return fail(res, err, "getFiscalYears");
  }
};

// ---------------------------------------- รอบเดือน (month) ------------------
async function buildMonth(req, res, format, where) {
  try {
    const { organizationId, month, year } = req.body;
    if (!organizationId || !month || !year)
      return res.status(400).json({ error: "กรุณาระบุ organizationId, month และ year" });

    const result = await ReportService.getReportDataForMonth(
      Number(organizationId),
      parseInt(month, 10),
      parseInt(year, 10),
    );
    if (!hasData(result.report)) return res.status(404).json({ error: "ไม่พบข้อมูล" });

    const heading = monthHeading(month, year);
    const fileName = `Report_Month_${month}_${year}`;
    if (format === "word") {
      const doc = ReportDoc.monthlyWordDoc(result, heading);
      return await ReportDoc.sendWord(res, doc, { en: `${fileName}.docx`, thai: `${fileName}.docx` });
    }
    const doc = ReportDoc.monthlyPdfDoc(result, heading);
    return ReportDoc.streamPdf(res, doc, { en: `${fileName}.pdf`, thai: `${fileName}.pdf` });
  } catch (err) {
    return fail(res, err, where);
  }
}
exports.exportMonthReportPDF = (req, res) => buildMonth(req, res, "pdf", "exportMonthReportPDF");
exports.exportMonthReportWORD = (req, res) => buildMonth(req, res, "word", "exportMonthReportWORD");

// ---------------------------------------- legacy /export-report (ADMIN) -----
// รับ format ทาง body — ใช้โครงรอบประเมิน (คงไว้เพื่อความเข้ากันได้ย้อนหลัง)
exports.exportReport = async (req, res) => {
  try {
    const { organizationId, countReport, startDate, endDate, format } = req.body;
    if (!countReport) return res.status(400).json({ error: "กรุณาระบุ countReport" });
    if (!format) return res.status(400).json({ error: "กรุณาระบุ format" });
    return await buildSummary(res, {
      organizationId,
      startDate,
      endDate,
      format: format === "word" ? "word" : "pdf",
      heading: roundHeading(countReport, startDate, endDate),
      fileName: `Report_Round_${countReport}`,
    });
  } catch (err) {
    return fail(res, err, "exportReport");
  }
};

// ============================================================================
// พรีวิวข้อมูล (แยก endpoint ของทีม) — รอบประเมิน / รอบปีงบประมาณ
// คงไว้เพื่อความเข้ากันได้ (คนละ endpoint กับของหน้า LeaveReport)
// ============================================================================
exports.getReportDataForRound = async (req, res) => {
  try {
    const { organizationId, startDate, endDate, countReport } = req.query;

    const organizationIdNumber = Number(organizationId);
    const countReportNumber = Number(countReport);

    if (!organizationIdNumber) {
      return res.status(400).json({ success: false, error: "กรุณาระบุ organizationId" });
    }
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, error: "กรุณาระบุ startDate และ endDate" });
    }
    if (!countReportNumber) {
      return res.status(400).json({ success: false, error: "กรุณาระบุ countReport" });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ success: false, error: "รูปแบบวันที่ไม่ถูกต้อง" });
    }
    if (start > end) {
      return res.status(400).json({ success: false, error: "startDate ต้องไม่มากกว่า endDate" });
    }

    const reportData = await ReportService.getReportDataForRound(
      organizationIdNumber,
      startDate,
      endDate,
      countReportNumber,
    );

    const hasRows = Object.values(reportData.report).some((users) => users.length > 0);
    if (!hasRows) {
      return res.status(404).json({
        success: false,
        message: "ไม่พบข้อมูลบุคลากรหรือข้อมูลการลาในรอบประเมินที่ระบุ",
        startDate,
        endDate,
        countReport: countReportNumber,
      });
    }

    return res.status(200).json({
      success: true,
      message: `ดึงข้อมูลรายงานรอบประเมินที่ ${countReportNumber} สำเร็จ`,
      data: reportData,
    });
  } catch (err) {
    console.error("Controller Error (getReportDataForRound):", err);
    return res.status(500).json({ success: false, error: "เกิดข้อผิดพลาดที่ Server", message: err.message });
  }
};

exports.getReportDataForFiscalYear = async (req, res) => {
  try {
    const { organizationId, fiscalYear } = req.query;

    const organizationIdNumber = Number(organizationId);
    const fiscalYearNumber = Number(fiscalYear);

    if (!organizationIdNumber) {
      return res.status(400).json({ success: false, error: "กรุณาระบุ organizationId" });
    }
    if (!fiscalYearNumber) {
      return res.status(400).json({ success: false, error: "กรุณาระบุปีงบประมาณ (ค.ศ.)" });
    }
    if (fiscalYearNumber < 1900 || fiscalYearNumber > 3000) {
      return res.status(400).json({ success: false, error: "กรุณาระบุปีงบประมาณเป็น ค.ศ. ที่ถูกต้อง" });
    }

    // ปีงบประมาณ ค.ศ. N = 1 ต.ค. (N-1) ถึง 30 ก.ย. N
    const startDate = new Date(fiscalYearNumber - 1, 9, 1);
    const endDate = new Date(fiscalYearNumber, 8, 30, 23, 59, 59, 999);

    const reportData = await ReportService.getReportDataForFiscalYear(
      organizationIdNumber,
      startDate,
      endDate,
    );

    const hasRows = Object.values(reportData.report).some((users) => users.length > 0);
    if (!hasRows) {
      return res.status(404).json({
        success: false,
        message: "ไม่พบข้อมูลบุคลากรหรือข้อมูลการลาในปีงบประมาณที่ระบุ",
        fiscalYear: fiscalYearNumber,
        startDate,
        endDate,
      });
    }

    return res.status(200).json({
      success: true,
      message: `ดึงข้อมูลรายงานปีงบประมาณ ${fiscalYearNumber} สำเร็จ`,
      data: { ...reportData, fiscalYear: fiscalYearNumber },
    });
  } catch (err) {
    console.error("Controller Error (getReportDataForFiscalYear):", err);
    return res.status(500).json({ success: false, error: "เกิดข้อผิดพลาดที่ Server", message: err.message });
  }
};
