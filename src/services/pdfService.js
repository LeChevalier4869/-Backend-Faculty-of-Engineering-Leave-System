const { PDFDocument } = require("pdf-lib");
const fontkit = require("fontkit");
const fs = require("fs");
const path = require("path");
const prisma = require("../config/prisma");
const { start } = require("repl");

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

    // ---------------------- helper ------------------------

    //วันที่ เดือน ปี
    const drawDateTriple = (page, parsed, y, xDay, xMonth, xYear) => {
      page.drawText(parsed.day, {
        x: xDay,
        y,
        size: 14,
        font: customFont,
      });
      page.drawText(parsed.monthText, {
        x: xMonth,
        y,
        size: 14,
        font: customFont,
      });
      page.drawText(parsed.year, {
        x: xYear,
        y,
        size: 14,
        font: customFont,
      });
    };

    // สังกัด
    // ใช้ได้แต่ วิศวกรรมศาสตร์ ณ ตอนนี้
    const drawOrganizationCheckboxs = (page, organizationId) => {
      const orgId = Number(organizationId);

      if (orgId === 1) {
        page.drawImage(checkImage, {
          x: 246,
          y: height - 142,
          width: 12,
          height: 12,
        });
      } else if (orgId === 2) {
        page.drawImage(checkImage, {
          x: 123,
          y: height - 142,
          width: 12,
          height: 12,
        });
      } else if (orgId === 3) {
        page.drawImage(checkImage, {
          x: 349,
          y: height - 142,
          width: 12,
          height: 12,
        });
      } else if (orgId === 4) {
        page.drawImage(checkImage, {
          x: 124,
          y: height - 161,
          width: 12,
          height: 12,
        });
      }
    };

    // ประเภทการลา
    const drawLeaveTypeCheckboxs = (page, leaveTypeId) => {
      const typeId = Number(leaveTypeId);

      // sick / personal / vacation
      if (typeId === 1) {
        page.drawImage(checkImage, {
          x: 122,
          y: height - 261,
          width: 12,
          height: 12,
        });
      } else if (typeId === 3) {
        page.drawImage(checkImage, {
          x: 122,
          y: height - 280,
          width: 12,
          height: 12,
        });
      } else if (typeId === 4) {
        page.drawImage(checkImage, {
          x: 122,
          y: height - 299,
          width: 12,
          height: 12,
        });
      }
    };

    // contact
    const drawContactBlock = (page, text) => {
      const contactLines = wrapTextStrictMaxLines(
        text,
        customFont,
        14,
        140,
        2
      );

      let startY = height - 354;
      contactLines.forEach((line, i) => {
        page.drawText(line, {
          x: i === 0 ? 410 : 70,
          y: startY - i * 18,
          size: 14,
          font: customFont,
        });
      });
    };

    // comment
    const drawCommentBlock = (page, text, startY) => {
      const lines = wrapTextStrictMaxLines(text, customFont, 14, 160, 2);
      lines.forEach((line, i) => {
        page.drawText(line, {
          x: 350,
          y: startY - i * 18,
          size: 14,
          font: customFont,
        });
      });
    };

    // comment left
    const drawCommentBlockLeft = (page, text, startY) => {
      const lines = wrapTextStrictMaxLines(text, customFont, 14, 160, 2);
      lines.forEach((line, i) => {
        page.drawText(line, {
          x: 80,
          y: startY - i * 18,
          size: 14,
          font: customFont,
        });
      });
    };

    // approver signature
    const drawApproverSignature = (page, name, position, rawDate, baseY) => {
      page.drawText(name, {
        x: 400,
        y: height - (baseY),
        size: 14,
        font: customFont,
      });
      page.drawText(position, {
        x: 400,
        y: height - (baseY + 19),
        size: 14,
        font: customFont,
      });

      const parsed = parseDateToThai(rawDate);
      drawDateTriple(page, parsed, height - (baseY + 39), 370, 415, 480);
    };

    // verifier block
    const drawVerifierBlock = (page, signature, rawDate) => {
      page.drawText(signature, {
        x: 140,
        y: height - 630,
        size: 14,
        font: customFont,
      });

      const parsed = parseDateToThai(rawDate);
      drawDateTriple(page, parsed, height - 686, 128, 155, 200);
    };

    // summary counter
    const drawSummaryCounters = (page, data, isSick) => {
      // sick
      page.drawText(`${isSick ? data.lastSickLeaved : Number(data.sickLeaveTotal)}`, {
        x: 150,
        y: height - 550,
        size: 14,
        font: customFont,
      });
      page.drawText(`${isSick ? data.thisTime : "-"}`, {
        x: 200,
        y: height - 550,
        size: 14,
        font: customFont,
      });
      page.drawText(`${data.sickLeaveTotal}`, {
        x: 250,
        y: height - 550,
        size: 14,
        font: customFont, 
      });

      // personal ยังไม่เสร็จ (data from frontend)
      page.drawText(`${isSick ? data.personnalLeaveTotal : data.lastPersonnalLeaved}`, {
        x: 150,
        y: height - 570,
        size: 14,
        font: customFont,
      });
      page.drawText(`${isSick ? "-" : data.thisTime}`, {
        x: 200,
        y: height - 570,
        size: 14,
        font: customFont,
      });
      page.drawText(`${data.personnalLeaveTotal}`, {
        x: 250,
        y: height - 570,
        size: 14,
        font: customFont,
      });

      // other leaves ยังไม่เสร็จ data(จาก DB)
      page.drawText(`-`, {
        x: 150,
        y: height - 590,
        size: 14,
        font: customFont,
      });
      page.drawText(`-`, {
        x: 200,
        y: height - 590,
        size: 14,
        font: customFont,
      });
      page.drawText(`-`, {
        x: 250,
        y: height - 590,
        size: 14,
        font: customFont,
      });
    };

    // ประเภทบุคลากร
    const drawPersonnelCheckboxs = (page, data) => {
      if (data.personnelType === "ข้าราชการ") {
        page.drawImage(checkImage, {
          x: 124,
          y: height - 192,
          width: 12,
          height: 12,
        });
      } else if (data.personnelType === "ลูกจ้างประจำ") {
        // ลูกจ้างประจำ (ยังไม่ได้ข้อสรุป) ยังไม่เสร็จ
      } else if (data.personnelType === "พนักงานราชการ") {
        if (data.employmentType === "ACADEMIC") {
          page.drawImage(checkImage, {
            x: 396,
            y: height - 192,
            width: 12,
            height: 12,
          });
        } else {
          page.drawImage(checkImage, {
            x: 395,
            y: height - 211,
            width: 12,
            height: 12,
          });
        }
      } else if (data.personnelType === "พนักงานในสถาบันอุดมศึกษา") {
        if (data.employmentType === "ACADEMIC") {
          page.drawImage(checkImage, {
            x: 209,
            y: height - 192,
            width: 12,
            height: 12,
          });
        } else {
          page.drawImage(checkImage, {
            x: 124,
            y: height - 211,
            width: 12,
            height: 12,
          });
        }
      } else if (data.personnelType === "ลูกจ้างเงินรายได้") {
        if (data.employmentType === "ACADEMIC") {
          page.drawImage(checkImage, {
            x: 395,
            y: height - 230,
            width: 12,
            height: 12,
          });
        } else {
          page.drawImage(checkImage, {
            x: 124, 
            y: height - 230,
            width: 12,
            height: 12,
          });
        }
      }
    };

    // command
    const drawCommandCheckboxs = (page) => {
      // คำสั่งยังไม่แยก case
      page.drawImage(checkImage, {
        x: 181,
        y: height - 716,
        width: 12,
        height: 12,
      });
      page.drawImage(checkImage, {
        x: 109,
        y: height - 716,
        width: 12,
        height: 12,
      });
    };

    // --------------------- function for sick + personnal ------------------
    const drawSickOrPersonnalForm = (page, data, typeId) => {
      const isSick = typeId === 1;

      // ที่ 
      page.drawText(`${data.documentNumber}`, {
        x: 470,
        y: height - 43,
        size: 14,
        font: customFont,
      });

      // วันที่ 
      const documentDate = parseDateToThai(data.documentDate);
      drawDateTriple(page, documentDate, height - 62, 382, 440, 525);

      // เรื่อง
      page.drawText(`${data.title}`, {
        x: 150,
        y: height - 80,
        size: 14,
        font: customFont,
      });

      // ข้าพเจ้า / ตำแหน่ง
      page.drawText(`${data.name}`, {
        x: 180,
        y: height - 122,
        size: 14,
        font: customFont,
      });
      page.drawText(`${data.position}`, {
        x: 400,
        y: height - 122,
        size: 14,
        font: customFont,
      });

      // สังกัด
      drawOrganizationCheckboxs(page, data.organizationId);

      // ประเภทบุคลากร
      drawPersonnelCheckboxs(page, data);

      // ประเภทการลา (ป่วย / กิจ / พักผ่อน)
      drawLeaveTypeCheckboxs(page, typeId);

      // เนื่องจาก
      page.drawText(`${data.reason}`, {
        x: 240,
        y: height - 283,
        size: 14,
        font: customFont,
      });

      // ช่วงวันที่ลา
      const start = parseDateToThai(data.startDate);
      const end = parseDateToThai(data.endDate);

      drawDateTriple(page, start, height - 318, 130, 200, 296);
      drawDateTriple(page, end, height - 318, 368, 420, 500);

      // มีกำหนด
      page.drawText(`${data.thisTime}`, {
        x: 115,
        y: height - 337,
        size: 14,
        font: customFont,
      });

      // ข้าพเจ้าได้ลา (ช่องสถิติลา)
      if (typeId === 1) {
        page.drawImage(checkImage, {
          x: 204,
          y: height - 336,
          width: 12,
          height: 12,
        });
      } else if (typeId === 3) {
        page.drawImage(checkImage, {
          x: 243,
          y: height - 336,
          width: 12,
          height: 12,
        });
      }

      // ลาครั้งสุดท้าย ตั้งแต่วันที่ ... ถึงวันที่ ...
      const lastStart = parseDateToThai(data.lastLeaveStartDate);
      const lastEnd = parseDateToThai(data.lastLeaveEndDate);

      page.drawText(
        `${lastStart.day} ${lastStart.monthText} ${lastStart.year}`,
        {
          x: 460,
          y: height - 337,
          size: 14,
          font: customFont,
        }
      );

      page.drawText(
        `${lastEnd.day} ${lastEnd.monthText} ${lastEnd.year}`,
        {
          x: 108,
          y: height - 354,
          size: 14,
          font: customFont,
        }
      );

      // มีกำหนด (ของช่วงเวลาครั้งล่าสุด)
      page.drawText(
        `${data.lastLeaveThisTime}`,
        {
          x: 235,
          y: height - 354,
          size: 14,
          font: customFont,
        }
      );

      // ในระหว่างลา ติดต่อได้ที่
      drawContactBlock(page, data.contact);

      // เบอร์โทรศัพท์
      page.drawText(`${data.phone}`, {
        x: 410,
        y: height - 373,
        size: 14, 
        font: customFont,
      });

      // ลายเซ็นผู้ลา + ชื่อ
      page.drawText(`${data.signature}`, {
        x: 360,
        y: height - 434, 
        size: 14,
        font: customFont,
      });
      page.drawText(`${data.name}`, {
        x: 350, 
        y: height - 452,
        size: 14,
        font: customFont,
      });

      // ความเห็นผู้บังคับบัญชา 1-3 (ข้อความ)
      drawCommentBlock(page, data.commentApprover1, height - 494);
      drawCommentBlock(page, data.commentApprover2, height - 614);
      drawCommentBlock(page, data.commentApprover3, height - 734);

      // ลายเซ็น / ตำแหน่ง / วันที่ ผู้บังคับบัญชา 1-3
      drawApproverSignature(
        page,
        data.signatureApprover1,
        data.positionApprover1,
        data.DateApprover1,
        534
      );
      drawApproverSignature(
        page,
        data.signatureApprover2,
        data.positionApprover2,
        data.DateApprover2,
        654
      );
      drawApproverSignature(
        page,
        data.signatureApprover3,
        data.positionApprover3,
        data.DateApprover3,
        775
      );

      // ผู้ตรวจสอบ
      drawVerifierBlock(page, data.signatureVerifier, data.DateVerifier);

      // คำสั่ง (ผ่าน / ไม่ผ่าน)
      drawCommandCheckboxs(page);

      // ความเห็น ผบ. 4 + ลายเซ็น + วันที่
      drawCommentBlockLeft(page, data.commentApprover4, height - 734);

      page.drawText(`${data.signatureApprover4}`, {
        x: 140,
        y: height - 776,
        size: 14,
        font: customFont,
      });

      const dateApprover4 = parseDateToThai(data.DateApprover4);
      drawDateTriple(page, dateApprover4, height - 813, 100, 140, 220);

      // ส่วนสรุปสถิติด้านล่าง
      drawSummaryCounters(page, data, isSick);
    };

      // -------------------- เลือกวาดตามประเภทการลา ------------------

      if (leaveTypeId === 1 || leaveTypeId === 3) {
        // sick + personnal --> same form
        drawSickOrPersonnalForm(firstPage, data, leaveTypeId);
      } else if (leaveTypeId === 4) {
        // vacation (placeholder) ยังไม่เสร็จ
        firstPage.drawText(`test`, {
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
