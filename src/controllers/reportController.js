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
  TableRow,
  TableCell,
  WidthType,
} = require("docx");

const templateMap = {
  1: "sick_template.pdf",
  3: "personal_template.pdf",
  4: "vacation_template.pdf",
};

exports.downloadReport = async (req, res) => {
  const leaveTypeId = Number(req.body.leaveTypeId);
  const userId = req.user.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      department: {
        include: {
          organization: true,
        },
      },
    },
  });

  const balances = await prisma.leaveBalance.findMany({
    where: { userId },
    include: {
      leaveType: true, // ดึงชื่อประเภทวันลามาด้วย
    },
  });

  const sickBalance = balances.find((b) => b.leaveTypeId === 1);
  const sickLeaved = sickBalance ? sickBalance.usedDays : 0;

  const personalBalance = balances.find((b) => b.leaveTypeId === 3);
  const personalLeaved = personalBalance ? personalBalance.usedDays : 0;

  console.log("User data:", user);
  console.log("Leave balance:", balances);

  const organizationId =
    user?.department?.organizationId || "ไม่พบข้อมูลองค์กร";
  console.log(leaveTypeId);
  if (!Object.keys(templateMap).map(Number).includes(leaveTypeId)) {
    return res
      .status(400)
      .json({ error: "leaveTypeId ต้อง 1 หรือ 3 หรือ 4 เท่านั้น" });
  }

  let data = {};
  switch (leaveTypeId) {
    case 1: // ลาป่วย
      if (!req.body.name || !req.body.description || !req.body.doctorName) {
        return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบถ้วน" });
      }
      data = {
        documentNumber: req.body.documentNumber || "ไม่ระบุ",
        documentDate: req.body.documentDate || "ไม่ระบุ",
        title: req.body.title || "ไม่ระบุ",
        name: req.body.name || "ไม่ระบุ",
        position: req.body.position || "ไม่ระบุ",
        organizationId: organizationId || "ไม่ระบุ",
        personalType: req.body.personalType || "ไม่ระบุ",
        leaveType: req.body.leaveType || "ไม่ระบุ",
        reason: req.body.reason || "ไม่ระบุ",
        startDate: req.body.startDate || "ไม่ระบุ",
        endDate: req.body.endDate || "ไม่ระบุ",
        total: req.body.total || "ไม่ระบุ",
        lastLeave: req.body.lastLeave || "ไม่ระบุ",
        lastLeaveStartDate: req.body.lastLeaveStartDate || "ไม่ระบุ",
        lastLeaveEndDate: req.body.lastLeaveEndDate || "ไม่ระบุ",
        lastLeaveTotal: req.body.lastLeaveTotal || "ไม่ระบุ",
        contact: req.body.contact || "ไม่ระบุ",
        phone: req.body.phone || "ไม่ระบุ",
        signature: req.body.signature || "ไม่ระบุ",
        commentApprover1: req.body.commentApprover1 || "ไม่ระบุ",
        commentApprover2: req.body.commentApprover2 || "ไม่ระบุ",
        commentApprover3: req.body.commentApprover3 || "ไม่ระบุ",
        commentApprover4: req.body.commentApprover4 || "ไม่ระบุ",
        signatureVerifier: req.body.signatureVerifier || "ไม่ระบุ",
        signatureApprover1: req.body.signatureApprover1 || "ไม่ระบุ",
        signatureApprover2: req.body.signatureApprover2 || "ไม่ระบุ",
        signatureApprover3: req.body.signatureApprover3 || "ไม่ระบุ",
        signatureApprover4: req.body.signatureApprover4 || "ไม่ระบุ",
        positionApprover1: req.body.positionApprover1 || "ไม่ระบุ",
        positionApprover2: req.body.positionApprover2 || "ไม่ระบุ",
        positionApprover3: req.body.positionApprover3 || "ไม่ระบุ",
        DateVerifier: req.body.DateVerifier || "ไม่ระบุ",
        DateApprover1: req.body.DateApprover1 || "ไม่ระบุ",
        DateApprover2: req.body.DateApprover2 || "ไม่ระบุ",
        DateApprover3: req.body.DateApprover3 || "ไม่ระบุ",
        DateApprover4: req.body.DateApprover4 || "ไม่ระบุ",
        isApprove: req.body.isApprove || "ไม่ระบุ",
        date: req.body.date || new Date().toLocaleDateString(),
        sickLeaved: sickLeaved, // จำนวนวันที่ลาป่วยที่ใช้ไป
        personalLeaved: personalLeaved, // จำนวนวันที่ลาป่วยที่ใช้ไป
      };
      break;

    case 3: // ลากิจ
      if (!req.body.name || !req.body.description || !req.body.reason) {
        return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบถ้วน" });
      }
      data = {
        documentNumber: req.body.documentNumber || "ไม่ระบุ",
        documentDate: req.body.documentDate || "ไม่ระบุ",
        title: req.body.title || "ไม่ระบุ",
        name: req.body.name || "ไม่ระบุ",
        position: req.body.position || "ไม่ระบุ",
        organizationId: organizationId || "ไม่ระบุ",
        personalType: req.body.personalType || "ไม่ระบุ",
        leaveType: req.body.leaveType || "ไม่ระบุ",
        reason: req.body.reason || "ไม่ระบุ",
        startDate: req.body.startDate || "ไม่ระบุ",
        endDate: req.body.endDate || "ไม่ระบุ",
        total: req.body.total || "ไม่ระบุ",
        lastLeave: req.body.lastLeave || "ไม่ระบุ",
        lastLeaveStartDate: req.body.lastLeaveStartDate || "ไม่ระบุ",
        lastLeaveEndDate: req.body.lastLeaveEndDate || "ไม่ระบุ",
        lastLeaveTotal: req.body.lastLeaveTotal || "ไม่ระบุ",
        contact: req.body.contact || "ไม่ระบุ",
        phone: req.body.phone || "ไม่ระบุ",
        signature: req.body.signature || "ไม่ระบุ",
        commentApprover1: req.body.commentApprover1 || "ไม่ระบุ",
        commentApprover2: req.body.commentApprover2 || "ไม่ระบุ",
        commentApprover3: req.body.commentApprover3 || "ไม่ระบุ",
        commentApprover4: req.body.commentApprover4 || "ไม่ระบุ",
        signatureVerifier: req.body.signatureVerifier || "ไม่ระบุ",
        signatureApprover1: req.body.signatureApprover1 || "ไม่ระบุ",
        signatureApprover2: req.body.signatureApprover2 || "ไม่ระบุ",
        signatureApprover3: req.body.signatureApprover3 || "ไม่ระบุ",
        signatureApprover4: req.body.signatureApprover4 || "ไม่ระบุ",
        positionApprover1: req.body.positionApprover1 || "ไม่ระบุ",
        positionApprover2: req.body.positionApprover2 || "ไม่ระบุ",
        positionApprover3: req.body.positionApprover3 || "ไม่ระบุ",
        DateVerifier: req.body.DateVerifier || "ไม่ระบุ",
        DateApprover1: req.body.DateApprover1 || "ไม่ระบุ",
        DateApprover2: req.body.DateApprover2 || "ไม่ระบุ",
        DateApprover3: req.body.DateApprover3 || "ไม่ระบุ",
        DateApprover4: req.body.DateApprover4 || "ไม่ระบุ",
        isApprove: req.body.isApprove || "ไม่ระบุ",
        date: req.body.date || new Date().toLocaleDateString(),
        sickLeaved: sickLeaved, // จำนวนวันที่ลาป่วยที่ใช้ไป
        personalLeaved: personalLeaved, // จำนวนวันที่ลาป่วยที่ใช้ไป
      };
      break;

    case 4: // ลาพักร้อน
      if (!req.body.name || !req.body.startDate || !req.body.endDate) {
        return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบถ้วน" });
      }
      data = {
        documentNumber: req.body.documentNumber || "ไม่ระบุ",
        documentDate: req.body.documentDate || "ไม่ระบุ",
        title: req.body.title || "ไม่ระบุ",
        name: req.body.name || "ไม่ระบุ",
        position: req.body.position || "ไม่ระบุ",
        organization: req.body.organization || "ไม่ระบุ",
        personalType: req.body.personalType || "ไม่ระบุ",
        leaveType: req.body.leaveType || "ไม่ระบุ",
        reason: req.body.reason || "ไม่ระบุ",
        startDate: req.body.startDate || "ไม่ระบุ",
        endDate: req.body.endDate || "ไม่ระบุ",
        total: req.body.total || "ไม่ระบุ",
        lastLeave: req.body.lastLeave || "ไม่ระบุ",
        lastLeaveStartDate: req.body.lastLeaveStartDate || "ไม่ระบุ",
        lastLeaveEndDate: req.body.lastLeaveEndDate || "ไม่ระบุ",
        lastLeaveTotal: req.body.lastLeaveTotal || "ไม่ระบุ",
        contact: req.body.contact || "ไม่ระบุ",
        phone: req.body.phone || "ไม่ระบุ",
        signature: req.body.signature || "ไม่ระบุ",
        commentApprover1: req.body.commentApprover1 || "ไม่ระบุ",
        commentApprover2: req.body.commentApprover2 || "ไม่ระบุ",
        commentApprover3: req.body.commentApprover3 || "ไม่ระบุ",
        commentApprover4: req.body.commentApprover4 || "ไม่ระบุ",
        signatureVerifier: req.body.signatureVerifier || "ไม่ระบุ",
        signatureApprover1: req.body.signatureApprover1 || "ไม่ระบุ",
        signatureApprover2: req.body.signatureApprover2 || "ไม่ระบุ",
        signatureApprover3: req.body.signatureApprover3 || "ไม่ระบุ",
        signatureApprover4: req.body.signatureApprover4 || "ไม่ระบุ",
        positionApprover1: req.body.positionApprover1 || "ไม่ระบุ",
        positionApprover2: req.body.positionApprover2 || "ไม่ระบุ",
        positionApprover3: req.body.positionApprover3 || "ไม่ระบุ",
        DateVerifier: req.body.DateVerifier || "ไม่ระบุ",
        DateApprover1: req.body.DateApprover1 || "ไม่ระบุ",
        DateApprover2: req.body.DateApprover2 || "ไม่ระบุ",
        DateApprover3: req.body.DateApprover3 || "ไม่ระบุ",
        DateApprover4: req.body.DateApprover4 || "ไม่ระบุ",
        isApprove: req.body.isApprove || "ไม่ระบุ",

        description: req.body.description,
        date: req.body.date || new Date().toLocaleDateString(),
        doctorName: req.body.doctorName,
      };
      break;
  }

  console.log("ข้อมูลที่ใช้สร้าง PDF:", data);
  const templatePath = `./templates/${templateMap[leaveTypeId]}`;
  const fileName = `report${Date.now()}.pdf`;
  const outputPath = `./public/reports/${fileName}`;

  try {
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


// 📍 Preview
exports.previewReport = async (req, res) => {
  try {
    const { userId } = req.params;
    const reportData = await ReportService.getReportData(userId);

    res.json({
      title: "รายงานการลา",
      userId,
      rows: reportData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.previewOrganizationReport = async (req, res) => {
  try {
    const { organizationId } = req.params;
    const reportData = await ReportService.getOrganizationLeaveReport(
      organizationId
    );

    res.json({
      title: "รายงานการลาของบุคลากรในคณะ",
      organizationId,
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
    const { organizationId } = req.params;
    const { format } = req.body;

    const reportData = await ReportService.getOrganizationLeaveReport(organizationId);

    if (!reportData || Object.keys(reportData).length === 0) {
      return res.status(404).json({ error: "ไม่พบข้อมูล" });
    }

    // -------------------- กำหนดลำดับหัวข้อ --------------------
    const TYPE_ORDER = [
      "ขาดราชการ",
      "ลาป่วย",
      "ลากิจ",
      "ลาพักผ่อน",
      "ลาคลอดบุตร",
      "ลาบวช"
    ];

    const td = (sum, name, f) => {
      const s = sum?.[name];
      if (!s) return "-";
      const v = f === "times" ? s.count : s.days;
      return (v === 0 || v) ? String(v) : "-";
    };

    // -------------------- PDF --------------------
    if (format === "pdf") {
      const fonts = {
        THSarabunNew: {
          normal: path.join(__dirname, "../fonts/THSarabunNew.ttf"),
          bold: path.join(__dirname, "../fonts/THSarabunNew-Bold.ttf"),
          italics: path.join(__dirname, "../fonts/THSarabunNew-Italic.ttf"),
          bolditalics: path.join(__dirname, "../fonts/THSarabunNew-BoldItalic.ttf"),
        },
      };
      const printer = new PdfPrinter(fonts);

      const makePdfTable = (list) => {
        const headerRow1 = [
          { text: "ที่", rowSpan: 3, style: "th", alignment: "center" },
          { text: "ชื่อ - สกุล", rowSpan: 3, style: "th", alignment: "center" },
          { text: "สาย/ครั้ง", rowSpan: 3, style: "th", alignment: "center" },
          { text: "จำนวนวันลา", colSpan: TYPE_ORDER.length * 2, style: "thGray", alignment: "center" },
          ...Array(TYPE_ORDER.length * 2 - 1).fill({}),
          { text: "หมายเหตุ", rowSpan: 3, style: "th", alignment: "center" },
        ];

        const headerRow2 = [
          {}, {}, {},
          ...TYPE_ORDER.flatMap(name => [{ text: name, colSpan: 2, style: "thGray", alignment: "center" }, {}]),
          {}
        ];

        const headerRow3 = [
          {}, {}, {},
          ...TYPE_ORDER.flatMap(() => ([
            { text: "ครั้ง", style: "thSub", alignment: "center" },
            { text: "วัน",   style: "thSub", alignment: "center" },
          ])),
          {}
        ];

        const body = [headerRow1, headerRow2, headerRow3];

        list.forEach((u, idx) => {
          const row = [];
          row.push({ text: String(idx + 1), alignment: "center" });
          row.push({ text: u.name, alignment: "left" });
          row.push({ text: u.lateTimes != null ? String(u.lateTimes) : "-", alignment: "center" });

          TYPE_ORDER.forEach(name => {
            row.push({ text: td(u.leaveSummary, name, "times"), alignment: "center" });
            row.push({ text: td(u.leaveSummary, name, "days"), alignment: "center" });
          });

          row.push({ text: u.note || "-", alignment: "left" });
          body.push(row);
        });

        return {
          table: {
            headerRows: 3,
            widths: [
              20,           // ที่
              110,          // ชื่อ - สกุล
              16,           // สาย/ครั้ง
              ...Array(TYPE_ORDER.length * 2).fill(16), // จำนวนวันลา
              80           // หมายเหตุ
            ],
            body
          },
          layout: {
            paddingLeft: () => 3, paddingRight: () => 3,
            paddingTop: () => 4, paddingBottom: () => 4,
            hLineColor: "#9CA3AF", vLineColor: "#9CA3AF"
          },
          margin: [0, 10, 0, 20]
        };
      };

      const content = [];
      Object.entries(reportData).forEach(([typeName, users]) => {
        content.push(
          { text: "มหาวิทยาลัยเทคโนโลยีราชมงคลอีสาน วิทยาเขตขอนแก่น", alignment: "center" },
          { text: `${typeName} คณะวิศวกรรมศาสตร์`, alignment: "center" },
          { text: "รายนามผู้ลาหยุดประจำปี", alignment: "center", margin: [0, 0, 0, 10] },
          makePdfTable(users)
        );
      });

      const docDefinition = {
        content,
        styles: {
          th: { bold: true, fillColor: "#E5E7EB" },
          thGray: { bold: true, fillColor: "#D1D5DB" },
          thSub: { bold: true, fillColor: "#E5E7EB" },
        },
        defaultStyle: { font: "THSarabunNew", fontSize: 14 },
      };

      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename=org-report-${organizationId}.pdf`);
      pdfDoc.pipe(res);
      pdfDoc.end();
    }

    // -------------------- Word --------------------
    else if (format === "word") {
      const makeCell = (txt) => new TableCell({ children: [new Paragraph(String(txt))] });

      const makeWordTable = (list) => {
        const rows = [];

        rows.push(new TableRow({
          children: [
            makeCell("ที่"),
            makeCell("ชื่อ - สกุล"),
            makeCell("สาย/ครั้ง"),
            ...TYPE_ORDER.flatMap(name => [makeCell(name + "\nครั้ง"), makeCell("วัน")]),
            makeCell("หมายเหตุ"),
          ]
        }));

        list.forEach((u, idx) => {
          rows.push(new TableRow({
            children: [
              makeCell(idx + 1),
              makeCell(u.name),
              makeCell(u.lateTimes != null ? String(u.lateTimes) : "-"),
              ...TYPE_ORDER.flatMap(name => [makeCell(td(u.leaveSummary, name, "times")), makeCell(td(u.leaveSummary, name, "days"))]),
              makeCell(u.note || "-"),
            ]
          }));
        });

        return new Table({
          rows,
          width: { size: 100, type: WidthType.PERCENTAGE },
          columnWidths: [
            25,           // ที่
            200,          // ชื่อ - สกุล
            40,           // สาย/ครั้ง
            ...Array(TYPE_ORDER.length * 2).fill(40), // จำนวนวันลา
            100           // หมายเหตุ
          ]
        });
      };

      const sections = [];
      Object.entries(reportData).forEach(([typeName, users]) => {
        sections.push(
          new Paragraph({ text: "มหาวิทยาลัยเทคโนโลยีราชมงคลอีสาน วิทยาเขตขอนแก่น", alignment: "center" }),
          new Paragraph({ text: `${typeName} คณะวิศวกรรมศาสตร์`, alignment: "center" }),
          new Paragraph({ text: "รายนามผู้ลาหยุดประจำปี", alignment: "center" }),
          new Paragraph({ text: "" }),
          makeWordTable(users),
          new Paragraph({ text: "" }),
        );
      });

      const doc = new Document({ sections: [{ children: sections }] });
      const buffer = await Packer.toBuffer(doc);

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename=org-report-${organizationId}.docx`);
      res.send(buffer);
    }

    else {
      res.status(400).json({ error: "Invalid format, use 'pdf' or 'word'" });
    }

  } catch (err) {
    console.error("Export Report Error:", err);
    res.status(500).json({ error: err.message });
  }
};

