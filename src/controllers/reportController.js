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

// exports.previewReport = async (req, res) => {
//   try {
//     const { userId } = req.params;
//     const data = await ReportService.getReportData(userId);
//     res.json(data);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

// exports.generateReportPdf = async (req, res) => {
//   try {
//     const { userId } = req.params;
//     const reportData = await ReportService.getReportData(userId);

//     const fonts = {
//       Roboto: {
//         normal: "fonts/Roboto-Regular.ttf",
//         bold: "fonts/Roboto-Medium.ttf",
//         italics: "fonts/Roboto-Italic.ttf",
//         bolditalics: "fonts/Roboto-MediumItalic.ttf",
//       },
//     };
//     const printer = new PdfPrinter(fonts);

//     const body = [
//       ["วันที่", "ประเภทลา", "จำนวนวัน", "หมายเหตุ"].map((h) => ({
//         text: h,
//         bold: true,
//       })),
//       ...reportData.map((row) => [
//         row.startDate.toISOString().split("T")[0],
//         row.type,
//         row.days.toString(),
//         row.remark || "",
//       ]),
//     ];

//     const docDefinition = {
//       content: [
//         { text: "รายงานการลา", style: "header" },
//         {
//           table: { body },
//         },
//       ],
//       styles: {
//         header: { fontSize: 18, bold: true, margin: [0, 0, 0, 10] },
//       },
//     };

//     const pdfDoc = printer.createPdfKitDocument(docDefinition);
//     res.setHeader("Content-Type", "application/pdf");
//     res.setHeader(
//       "Content-Disposition",
//       `attachment; filename=report-${userId}.pdf`
//     );
//     pdfDoc.pipe(res);
//     pdfDoc.end();
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };

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
    const { userId } = req.params;
    const { format } = req.body; // "pdf" | "word"
    const reportData = await ReportService.getReportData(userId);

    if (format === "pdf") {
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

        const body = [
          ["วันที่", "ประเภทลา", "จำนวนวัน", "หมายเหตุ"].map((h) => ({
            text: h,
            bold: true,
          })),
          ...reportData.map((row) => [
            row.date,
            row.type,
            row.days.toString(),
            row.remark,
          ]),
        ];

        const docDefinition = {
          content: [
            { text: "รายงานการลา", style: "header", alignment: "center" },
            {
              table: { body },
              layout: "lightHorizontalLines",
              margin: [0, 20, 0, 0],
            },
          ],
          styles: {
            header: { fontSize: 18, bold: true },
          },
          defaultStyle: {
            font: "THSarabunNew", // ✅ fix ปัญหา font Roboto not found
            fontSize: 16,
          },
        };

        const pdfDoc = printer.createPdfKitDocument(docDefinition);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=report-${userId}.pdf`
        );
        pdfDoc.pipe(res);
        pdfDoc.end();
      }
    } else if (format === "word") {
      const rows = [
        new TableRow({
          children: ["วันที่", "ประเภทลา", "จำนวนวัน", "หมายเหตุ"].map(
            (h) =>
              new TableCell({
                children: [new Paragraph({ text: h, bold: true })],
              })
          ),
        }),
        ...reportData.map(
          (row) =>
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph(row.date)] }),
                new TableCell({ children: [new Paragraph(row.type)] }),
                new TableCell({
                  children: [new Paragraph(row.days.toString())],
                }),
                new TableCell({ children: [new Paragraph(row.remark)] }),
              ],
            })
        ),
      ];

      const doc = new Document({
        sections: [
          {
            children: [
              new Paragraph({ text: "รายงานการลา", heading: "Heading1" }),
              new Table({ rows }),
            ],
          },
        ],
      });

      const buffer = await Packer.toBuffer(doc);
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=report-${userId}.docx`
      );
      res.send(buffer);
    } else {
      res.status(400).json({ error: "Invalid format, use 'pdf' or 'word'" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// exports.exportReport = async (req, res) => {
//   try {
//     const { organizationId } = req.params;
//     const { format } = req.body;

//     const reportData = await ReportService.getOrganizationLeaveReport(
//       organizationId
//     );

//     console.log("Report Data:", reportData);
//     if (!reportData || reportData.length === 0) {
//       return res.status(404).json({ error: "ไม่พบข้อมูล" });
//     }

//     if (format === "pdf") {
//       const fonts = {
//         THSarabunNew: {
//           normal: path.join(__dirname, "../fonts/THSarabunNew.ttf"),
//           bold: path.join(__dirname, "../fonts/THSarabunNew-Bold.ttf"),
//           italics: path.join(__dirname, "../fonts/THSarabunNew-Italic.ttf"),
//           bolditalics: path.join(
//             __dirname,
//             "../fonts/THSarabunNew-BoldItalic.ttf"
//           ),
//         },
//       };
//       const printer = new PdfPrinter(fonts);

//       const body = [
//         ["ชื่อ-สกุล", "อีเมล", "ประเภทลา", "จำนวนครั้ง", "จำนวนวัน"].map(
//           (h) => ({
//             text: h,
//             bold: true,
//           })
//         ),
//       ];

//       reportData.forEach((row) => {
//         const summaries = row.leaveSummary || {};
//         if (Object.keys(summaries).length === 0) {
//           body.push([row.name, row.email, "-", "0", "0"]);
//         } else {
//           Object.entries(summaries).forEach(([type, s]) => {
//             body.push([
//               row.name,
//               row.email,
//               type,
//               s.count.toString(),
//               s.days.toString(),
//             ]);
//           });
//         }
//       });

//       const docDefinition = {
//         content: [
//           { text: reportData.title, style: "header", alignment: "center" },
//           {
//             table: { body },
//             layout: "lightHorizontalLines",
//             margin: [0, 20, 0, 0],
//           },
//         ],
//         styles: { header: { fontSize: 18, bold: true } },
//         defaultStyle: { font: "THSarabunNew", fontSize: 16 },
//       };

//       const pdfDoc = printer.createPdfKitDocument(docDefinition);
//       res.setHeader("Content-Type", "application/pdf");
//       res.setHeader(
//         "Content-Disposition",
//         `attachment; filename=org-report-${organizationId}.pdf`
//       );
//       pdfDoc.pipe(res);
//       pdfDoc.end();
//     } else if (format === "word") {
//       const rows = [
//         new TableRow({
//           children: [
//             "ชื่อ-สกุล",
//             "อีเมล",
//             "ประเภทลา",
//             "จำนวนครั้ง",
//             "จำนวนวัน",
//           ].map(
//             (h) =>
//               new TableCell({
//                 children: [new Paragraph({ text: h, bold: true })],
//               })
//           ),
//         }),
//       ];

//       reportData.rows.forEach((row) => {
//         const summaries = row.leaveSummary || {};
//         if (Object.keys(summaries).length === 0) {
//           rows.push(
//             new TableRow({
//               children: [
//                 new TableCell({ children: [new Paragraph(row.name)] }),
//                 new TableCell({ children: [new Paragraph(row.email)] }),
//                 new TableCell({ children: [new Paragraph("-")] }),
//                 new TableCell({ children: [new Paragraph("0")] }),
//                 new TableCell({ children: [new Paragraph("0")] }),
//               ],
//             })
//           );
//         } else {
//           Object.entries(summaries).forEach(([type, s]) => {
//             rows.push(
//               new TableRow({
//                 children: [
//                   new TableCell({ children: [new Paragraph(row.name)] }),
//                   new TableCell({ children: [new Paragraph(row.email)] }),
//                   new TableCell({ children: [new Paragraph(type)] }),
//                   new TableCell({
//                     children: [new Paragraph(s.count.toString())],
//                   }),
//                   new TableCell({
//                     children: [new Paragraph(s.days.toString())],
//                   }),
//                 ],
//               })
//             );
//           });
//         }
//       });

//       const doc = new Document({
//         sections: [
//           {
//             children: [
//               new Paragraph({ text: reportData.title, heading: "Heading1" }),
//               new Table({ rows }),
//             ],
//           },
//         ],
//       });

//       const buffer = await Packer.toBuffer(doc);
//       res.setHeader(
//         "Content-Type",
//         "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
//       );
//       res.setHeader(
//         "Content-Disposition",
//         `attachment; filename=org-report-${organizationId}.docx`
//       );
//       res.send(buffer);
//     } else {
//       res.status(400).json({ error: "Invalid format, use 'pdf' or 'word'" });
//     }
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// };
