const { PDFDocument } = require("pdf-lib");
const fontkit = require("fontkit");
const fs = require("fs");
const path = require("path");
const prisma = require("../config/prisma");

//แปลงวันที่
const thaiMonths = [
  "",
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
const thaiMonthsShort = [
  "",
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

// แปลงเดือนจากตัวเลข
function getThaiMonth(monthNumber) {
  return thaiMonths[monthNumber] || "";
}
// แปลงเดือนเป็นแบบย่อ
function getThaiMonthShort(month) {
  return thaiMonthsShort[month] || "";
}

// แยกวัน เดือน ปี และแปลง ค.ศ. → พ.ศ.
function parseDateToThai(dateStr) {
  //debug dateStr
  console.log("Parsing date:", dateStr);

  //กันเดสไม่มีค่า
  if (!dateStr || dateStr === "ไม่ระบุ") {
    return {
      day: "",
      month: "",
      monthText: "",
      monthShortText: "",
      year: "",
    };
  }

  //ถ้า date obj.
  if (dateStr instanceof Date) {
    const d = dateStr.getDate();
    const m = dateStr.getMonth() + 1; // เดือนใน JavaScript เริ่มต้นที่ 0
    const y = dateStr.getFullYear();
    const year = y < 2500 ? y + 543 : y;

    return {
      day: d.toString().padStart(2, "0"),
      month: m.toString().padStart(2, "0"),
      monthText: getThaiMonth(m),
      monthShortText: getThaiMonthShort(m),
      year: year.toString(),
    };
  }

  // const [day, month, yearInput] = dateStr.split("-").map(Number);
  // const year = yearInput < 2500 ? yearInput + 543 : yearInput;

  // return {
  //   day: day.toString().padStart(2, "0"),
  //   month: month.toString().padStart(2, "0"),
  //   monthText: getThaiMonth(month),
  //   monthShortText: getThaiMonthShort(month),
  //   year: year.toString(),
  // };

  let day, month, yearInput;

  if (typeof dateStr === "string") {
    //normalize string format "DD-MM-YYYY"
    const normalized = dateStr.replace(/\//g, "-");
    const parts = normalized.split("-");

    // เคส 3 ส่วน เช่น:
    // - "2025-11-20"       (YYYY-MM-DD)
    // - "12-06-2568"       (DD-MM-YYYY)
    // - "2025-11-20T..."   (YYYY-MM-DDTHH:mm:ss)

    if (parts.length >= 3) {
      const [p1, p2, p3Raw] = parts; 
      const p3 = p3Raw.replace(/\D/g, ""); // ลบตัวอักษรที่ไม่ใช่ตัวเลข เช่น 'T'

      if (/^\d{4}$/.test(p1) && /^\d{1,2}$/.test(p2) && /^\d{1,2}$/.test(p3)) {
        // YYYY-MM-DD
        yearInput = Number(p1);
        month = Number(p2);
        day = Number(p3);
      } else if (
        /^\d{1,2}$/.test(p1) &&
        /^\d{1,2}$/.test(p2) &&
        /^\d{4}$/.test(p3)
      ) {
        // DD-MM-YYYY
        day = Number(p1);
        month = Number(p2);
        yearInput = Number(p3);
      } else {
        // รูปแบบไม่ตรงกับที่คาดไว้
        const dObj = new Date(dateStr);
        if (!isNaN(dObj)) {
          day = dObj.getDate();
          month = dObj.getMonth() + 1;
          yearInput = dObj.getFullYear();
        }
      }
    } else {
      // date parse fallback
      const dObj = new Date(dateStr);
      if (!isNaN(dObj)) {
        day = dObj.getDate();
        month = dObj.getMonth() + 1;
        yearInput = dObj.getFullYear();
      }
    }
  }

  //ถ้ายัง parse ไม่ได้เลย ให้คืนค่าว่าง ป้องกัน error
  if (
    day == null ||
    month == null ||
    yearInput == null ||
    isNaN(day) ||
    isNaN(month) ||
    isNaN(yearInput)
  ) {
    console.warn("parseDateToThai: parse fail for", dateStr);
    return {
      day: "",
      month: "",
      monthText: "",
      monthShortText: "",
      year: "",
    };
  }

  const year = yearInput < 2500 ? yearInput + 543 : yearInput;

  return {
    day: day.toString().padStart(2, "0"),
    month: month.toString().padStart(2, "0"),
    monthText: getThaiMonth(month),
    monthShortText: getThaiMonthShort(month),
    year: year.toString(),
  };
}

//ตัดบรรทัดข้อความที่ยาวเกินไป
function wrapTextStrictMaxLines(text, font, fontSize, maxWidth, maxLines = 2) {
  const lines = [];
  let currentLine = "";

  for (let i = 0; i < text.length; i++) {
    currentLine += text[i];
    const lineWidth = font.widthOfTextAtSize(currentLine, fontSize);

    if (lineWidth > maxWidth) {
      lines.push(currentLine.slice(0, -1));
      currentLine = text[i];

      if (lines.length === maxLines - 1) {
        break;
      }
    }
  }

  // ดึงข้อความที่ยังไม่เคยใช้มาต่อในบรรทัดสุดท้าย
  if (lines.length < maxLines && currentLine) {
    const usedLength = lines.join("").length + currentLine.length;
    lines.push(currentLine + text.slice(usedLength));
  }

  return lines;
}

async function fillPDFTemplate(data, templatePath, outputPath, leaveTypeId) {
  console.log("กำลังสร้าง PDF ด้วยข้อมูล:", data);
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

    const checkImageBytes = fs.readFileSync(
      path.join(__dirname, "../assets/check.png")
    );
    const checkImage = await pdfDoc.embedPng(checkImageBytes);

    if (leaveTypeId === 1) {
      // ลาป่วย-------------------------------------

      // เขียนที่
      firstPage.drawText(`${data.documentNumber}`, {
        x: 470,
        y: height - 43,
        size: 14,
        font: customFont,
      });

      //วันที่
      const documentDate = parseDateToThai(data.documentDate);
      firstPage.drawText(documentDate.day, {
        x: 382,
        y: height - 62,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(documentDate.monthText, {
        x: 440,
        y: height - 62,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(documentDate.year, {
        x: 525,
        y: height - 62,
        size: 14,
        font: customFont,
      });

      //เรื่อง
      firstPage.drawText(`${data.title}`, {
        x: 150,
        y: height - 80,
        size: 14,
        font: customFont,
      });

      //ข้าพเจ้า
      firstPage.drawText(`${data.name}`, {
        x: 180,
        y: height - 122,
        size: 14,
        font: customFont,
      });

      //ตำแหน่ง
      firstPage.drawText(`${data.position}`, {
        x: 400,
        y: height - 122,
        size: 14,
        font: customFont,
      });

      //สังกัด
      if (data.organizationId === 1) {
        firstPage.drawImage(checkImage, {
          x: 246,
          y: height - 142,
          width: 12,
          height: 12,
        });
      } else if (data.organizationId === 2) {
        firstPage.drawImage(checkImage, {
          x: 123,
          y: height - 142,
          width: 12,
          height: 12,
        });
      } else if (data.organizationId === 3) {
        firstPage.drawImage(checkImage, {
          x: 349,
          y: height - 142,
          width: 12,
          height: 12,
        });
      } else if (data.organizationId === 4) {
        firstPage.drawImage(checkImage, {
          x: 124,
          y: height - 161,
          width: 12,
          height: 12,
        });
      }

      //ประเภทบุคลากร
      firstPage.drawImage(checkImage, {
        x: 124,
        y: height - 192,
        width: 12,
        height: 12,
      });
      firstPage.drawImage(checkImage, {
        x: 124,
        y: height - 211,
        width: 12,
        height: 12,
      });
      firstPage.drawImage(checkImage, {
        x: 124,
        y: height - 230,
        width: 12,
        height: 12,
      });
      firstPage.drawImage(checkImage, {
        x: 209,
        y: height - 192,
        width: 12,
        height: 12,
      });
      firstPage.drawImage(checkImage, {
        x: 396,
        y: height - 192,
        width: 12,
        height: 12,
      });
      firstPage.drawImage(checkImage, {
        x: 395,
        y: height - 211,
        width: 12,
        height: 12,
      });
      firstPage.drawImage(checkImage, {
        x: 395,
        y: height - 230,
        width: 12,
        height: 12,
      });

      //ขอลา
      if (leaveTypeId === 1) {
        firstPage.drawImage(checkImage, {
          x: 122,
          y: height - 261,
          width: 12,
          height: 12,
        });
      } else if (leaveTypeId === 3) {
        firstPage.drawImage(checkImage, {
          x: 122,
          y: height - 280,
          width: 12,
          height: 12,
        });
      } else if (leaveTypeId === 4) {
        firstPage.drawImage(checkImage, {
          x: 122,
          y: height - 299,
          width: 12,
          height: 12,
        });
      }
      //เนื่องจาก
      firstPage.drawText(`${data.reason}`, {
        x: 240,
        y: height - 283,
        size: 14,
        font: customFont,
      });

      //ตั้งแต่วันที่
      const start = parseDateToThai(data.startDate);
      firstPage.drawText(start.day, {
        x: 130,
        y: height - 318,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(start.monthText, {
        x: 200,
        y: height - 318,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(start.year, {
        x: 296,
        y: height - 318,
        size: 14,
        font: customFont,
      });

      //ถึงวันที่
      const end = parseDateToThai(data.endDate);
      firstPage.drawText(end.day, {
        x: 368,
        y: height - 318,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(end.monthText, {
        x: 420,
        y: height - 318,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(end.year, {
        x: 500,
        y: height - 318,
        size: 14,
        font: customFont,
      });

      //มีกำหนด
      firstPage.drawText(`${data.total}`, {
        x: 115,
        y: height - 337,
        size: 14,
        font: customFont,
      });

      //ข้าพเจ้าได้ลา
      if (leaveTypeId === 1) {
        firstPage.drawImage(checkImage, {
          x: 204,
          y: height - 336,
          width: 12,
          height: 12,
        });
      } else if (leaveTypeId === 3) {
        firstPage.drawImage(checkImage, {
          x: 243,
          y: height - 336,
          width: 12,
          height: 12,
        });
      } else if (leaveTypeId === 4) {
        firstPage.drawImage(checkImage, {
          x: 308,
          y: height - 336,
          width: 12,
          height: 12,
        });
      }

      //ลาครั้งสุดท้ายตั่งแต่วันที่
      const parsedlastLeaveStartDate = parseDateToThai(data.lastLeaveStartDate);
      firstPage.drawText(
        `${parsedlastLeaveStartDate.day} ${parsedlastLeaveStartDate.monthText} ${parsedlastLeaveStartDate.year}`,
        {
          x: 460,
          y: height - 337,
          size: 14,
          font: customFont,
        }
      );

      //ถึงวันที่
      const parsedlastLeaveEndDate = parseDateToThai(data.lastLeaveStartDate);
      firstPage.drawText(
        `${parsedlastLeaveEndDate.day} ${parsedlastLeaveEndDate.monthText} ${parsedlastLeaveEndDate.year}`,
        {
          x: 108,
          y: height - 354,
          size: 14,
          font: customFont,
        }
      );

      //มีกำหนด
      firstPage.drawText(`${data.lastLeaveTotal}`, {
        x: 235,
        y: height - 354,
        size: 14,
        font: customFont,
      });

      //ในระหว่างลา จะติดต่อได้ที่
      const contactLines = wrapTextStrictMaxLines(
        data.contact,
        customFont,
        14, // fontSize
        140, // maxWidth ที่คุณต้องการ
        2 // จำนวนบรรทัดสูงสุด
      );

      let startY = height - 354;

      contactLines.forEach((line, i) => {
        firstPage.drawText(line, {
          x: i === 0 ? 410 : 70, // แถวแรกอยู่ขวา แถวถัดไปอยู่ซ้าย
          y: startY - i * 18,
          size: 14,
          font: customFont,
        });
      });

      //เบอร์โทรศัพท์
      firstPage.drawText(`${data.phone}`, {
        x: 410,
        y: height - 373,
        size: 14,
        font: customFont,
      });

      //ลายเซ็น
      firstPage.drawText(`${data.signature}`, {
        x: 360,
        y: height - 434,
        size: 14,
        font: customFont,
      });

      //ชื่อ
      firstPage.drawText(`${data.name}`, {
        x: 350,
        y: height - 452,
        size: 14,
        font: customFont,
      });

      //ความเห็นผูบังคับบัญชา1
      const commentApprover1Lines = wrapTextStrictMaxLines(
        data.commentApprover1,
        customFont,
        14, // fontSize
        160, // maxWidth ที่คุณต้องการ
        2 // จำนวนบรรทัดสูงสุด
      );

      let startY2 = height - 494;

      commentApprover1Lines.forEach((line, i) => {
        firstPage.drawText(line, {
          x: i === 0 ? 350 : 350, // แถวแรกอยู่ขวา แถวถัดไปอยู่ซ้าย
          y: startY2 - i * 18,
          size: 14,
          font: customFont,
        });
      });

      //ลายเซ็น1
      firstPage.drawText(`${data.signatureApprover1}`, {
        x: 400,
        y: height - 534,
        size: 14,
        font: customFont,
      });

      //ตำแหน่ง1
      firstPage.drawText(`${data.positionApprover1}`, {
        x: 400,
        y: height - 554,
        size: 14,
        font: customFont,
      });

      //วันที่1
      const dateApprover1 = parseDateToThai(data.DateApprover1);
      firstPage.drawText(dateApprover1.day, {
        x: 370,
        y: height - 572,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(dateApprover1.monthText, {
        x: 415,
        y: height - 572,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(dateApprover1.year, {
        x: 480,
        y: height - 572,
        size: 14,
        font: customFont,
      });

      //ความเห็นผูบังคับบัญชา2
      const commentApprover2Lines = wrapTextStrictMaxLines(
        data.commentApprover2,
        customFont,
        14, // fontSize
        160, // maxWidth ที่คุณต้องการ
        2 // จำนวนบรรทัดสูงสุด
      );

      let startY3 = height - 614;

      commentApprover2Lines.forEach((line, i) => {
        firstPage.drawText(line, {
          x: i === 0 ? 350 : 350, // แถวแรกอยู่ขวา แถวถัดไปอยู่ซ้าย
          y: startY3 - i * 18,
          size: 14,
          font: customFont,
        });
      });

      //ลายเซ็น ผูบังคับบัญชา2
      firstPage.drawText(`${data.signatureApprover2}`, {
        x: 400,
        y: height - 654,
        size: 14,
        font: customFont,
      });

      //ตำแหน่ง2
      firstPage.drawText(`${data.positionApprover2}`, {
        x: 400,
        y: height - 674,
        size: 14,
        font: customFont,
      });

      //วันที่2
      const dateApprover2 = parseDateToThai(data.DateApprover2);
      firstPage.drawText(dateApprover2.day, {
        x: 370,
        y: height - 693,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(dateApprover2.monthText, {
        x: 415,
        y: height - 693,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(dateApprover2.year, {
        x: 480,
        y: height - 693,
        size: 14,
        font: customFont,
      });

      //ความเห็นผูบังคับบัญชา3
      const commentApprover3Lines = wrapTextStrictMaxLines(
        data.commentApprover3,
        customFont,
        14, // fontSize
        160, // maxWidth ที่คุณต้องการ
        2 // จำนวนบรรทัดสูงสุด
      );

      let startY4 = height - 734;

      commentApprover3Lines.forEach((line, i) => {
        firstPage.drawText(line, {
          x: i === 0 ? 350 : 350, // แถวแรกอยู่ขวา แถวถัดไปอยู่ซ้าย
          y: startY4 - i * 18,
          size: 14,
          font: customFont,
        });
      });

      //ลายเซ็น ผูบังคับบัญชา3
      firstPage.drawText(`${data.signatureApprover3}`, {
        x: 400,
        y: height - 776,
        size: 14,
        font: customFont,
      });

      //ตำแหน่ง2
      firstPage.drawText(`${data.positionApprover3}`, {
        x: 400,
        y: height - 795,
        size: 14,
        font: customFont,
      });

      //วันที่3
      const dateApprover3 = parseDateToThai(data.DateApprover3);
      firstPage.drawText(dateApprover3.day, {
        x: 370,
        y: height - 813,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(dateApprover3.monthText, {
        x: 415,
        y: height - 813,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(dateApprover3.year, {
        x: 480,
        y: height - 813,
        size: 14,
        font: customFont,
      });

      //ลายเซ็น ผู้ตรวจสอบ
      firstPage.drawText(`${data.signatureVerifier}`, {
        x: 140,
        y: height - 630,
        size: 14,
        font: customFont,
      });

      //วันที่ ผู้ตรวจสอบ
      const dateVerifier = parseDateToThai(data.DateVerifier);
      firstPage.drawText(dateVerifier.day, {
        x: 128,
        y: height - 687,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(dateVerifier.monthText, {
        x: 152,
        y: height - 687,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(dateVerifier.year, {
        x: 200,
        y: height - 687,
        size: 14,
        font: customFont,
      });

      //คำสั่ง
      firstPage.drawImage(checkImage, {
        x: 181,
        y: height - 716,
        width: 12,
        height: 12,
      });
      firstPage.drawImage(checkImage, {
        x: 109,
        y: height - 716,
        width: 12,
        height: 12,
      });

      //ความเห็นผูบังคับบัญชา4
      const commentApprover4Lines = wrapTextStrictMaxLines(
        data.commentApprover4,
        customFont,
        14, // fontSize
        160, // maxWidth ที่คุณต้องการ
        2 // จำนวนบรรทัดสูงสุด
      );

      let startY5 = height - 734;

      commentApprover4Lines.forEach((line, i) => {
        firstPage.drawText(line, {
          x: i === 0 ? 80 : 80, // แถวแรกอยู่ขวา แถวถัดไปอยู่ซ้าย
          y: startY5 - i * 18,
          size: 14,
          font: customFont,
        });
      });

      //ลายเซ็น ผูบังคับบัญชา4
      firstPage.drawText(`${data.signatureApprover4}`, {
        x: 140,
        y: height - 776,
        size: 14,
        font: customFont,
      });

      //วันที่4
      const dateApprover4 = parseDateToThai(data.DateApprover4);
      firstPage.drawText(dateApprover4.day, {
        x: 100,
        y: height - 813,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(dateApprover4.monthText, {
        x: 140,
        y: height - 813,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(dateApprover4.year, {
        x: 220,
        y: height - 813,
        size: 14,
        font: customFont,
      });

      firstPage.drawText(`${data.sickLeaved}`, {
        x: 150,
        y: height - 550,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(`${data.total}`, {
        x: 200,
        y: height - 550,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(`${Number(data.sickLeaved) + Number(data.total)}`, {
        x: 250,
        y: height - 550,
        size: 14,
        font: customFont,
      });

      firstPage.drawText(`${data.personalLeaved}`, {
        x: 150,
        y: height - 570,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(`-`, {
        x: 200,
        y: height - 570,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(`${data.personalLeaved}`, {
        x: 250,
        y: height - 570,
        size: 14,
        font: customFont,
      });

      firstPage.drawText(`-`, {
        x: 150,
        y: height - 590,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(`-`, {
        x: 200,
        y: height - 590,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(`-`, {
        x: 250,
        y: height - 590,
        size: 14,
        font: customFont,
      });

      //ลาป่วย--------------------------------------
    } else if (leaveTypeId === 3) {
      // ลากิจ--------------------------------------
      // เขียนที่
      firstPage.drawText(`${data.documentNumber}`, {
        x: 470,
        y: height - 43,
        size: 14,
        font: customFont,
      });

      //วันที่
      const documentDate = parseDateToThai(data.documentDate);
      firstPage.drawText(documentDate.day, {
        x: 382,
        y: height - 62,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(documentDate.monthText, {
        x: 440,
        y: height - 62,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(documentDate.year, {
        x: 525,
        y: height - 62,
        size: 14,
        font: customFont,
      });

      //เรื่อง
      firstPage.drawText(`${data.title}`, {
        x: 150,
        y: height - 80,
        size: 14,
        font: customFont,
      });

      //ข้าพเจ้า
      firstPage.drawText(`${data.name}`, {
        x: 180,
        y: height - 122,
        size: 14,
        font: customFont,
      });

      //ตำแหน่ง
      firstPage.drawText(`${data.position}`, {
        x: 400,
        y: height - 122,
        size: 14,
        font: customFont,
      });

      //สังกัด
      if (data.organizationId === 1) {
        firstPage.drawImage(checkImage, {
          x: 246,
          y: height - 142,
          width: 12,
          height: 12,
        });
      } else if (data.organizationId === 2) {
        firstPage.drawImage(checkImage, {
          x: 123,
          y: height - 142,
          width: 12,
          height: 12,
        });
      } else if (data.organizationId === 3) {
        firstPage.drawImage(checkImage, {
          x: 349,
          y: height - 142,
          width: 12,
          height: 12,
        });
      } else if (data.organizationId === 4) {
        firstPage.drawImage(checkImage, {
          x: 124,
          y: height - 161,
          width: 12,
          height: 12,
        });
      }

      //ประเภทบุคลากร
      firstPage.drawImage(checkImage, {
        x: 124,
        y: height - 192,
        width: 12,
        height: 12,
      });
      firstPage.drawImage(checkImage, {
        x: 124,
        y: height - 211,
        width: 12,
        height: 12,
      });
      firstPage.drawImage(checkImage, {
        x: 124,
        y: height - 230,
        width: 12,
        height: 12,
      });
      firstPage.drawImage(checkImage, {
        x: 209,
        y: height - 192,
        width: 12,
        height: 12,
      });
      firstPage.drawImage(checkImage, {
        x: 396,
        y: height - 192,
        width: 12,
        height: 12,
      });
      firstPage.drawImage(checkImage, {
        x: 395,
        y: height - 211,
        width: 12,
        height: 12,
      });
      firstPage.drawImage(checkImage, {
        x: 395,
        y: height - 230,
        width: 12,
        height: 12,
      });

      //ขอลา
      if (leaveTypeId === 1) {
        firstPage.drawImage(checkImage, {
          x: 122,
          y: height - 261,
          width: 12,
          height: 12,
        });
      } else if (leaveTypeId === 3) {
        firstPage.drawImage(checkImage, {
          x: 122,
          y: height - 280,
          width: 12,
          height: 12,
        });
      } else if (leaveTypeId === 4) {
        firstPage.drawImage(checkImage, {
          x: 122,
          y: height - 299,
          width: 12,
          height: 12,
        });
      }
      //เนื่องจาก
      firstPage.drawText(`${data.reason}`, {
        x: 240,
        y: height - 283,
        size: 14,
        font: customFont,
      });

      //ตั้งแต่วันที่
      const start = parseDateToThai(data.startDate);
      firstPage.drawText(start.day, {
        x: 130,
        y: height - 318,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(start.monthText, {
        x: 200,
        y: height - 318,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(start.year, {
        x: 296,
        y: height - 318,
        size: 14,
        font: customFont,
      });

      //ถึงวันที่
      const end = parseDateToThai(data.endDate);
      firstPage.drawText(end.day, {
        x: 368,
        y: height - 318,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(end.monthText, {
        x: 420,
        y: height - 318,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(end.year, {
        x: 500,
        y: height - 318,
        size: 14,
        font: customFont,
      });

      //มีกำหนด
      firstPage.drawText(`${data.total}`, {
        x: 115,
        y: height - 337,
        size: 14,
        font: customFont,
      });

      //ข้าพเจ้าได้ลา
      if (leaveTypeId === 1) {
        firstPage.drawImage(checkImage, {
          x: 204,
          y: height - 336,
          width: 12,
          height: 12,
        });
      } else if (leaveTypeId === 3) {
        firstPage.drawImage(checkImage, {
          x: 243,
          y: height - 336,
          width: 12,
          height: 12,
        });
      } else if (leaveTypeId === 4) {
        firstPage.drawImage(checkImage, {
          x: 308,
          y: height - 336,
          width: 12,
          height: 12,
        });
      }

      //ลาครั้งสุดท้ายตั่งแต่วันที่
      const parsedlastLeaveStartDate = parseDateToThai(data.lastLeaveStartDate);
      firstPage.drawText(
        `${parsedlastLeaveStartDate.day} ${parsedlastLeaveStartDate.monthText} ${parsedlastLeaveStartDate.year}`,
        {
          x: 460,
          y: height - 337,
          size: 14,
          font: customFont,
        }
      );

      //ถึงวันที่
      const parsedlastLeaveEndDate = parseDateToThai(data.lastLeaveStartDate);
      firstPage.drawText(
        `${parsedlastLeaveEndDate.day} ${parsedlastLeaveEndDate.monthText} ${parsedlastLeaveEndDate.year}`,
        {
          x: 108,
          y: height - 354,
          size: 14,
          font: customFont,
        }
      );

      //มีกำหนด
      firstPage.drawText(`${data.lastLeaveTotal}`, {
        x: 235,
        y: height - 354,
        size: 14,
        font: customFont,
      });

      //ในระหว่างลา จะติดต่อได้ที่
      const contactLines = wrapTextStrictMaxLines(
        data.contact,
        customFont,
        14, // fontSize
        140, // maxWidth ที่คุณต้องการ
        2 // จำนวนบรรทัดสูงสุด
      );

      let startY = height - 354;

      contactLines.forEach((line, i) => {
        firstPage.drawText(line, {
          x: i === 0 ? 410 : 70, // แถวแรกอยู่ขวา แถวถัดไปอยู่ซ้าย
          y: startY - i * 18,
          size: 14,
          font: customFont,
        });
      });

      //เบอร์โทรศัพท์
      firstPage.drawText(`${data.phone}`, {
        x: 410,
        y: height - 373,
        size: 14,
        font: customFont,
      });

      //ลายเซ็น
      firstPage.drawText(`${data.signature}`, {
        x: 360,
        y: height - 434,
        size: 14,
        font: customFont,
      });

      //ชื่อ
      firstPage.drawText(`${data.name}`, {
        x: 350,
        y: height - 452,
        size: 14,
        font: customFont,
      });

      //ความเห็นผูบังคับบัญชา1
      const commentApprover1Lines = wrapTextStrictMaxLines(
        data.commentApprover1,
        customFont,
        14, // fontSize
        160, // maxWidth ที่คุณต้องการ
        2 // จำนวนบรรทัดสูงสุด
      );

      let startY2 = height - 494;

      commentApprover1Lines.forEach((line, i) => {
        firstPage.drawText(line, {
          x: i === 0 ? 350 : 350, // แถวแรกอยู่ขวา แถวถัดไปอยู่ซ้าย
          y: startY2 - i * 18,
          size: 14,
          font: customFont,
        });
      });

      //ลายเซ็น1
      firstPage.drawText(`${data.signatureApprover1}`, {
        x: 400,
        y: height - 534,
        size: 14,
        font: customFont,
      });

      //ตำแหน่ง1
      firstPage.drawText(`${data.positionApprover1}`, {
        x: 400,
        y: height - 554,
        size: 14,
        font: customFont,
      });

      //วันที่1
      const dateApprover1 = parseDateToThai(data.DateApprover1);
      firstPage.drawText(dateApprover1.day, {
        x: 370,
        y: height - 572,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(dateApprover1.monthText, {
        x: 415,
        y: height - 572,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(dateApprover1.year, {
        x: 480,
        y: height - 572,
        size: 14,
        font: customFont,
      });

      //ความเห็นผูบังคับบัญชา2
      const commentApprover2Lines = wrapTextStrictMaxLines(
        data.commentApprover2,
        customFont,
        14, // fontSize
        160, // maxWidth ที่คุณต้องการ
        2 // จำนวนบรรทัดสูงสุด
      );

      let startY3 = height - 614;

      commentApprover2Lines.forEach((line, i) => {
        firstPage.drawText(line, {
          x: i === 0 ? 350 : 350, // แถวแรกอยู่ขวา แถวถัดไปอยู่ซ้าย
          y: startY3 - i * 18,
          size: 14,
          font: customFont,
        });
      });

      //ลายเซ็น ผูบังคับบัญชา2
      firstPage.drawText(`${data.signatureApprover2}`, {
        x: 400,
        y: height - 654,
        size: 14,
        font: customFont,
      });

      //ตำแหน่ง2
      firstPage.drawText(`${data.positionApprover2}`, {
        x: 400,
        y: height - 674,
        size: 14,
        font: customFont,
      });

      //วันที่2
      const dateApprover2 = parseDateToThai(data.DateApprover2);
      firstPage.drawText(dateApprover2.day, {
        x: 370,
        y: height - 693,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(dateApprover2.monthText, {
        x: 415,
        y: height - 693,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(dateApprover2.year, {
        x: 480,
        y: height - 693,
        size: 14,
        font: customFont,
      });

      //ความเห็นผูบังคับบัญชา3
      const commentApprover3Lines = wrapTextStrictMaxLines(
        data.commentApprover3,
        customFont,
        14, // fontSize
        160, // maxWidth ที่คุณต้องการ
        2 // จำนวนบรรทัดสูงสุด
      );

      let startY4 = height - 734;

      commentApprover3Lines.forEach((line, i) => {
        firstPage.drawText(line, {
          x: i === 0 ? 350 : 350, // แถวแรกอยู่ขวา แถวถัดไปอยู่ซ้าย
          y: startY4 - i * 18,
          size: 14,
          font: customFont,
        });
      });

      //ลายเซ็น ผูบังคับบัญชา3
      firstPage.drawText(`${data.signatureApprover3}`, {
        x: 400,
        y: height - 776,
        size: 14,
        font: customFont,
      });

      //ตำแหน่ง2
      firstPage.drawText(`${data.positionApprover3}`, {
        x: 400,
        y: height - 795,
        size: 14,
        font: customFont,
      });

      //วันที่3
      const dateApprover3 = parseDateToThai(data.DateApprover3);
      firstPage.drawText(dateApprover3.day, {
        x: 370,
        y: height - 813,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(dateApprover3.monthText, {
        x: 415,
        y: height - 813,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(dateApprover3.year, {
        x: 480,
        y: height - 813,
        size: 14,
        font: customFont,
      });

      //ลายเซ็น ผู้ตรวจสอบ
      firstPage.drawText(`${data.signatureVerifier}`, {
        x: 140,
        y: height - 630,
        size: 14,
        font: customFont,
      });

      //วันที่ ผู้ตรวจสอบ
      const dateVerifier = parseDateToThai(data.DateVerifier);
      firstPage.drawText(dateVerifier.day, {
        x: 128,
        y: height - 687,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(dateVerifier.monthText, {
        x: 152,
        y: height - 687,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(dateVerifier.year, {
        x: 200,
        y: height - 687,
        size: 14,
        font: customFont,
      });

      //คำสั่ง
      firstPage.drawImage(checkImage, {
        x: 181,
        y: height - 716,
        width: 12,
        height: 12,
      });
      firstPage.drawImage(checkImage, {
        x: 109,
        y: height - 716,
        width: 12,
        height: 12,
      });

      //ความเห็นผูบังคับบัญชา4
      const commentApprover4Lines = wrapTextStrictMaxLines(
        data.commentApprover4,
        customFont,
        14, // fontSize
        160, // maxWidth ที่คุณต้องการ
        2 // จำนวนบรรทัดสูงสุด
      );

      let startY5 = height - 734;

      commentApprover4Lines.forEach((line, i) => {
        firstPage.drawText(line, {
          x: i === 0 ? 80 : 80, // แถวแรกอยู่ขวา แถวถัดไปอยู่ซ้าย
          y: startY5 - i * 18,
          size: 14,
          font: customFont,
        });
      });

      //ลายเซ็น ผูบังคับบัญชา4
      firstPage.drawText(`${data.signatureApprover4}`, {
        x: 140,
        y: height - 776,
        size: 14,
        font: customFont,
      });

      //วันที่4
      const dateApprover4 = parseDateToThai(data.DateApprover4);
      firstPage.drawText(dateApprover4.day, {
        x: 100,
        y: height - 813,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(dateApprover4.monthText, {
        x: 140,
        y: height - 813,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(dateApprover4.year, {
        x: 220,
        y: height - 813,
        size: 14,
        font: customFont,
      });

      firstPage.drawText(`${data.sickLeaved}`, {
        x: 150,
        y: height - 550,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(`${data.total}`, {
        x: 200,
        y: height - 550,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(`${Number(data.sickLeaved) + Number(data.total)}`, {
        x: 250,
        y: height - 550,
        size: 14,
        font: customFont,
      });

      firstPage.drawText(`${data.personalLeaved}`, {
        x: 150,
        y: height - 570,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(`-`, {
        x: 200,
        y: height - 570,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(`${data.personalLeaved}`, {
        x: 250,
        y: height - 570,
        size: 14,
        font: customFont,
      });

      firstPage.drawText(`-`, {
        x: 150,
        y: height - 590,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(`-`, {
        x: 200,
        y: height - 590,
        size: 14,
        font: customFont,
      });
      firstPage.drawText(`-`, {
        x: 250,
        y: height - 590,
        size: 14,
        font: customFont,
      });

      // ลากิจ--------------------------------------
    } else if (leaveTypeId === 4) {
      // ลาพักผ่อน----------------------------------
      firstPage.drawText(`test`, {
        x: 50,
        y: height - 200,
        size: 14,
        font: customFont,
      });
      // ลาพักผ่อน----------------------------------
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
