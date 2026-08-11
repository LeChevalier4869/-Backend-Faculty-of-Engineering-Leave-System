const fs = require("fs");
const PdfPrinter = require("pdfmake");
const path = require("path");
const { fillPDFTemplate } = require("../services/pdfService");
const { title } = require("process");
const LeaveBalanceService = require("../services/leaveBalance-service");
const prisma = require("../config/prisma");
const ReportService = require("../services/report-service");
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

exports.getReportDataForFiscalYear = async (req, res) => {
  try {
    const { organizationId, fiscalYear } = req.query;

    const organizationIdNumber = Number(organizationId);
    const fiscalYearNumber = Number(fiscalYear);

    // Validation organizationId
    if (!organizationIdNumber) {
      return res.status(400).json({
        success: false,
        error: "กรุณาระบุ organizationId",
      });
    }

    // Validation fiscalYear
    if (!fiscalYearNumber) {
      return res.status(400).json({
        success: false,
        error: "กรุณาระบุปีงบประมาณ (ค.ศ.)",
      });
    }

    // ตรวจสอบปี ค.ศ.
    if (fiscalYearNumber < 1900 || fiscalYearNumber > 3000) {
      return res.status(400).json({
        success: false,
        error: "กรุณาระบุปีงบประมาณเป็น ค.ศ. ที่ถูกต้อง",
      });
    }

    // ปีงบประมาณเริ่มวันที่ 1 ตุลาคมของปีก่อนหน้า
    // เช่น fiscalYear = 2026
    // startDate = 2025-10-01
    const startDate = new Date(fiscalYearNumber - 1, 9, 1);

    // สิ้นสุดวันที่ 30 กันยายนของปีที่เลือก
    // เช่น fiscalYear = 2026
    // endDate = 2026-09-30
    const endDate = new Date(fiscalYearNumber, 8, 30, 23, 59, 59, 999);

    // เรียก Service
    const reportData = await ReportService.getReportDataForFiscalYear(
      organizationIdNumber,
      startDate,
      endDate,
    );

    // ตรวจสอบว่ามีข้อมูลหรือไม่
    const hasData = Object.values(reportData.report).some(
      (users) => users.length > 0,
    );

    if (!hasData) {
      return res.status(404).json({
        success: false,
        message: "ไม่พบข้อมูลบุคลากรหรือข้อมูลการลาในปีงบประมาณที่ระบุ",
        fiscalYear: fiscalYearNumber,
        startDate,
        endDate,
      });
    }

    // ส่งข้อมูลกลับ
    return res.status(200).json({
      success: true,
      message: `ดึงข้อมูลรายงานปีงบประมาณ ${fiscalYearNumber} สำเร็จ`,
      data: {
        ...reportData,
        fiscalYear: fiscalYearNumber,
      },
    });
  } catch (err) {
    console.error("Controller Error (getReportDataForFiscalYear):", err);

    return res.status(500).json({
      success: false,
      error: "เกิดข้อผิดพลาดที่ Server",
      message: err.message,
    });
  }
};

// 📍 Export PDF หรือ Word

// ---------------------------------------ประจำรอบประเมิน---------------------------------------
exports.exportReport = async (req, res) => {
  try {
    const { countReport, organizationId, startDate, endDate, format } =
      req.body;
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
      endDate,
    );

    if (!reportData || Object.keys(reportData).length === 0) {
      return res.status(404).json({ error: "ไม่พบข้อมูล" });
    }

    // กรองช่องว่างออกก่อน
    const filteredTypeOrder = TYPE_ORDER.filter(
      (name) => name && name.trim() !== "",
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
            "../fonts/THSarabunNew-BoldItalic.ttf",
          ),
        },
      };
      const printer = new PdfPrinter(fonts);

      const makePdfTable = (list) => {
        const headerRow1 = [
          {
            text: "ลำดับ",
            rowSpan: 2,
            style: "th",
            alignment: "center",
            margin: [0, 15, 0, 15],
          },
          {
            text: "เลขที่ตำแหน่ง",
            rowSpan: 2,
            style: "th",
            alignment: "center",
            margin: [0, 15, 0, 15],
          },
          {
            text: "ชื่อ - สกุล",
            rowSpan: 2,
            style: "th",
            alignment: "center",
            margin: [0, 15, 0, 15],
          },
          ...TYPE_ORDER.flatMap((name) => {
            return [
              {
                text: name,
                colSpan: 2,
                style: "th",
                alignment: "center",
                margin: [0, 1, 0, 1],
              },
              {},
            ];
          }),
          {
            text: "มาสาย(ครั้ง)",
            rowSpan: 2,
            style: "th",
            alignment: "center",
            margin: [0, 15, 0, 15],
          },
          {
            text: "ขาดราชการ(วัน)",
            rowSpan: 2,
            style: "th",
            alignment: "center",
            margin: [0, 15, 0, 15],
          },
          {
            text: "การลาประเภท อื่น ๆ (โปรดระบุ)",
            rowSpan: 2,
            style: "th",
            alignment: "center",
            margin: [0, 15, 0, 15],
          },
          {
            text: "หมายเหตุ",
            rowSpan: 2,
            style: "th",
            alignment: "center",
            margin: [0, 15, 0, 15],
          },
        ];

        const headerRow2 = [
          {},
          {},
          {},
          ...TYPE_ORDER.flatMap((name) => {
            return [
              {
                text: "ครั้ง",
                style: "th",
                alignment: "center",
                margin: [0, 1, 0, 1],
              },
              {
                text: "วัน",
                style: "th",
                alignment: "center",
                margin: [0, 1, 0, 1],
              },
            ];
          }),
          {},
          {},
          {},
        ];

        const body = [headerRow1, headerRow2];

        list.forEach((u, idx) => {
          const row = [];
          row.push({ text: String(idx + 1), alignment: "center" }); //ลำดับ
          row.push({ text: "", alignment: "left" }); //เลขที่ตำแหน่ง(ใช้ชื่อแทนไปก่อน)
          row.push({ text: u.name, alignment: "left" }); //ชื่อ
          TYPE_ORDER.forEach((name) => {
            row.push({
              text: td(u.leaveSummary, name, "times"),
              alignment: "center",
            });
            row.push({
              text: td(u.leaveSummary, name, "days"),
              alignment: "center",
            });
          });
          row.push({
            text: u.lateTimes != null ? String(u.lateTimes) : "-",
            alignment: "center",
          });
          row.push({ text: "" || "", alignment: "center" });
          row.push({ text: "" || "", alignment: "center" });
          row.push({ text: "" || "", alignment: "center" });
          body.push(row);
        });

        return {
          table: {
            headerRows: 2,
            widths: [
              30, // ที่
              60, // เลขที่ตำแหน่ง
              130, // ชื่อ - สกุล
              ...Array(TYPE_ORDER.length * 2).fill(25), // จำนวนวันลา
              50, // สาย/ครั้ง
              70, // สาย/ครั้ง
              130, // สาย/ครั้ง
              70, // หมายเหตุ
            ],
            body,
          },
          layout: {
            paddingLeft: () => 1,
            paddingRight: () => 1,
            paddingTop: () => 1,
            paddingBottom: () => 1,
            hLineColor: "#000000",
            vLineColor: "#000000",
            hLineWidth: () => 1,
            vLineWidth: () => 1,
          },
          margin: [0, 10, 0, 20],
        };
      };

      const content = [];
      const MAX_USERS_PER_PAGE = 15;

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
              {
                text: "รายงานสรุปการลาและการลงเวลาปฏิบัติราชการของบุคคลากร",
                alignment: "center",
              },
              { text: `สังกัด คณะวิศวกรรมศาสตร์`, alignment: "center" },
              {
                text: `ประจำรอบการประเมิน ครั้งที่ ${arabicToThaiNumber(
                  countReport,
                )} ระหว่างวันที่ ${arabicToThaiNumber(
                  formatThaiDateFull(startDate),
                )} - ${arabicToThaiNumber(formatThaiDateFull(endDate))}`,
                alignment: "center",
              },
              {
                text: `ประเภทบุคคลากร ${typeName}`,
                alignment: "center",
                margin: [0, 0, 0, -5],
              },
              makePdfTable(chunk),
            ],
            pageBreak: pageBreakBefore,
          });
        }
      });

      const docDefinition = {
        pageSize: "A4",
        pageOrientation: "landscape",
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
        `attachment; filename=org-report-${organizationId}.pdf`,
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
          verticalAlign: VerticalAlign.CENTER,
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
                makeCell("เลขที่ตำแหน่ง", { verticalMerge: "restart" }),
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
            }),
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
                  return makeCell(type, {
                    columnSpan: 2,
                    width: w * 2,
                    alignment: "center",
                    bold: false,
                  });
                }),
                makeCell("", { verticalMerge: "continue" }),
              ],
            }),
          );

          // ✅ Row 3 — ครั้ง / วัน
          rows.push(
            new TableRow({
              tableHeader: true,
              children: [
                makeCell("", { verticalMerge: "continue" }),
                makeCell("", { verticalMerge: "continue" }),
                makeCell("", { verticalMerge: "continue" }),
                makeCell("", { verticalMerge: "continue" }),
                makeCell("", { verticalMerge: "continue" }),
                ...filteredTypeOrder.flatMap((type) => {
                  const w = typeWidths[type] || 1134;
                  return [
                    makeCell("ครั้ง", { width: w }),
                    makeCell("วัน", { width: w }),
                  ];
                }),
                makeCell("", { verticalMerge: "continue" }),
              ],
            }),
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
                    return [
                      makeCell(td(u.leaveSummary, name, "times")),
                      makeCell(td(u.leaveSummary, name, "days")),
                    ];
                  }),
                  makeCell(u.note || "-"),
                ],
              }),
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

      const doc = new Document({
        styles: {
          default: {
            document: {
              run: {
                font: "TH Sarabun New",
                size: 28,
                lang: "th-TH",
              },
            },
          },
        },

        sections: [
          {
            properties: {
              page: {
                margin: {
                  top: 1440,
                  bottom: 1440,
                  left: 543,
                  right: 1440,
                },
                size: {
                  orientation: PageOrientation.LANDSCAPE,
                  width: 16840,
                  height: 11907,
                },
              },
            },

            children: Object.entries(reportData).flatMap(
              ([typeName, users], index) => [
                ...(index > 0
                  ? [new Paragraph({ pageBreakBefore: true })]
                  : []),

                // 🔥 header (ย้ายมาเป็น content)
                new Paragraph({
                  text: "มหาวิทยาลัยเทคโนโลยีราชมงคลอีสาน วิทยาเขตขอนแก่น",
                  alignment: AlignmentType.CENTER,
                }),
                new Paragraph({
                  text: `${typeName} คณะวิศวกรรมศาสตร์`,
                  alignment: AlignmentType.CENTER,
                }),
                new Paragraph({
                  text: "รายนามผู้ลาหยุดประจำปี",
                  alignment: AlignmentType.CENTER,
                }),
                new Paragraph({
                  text: `ครั้งที่ ${countReport} ตั้งแต่วันที่ ${formatThaiDateFull(
                    startDate,
                  )} ถึงวันที่ ${formatThaiDateFull(endDate)}`,
                  alignment: AlignmentType.CENTER,
                }),

                ...makeWordTable(users),
              ],
            ),
          },
        ],
      });

      const buffer = await Packer.toBuffer(doc);

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=org-report-${organizationId}.docx`,
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
exports.exportRoundReportPDF = async (req, res) => {
  try {
    const { countReport, organizationId, startDate, endDate } = req.body;
    if (!organizationId) {
      return res.status(400).json({ error: "กรุณาระบุ organizationId" });
    }
    if (!countReport) {
      return res.status(400).json({ error: "กรุณาระบุ countReport" });
    }
    if (!startDate || !endDate) {
      return res.status(400).json({ error: "กรุณาระบุ startDate และ endDate" });
    }

    const reportData = await ReportService.getReportData(
      organizationId,
      startDate,
      endDate,
    );

    if (!reportData || Object.keys(reportData).length === 0) {
      return res.status(404).json({ error: "ไม่พบข้อมูล" });
    }

    const td = (sum, name, f) => {
      const s = sum?.[name];
      if (!s) return "-";
      const v = f === "times" ? s.count : s.days;
      return v === 0 || v ? String(v) : "-";
    };

    // -------------------- PDF --------------------
    if (reportData) {
      const fonts = {
        THSarabunNew: {
          normal: path.join(__dirname, "../fonts/THSarabunNew.ttf"),
          bold: path.join(__dirname, "../fonts/THSarabunNew-Bold.ttf"),
          italics: path.join(__dirname, "../fonts/THSarabunNew-Italic.ttf"),
          bolditalics: path.join(
            __dirname,
            "../fonts/THSarabunNew-BoldItalic.ttf",
          ),
        },
      };
      const printer = new PdfPrinter(fonts);

      const makePdfTable = (list) => {
        const headerRow1 = [
          {
            text: "ลำดับ",
            rowSpan: 2,
            style: "th",
            alignment: "center",
            margin: [0, 15, 0, 15],
          },
          {
            text: "เลขที่ตำแหน่ง",
            rowSpan: 2,
            style: "th",
            alignment: "center",
            margin: [0, 15, 0, 15],
          },
          {
            text: "ชื่อ - สกุล",
            rowSpan: 2,
            style: "th",
            alignment: "center",
            margin: [0, 15, 0, 15],
          },
          ...TYPE_ORDER.flatMap((name) => {
            return [
              {
                text: name,
                colSpan: 2,
                style: "th",
                alignment: "center",
                margin: [0, 1, 0, 1],
              },
              {},
            ];
          }),
          {
            text: "มาสาย(ครั้ง)",
            rowSpan: 2,
            style: "th",
            alignment: "center",
            margin: [0, 15, 0, 15],
          },
          {
            text: "ขาดราชการ(วัน)",
            rowSpan: 2,
            style: "th",
            alignment: "center",
            margin: [0, 15, 0, 15],
          },
          {
            text: "การลาประเภท อื่น ๆ (โปรดระบุ)",
            rowSpan: 2,
            style: "th",
            alignment: "center",
            margin: [0, 15, 0, 15],
          },
          {
            text: "หมายเหตุ",
            rowSpan: 2,
            style: "th",
            alignment: "center",
            margin: [0, 15, 0, 15],
          },
        ];

        const headerRow2 = [
          {},
          {},
          {},
          ...TYPE_ORDER.flatMap((name) => {
            return [
              {
                text: "ครั้ง",
                style: "th",
                alignment: "center",
                margin: [0, 1, 0, 1],
              },
              {
                text: "วัน",
                style: "th",
                alignment: "center",
                margin: [0, 1, 0, 1],
              },
            ];
          }),
          {},
          {},
          {},
        ];

        const body = [headerRow1, headerRow2];

        list.forEach((u, idx) => {
          const row = [];
          row.push({ text: String(idx + 1), alignment: "center" }); //ลำดับ
          row.push({ text: "", alignment: "left" }); //เลขที่ตำแหน่ง(ใช้ชื่อแทนไปก่อน)
          row.push({ text: u.name, alignment: "left" }); //ชื่อ
          TYPE_ORDER.forEach((name) => {
            row.push({
              text: td(u.leaveSummary, name, "times"),
              alignment: "center",
            });
            row.push({
              text: td(u.leaveSummary, name, "days"),
              alignment: "center",
            });
          });
          row.push({
            text: u.lateTimes != null ? String(u.lateTimes) : "-",
            alignment: "center",
          });
          row.push({ text: "" || "", alignment: "center" });
          row.push({ text: "" || "", alignment: "center" });
          row.push({ text: "" || "", alignment: "center" });
          body.push(row);
        });

        return {
          table: {
            headerRows: 2,
            widths: [
              30, // ที่
              60, // เลขที่ตำแหน่ง
              130, // ชื่อ - สกุล
              ...Array(TYPE_ORDER.length * 2).fill(25), // จำนวนวันลา
              50, // สาย/ครั้ง
              70, // สาย/ครั้ง
              130, // สาย/ครั้ง
              70, // หมายเหตุ
            ],
            body,
          },
          layout: {
            paddingLeft: () => 1,
            paddingRight: () => 1,
            paddingTop: () => 1,
            paddingBottom: () => 1,
            hLineColor: "#000000",
            vLineColor: "#000000",
            hLineWidth: () => 1,
            vLineWidth: () => 1,
          },
          margin: [0, 10, 0, 20],
        };
      };

      const content = [];
      const MAX_USERS_PER_PAGE = 15;

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
              {
                text: "รายงานสรุปการลาและการลงเวลาปฏิบัติราชการของบุคคลากร",
                alignment: "center",
              },
              { text: `สังกัด คณะวิศวกรรมศาสตร์`, alignment: "center" },
              {
                text: `ประจำรอบการประเมิน ครั้งที่ ${arabicToThaiNumber(
                  countReport,
                )} ระหว่างวันที่ ${arabicToThaiNumber(
                  formatThaiDateFull(startDate),
                )} - ${arabicToThaiNumber(formatThaiDateFull(endDate))}`,
                alignment: "center",
              },
              {
                text: `ประเภทบุคคลากร ${typeName}`,
                alignment: "center",
                margin: [0, 0, 0, -5],
              },
              makePdfTable(chunk),
            ],
            pageBreak: pageBreakBefore,
          });
        }
      });

      const docDefinition = {
        pageSize: "A4",
        pageOrientation: "landscape",
        content,
        styles: {
          th: { bold: false },
        },
        defaultStyle: { font: "THSarabunNew", fontSize: 14 },
      };

      // กำหนดชื่อไฟล์
      // ตรวจสอบว่ามีฟังก์ชัน arabicToThaiNumber หรือไม่ ถ้าไม่มีให้ใช้ countReport ปกติ
      const thaiRound =
        typeof arabicToThaiNumber === "function"
          ? arabicToThaiNumber(countReport)
          : countReport;
      const fileNameThai = `รายงานสรุปการลาประจำรอบการประเมิน ครั้งที่ ${thaiRound}.pdf`;
      const fileNameEn = `Report_Round_${countReport}.pdf`;

      const pdfDoc = printer.createPdfKitDocument(docDefinition);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileNameEn}"; filename*=UTF-8''${encodeURIComponent(fileNameThai)}`,
      );

      pdfDoc.pipe(res);
      pdfDoc.end();
    }
  } catch (err) {
    console.error("Export Report Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ---------------------------------------ประจำปี---------------------------------------
exports.exportFiscalYearReportPDF = async (req, res) => {
  try {
    const { organizationId, startDate, endDate } = req.body;
    if (!organizationId) {
      return res.status(400).json({ error: "กรุณาระบุ organizationId" });
    }
    if (!startDate || !endDate) {
      return res.status(400).json({ error: "กรุณาระบุ startDate และ endDate" });
    }

    const fiscalYearSetting = await prisma.setting.findUnique({
      where: { key: "fiscalYear" },
    });

    const fiscalYear = parseInt(fiscalYearSetting.value) + 543;

    const reportData = await ReportService.getReportData(
      organizationId,
      startDate,
      endDate,
    );

    if (!reportData || Object.keys(reportData).length === 0) {
      return res.status(404).json({ error: "ไม่พบข้อมูล" });
    }

    const td = (sum, name, f) => {
      const s = sum?.[name];
      if (!s) return "-";
      const v = f === "times" ? s.count : s.days;
      return v === 0 || v ? String(v) : "-";
    };

    // -------------------- PDF --------------------
    if (reportData) {
      const fonts = {
        THSarabunNew: {
          normal: path.join(__dirname, "../fonts/THSarabunNew.ttf"),
          bold: path.join(__dirname, "../fonts/THSarabunNew-Bold.ttf"),
          italics: path.join(__dirname, "../fonts/THSarabunNew-Italic.ttf"),
          bolditalics: path.join(
            __dirname,
            "../fonts/THSarabunNew-BoldItalic.ttf",
          ),
        },
      };
      const printer = new PdfPrinter(fonts);

      const makePdfTable = (list) => {
        const headerRow1 = [
          {
            text: "ลำดับ",
            rowSpan: 2,
            style: "th",
            alignment: "center",
            margin: [0, 15, 0, 15],
          },
          {
            text: "เลขที่ตำแหน่ง",
            rowSpan: 2,
            style: "th",
            alignment: "center",
            margin: [0, 15, 0, 15],
          },
          {
            text: "ชื่อ - สกุล",
            rowSpan: 2,
            style: "th",
            alignment: "center",
            margin: [0, 15, 0, 15],
          },
          ...TYPE_ORDER.flatMap((name) => {
            return [
              {
                text: name,
                colSpan: 2,
                style: "th",
                alignment: "center",
                margin: [0, 1, 0, 1],
              },
              {},
            ];
          }),
          {
            text: "มาสาย(ครั้ง)",
            rowSpan: 2,
            style: "th",
            alignment: "center",
            margin: [0, 15, 0, 15],
          },
          {
            text: "ขาดราชการ(วัน)",
            rowSpan: 2,
            style: "th",
            alignment: "center",
            margin: [0, 15, 0, 15],
          },
          {
            text: "การลาประเภท อื่น ๆ (โปรดระบุ)",
            rowSpan: 2,
            style: "th",
            alignment: "center",
            margin: [0, 15, 0, 15],
          },
          {
            text: "หมายเหตุ",
            rowSpan: 2,
            style: "th",
            alignment: "center",
            margin: [0, 15, 0, 15],
          },
        ];

        const headerRow2 = [
          {},
          {},
          {},
          ...TYPE_ORDER.flatMap((name) => {
            return [
              {
                text: "ครั้ง",
                style: "th",
                alignment: "center",
                margin: [0, 1, 0, 1],
              },
              {
                text: "วัน",
                style: "th",
                alignment: "center",
                margin: [0, 1, 0, 1],
              },
            ];
          }),
          {},
          {},
          {},
        ];

        const body = [headerRow1, headerRow2];

        list.forEach((u, idx) => {
          const row = [];
          row.push({ text: String(idx + 1), alignment: "center" }); //ลำดับ
          row.push({ text: "", alignment: "left" }); //เลขที่ตำแหน่ง(ใช้ชื่อแทนไปก่อน)
          row.push({ text: u.name, alignment: "left" }); //ชื่อ
          TYPE_ORDER.forEach((name) => {
            row.push({
              text: td(u.leaveSummary, name, "times"),
              alignment: "center",
            });
            row.push({
              text: td(u.leaveSummary, name, "days"),
              alignment: "center",
            });
          });
          row.push({
            text: u.lateTimes != null ? String(u.lateTimes) : "-",
            alignment: "center",
          });
          row.push({ text: "" || "", alignment: "center" });
          row.push({ text: "" || "", alignment: "center" });
          row.push({ text: "" || "", alignment: "center" });
          body.push(row);
        });

        return {
          table: {
            headerRows: 2,
            widths: [
              30, // ที่
              60, // เลขที่ตำแหน่ง
              130, // ชื่อ - สกุล
              ...Array(TYPE_ORDER.length * 2).fill(25), // จำนวนวันลา
              50, // สาย/ครั้ง
              70, // สาย/ครั้ง
              130, // สาย/ครั้ง
              70, // หมายเหตุ
            ],
            body,
          },
          layout: {
            paddingLeft: () => 1,
            paddingRight: () => 1,
            paddingTop: () => 1,
            paddingBottom: () => 1,
            hLineColor: "#000000",
            vLineColor: "#000000",
            hLineWidth: () => 1,
            vLineWidth: () => 1,
          },
          margin: [0, 10, 0, 20],
        };
      };

      const content = [];
      const MAX_USERS_PER_PAGE = 15;

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
              {
                text: "รายงานสรุปการลาและการลงเวลาปฏิบัติราชการของบุคคลากร",
                alignment: "center",
              },
              { text: `สังกัด คณะวิศวกรรมศาสตร์`, alignment: "center" },
              {
                text: `ประจำปีงบประมาณ พ.ศ. ${arabicToThaiNumber(
                  fiscalYear,
                )} ระหว่างวันที่ ${arabicToThaiNumber(
                  formatThaiDateFull(startDate),
                )} - ${arabicToThaiNumber(formatThaiDateFull(endDate))}`,
                alignment: "center",
              },
              {
                text: `ประเภทบุคคลากร ${typeName}`,
                alignment: "center",
                margin: [0, 0, 0, -5],
              },
              makePdfTable(chunk),
            ],
            pageBreak: pageBreakBefore,
          });
        }
      });

      const docDefinition = {
        pageSize: "A4",
        pageOrientation: "landscape",
        content,
        styles: {
          th: { bold: false },
        },
        defaultStyle: { font: "THSarabunNew", fontSize: 14 },
      };

      const fileNameThai = `รายงานสรุปการลาประจำปีการศึกษา ${arabicToThaiNumber(fiscalYear)}.pdf`;
      const fileNameEn = `Report_year_${fiscalYear}.pdf`;

      const pdfDoc = printer.createPdfKitDocument(docDefinition);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileNameEn}"; filename*=UTF-8''${encodeURIComponent(fileNameThai)}`,
      );

      pdfDoc.pipe(res);
      pdfDoc.end();
    }
  } catch (err) {
    console.error("Export Report Error:", err);
    res.status(500).json({ error: err.message });
  }
};
exports.exportFiscalYearReportWORD = async (req, res) => {
  try {
    const { organizationId, startDate, endDate, format } = req.body;
    if (!organizationId) {
      return res.status(400).json({ error: "กรุณาระบุ organizationId" });
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
      endDate,
    );

    if (!reportData || Object.keys(reportData).length === 0) {
      return res.status(404).json({ error: "ไม่พบข้อมูล" });
    }

    // กรองช่องว่างออกก่อน
    const filteredTypeOrder = TYPE_ORDER.filter(
      (name) => name && name.trim() !== "",
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
            "../fonts/THSarabunNew-BoldItalic.ttf",
          ),
        },
      };
      const printer = new PdfPrinter(fonts);

      const makePdfTable = (list) => {
        const headerRow1 = [
          {
            text: "ลำดับ",
            rowSpan: 2,
            style: "th",
            alignment: "center",
            margin: [0, 15, 0, 15],
          },
          {
            text: "เลขที่ตำแหน่ง",
            rowSpan: 2,
            style: "th",
            alignment: "center",
            margin: [0, 15, 0, 15],
          },
          {
            text: "ชื่อ - สกุล",
            rowSpan: 2,
            style: "th",
            alignment: "center",
            margin: [0, 15, 0, 15],
          },
          ...TYPE_ORDER.flatMap((name) => {
            return [
              {
                text: name,
                colSpan: 2,
                style: "th",
                alignment: "center",
                margin: [0, 1, 0, 1],
              },
              {},
            ];
          }),
          {
            text: "มาสาย ครั้ง",
            rowSpan: 2,
            style: "th",
            alignment: "center",
            margin: [0, 15, 0, 15],
          },
          {
            text: "ขาดราชการ วัน",
            rowSpan: 2,
            style: "th",
            alignment: "center",
            margin: [0, 15, 0, 15],
          },
          {
            text: "การลาประเภท อื่น ๆ (โปรดระบุ)",
            rowSpan: 2,
            style: "th",
            alignment: "center",
            margin: [0, 15, 0, 15],
          },
          {
            text: "หมายเหตุ",
            rowSpan: 2,
            style: "th",
            alignment: "center",
            margin: [0, 15, 0, 15],
          },
        ];

        const headerRow2 = [
          {},
          {},
          {},
          ...TYPE_ORDER.flatMap((name) => {
            return [
              {
                text: "ครั้ง",
                style: "th",
                alignment: "center",
                margin: [0, 1, 0, 1],
              },
              {
                text: "วัน",
                style: "th",
                alignment: "center",
                margin: [0, 1, 0, 1],
              },
            ];
          }),
          {},
          {},
          {},
        ];

        const body = [headerRow1, headerRow2];

        list.forEach((u, idx) => {
          const row = [];
          row.push({ text: String(idx + 1), alignment: "center" }); //ลำดับ
          row.push({ text: "test", alignment: "left" }); //เลขที่ตำแหน่ง(ใช้ชื่อแทนไปก่อน)
          row.push({ text: u.name, alignment: "left" }); //ชื่อ
          TYPE_ORDER.forEach((name) => {
            row.push({
              text: td(u.leaveSummary, name, "times"),
              alignment: "center",
            });
            row.push({
              text: td(u.leaveSummary, name, "days"),
              alignment: "center",
            });
          });
          row.push({
            text: u.lateTimes != null ? String(u.lateTimes) : "-",
            alignment: "center",
          });
          row.push({ text: "-" || "", alignment: "center" });
          row.push({ text: u.note || "", alignment: "center" });
          row.push({ text: u.note || "", alignment: "center" });
          body.push(row);
        });

        return {
          table: {
            headerRows: 2,
            widths: [
              30, // ที่
              60, // เลขที่ตำแหน่ง
              130, // ชื่อ - สกุล
              ...Array(TYPE_ORDER.length * 2).fill(25), // จำนวนวันลา
              50, // สาย/ครั้ง
              70, // สาย/ครั้ง
              130, // สาย/ครั้ง
              70, // หมายเหตุ
            ],
            body,
          },
          layout: {
            paddingLeft: () => 1,
            paddingRight: () => 1,
            paddingTop: () => 1,
            paddingBottom: () => 1,
            hLineColor: "#000000",
            vLineColor: "#000000",
            hLineWidth: () => 1,
            vLineWidth: () => 1,
          },
          margin: [0, 10, 0, 20],
        };
      };

      const content = [];
      const MAX_USERS_PER_PAGE = 15;

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
              {
                text: "รายงานสรุปการลาและการลงเวลาปฏิบัติราชการของบุคคลากร",
                alignment: "center",
              },
              { text: `สังกัด คณะวิศวกรรมศาสตร์`, alignment: "center" },
              {
                text: `ประจำปีงบประมาณ พ.ศ. ${arabicToThaiNumber(
                  2568,
                )} ระหว่างวันที่ ${arabicToThaiNumber(
                  formatThaiDateFull(startDate),
                )} - ${arabicToThaiNumber(formatThaiDateFull(endDate))}`,
                alignment: "center",
              },
              {
                text: `ประเภทบุคคลากร ${typeName}`,
                alignment: "center",
                margin: [0, 0, 0, -5],
              },
              makePdfTable(chunk),
            ],
            pageBreak: pageBreakBefore,
          });
        }
      });

      const docDefinition = {
        pageSize: "A4",
        pageOrientation: "landscape",
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
        `attachment; filename=org-report-${organizationId}.pdf`,
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
            }),
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
                    type,
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
            }),
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
                    type,
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
            }),
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
              }),
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
                    text: `ครั้งที่ ตั้งแต่วันที่ ${formatThaiDateFull(
                      startDate,
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
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=org-report-${organizationId}.docx`,
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

// ---------------------------------------ประจำเดือน---------------------------------------
// exports.getReportDataForMonth = async (req, res, next) => {
//   try {
//     const { organizationId, month, year } = req.query;

//     if (!organizationId || !month || !year) {
//       return res.status(400).json({
//         success: false,
//         message: "organizationId, month และ year เป็นข้อมูลที่จำเป็น",
//       });
//     }

//     const data = await ReportService.getReportDataForMonth(
//       Number(organizationId),
//       Number(month),
//       Number(year),
//     );

//     return res.status(200).json({
//       success: true,
//       data,
//     });
//   } catch (error) {
//     next(error);
//   }
// };

exports.exportMonthReportPDF = async (req, res) => {
  try {
    const { organizationId, month, year } = req.body;

    if (!organizationId || !month || !year) {
      return res
        .status(400)
        .json({ error: "กรุณาระบุ organizationId, month และ year" });
    }

    // 1. ดึงข้อมูลรายวันจาก Service
    const result = await ReportService.getReportDataForMonth(
      Number(organizationId),
      parseInt(month),
      parseInt(year),
    );

    const { daysInMonth, report: reportData } = result;

    // 2. ตั้งค่า Mapping การลา
    const leaveMapping = {
      1: { text: "ป", color: "#FFC000" }, // ลาป่วย - เหลือง
      2: { text: "ก", color: "#92D050" }, // ลากิจ - เขียว
      3: { text: "พ", color: "#00B0F0" }, // ลาพักผ่อน - ฟ้า
    };

    // 3. ตั้งค่า Font
    const fonts = {
      THSarabunNew: {
        normal: path.join(__dirname, "../fonts/THSarabunNew.ttf"),
        bold: path.join(__dirname, "../fonts/THSarabunNew-Bold.ttf"),
      },
    };
    const printer = new PdfPrinter(fonts);

    // 4. ฟังก์ชันสร้างตาราง
    const makePdfTable = (users) => {
      const headerRow1 = [
        {
          text: "ลำดับ",
          rowSpan: 2,
          style: "th",
          alignment: "center",
          margin: [0, 5, 0, 0],
        },
        {
          text: "ชื่อ - สกุล",
          rowSpan: 2,
          style: "th",
          alignment: "center",
          margin: [0, 5, 0, 0],
        },
        {
          text: "ประจำวันที่",
          colSpan: daysInMonth,
          style: "th",
          alignment: "center",
        },
        ...Array(daysInMonth - 1).fill({}),
        { text: "รวมวัน\nทำงาน", rowSpan: 2, style: "th", alignment: "center" },
        {
          text: "หมายเหตุ",
          rowSpan: 2,
          style: "th",
          alignment: "center",
          margin: [0, 5, 0, 0],
        },
      ];

      const headerRow2 = [
        {},
        {},
        ...Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const dateCheck = new Date(Number(year), Number(month) - 1, day);
          const weekend = dateCheck.getDay() === 0 || dateCheck.getDay() === 6;
          return {
            text: String(day),
            style: "th",
            alignment: "center",
            fillColor: weekend ? "#d9d9d9" : null,
            fontSize: 9,
          };
        }),
        {},
        {},
      ];

      const body = [headerRow1, headerRow2];

      users.forEach((u, idx) => {
        const row = [
          { text: String(idx + 1), alignment: "center" },
          { text: u.name, alignment: "left", noWrap: false },
        ];

        for (let d = 1; d <= daysInMonth; d++) {
          const leaveId = u.attendance[d];
          const dateCheck = new Date(Number(year), Number(month) - 1, d);
          const isWeekendDay =
            dateCheck.getDay() === 0 || dateCheck.getDay() === 6;
          const leaveInfo = leaveMapping[leaveId];

          let cellText = "";
          let cellColor = null;

          if (leaveInfo) {
            cellText = leaveInfo.text;
            cellColor = leaveInfo.color;
          } else if (isWeekendDay) {
            cellText = "";
            cellColor = "#d9d9d9";
          } else {
            cellText = "/";
            cellColor = null;
          }

          row.push({
            text: cellText,
            alignment: "center",
            fillColor: cellColor,
            fontSize: 10,
            bold: !!leaveInfo,
          });
        }

        row.push({ text: String(u.totalWorkDays), alignment: "center" });
        row.push({ text: "", alignment: "left" });
        body.push(row);
      });

      return {
        table: {
          headerRows: 2,
          widths: [18, 100, ...Array(daysInMonth).fill(11.5), 25, 35],
          body,
        },
        layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5 },
      };
    };

    const content = [];
    const MAX_USERS_PER_PAGE = 22;

    Object.entries(reportData).forEach(([typeName, users], index) => {
      for (let i = 0; i < users.length; i += MAX_USERS_PER_PAGE) {
        const chunk = users.slice(i, i + MAX_USERS_PER_PAGE);
        const isFirstPage = i === 0 && index === 0;

        content.push({
          stack: [
            {
              text: "รายงานสรุปการลาและการลงเวลาปฏิบัติราชการของบุคคลากร",
              alignment: "center",
              margin: [0, 0, 0, 0],
            },
            {
              text: `ประจำเดือน ${formatThaiMonth(month)} พ.ศ. ${arabicToThaiNumber(parseInt(year) + 543)}`,
              alignment: "center",
            },
            {
              text: `สังกัด คณะวิศวกรรมศาสตร์ มหาวิทยาลัยเทคโนโลยีราชมงคลอีสาน`,
              alignment: "center",
            },
            {
              text: `ประเภทบุคคลากร ${typeName}`,
              alignment: "center",
              margin: [0, 0, 0, 4],
            },
            makePdfTable(chunk),
          ],
          pageBreak: isFirstPage ? undefined : "before",
        });
      }
    });

    // --- ส่วนปิดท้าย (หมายเหตุ + ลงนาม) ---
    content.push({
      stack: [
        { text: "หมายเหตุ", bold: true, fontSize: 12, margin: [0, 20, 0, 5] },
        {
          text: [
            { text: "โปรดกรอกข้อมูลการมาปฏิบัติราชการ ดังนี้ ", fontSize: 10 },
            {
              text: "/ = มาปฏิบัติราชการ, ส = สาย, ก = ลากิจส่วนตัว, ป = ลาป่วย, พ = ลาพักผ่อน, ค = ลาคลอดบุตร\n",
              fontSize: 10,
            },
            {
              text: "ช = ลาช่วยภริยาคลอดบุตร, บ = ลาอุปสมบท/พิธีฮัจญ์, ศ = ลาศึกษาต่อ, ว = ไปปฏิบัติการวิจัย, ร = ไปราชการ, ข = ไม่มีข้อมูลการลงเวลา",
              fontSize: 10,
            },
          ],
          margin: [0, 0, 0, 40],
        },
        {
          table: {
            widths: ["*", "*", "*"],
            body: [
              [
                {
                  stack: [
                    {
                      text: "ลงชื่อ..........................................................",
                      margin: [0, 0, 0, 5],
                    },
                    {
                      text: "(..........................................................)",
                      margin: [0, 0, 0, 15],
                    },
                    {
                      text: "........../........../..........",
                      margin: [0, 0, 0, 5],
                    },
                    { text: "(เจ้าหน้าที่ผู้รับผิดชอบ)", fontSize: 10 },
                  ],
                  alignment: "center",
                },
                {
                  stack: [
                    {
                      text: "ลงชื่อ..........................................................",
                      margin: [0, 0, 0, 5],
                    },
                    {
                      text: "(..........................................................)",
                      margin: [0, 0, 0, 15],
                    },
                    {
                      text: "........../........../..........",
                      margin: [0, 0, 0, 5],
                    },
                    { text: "(หัวหน้าเจ้าหน้าที่)", fontSize: 10 },
                  ],
                  alignment: "center",
                },
                {
                  stack: [
                    {
                      text: "ลงชื่อ..........................................................",
                      margin: [0, 0, 0, 5],
                    },
                    {
                      text: "(..........................................................)",
                      margin: [0, 0, 0, 15],
                    },
                    {
                      text: "........../........../..........",
                      margin: [0, 0, 0, 5],
                    },
                    { text: "(หัวหน้าหน่วยงาน)", fontSize: 10 },
                  ],
                  alignment: "center",
                },
              ],
            ],
          },
          layout: "noBorders",
        },
      ],
      unbreakable: true,
    });

    const docDefinition = {
      pageSize: "A4",
      pageOrientation: "landscape",
      content,
      defaultStyle: { font: "THSarabunNew", fontSize: 11 },
      pageMargins: [20, 20, 20, 20],
    };

    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Report_${month}_${year}.pdf"`,
    );
    pdfDoc.pipe(res);
    pdfDoc.end();
  } catch (err) {
    console.error("Export Error:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.exportMonthReport = async (req, res) => {
  try {
    const { organizationId, startDate, endDate, format } = req.body;
    if (!organizationId) {
      return res.status(400).json({ error: "กรุณาระบุ organizationId" });
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
      endDate,
    );

    if (!reportData || Object.keys(reportData).length === 0) {
      return res.status(404).json({ error: "ไม่พบข้อมูล" });
    }

    // กรองช่องว่างออกก่อน
    const filteredTypeOrder = TYPE_ORDER.filter(
      (name) => name && name.trim() !== "",
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
            "../fonts/THSarabunNew-BoldItalic.ttf",
          ),
        },
      };
      const printer = new PdfPrinter(fonts);

      const makePdfTable = (list) => {
        const headerRow1 = [
          {
            text: "ประจำวันที่",
            colSpan: DAY_ORDER.length + 2, // ลำดับ + ชื่อ + วัน
            style: "th",
            alignment: "center",
          },
          ...Array(DAY_ORDER.length + 1).fill({}),
          {
            text: "รวมวันทำงาน",
            rowSpan: 2,
            style: "th",
            alignment: "center",
          },
          {
            text: "หมายเหตุ",
            rowSpan: 2,
            style: "th",
            alignment: "center",
          },
        ];

        const headerRow2 = [
          {
            text: "ลำดับ",
            style: "th",
            alignment: "center",
          },
          {
            text: "ชื่อ - สกุล",
            style: "th",
            alignment: "center",
          },
          ...DAY_ORDER.map((d) => ({
            text: d,
            style: "th",
            alignment: "center",
            fillColor: isWeekend(d) ? "#d9d9d9" : null,
          })),

          {},
          {},
        ];

        const body = [headerRow1, headerRow2];

        list.forEach((u, idx) => {
          const row = [];
          row.push({ text: String(idx + 1), alignment: "center" });
          row.push({ text: u.name, alignment: "left" });

          DAY_ORDER.forEach((day) => {
            row.push({
              text: td(u.note, day),
              alignment: "center",
              fillColor: checkIsWeekend(day) ? "#d9d9d9" : null,
            });
          });

          row.push({ text: u.totalWorkDay ?? "", alignment: "center" });
          row.push({ text: u.note ?? "", alignment: "center" });
          body.push(row);
        });

        return {
          table: {
            headerRows: 2,
            widths: [
              20, // ลำดับ
              90, // ชื่อ
              ...Array(31).fill(8), // วันที่ 1–31
              20, // รวมวัน
              50, // หมายเหตุ
            ],

            body,
          },
          layout: {
            paddingLeft: () => 1,
            paddingRight: () => 1,
            paddingTop: () => 1,
            paddingBottom: () => 1,
            hLineColor: "#000000",
            vLineColor: "#000000",
            hLineWidth: () => 1,
            vLineWidth: () => 1,
          },
          margin: [0, 10, 0, 20],
        };
      };

      const content = [];
      const MAX_USERS_PER_PAGE = 35;

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
                text: "รายงานสรุปการลาและการลงเวลาปฏิบัติราชการของบุคคลากร",
                alignment: "center",
                margin: [0, 0, 0, 0],
              },
              {
                text: `ประจำเดือน พ.ศ. ${arabicToThaiNumber(2568)}`,
                alignment: "center",
              },
              {
                text: `สังกัด คณะวิศวกรรมศาสตร์ มหาวิทยาลัยเทคโนโลยีราชมงคลอีสาน`,
                alignment: "center",
              },
              {
                text: `ประเภทบุคคลากร ${typeName}`,
                alignment: "center",
                margin: [0, 0, 0, -5],
              },
              makePdfTable(chunk),
            ],
            pageBreak: pageBreakBefore,
          });
        }
      });

      const docDefinition = {
        pageSize: "A4",
        pageOrientation: "portrait",
        content,
        styles: {
          th: { bold: false }, // เอา fillColor ออกทั้งหมด
        },
        defaultStyle: { font: "THSarabunNew", fontSize: 11 },
      };

      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        `Content-Disposition`,
        `attachment; filename=org-report-${organizationId}.pdf`,
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
            }),
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
                    type,
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
            }),
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
                    type,
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
            }),
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
              }),
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
                      startDate,
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
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=org-report-${organizationId}.docx`,
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
