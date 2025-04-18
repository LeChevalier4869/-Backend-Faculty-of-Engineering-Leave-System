const fs = require('fs');
const { fillPDFTemplate } = require("../services/pdfService");

const templateMap = {
  1: "sick_template.pdf",
  2: "personal_template.pdf",
  3: "vacation_template.pdf",
};

exports.downloadReport = async (req, res) => {
  const leaveTypeId = Number(req.body.leaveTypeId);

  console.log(leaveTypeId)
  if (!Object.keys(templateMap).map(Number).includes(leaveTypeId)) {
    return res
      .status(400)
      .json({ error: "leaveTypeId ต้อง 1 หรือ 2 หรือ 3 เท่านั้น" });
  }

  let data = {};
  switch (leaveTypeId) {
    case 1: // ลาป่วย
      if (!req.body.name || !req.body.description || !req.body.doctorName) {
        return res.status(400).json({ error: "กรุณาระบุชื่อ รายละเอียด และชื่อแพทย์" });
      }
      data = {
        name: req.body.name,
        description: req.body.description,
        date: req.body.date || new Date().toLocaleDateString(),
        doctorName: req.body.doctorName,
      };
      break;

    case 2: // ลากิจ
      if (!req.body.name || !req.body.description || !req.body.reason) {
        return res.status(400).json({ error: "กรุณาระบุชื่อ รายละเอียด และเหตุผล" });
      }
      data = {
        name: req.body.name,
        description: req.body.description,
        date: req.body.date || new Date().toLocaleDateString(),
        reason: req.body.reason,
      };
      break;

    case 3: // ลาพักร้อน
      if (!req.body.name || !req.body.startDate || !req.body.endDate) {
        return res.status(400).json({ error: "กรุณาระบุชื่อ วันเริ่ม และวันสิ้นสุด" });
      }
      data = {
        name: req.body.name,
        date: req.body.date || new Date().toLocaleDateString(),
        startDate: req.body.startDate,
        endDate: req.body.endDate,
      };
      break;
  }

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


//----------------------------------------------------------------------------------------------------------------
// const fs = require('fs');  // เพิ่มการ import fs

// const { fillPDFTemplate } = require("../services/pdfService");

// const templateMap = {
//   1: "sick_template.pdf",
//   2: "personal_template.pdf",
//   3: "vacation_template.pdf",
// };

// exports.downloadReport = async (req, res) => {
//   const data = {
//     name: req.body.name || "ไม่ระบุชื่อ",
//     description: req.body.description || "ไม่ระบุรายละเอียด",
//     date: req.body.date || new Date().toLocaleDateString(),
//   };

//   const leaveTypeId = Number(req.body.leaveTypeId);

//   // ตรวจสอบว่า leaveTypeId อยู่ในรายการที่กำหนด
//   if (!Object.keys(templateMap).map(Number).includes(leaveTypeId)) {
//     return res
//       .status(400)
//       .json({ error: "leaveTypeId ต้อง 1 หรือ 2 หรือ 3 เท่านั้น" });
//   }

//   const templatePath = `./templates/${templateMap[leaveTypeId]}`;
//   const fileName = `report${Date.now()}.pdf`;
//   const outputPath = `./public/reports/${fileName}`;

//   try {
//     await fillPDFTemplate(data, templatePath, outputPath);

//     // ตั้งชื่อไฟล์ที่จะแสดงบนหน้า download
//     const downloadFileName = `${data.date}.pdf`;
//     console.log(downloadFileName);
    
//     // ตรวจสอบให้แน่ใจว่า filename ไม่มีเครื่องหมายที่ไม่อนุญาต
//     res.setHeader("Content-Type", "application/pdf");
//     res.setHeader(
//       "Content-Disposition",
//       `inline; filename="${downloadFileName.replace(/"/g, "")}"`
//     );

//     const fileStream = fs.createReadStream(outputPath);
//     fileStream.pipe(res);

//     fileStream.on("end", () => {
//       fs.unlink(outputPath, (err) => {
//         if (err) {
//           console.error("ไม่สามารถลบไฟล์ PDF ชั่วคราว:", err);
//         }
//       });
//     });

//     fileStream.on("error", (err) => {
//       console.error("เกิดข้อผิดพลาดในการส่งไฟล์:", err);
//       res.status(500).send("ไม่สามารถเปิดไฟล์ PDF ได้");
//     });
//   } catch (err) {
//     console.error("เกิดข้อผิดพลาดในการสร้างไฟล์ PDF:", err);
//     res.status(500).send("เกิดข้อผิดพลาดในการสร้างไฟล์ PDF");
//   }
// };

