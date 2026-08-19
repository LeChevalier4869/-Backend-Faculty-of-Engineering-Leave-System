/**
 * reportDoc-service — ตัวสร้างเอกสารรายงานสรุปการลา (PDF/Word) ที่ใช้ร่วมกัน
 *
 * รวมโค้ดสร้างเอกสารที่เดิมกระจาย/ซ้ำอยู่หลายที่ใน reportController ให้เหลือชุดเดียว
 * แยกเป็น 2 รูปแบบรายงาน:
 *   - summary : ตารางสรุปจำนวนครั้ง/วันลาต่อคน (ใช้กับ "รอบประเมิน" และ "รอบปีงบประมาณ")
 *   - monthly : ตารางลงเวลารายวัน (ใช้กับ "รอบเดือน")
 *
 * ทุกตัวรับ headingLines(typeName) เพื่อกำหนดข้อความหัวรายงาน (บรรทัดช่วงเวลาต่างกันตามรอบ)
 * ทำให้ PDF/Word/พรีวิว ใช้โครงเดียวกัน (WYSIWYG) และแก้บั๊คเดิม:
 *   - ชื่อประเภทลา lookup ให้ตรง DB ("ลากิจส่วนตัว") แต่แสดงหัวสั้น ("ลากิจ")
 *   - รายงานรายวันเดิม map ด้วย leaveTypeId ตัวเลข แต่ service คืน string key → ไม่เคยโชว์สัญลักษณ์
 *   - ปีงบเดิม hardcode 2568 → คำนวณจากช่วงวันที่จริง
 */
const path = require("path");
const PdfPrinter = require("pdfmake");
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
  VerticalAlign,
  Header,
} = require("docx");

/* ---------------------------------------------------------------- helpers */
const THAI_DIGITS = ["๐", "๑", "๒", "๓", "๔", "๕", "๖", "๗", "๘", "๙"];
const THAI_MONTHS = [
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

const toThaiNumber = (input) =>
  String(input).replace(/[0-9]/g, (d) => THAI_DIGITS[d]);

const formatThaiDateFull = (dateStr) => {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "-";
  const day = date.getDate();
  const month = THAI_MONTHS[date.getMonth()];
  const year = date.getFullYear() + 543;
  return `${day} ${month} ${year}`;
};

const formatThaiMonth = (m) => THAI_MONTHS[Number(m) - 1] || "";

// ปีงบประมาณ (พ.ศ.) จากวันเริ่มช่วง: เดือน ต.ค.(index 9) ขึ้นไปนับเป็นปีงบถัดไป
const fiscalYearBE = (dateStr) => {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const ce = d.getMonth() >= 9 ? d.getFullYear() + 1 : d.getFullYear();
  return ce + 543;
};

const isWeekendDate = (y, m /* 1-12 */, day) => {
  const w = new Date(Number(y), Number(m) - 1, Number(day)).getDay();
  return w === 0 || w === 6;
};

// วันในอนาคต (หลังวันนี้) — ใช้เว้นเครื่องหมายมาทำงาน "/" ในวันที่ยังไม่ถึง
const isFutureDate = (y, m /* 1-12 */, day) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(Number(y), Number(m) - 1, Number(day)) > today;
};

/* ประเภทลาที่แสดงในตารางสรุป: key = ชื่อจริงใน DB, label = หัวคอลัมน์แบบสั้น */
const SUMMARY_TYPES = [
  { key: "ลาป่วย", label: "ลาป่วย" },
  { key: "ลากิจส่วนตัว", label: "ลากิจ" },
  { key: "ลาพักผ่อน", label: "ลาพักผ่อน" },
];

// อ่านค่า ครั้ง/วัน จาก leaveSummary อย่างปลอดภัย
const td = (summary, key, field) => {
  const s = summary?.[key];
  if (!s) return "-";
  const v = field === "times" ? s.count : s.days;
  return v === 0 || v ? String(v) : "-";
};

/* สัญลักษณ์การลงเวลารายวัน (string key จาก LEAVE_KEY ของ report-service)
 * ใช้ตัวอักษร/สีชุดเดียวกับฝั่ง frontend (leaveMeta) เพื่อให้พรีวิวตรงกับไฟล์ที่โหลด */
const DAY_PRESENT = "/";
const ATTENDANCE = {
  SICK: { t: "ป", c: "#FFE08A" },
  MATERNITY: { t: "ค", c: "#F5C6D6" },
  PERSONAL: { t: "ก", c: "#BEE3B0" },
  ANNUAL: { t: "ล", c: "#A9DCF0" },
  ORDINATION: { t: "อ", c: "#E5E7EB" },
  MILITARY: { t: "ท", c: "#E5E7EB" },
  STUDY: { t: "ศ", c: "#E5E7EB" },
  PATERNITY: { t: "ภ", c: "#E5E7EB" },
  REHABILITATION: { t: "ฟ", c: "#E5E7EB" },
  DHARMA: { t: "ธ", c: "#E5E7EB" },
  INTERNATIONAL_WORK: { t: "ร", c: "#E5E7EB" },
  FOLLOW_SPOUSE: { t: "ต", c: "#E5E7EB" },
  HAJJ: { t: "ฮ", c: "#E5E7EB" },
  ABSENT: { t: "ข", c: "#F3C9C9" },
  UNKNOWN: { t: "?", c: "#E5E7EB" },
};

/* ---------------------------------------------------------------- fonts */
const FONT_DIR = path.join(__dirname, "../fonts");
const pdfFonts = {
  THSarabunNew: {
    normal: path.join(FONT_DIR, "THSarabunNew.ttf"),
    bold: path.join(FONT_DIR, "THSarabunNew-Bold.ttf"),
    italics: path.join(FONT_DIR, "THSarabunNew-Italic.ttf"),
    bolditalics: path.join(FONT_DIR, "THSarabunNew-BoldItalic.ttf"),
  },
};
const printer = new PdfPrinter(pdfFonts);

/* ============================================================== SUMMARY PDF */
function summaryPdfTable(list, startIndex = 0) {
  const headerRow1 = [
    thCell("ลำดับ", 2),
    thCell("เลขที่ตำแหน่ง", 2),
    thCell("ชื่อ - สกุล", 2),
    ...SUMMARY_TYPES.flatMap((t) => [
      {
        text: t.label,
        colSpan: 2,
        style: "th",
        alignment: "center",
        margin: [0, 1, 0, 1],
      },
      {},
    ]),
    thCell("มาสาย(ครั้ง)", 2),
    thCell("ขาดราชการ(วัน)", 2),
    thCell("การลาประเภท อื่น ๆ (โปรดระบุ)", 2),
    thCell("หมายเหตุ", 2),
  ];
  const headerRow2 = [
    {},
    {},
    {},
    ...SUMMARY_TYPES.flatMap(() => [
      { text: "ครั้ง", style: "th", alignment: "center", margin: [0, 1, 0, 1] },
      { text: "วัน", style: "th", alignment: "center", margin: [0, 1, 0, 1] },
    ]),
    {},
    {},
    {},
    {},
  ];

  const body = [headerRow1, headerRow2];
  list.forEach((u, idx) => {
    const row = [
      { text: String(startIndex + idx + 1), alignment: "center" },
      { text: u.positionNo || "", alignment: "center" },
      { text: u.name, alignment: "left" },
    ];
    SUMMARY_TYPES.forEach((t) => {
      row.push({
        text: td(u.leaveSummary, t.key, "times"),
        alignment: "center",
      });
      row.push({
        text: td(u.leaveSummary, t.key, "days"),
        alignment: "center",
      });
    });
    row.push({
      text: u.lateTimes != null ? String(u.lateTimes) : "-",
      alignment: "center",
    });
    row.push({
      text: u.absentDays != null ? String(u.absentDays) : "-",
      alignment: "center",
    });
    row.push({ text: u.otherLeave || "", alignment: "center" });
    row.push({ text: u.note || "", alignment: "center" });
    body.push(row);
  });

  return {
    table: {
      headerRows: 2,
      widths: [
        30,
        60,
        130,
        ...Array(SUMMARY_TYPES.length * 2).fill(25),
        50,
        70,
        130,
        70,
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
}

const thCell = (text, rowSpan) => ({
  text,
  rowSpan,
  style: "th",
  alignment: "center",
  margin: [0, 15, 0, 15],
});

// แปลงบรรทัดหัวรายงาน → stack ของ pdfmake (คำนวณ lines ครั้งเดียวแล้วส่งเข้ามา)
const headingStack = (lines, lastMargin) =>
  lines.map((text, li) => ({
    text,
    alignment: "center",
    margin: li === lines.length - 1 ? lastMargin : [0, 0, 0, 0],
  }));

/**
 * @param {Object} reportData  grouped: { [personnelType]: user[] }
 * @param {(typeName:string)=>string[]} headingLines
 */
function summaryPdfDoc(reportData, headingLines) {
  const content = [];
  const MAX_USERS_PER_PAGE = 15;

  Object.entries(reportData).forEach(([typeName, users], index) => {
    if (!users.length) return;
    const lines = headingLines(typeName);
    for (let i = 0; i < users.length; i += MAX_USERS_PER_PAGE) {
      const chunk = users.slice(i, i + MAX_USERS_PER_PAGE);
      const first = i === 0 && index === 0;

      content.push({
        stack: [
          ...headingStack(lines, [0, 0, 0, -5]),
          summaryPdfTable(chunk, i),
        ],
        pageBreak: first ? undefined : "before",
      });
    }
  });

  return {
    pageSize: "A4",
    pageOrientation: "landscape",
    content,
    styles: { th: { bold: false } },
    defaultStyle: { font: "THSarabunNew", fontSize: 14 },
  };
}

/* ============================================================= SUMMARY WORD */
const wCell = (txt, opts = {}) => {
  const {
    alignment = "center",
    fillColor = null,
    bold = false,
    columnSpan = 1,
    verticalMerge,
    width,
    margins = { top: 20, bottom: 0, left: 40, right: 40 },
  } = opts;
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
  });
};

const WORD_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 8, color: "000000" },
  bottom: { style: BorderStyle.SINGLE, size: 8, color: "000000" },
  left: { style: BorderStyle.SINGLE, size: 8, color: "000000" },
  right: { style: BorderStyle.SINGLE, size: 8, color: "000000" },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 8, color: "000000" },
  insideVertical: { style: BorderStyle.SINGLE, size: 8, color: "000000" },
};

function summaryWordTables(list) {
  const TYPE_W = 760;
  const colWidths = [
    600,
    1300,
    2800,
    ...SUMMARY_TYPES.flatMap(() => [TYPE_W, TYPE_W]),
    1000,
    1200,
    1400,
    1300,
  ];

  const headerRows = () => {
    const row1 = new TableRow({
      tableHeader: true,
      children: [
        wCell("ที่", { verticalMerge: "restart" }),
        wCell("เลขที่ตำแหน่ง", { verticalMerge: "restart" }),
        wCell("ชื่อ - สกุล", { verticalMerge: "restart" }),
        ...SUMMARY_TYPES.map((t) => wCell(t.label, { columnSpan: 2 })),
        wCell("มาสาย(ครั้ง)", { verticalMerge: "restart" }),
        wCell("ขาดราชการ(วัน)", { verticalMerge: "restart" }),
        wCell("อื่น ๆ", { verticalMerge: "restart" }),
        wCell("หมายเหตุ", { verticalMerge: "restart" }),
      ],
    });
    const row2 = new TableRow({
      tableHeader: true,
      children: [
        wCell("", { verticalMerge: "continue" }),
        wCell("", { verticalMerge: "continue" }),
        wCell("", { verticalMerge: "continue" }),
        ...SUMMARY_TYPES.flatMap(() => [wCell("ครั้ง"), wCell("วัน")]),
        wCell("", { verticalMerge: "continue" }),
        wCell("", { verticalMerge: "continue" }),
        wCell("", { verticalMerge: "continue" }),
        wCell("", { verticalMerge: "continue" }),
      ],
    });
    return [row1, row2];
  };

  const MAX_ROWS_PER_PAGE = 22;
  const out = [];
  for (let p = 0; p * MAX_ROWS_PER_PAGE < list.length; p++) {
    const chunk = list.slice(
      p * MAX_ROWS_PER_PAGE,
      (p + 1) * MAX_ROWS_PER_PAGE,
    );
    const rows = [...headerRows()];
    chunk.forEach((u, idx) => {
      rows.push(
        new TableRow({
          children: [
            wCell(p * MAX_ROWS_PER_PAGE + idx + 1),
            wCell(u.positionNo || ""),
            wCell(u.name, { alignment: "left" }),
            ...SUMMARY_TYPES.flatMap((t) => [
              wCell(td(u.leaveSummary, t.key, "times")),
              wCell(td(u.leaveSummary, t.key, "days")),
            ]),
            wCell(u.lateTimes != null ? u.lateTimes : "-"),
            wCell(u.absentDays != null ? u.absentDays : "-"),
            wCell(u.otherLeave || ""),
            wCell(u.note || ""),
          ],
        }),
      );
    });
    if (p > 0) out.push(new Paragraph({ pageBreakBefore: true }));
    out.push(
      new Table({
        layout: TableLayoutType.FIXED,
        columnWidths: colWidths,
        rows,
        borders: WORD_BORDERS,
      }),
    );
  }
  return out;
}

function summaryWordDoc(reportData, headingLines) {
  const entries = Object.entries(reportData).filter(([, u]) => u.length);
  const sections = entries.map(([typeName, users]) => ({
    properties: {
      page: {
        margin: { top: 1000, bottom: 1000, left: 543, right: 543 },
        size: { orientation: "landscape", width: 16838, height: 11906 },
      },
    },
    headers: {
      default: new Header({
        children: headingLines(typeName).map(
          (text) =>
            new Paragraph({
              children: [
                new TextRun({ text, font: "TH Sarabun New", size: 28 }),
              ],
              alignment: AlignmentType.CENTER,
            }),
        ),
      }),
    },
    children: [...summaryWordTables(users), new Paragraph({ text: "" })],
  }));

  return new Document({
    styles: {
      default: {
        document: { run: { font: "TH Sarabun New", size: 28, lang: "th-TH" } },
      },
    },
    sections: sections.length
      ? sections
      : [{ children: [new Paragraph({ text: "ไม่พบข้อมูล" })] }],
  });
}

/* ============================================================== MONTHLY PDF */
function monthlyPdfTable(users, daysInMonth, month, year) {
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
    ...Array.from({ length: daysInMonth }, (_, i) => ({
      text: String(i + 1),
      style: "th",
      alignment: "center",
      fillColor: isWeekendDate(year, month, i + 1) ? "#d9d9d9" : null,
      fontSize: 9,
    })),
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
      const key = u.attendance?.[d];
      const info = key ? ATTENDANCE[key] : null;
      const weekend = isWeekendDate(year, month, d);
      let text = "";
      let fill = null;
      if (info) {
        text = info.t;
        fill = info.c;
      } else if (weekend) {
        fill = "#d9d9d9";
      } else if (!isFutureDate(year, month, d)) {
        text = DAY_PRESENT; // มาทำงาน — เฉพาะวันที่ถึงวันนี้ (อนาคตเว้นว่าง)
      }
      row.push({
        text,
        alignment: "center",
        fillColor: fill,
        fontSize: 10,
        bold: !!info,
      });
    }
    row.push({ text: String(u.totalWorkDays ?? ""), alignment: "center" });
    row.push({ text: "", alignment: "left" });
    body.push(row);
  });

  return {
    table: {
      headerRows: 2,
      widths: [18, 100, ...Array(daysInMonth).fill(10), 25, 35],
      body,
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
    },
  };
}

const MONTH_LEGEND = [
  "/ = มาปฏิบัติราชการ, ป = ลาป่วย, ก = ลากิจส่วนตัว, ล = ลาพักผ่อน, ค = ลาคลอดบุตร, ภ = ลาช่วยภริยาคลอดบุตร,",
  "อ = ลาอุปสมบท, ศ = ลาศึกษา/ฝึกอบรม/วิจัย/ดูงาน, ท = ลาตรวจเลือก/เตรียมพล, ธ = ลาปฏิบัติธรรม, ต = ลาติดตามคู่สมรส,",
  "ร = ลาปฏิบัติงานองค์การระหว่างประเทศ, ฟ = ลาฟื้นฟูสมรรถภาพ, ฮ = ลาประกอบพิธีฮัจย์, ข = ขาดราชการ/ไม่มีข้อมูล",
];

const signatureBlock = () => {
  const col = (role) => ({
    stack: [
      {
        text: "ลงชื่อ..........................................................",
        margin: [0, 0, 0, 5],
      },
      {
        text: "(..........................................................)",
        margin: [0, 0, 0, 15],
      },
      { text: "........../........../..........", margin: [0, 0, 0, 5] },
      { text: role, fontSize: 10 },
    ],
    alignment: "center",
  });
  return {
    stack: [
      { text: "หมายเหตุ", bold: true, fontSize: 12, margin: [0, 20, 0, 5] },
      { text: MONTH_LEGEND.join("\n"), fontSize: 10, margin: [0, 0, 0, 40] },
      {
        table: {
          widths: ["*", "*", "*"],
          body: [
            [
              col("(เจ้าหน้าที่ผู้รับผิดชอบ)"),
              col("(หัวหน้าเจ้าหน้าที่)"),
              col("(หัวหน้าหน่วยงาน)"),
            ],
          ],
        },
        layout: "noBorders",
      },
    ],
    unbreakable: true,
  };
};

/**
 * @param {Object} result  { daysInMonth, month, year, report }
 * @param {(typeName:string)=>string[]} headingLines
 */
function monthlyPdfDoc(result, headingLines) {
  const { daysInMonth, month, year, report } = result;
  const content = [];
  const MAX_USERS_PER_PAGE = 22;

  Object.entries(report).forEach(([typeName, users], index) => {
    if (!users.length) return;
    const lines = headingLines(typeName);
    for (let i = 0; i < users.length; i += MAX_USERS_PER_PAGE) {
      const chunk = users.slice(i, i + MAX_USERS_PER_PAGE);
      const first = i === 0 && index === 0;
      content.push({
        stack: [
          ...headingStack(lines, [0, 0, 0, 4]),
          monthlyPdfTable(chunk, daysInMonth, month, year),
        ],
        pageBreak: first ? undefined : "before",
      });
    }
  });
  content.push(signatureBlock());

  return {
    pageSize: "A4",
    pageOrientation: "landscape",
    content,
    styles: { th: { bold: false } },
    defaultStyle: { font: "THSarabunNew", fontSize: 11 },
    pageMargins: [20, 20, 20, 20],
  };
}

/* ============================================================= MONTHLY WORD */
function monthlyWordTables(users, daysInMonth, month, year) {
  const dayW = 300;
  const colWidths = [500, 2400, ...Array(daysInMonth).fill(dayW), 900, 1100];

  const headerRows = () => {
    const row1 = new TableRow({
      tableHeader: true,
      children: [
        wCell("ลำดับ", { verticalMerge: "restart" }),
        wCell("ชื่อ - สกุล", { verticalMerge: "restart" }),
        wCell("ประจำวันที่", { columnSpan: daysInMonth }),
        wCell("รวมวันทำงาน", { verticalMerge: "restart" }),
        wCell("หมายเหตุ", { verticalMerge: "restart" }),
      ],
    });
    const row2 = new TableRow({
      tableHeader: true,
      children: [
        wCell("", { verticalMerge: "continue" }),
        wCell("", { verticalMerge: "continue" }),
        ...Array.from({ length: daysInMonth }, (_, i) =>
          wCell(String(i + 1), {
            fillColor: isWeekendDate(year, month, i + 1) ? "D9D9D9" : null,
            margins: { top: 10, bottom: 0, left: 10, right: 10 },
          }),
        ),
        wCell("", { verticalMerge: "continue" }),
        wCell("", { verticalMerge: "continue" }),
      ],
    });
    return [row1, row2];
  };

  const MAX_ROWS_PER_PAGE = 20;
  const out = [];
  for (let p = 0; p * MAX_ROWS_PER_PAGE < users.length; p++) {
    const chunk = users.slice(
      p * MAX_ROWS_PER_PAGE,
      (p + 1) * MAX_ROWS_PER_PAGE,
    );
    const rows = [...headerRows()];
    chunk.forEach((u, idx) => {
      const dayCells = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const key = u.attendance?.[d];
        const info = key ? ATTENDANCE[key] : null;
        const weekend = isWeekendDate(year, month, d);
        // มาทำงาน "/" เฉพาะวันที่ถึงวันนี้ (เสาร์อาทิตย์/อนาคต = เว้นว่าง)
        const present = !info && !weekend && !isFutureDate(year, month, d);
        const text = info ? info.t : present ? DAY_PRESENT : "";
        const fill = info ? info.c.replace("#", "") : weekend ? "D9D9D9" : null;
        dayCells.push(
          wCell(text, {
            fillColor: fill,
            margins: { top: 10, bottom: 0, left: 10, right: 10 },
          }),
        );
      }
      rows.push(
        new TableRow({
          children: [
            wCell(p * MAX_ROWS_PER_PAGE + idx + 1),
            wCell(u.name, { alignment: "left" }),
            ...dayCells,
            wCell(String(u.totalWorkDays ?? "")),
            wCell(""),
          ],
        }),
      );
    });
    if (p > 0) out.push(new Paragraph({ pageBreakBefore: true }));
    out.push(
      new Table({
        layout: TableLayoutType.FIXED,
        columnWidths: colWidths,
        rows,
        borders: WORD_BORDERS,
      }),
    );
  }
  return out;
}

function monthlyWordDoc(result, headingLines) {
  const { daysInMonth, month, year, report } = result;
  const entries = Object.entries(report).filter(([, u]) => u.length);

  const sections = entries.map(([typeName, users]) => ({
    properties: {
      page: {
        margin: { top: 900, bottom: 900, left: 543, right: 543 },
        size: { orientation: "landscape", width: 16838, height: 11906 },
      },
    },
    headers: {
      default: new Header({
        children: headingLines(typeName).map(
          (text) =>
            new Paragraph({
              children: [
                new TextRun({ text, font: "TH Sarabun New", size: 28 }),
              ],
              alignment: AlignmentType.CENTER,
            }),
        ),
      }),
    },
    children: [
      ...monthlyWordTables(users, daysInMonth, month, year),
      new Paragraph({ text: "" }),
      new Paragraph({
        children: [
          new TextRun({
            text: MONTH_LEGEND.join(" "),
            font: "TH Sarabun New",
            size: 24,
          }),
        ],
      }),
    ],
  }));

  return new Document({
    styles: {
      default: {
        document: { run: { font: "TH Sarabun New", size: 28, lang: "th-TH" } },
      },
    },
    sections: sections.length
      ? sections
      : [{ children: [new Paragraph({ text: "ไม่พบข้อมูล" })] }],
  });
}

/* ---------------------------------------------------------------- response */
function streamPdf(res, docDefinition, { thai, en }) {
  const pdfDoc = printer.createPdfKitDocument(docDefinition);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${en}"; filename*=UTF-8''${encodeURIComponent(thai)}`,
  );
  pdfDoc.pipe(res);
  pdfDoc.end();
}

async function sendWord(res, doc, { thai, en }) {
  const buffer = await Packer.toBuffer(doc);
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${en}"; filename*=UTF-8''${encodeURIComponent(thai)}`,
  );
  res.send(buffer);
}

module.exports = {
  // builders
  summaryPdfDoc,
  summaryWordDoc,
  monthlyPdfDoc,
  monthlyWordDoc,
  // response helpers
  streamPdf,
  sendWord,
  // text helpers (ให้ controller ใช้ประกอบหัวรายงาน)
  toThaiNumber,
  formatThaiDateFull,
  formatThaiMonth,
  fiscalYearBE,
  SUMMARY_TYPES,
};
