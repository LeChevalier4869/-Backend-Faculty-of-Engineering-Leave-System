const createError = require("../utils/createError");
const nodemailer = require("nodemailer");
const dns = require("dns");

// บังคับ DNS resolve IPv4 ก่อน — กันปัญหา ENETUNREACH IPv6 บน host (เช่น Render)
// ที่ Gmail SMTP resolve เป็น IPv6 ก่อนแต่ network ไป IPv6 ไม่ได้
if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

// ตัวเลือกการเชื่อมต่อ SMTP: ใช้ IPv4 + ตั้ง timeout ให้ fail เร็ว (ไม่ค้าง)
const SMTP_CONN_OPTS = {
  family: 4,
  connectionTimeout: 10000,
  greetingTimeout: 8000,
  socketTimeout: 15000,
};

const APP_NAME = "ระบบจัดการวันลา คณะวิศวกรรมศาสตร์";

// Gmail (Workspace ของคณะ) — รองรับ 2 วิธี auth: OAuth2 (หลัก) และ app password (สำรอง)
const GMAIL_USER = process.env.EMAIL_USER_RMUTI;
const GMAIL_PASS = process.env.EMAIL_APP_PASS;
const GMAIL_FROM = GMAIL_USER ? `${APP_NAME} <${GMAIL_USER}>` : undefined;

const GMAIL_OAUTH = {
  clientId: process.env.OAUTH_CLIENT_ID_RMUTI,
  clientSecret: process.env.OAUTH_CLIENT_SECRET_RMUTI,
  refreshToken: process.env.OAUTH_REFRESH_TOKEN_RMUTI,
};
const hasGmailOAuth = () =>
  !!(GMAIL_USER && GMAIL_OAUTH.clientId && GMAIL_OAUTH.clientSecret && GMAIL_OAUTH.refreshToken);
const hasGmailAppPass = () => !!(GMAIL_USER && GMAIL_PASS);

const getFrontendUrl = () =>
  process.env.FRONTEND_URL || "https://frontend-faculty-of-engineering-leave-system.vercel.app";

// transporter แยกตามวิธี auth (lazy + memoize)
let oauthTransporter = null;
function getOAuthTransporter() {
  if (!oauthTransporter) {
    oauthTransporter = nodemailer.createTransport({
      service: "gmail",
      ...SMTP_CONN_OPTS,
      auth: {
        type: "OAuth2",
        user: GMAIL_USER,
        clientId: GMAIL_OAUTH.clientId,
        clientSecret: GMAIL_OAUTH.clientSecret,
        refreshToken: GMAIL_OAUTH.refreshToken,
      },
    });
  }
  return oauthTransporter;
}

let appPassTransporter = null;
function getAppPassTransporter() {
  if (!appPassTransporter) {
    appPassTransporter = nodemailer.createTransport({
      service: "gmail",
      ...SMTP_CONN_OPTS,
      auth: { user: GMAIL_USER, pass: GMAIL_PASS },
    });
  }
  return appPassTransporter;
}

/**
 * ช่องทางส่งอีเมล (nodemailer/Gmail) เรียงตามลำดับ — ลอง OAuth2 ก่อน แล้ว fallback เป็น app password
 */
const providers = [
  {
    name: "gmail-oauth2",
    isConfigured: hasGmailOAuth,
    send: (to, subject, html) =>
      getOAuthTransporter().sendMail({ from: GMAIL_FROM, to, subject, html }),
  },
  {
    name: "gmail-app",
    isConfigured: hasGmailAppPass,
    send: (to, subject, html) =>
      getAppPassTransporter().sendMail({ from: GMAIL_FROM, to, subject, html }),
  },
];

/**
 * พยายามส่งอีเมลผ่าน channel ตามลำดับ และ fallback อัตโนมัติเมื่อล้มเหลว
 * @returns {Promise<{ok: boolean, provider?: string, errors: Array<{provider:string, error:string}>}>}
 */
async function deliver(toEmail, subject, message) {
  const errors = [];
  for (const p of providers) {
    if (!p.isConfigured()) continue;
    try {
      await p.send(toEmail, subject, message);
      return { ok: true, provider: p.name, errors };
    } catch (error) {
      const detail = error.response?.body
        ? JSON.stringify(error.response.body)
        : error.message;
      errors.push({ provider: p.name, error: detail });
      console.error(`[email] channel "${p.name}" ล้มเหลว → ${toEmail} | ${detail}`);
    }
  }
  return { ok: false, errors };
}

/**
 * ส่งอีเมล (HTML) ผ่าน Gmail (nodemailer) — ลอง OAuth2 ก่อน ถ้าไม่สำเร็จ fallback เป็น app password
 * ไม่ throw เพื่อไม่ให้ flow อนุมัติพัง แต่จะ log ชัดเจนเมื่อส่งไม่สำเร็จทุกช่องทาง
 * @returns {Promise<object>} ผลการส่ง { ok, provider?, errors }
 */
const sendEmail = async (toEmail, subject, message) => {
  const result = await deliver(toEmail, subject, message);
  if (result.ok) {
    console.log(`[email] ✅ ส่งสำเร็จ → ${toEmail} ผ่าน ${result.provider} | "${subject}"`);
  } else {
    // ความล้มเหลวต้องไม่เงียบ — log ให้เห็นชัดเพื่อให้ตรวจจับได้ (observability)
    console.error(
      `[email] ❌ ส่งไม่สำเร็จทุกช่องทาง → ${toEmail} | subject="${subject}" |`,
      JSON.stringify(result.errors)
    );
  }
  return result;
};

/**
 * เหมือน sendEmail แต่ throw error เมื่อส่งไม่สำเร็จทุกช่องทาง (ใช้ในหน้าทดสอบ)
 */
const sendEmailTest = async (toEmail, subject, message) => {
  const result = await deliver(toEmail, subject, message);
  if (!result.ok) {
    const summary =
      result.errors.map((e) => `${e.provider}: ${e.error}`).join(" | ") ||
      "ไม่มี provider อีเมลที่ตั้งค่าไว้";
    throw new Error(`ส่งอีเมลไม่สำเร็จ (${summary})`);
  }
  console.log(`[email] ✅ (test) ส่งสำเร็จ → ${toEmail} ผ่าน ${result.provider}`);
  return result;
};

// ─────────────────────────────────────────────────────────────
// Email templates
// ─────────────────────────────────────────────────────────────

// สีประจำคณะวิศวกรรมศาสตร์ — เลือดหมู (maroon) + ทอง
const COLORS = {
  maroon: "#7A1B22",
  maroonDark: "#561016",
  gold: "#C9A24A",
  pageBg: "#f2eeef",
  text: "#3f3f46",
  heading: "#561016",
  footerBg: "#faf5f5",
  footerText: "#a08a8c",
  divider: "#f0e4e5",
};

// โทนของ status badge ตามประเภทเหตุการณ์
const TONES = {
  success: { text: "#166534", bg: "#e7f6ec", border: "#bbe6c8" },
  info: { text: "#7A1B22", bg: "#f7e9ea", border: "#ecccce" },
  pending: { text: "#92400e", bg: "#fdf0dd", border: "#f6dcae" },
  danger: { text: "#9f1d18", bg: "#fdeceb", border: "#f5c9c5" },
};

function renderBadge(tone, badge) {
  if (!badge) return "";
  const t = TONES[tone] || TONES.info;
  return `<span style="display:inline-block;padding:5px 14px;border-radius:999px;font-size:13px;font-weight:600;color:${t.text};background:${t.bg};border:1px solid ${t.border};">${badge}</span>`;
}

function renderDetails(details = []) {
  const rows = details
    .filter((d) => d && d.value != null && d.value !== "")
    .map(
      (d) =>
        `<tr>
          <td style="padding:9px 0;font-size:14px;color:#9b7e80;vertical-align:top;width:36%;">${d.label}</td>
          <td style="padding:9px 0;font-size:14px;color:#2b2b2b;font-weight:600;">${d.value}</td>
        </tr>`
    )
    .join("");
  if (!rows) return "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 4px;border-top:1px solid ${COLORS.divider};border-bottom:1px solid ${COLORS.divider};">${rows}</table>`;
}

/** ครอบเนื้อหาด้วย layout อีเมลแบบมีแบรนด์ของคณะ (inline style เพื่อรองรับ email client) */
function wrapHtml({ heading, lines = [], details = [], tone, badge }) {
  const body = lines
    .filter(Boolean)
    .map(
      (l) =>
        `<p style="margin:0 0 12px;font-size:15px;line-height:1.75;color:${COLORS.text};">${l}</p>`
    )
    .join("");

  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${COLORS.pageBg};font-family:'Sarabun','Kanit',-apple-system,'Segoe UI',Tahoma,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.pageBg};padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #ecdcde;box-shadow:0 6px 22px rgba(86,16,22,0.08);">
        <tr><td style="height:4px;background:${COLORS.gold};"></td></tr>
        <tr><td style="background:linear-gradient(135deg,${COLORS.maroon},${COLORS.maroonDark});padding:26px 30px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td>
              <div style="color:#ffffff;font-size:19px;font-weight:700;letter-spacing:.2px;">${APP_NAME}</div>
              <div style="color:#f0d9bd;font-size:13px;margin-top:3px;">คณะวิศวกรรมศาสตร์ · มทร.อีสาน วิทยาเขตขอนแก่น</div>
            </td>
            <td align="right" style="font-size:30px;line-height:1;">⚙️</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:30px;">
          ${renderBadge(tone, badge)}
          ${heading ? `<h1 style="margin:14px 0 16px;font-size:20px;color:${COLORS.heading};font-weight:700;">${heading}</h1>` : ""}
          ${body}
          ${renderDetails(details)}
          <div style="margin-top:26px;">
            <a href="${getFrontendUrl()}" style="display:inline-block;background:${COLORS.maroon};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:9px;box-shadow:0 2px 6px rgba(122,27,34,.25);">เข้าสู่ระบบ</a>
          </div>
        </td></tr>
        <tr><td style="padding:18px 30px;background:${COLORS.footerBg};border-top:1px solid ${COLORS.divider};color:${COLORS.footerText};font-size:12px;text-align:center;line-height:1.7;">
          อีเมลฉบับนี้ส่งจากระบบอัตโนมัติ กรุณาอย่าตอบกลับ<br>© คณะวิศวกรรมศาสตร์ มหาวิทยาลัยเทคโนโลยีราชมงคลอีสาน วิทยาเขตขอนแก่น
        </td></tr>
      </table>
      <div style="color:#b9a9aa;font-size:11px;margin-top:14px;">ระบบจัดการการลาออนไลน์</div>
    </td></tr>
  </table>
</body></html>`;
}

/** บรรทัดเสริมกรณีเป็นการอนุมัติแทน (proxy) — คืนค่าว่างถ้าไม่ใช่ proxy */
function proxyLine(d = {}) {
  if (d.proxyApprover && d.originalApprover) {
    return `<span style="color:#64748b;">(อนุมัติโดยผู้รับมอบอำนาจ: ${d.proxyApprover} แทน ${d.originalApprover})</span>`;
  }
  return "";
}

const daysValue = (d) =>
  d.requestedDays != null && d.requestedDays !== "" ? `${d.requestedDays} วัน` : null;

// ตารางเทมเพลตหลัก (key มาตรฐาน) — แต่ละตัวคืน { subject, heading, lines, tone, badge, details? }
const TEMPLATES = {
  // ── ยื่นคำขอ → แจ้งผู้อนุมัติระดับแรก ──
  SUBMISSION: (d) => ({
    subject: "มีคำขอลาใหม่รอการพิจารณา",
    heading: "คำขอลาใหม่รอการพิจารณา",
    tone: "info",
    badge: "คำขอใหม่",
    lines: [
      `เรียน ${d.userName || "ผู้อนุมัติ"},`,
      `มีคำขอลาใหม่จาก <b>${d.requesterName || "-"}</b> เข้าสู่ระบบ กรุณาตรวจสอบและพิจารณาดำเนินการ`,
    ],
    details: [
      { label: "ผู้ยื่นคำขอ", value: d.requesterName },
      { label: "จำนวนวันลา", value: daysValue(d) },
      { label: "เหตุผล", value: d.reason },
      { label: "ติดต่อ", value: d.contact },
    ],
  }),
  // ── ยื่นคำขอ → ยืนยันกลับผู้ลา ──
  SUBMISSION_CONFIRM: (d) => ({
    subject: "ระบบได้รับคำขอลาของคุณแล้ว",
    heading: "ยืนยันการยื่นคำขอลา",
    tone: "pending",
    badge: "รอดำเนินการ",
    lines: [
      `เรียน ${d.userName},`,
      "ระบบได้รับคำขอลาของคุณเรียบร้อยแล้ว ขณะนี้อยู่ระหว่างรอการพิจารณาจากหัวหน้าสาขา",
    ],
    details: [
      { label: "จำนวนวันลา", value: daysValue(d) },
      { label: "เหตุผล", value: d.reason },
      { label: "ติดต่อ", value: d.contact },
    ],
  }),
  APPROVER1_APPROVED: (d) => ({
    subject: "คำขอลาได้รับการอนุมัติจากหัวหน้าสาขา",
    heading: "มีคำขอลารอการตรวจสอบ",
    tone: "info",
    badge: "รอการตรวจสอบ",
    lines: [
      "เรียน ผู้ตรวจสอบ,",
      `คำขอลาจาก <b>${d.userName}</b> ได้รับการอนุมัติจากหัวหน้าสาขาแล้ว ${proxyLine(d)} กรุณาตรวจสอบข้อมูล`,
    ],
  }),
  VERIFIER_APPROVED: (d) => ({
    subject: "คำขอลาได้รับการตรวจสอบจากผู้ตรวจสอบ",
    heading: "มีคำขอลารอการอนุมัติ",
    tone: "info",
    badge: "รอการอนุมัติ",
    lines: [
      "เรียน ผู้บังคับบัญชา,",
      `คำขอลาจาก <b>${d.userName}</b> ได้รับการตรวจสอบผ่านจากผู้ตรวจสอบแล้ว ${proxyLine(d)} กรุณาพิจารณาอนุมัติขั้นต่อไป`,
    ],
  }),
  APPROVER2_APPROVED: (d) => ({
    subject: "คำขอลาได้รับการอนุมัติจากหัวหน้าคณะ",
    heading: "มีคำขอลารอการอนุมัติ",
    tone: "info",
    badge: "รอการอนุมัติ",
    lines: [
      "เรียน รองคณบดี,",
      `คำขอลาจาก <b>${d.userName}</b> ได้รับการอนุมัติจากหัวหน้าคณะแล้ว ${proxyLine(d)} กรุณาพิจารณาอนุมัติขั้นต่อไป`,
    ],
  }),
  APPROVER3_APPROVED: (d) => ({
    subject: "คำขอลาได้รับการอนุมัติจากรองคณบดี",
    heading: "มีคำขอลารอการอนุมัติขั้นสุดท้าย",
    tone: "info",
    badge: "รออนุมัติขั้นสุดท้าย",
    lines: [
      "เรียน คณบดี,",
      `คำขอลาจาก <b>${d.userName}</b> ได้รับการอนุมัติจากรองคณบดีแล้ว ${proxyLine(d)} กรุณาพิจารณาอนุมัติขั้นสุดท้าย`,
    ],
  }),
  STEP_APPROVED_1: (d) => ({
    subject: "คำขอลาของคุณได้รับการอนุมัติจากหัวหน้าสาขา",
    heading: "คำขอลาผ่านขั้นที่ 1",
    tone: "success",
    badge: "ผ่านขั้นที่ 1",
    lines: [
      `เรียน ${d.userName},`,
      "คำขอลาของคุณได้รับการอนุมัติเรียบร้อยแล้วจากหัวหน้าสาขา กรุณาตรวจสอบสถานะในระบบ",
    ],
  }),
  STEP_APPROVED_2: (d) => ({
    subject: "คำขอลาของคุณได้รับการตรวจสอบจากผู้ตรวจสอบ",
    heading: "คำขอลาผ่านขั้นที่ 2",
    tone: "success",
    badge: "ผ่านขั้นที่ 2",
    lines: [
      `เรียน ${d.userName},`,
      "คำขอลาของคุณได้รับการตรวจสอบเรียบร้อยแล้วจากผู้ตรวจสอบ กรุณาตรวจสอบสถานะในระบบ",
    ],
  }),
  STEP_APPROVED_3: (d) => ({
    subject: "คำขอลาของคุณได้รับการอนุมัติจากหัวหน้าคณะ",
    heading: "คำขอลาผ่านขั้นที่ 3",
    tone: "success",
    badge: "ผ่านขั้นที่ 3",
    lines: [
      `เรียน ${d.userName},`,
      "คำขอลาของคุณได้รับการอนุมัติเรียบร้อยแล้วจากหัวหน้าคณะ กรุณาตรวจสอบสถานะในระบบ",
    ],
  }),
  STEP_APPROVED_4: (d) => ({
    subject: "คำขอลาของคุณได้รับการอนุมัติจากรองคณบดี",
    heading: "คำขอลาผ่านขั้นที่ 4",
    tone: "success",
    badge: "ผ่านขั้นที่ 4",
    lines: [
      `เรียน ${d.userName},`,
      "คำขอลาของคุณได้รับการอนุมัติเรียบร้อยแล้วจากรองคณบดี กรุณาตรวจสอบสถานะในระบบ",
    ],
  }),
  FULLY_APPROVED: (d) => ({
    subject: "คำขอลาของคุณได้รับการอนุมัติเรียบร้อยแล้ว",
    heading: "คำขอลาได้รับการอนุมัติครบทุกขั้นตอน",
    tone: "success",
    badge: "อนุมัติสมบูรณ์",
    lines: [
      `เรียน ${d.userName},`,
      "คำขอลาของคุณได้รับการอนุมัติครบทุกขั้นตอนแล้ว ระบบได้ตัดยอดวันลาเรียบร้อยแล้ว",
    ],
  }),
  REJECTION: (d) => ({
    subject: "คำขอลาของคุณถูกปฏิเสธ",
    heading: "คำขอลาถูกปฏิเสธ",
    tone: "danger",
    badge: "ถูกปฏิเสธ",
    lines: [
      `เรียน ${d.userName},`,
      "คำขอลาของคุณถูกปฏิเสธ กรุณาตรวจสอบรายละเอียดและเหตุผลด้านล่าง",
    ],
    details: [{ label: "เหตุผล", value: d.remarks || "ไม่ได้ระบุเหตุผล" }],
  }),
  // ── ยกเลิกโดยผู้ดูแลระบบ → แจ้งผู้ลา ──
  CANCELLATION: (d) => ({
    subject: "คำขอลาของคุณถูกยกเลิก",
    heading: "คำขอลาถูกยกเลิก",
    tone: "danger",
    badge: "ยกเลิกแล้ว",
    lines: [
      `เรียน ${d.userName},`,
      "คำขอลาของคุณถูกยกเลิกโดยผู้ดูแลระบบ และสิทธิ์วันลาของคุณได้รับการคืนค่าเรียบร้อยแล้ว",
    ],
    details: [
      { label: "เลขที่ใบลา", value: d.documentNumber },
      { label: "ประเภทการลา", value: d.leaveTypeName },
      { label: "จำนวนวันลา", value: daysValue(d) },
      { label: "วันที่ลา", value: d.dateRange },
    ],
  }),
  // ── มอบอำนาจ → แจ้งผู้รับมอบอำนาจ ──
  PROXY_ASSIGNED: (d) => ({
    subject: "คุณได้รับมอบหมายให้อนุมัติแทน",
    heading: "ได้รับมอบหมายให้อนุมัติแทน",
    tone: "info",
    badge: "มอบอำนาจ",
    lines: [
      `เรียน ${d.userName},`,
      `คุณได้รับมอบหมายจาก <b>${d.originalApproverName || "-"}</b> ให้ทำหน้าที่อนุมัติคำขอลาแทนในช่วงเวลาที่กำหนด`,
    ],
    details: [
      { label: "ผู้มอบอำนาจ", value: d.originalApproverName },
      { label: "ระดับการอนุมัติ", value: d.levelLabel },
      { label: "ช่วงเวลา", value: d.period },
      { label: "เหตุผล", value: d.reason },
    ],
  }),
  // ── ยกเลิกการมอบอำนาจ → แจ้งผู้รับมอบอำนาจ ──
  PROXY_CANCELLED: (d) => ({
    subject: "การมอบอำนาจอนุมัติแทนถูกยกเลิก",
    heading: "การมอบอำนาจถูกยกเลิก",
    tone: "danger",
    badge: "ยกเลิกมอบอำนาจ",
    lines: [
      `เรียน ${d.userName},`,
      `การมอบอำนาจให้คุณอนุมัติแทน <b>${d.originalApproverName || "-"}</b> ได้ถูกยกเลิกแล้ว คุณไม่ต้องดำเนินการอนุมัติแทนในช่วงเวลานี้อีกต่อไป`,
    ],
    details: [
      { label: "ผู้มอบอำนาจ", value: d.originalApproverName },
      { label: "ระดับการอนุมัติ", value: d.levelLabel },
      { label: "ช่วงเวลา", value: d.period },
    ],
  }),
  // ── เปลี่ยนบทบาทผู้ใช้ → แจ้งผู้ใช้ ──
  ROLE_UPDATED: (d) => ({
    subject: "บทบาทของคุณในระบบได้รับการอัปเดต",
    heading: "บทบาทได้รับการอัปเดต",
    tone: "success",
    badge: "อัปเดตบทบาท",
    lines: [
      `เรียน ${d.userName},`,
      "บทบาทของคุณในระบบจัดการวันลาได้รับการอัปเดตเรียบร้อยแล้ว",
    ],
    details: [{ label: "บทบาทปัจจุบัน", value: d.roles }],
  }),
  // ── สร้างบัญชีผู้ใช้ใหม่ → ต้อนรับ ──
  WELCOME: (d) => ({
    subject: "ยินดีต้อนรับเข้าสู่ระบบจัดการวันลา คณะวิศวกรรมศาสตร์",
    heading: "บัญชีของคุณพร้อมใช้งานแล้ว",
    tone: "success",
    badge: "บัญชีใหม่",
    lines: [
      `เรียน ${d.userName},`,
      "ผู้ดูแลระบบได้สร้างบัญชีของคุณในระบบจัดการวันลา คณะวิศวกรรมศาสตร์ เรียบร้อยแล้ว",
      `คุณสามารถเข้าสู่ระบบได้ทันทีด้วยบัญชี Google ของมหาวิทยาลัย (<b>${d.email || "-"}</b>) โดยกดปุ่มด้านล่าง`,
    ],
    details: [
      { label: "อีเมลสำหรับเข้าระบบ", value: d.email },
      { label: "ตำแหน่ง", value: d.position },
      { label: "หน่วยงาน", value: d.department },
    ],
  }),
  // ── เตือนผู้อนุมัติที่มีคำขอค้าง ──
  PENDING_REMINDER: (d) => ({
    subject: "แจ้งเตือน: มีคำขอลารอการพิจารณาของคุณ",
    heading: "มีคำขอลารอการดำเนินการ",
    tone: "pending",
    badge: "รอดำเนินการ",
    lines: [
      `เรียน ${d.userName},`,
      `คุณมีคำขอลาที่รอการพิจารณาค้างอยู่ในระบบ <b>${d.count != null ? d.count : ""}</b> รายการ กรุณาเข้าตรวจสอบและดำเนินการโดยเร็ว`,
    ],
    details: [
      { label: "จำนวนคำขอค้าง", value: d.count != null ? `${d.count} รายการ` : null },
      { label: "ค้างนานสุด", value: d.oldestDays != null ? `${d.oldestDays} วัน` : null },
    ],
  }),
};

// alias สำหรับ key ที่เคยเรียกผิด → ชี้ไป key มาตรฐาน (กันพลาดเผื่อมี call site ตกหล่น)
const EVENT_ALIASES = {
  STEP_APPROVER1: "STEP_APPROVED_1",
  STEP_APPROVER2: "STEP_APPROVED_2",
  STEP_APPROVER3: "STEP_APPROVED_3",
  STEP_APPROVER4: "STEP_APPROVED_4",
  REJECTED: "REJECTION",
};

/**
 * สร้างเทมเพลตอีเมลตามประเภทเหตุการณ์
 * @returns {{subject: string, html: string}}
 */
function getEmailTemplate(eventType, data = {}) {
  const key = EVENT_ALIASES[eventType] || eventType;
  const builder = TEMPLATES[key];

  if (!builder) {
    return {
      subject: "แจ้งเตือนจากระบบลาคณะวิศวกรรมศาสตร์",
      html: wrapHtml({
        heading: "แจ้งเตือนจากระบบ",
        tone: "info",
        badge: "แจ้งเตือน",
        lines: ["คุณมีการแจ้งเตือนใหม่ กรุณาตรวจสอบในระบบ"],
      }),
    };
  }

  const { subject, heading, lines, tone, badge, details } = builder(data);
  return { subject, html: wrapHtml({ heading, lines, tone, badge, details }) };
}

/**
 * ส่งอีเมลแจ้งเตือนตามประเภทเหตุการณ์
 * @param {string} eventType ประเภทเหตุการณ์ (ดู TEMPLATES)
 * @param {object} data ต้องมี data.to (อีเมลผู้รับ)
 */
async function sendNotification(eventType, data) {
  if (!data || !data.to) {
    throw createError(400, "ไม่พบที่อยู่อีเมลผู้รับ");
  }
  const template = getEmailTemplate(eventType, data);
  return await sendEmail(data.to, template.subject, template.html);
}

/**
 * ส่งอีเมลแจ้งเตือนแบบ background (ไม่ block / ไม่ throw)
 * ใช้ในขั้นตอนที่ผู้ใช้กำลังรอ response (เช่น approve/reject) เพื่อไม่ให้การส่งอีเมลทำให้ช้า
 * @param {string} eventType
 * @param {object} data ต้องมี data.to
 */
function queueNotification(eventType, data) {
  Promise.resolve()
    .then(() => sendNotification(eventType, data))
    .catch((err) =>
      console.error(`[email] queued notification "${eventType}" failed: ${err.message}`)
    );
}

module.exports = {
  sendEmail,
  sendEmailTest,
  sendNotification,
  queueNotification,
  getEmailTemplate,
  EVENT_ALIASES,
};
