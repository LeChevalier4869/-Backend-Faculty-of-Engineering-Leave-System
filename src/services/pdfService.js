const { PDFDocument } = require("pdf-lib");
const fontkit = require("fontkit");
const fs = require("fs");
const path = require("path");
const prisma = require("../config/prisma");

async function fillPDFTemplate(data, templatePath, outputPath, leaveTypeId) {
  try {
    const templateBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(templateBytes);
    pdfDoc.registerFontkit(fontkit);

    const fontPath = path.join(__dirname, "../fonts/THSarabunNew.ttf");
    const fontBytes = fs.readFileSync(fontPath);
    const customFont = await pdfDoc.embedFont(fontBytes);

    const pages = pdfDoc.getPages();
    const firstPage = pages[0];
    const { width, height } = firstPage.getSize();

    // ✅ ใช้ค่าจาก parameter data
    firstPage.drawText(`ชื่อ: ${data.name}`, {
      x: 50,
      y: height - 100,
      size: 14,
      font: customFont,
    });

    firstPage.drawText(`รายละเอียด: ${data.description}`, {
      x: 50,
      y: height - 120,
      size: 14,
      font: customFont,
    });

    firstPage.drawText(`วันที่: ${data.date}`, {
      x: 50,
      y: height - 160,
      size: 14,
      font: customFont,
    });

    if (leaveTypeId === 1) {
      // ลาป่วย
      firstPage.drawText(`แพทย์: ${data.doctorName}`, {
        x: 50,
        y: height - 200,
        size: 14,
        font: customFont,
      });
    } else if (leaveTypeId === 2) {
      // ลากิจ
      firstPage.drawText(`เหตุผล: ${data.reason}`, {
        x: 50,
        y: height - 200,
        size: 14,
        font: customFont,
      });
    } else if (leaveTypeId === 3) {
      // ลาพักผ่อน
      firstPage.drawText(`ช่วงเวลา: ${data.startDate} - ${data.endDate}`, {
        x: 50,
        y: height - 200,
        size: 14,
        font: customFont,
      });
    }

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, pdfBytes);

    console.log(`ไฟล์ PDF ถูกสร้างที่: ${outputPath}`);
  } catch (err) {
    console.error("เกิดข้อผิดพลาดในการสร้างไฟล์ PDF:", err);
    throw err;
  }
}

module.exports = {
  fillPDFTemplate,
};

//----------------------------------------------------------------------------------------------------------------
// const { PDFDocument } = require("pdf-lib");
// const fontkit = require("fontkit");
// const fs = require("fs");
// const path = require("path");

// async function fillPDFTemplate(data, templatePath, outputPath) {
//   try {
//     // อ่านไฟล์ PDF Template
//     const templateBytes = fs.readFileSync(templatePath);

//     // โหลด PDF Template
//     const pdfDoc = await PDFDocument.load(templateBytes);

//     // ลงทะเบียน fontkit
//     pdfDoc.registerFontkit(fontkit);

//     // โหลดฟอนต์ที่รองรับภาษาไทย
//     const fontPath = path.join(__dirname, "../fonts/THSarabunNew.ttf");
//     const fontBytes = fs.readFileSync(fontPath);
//     const customFont = await pdfDoc.embedFont(fontBytes);

//     // ดึงหน้าแรกของ PDF
//     const pages = pdfDoc.getPages();
//     const firstPage = pages[0];

//     // เติมข้อมูลลงใน PDF
//     const { width, height } = firstPage.getSize();
//     const data = {
//       title: "ขออนุญาติลางาน",
//       fullName: "นายสมชาย ใจดี",
//       date: "2025-01-01",
//       position: "พนักงานทำความสะอาด",
//       organizations: "คณะวิศวกรรมศาสตร์",
//       personnelType: "ลูกจ้างเงินรายได้",
//       employmentType: "สายสนับสนุน",
//       leaveType: "ลาป่วย",
//       reason: "ป่วย",
//       startDate: "2025-01-02",
//       endDate: "2025-01-03",
//       requestDays: "1",
//       lastStartDate: "N/A",
//       lastEndDate: "N/A",
//       lastRequestDays: "N/A",
//       email: "somchai.ja@rmuti.ac.th",
//       phone: "0829054912",
//       mySignature: "somchai",
//       sickUsedDays: "0",
//       sickThisTimeDays: "1",
//       sickSumDays: "1",
//       personUsedDays: "0",
//       personThisTimeDays: "0",
//       personSumDays: "0",
//       babyUsedDays: "N/A",
//       babyThisTimeDays: "N/A",
//       babySumDays: "N/A",
//       commonBossOpinion: "อนุญาตแล้ว",
//       commonBossSignature: "Abe",
//       commonBossPosition: "หัวหน้าแผนกทำความสะอาด",
//       commonBossUpdatedAt: "2025-01-01",

//     };

//     firstPage.drawText(`ชื่อ: ${name}`, {
//       x: 50,
//       y: height - 100,
//       size: 14,
//       font: customFont, // ใช้ฟอนต์ที่ embed
//     });

//     firstPage.drawText(`รายละเอียด: ${description}`, {
//       x: 500,
//       y: height - 120,
//       size: 14,
//       font: customFont, // ใช้ฟอนต์ที่ embed
//     });

//     firstPage.drawText(`วันที่: ${date}`, {
//       x: 50,
//       y: height - 160,
//       size: 14,
//       font: customFont, // ใช้ฟอนต์ที่ embed
//     });

//     // บันทึก PDF ใหม่
//     const pdfBytes = await pdfDoc.save();
//     fs.writeFileSync(outputPath, pdfBytes);

//     console.log(`ไฟล์ PDF ถูกสร้างที่: ${outputPath}`);
//   } catch (err) {
//     console.error("เกิดข้อผิดพลาดในการสร้างไฟล์ PDF:", err);
//     throw err; // ส่งข้อผิดพลาดไปยัง caller
//   }
// }

// module.exports = {
//   fillPDFTemplate,
// };
