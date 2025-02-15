// const puppeteer = require('puppeteer');
// const fs = require('fs');

// async function createPDF(data, outputPath) {
//   // เปิดเบราว์เซอร์
//   const browser = await puppeteer.launch();
//   const page = await browser.newPage();

//   // สร้าง HTML content
//   const htmlContent = `
//     <html>
//       <head>
//         <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai&display=swap" rel="stylesheet">
//         <style>
//           body { font-family: 'Noto Sans Thai', sans-serif; }
//         </style>
//       </head>
//       <body>
//         <h1>รายงาน</h1>
//         <p>ชื่อ: ${data.name}</p>
//         <p>รายละเอียด: ${data.description}</p>
//         <p>วันที่: ${data.date}</p>
//       </body>
//     </html>
//   `;

//   // ตั้งค่า content ของหน้าเว็บ
//   await page.setContent(htmlContent);

//   // สร้าง PDF
//   await page.pdf({ path: outputPath, format: 'A4' });

//   // ปิดเบราว์เซอร์
//   await browser.close();

//   console.log(`ไฟล์ PDF ถูกสร้างที่: ${outputPath}`);
// }

// module.exports = {
//   createPDF,
// };


//----------------------------------------------------------------------------------------------------------------
const { PDFDocument } = require('pdf-lib');
const fontkit = require('fontkit');
const fs = require('fs');
const path = require('path');

async function fillPDFTemplate(data, templatePath, outputPath) {
  try {
    // อ่านไฟล์ PDF Template
    const templateBytes = fs.readFileSync(templatePath);

    // โหลด PDF Template
    const pdfDoc = await PDFDocument.load(templateBytes);

    // ลงทะเบียน fontkit
    pdfDoc.registerFontkit(fontkit);

    // โหลดฟอนต์ที่รองรับภาษาไทย
    const fontPath = path.join(__dirname, '../fonts/THSarabunNew.ttf');
    const fontBytes = fs.readFileSync(fontPath);
    const customFont = await pdfDoc.embedFont(fontBytes);

    // ดึงหน้าแรกของ PDF
    const pages = pdfDoc.getPages();
    const firstPage = pages[0];

    // เติมข้อมูลลงใน PDF
    const { width, height } = firstPage.getSize();
    const { name, description, date } = data;

    firstPage.drawText(`ชื่อ: ${name}`, {
      x: 50,
      y: height - 100,
      size: 14,
      font: customFont, // ใช้ฟอนต์ที่ embed
    });

    firstPage.drawText(`รายละเอียด: ${description}`, {
      x: 50,
      y: height - 130,
      size: 14,
      font: customFont, // ใช้ฟอนต์ที่ embed
    });

    firstPage.drawText(`วันที่: ${date}`, {
      x: 50,
      y: height - 160,
      size: 14,
      font: customFont, // ใช้ฟอนต์ที่ embed
    });

    // บันทึก PDF ใหม่
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, pdfBytes);

    console.log(`ไฟล์ PDF ถูกสร้างที่: ${outputPath}`);
  } catch (err) {
    console.error('เกิดข้อผิดพลาดในการสร้างไฟล์ PDF:', err);
    throw err; // ส่งข้อผิดพลาดไปยัง caller
  }
}

module.exports = {
  fillPDFTemplate,
};