// const pdfService = require('../services/pdfService');
// const fileUtils = require('../utils/fileUtils');

// exports.downloadReport = async (req, res) => {
//   const data = {
//     name: 'จอห์น โด',
//     description: 'รายละเอียดตัวอย่าง',
//     date: '2023-10-15',
//   };

//   const outputPath = './public/reports/output.pdf';

//   try {
//     await pdfService.createPDF(data, outputPath);

//     // ส่งไฟล์ PDF กลับไปยัง client
//     const fileName = `report_${Date.now()}.pdf`;
//     const filePath = await fileUtils.moveFile(outputPath, `./public/reports/${fileName}`);
//     res.download(filePath, fileName, (err) => {
//       if (err) {
//         console.error('เกิดข้อผิดพลาดในการดาวน์โหลดไฟล์:', err);
//         res.status(500).send('ไม่สามารถดาวน์โหลดไฟล์ได้');
//       } else {
//         console.log('ไฟล์ PDF ถูกดาวน์โหลดเรียบร้อย');
//       }
//     });
//   } catch (err) {
//     console.error('เกิดข้อผิดพลาดในการสร้างไฟล์ PDF:', err);
//     res.status(500).send('เกิดข้อผิดพลาดในการสร้างไฟล์ PDF');
//   }
// };

//----------------------------------------------------------------------------------------------------------------
const { fillPDFTemplate } = require('../services/pdfService');

exports.downloadReport = async (req, res) => {
  const data = {
    name: req.body.name || 'ไม่ระบุชื่อ',
    description: req.body.description || 'ไม่ระบุรายละเอียด',
    date: req.body.date || new Date().toLocaleDateString(),
  };

  const templatePath = './templates/template1.pdf';
  const outputPath = './public/reports/output.pdf';

  try {
    await fillPDFTemplate(data, templatePath, outputPath);

    // ส่งไฟล์ PDF กลับไปยัง client
    res.download(outputPath, 'report.pdf', (err) => {
      if (err) {
        console.error('เกิดข้อผิดพลาดในการดาวน์โหลดไฟล์:', err);
        res.status(500).send('ไม่สามารถดาวน์โหลดไฟล์ได้');
      } else {
        console.log('ไฟล์ PDF ถูกดาวน์โหลดเรียบร้อย');
      }
    });
  } catch (err) {
    console.error('เกิดข้อผิดพลาดในการสร้างไฟล์ PDF:', err);
    res.status(500).send('เกิดข้อผิดพลาดในการสร้างไฟล์ PDF');
  }
};