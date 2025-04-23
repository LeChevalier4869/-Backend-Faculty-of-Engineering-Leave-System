const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  // service: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false,
  auth: {
    // type: "OAuth2",
    // user: process.env.EMAIL_USER_RMUTI,
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASS,
    // clientId: process.env.OAUTH_CLIENT_ID_RMUTI,
    // clientSecret: process.env.OAUTH_CLIENT_SECRET_RMUTI,
    // refreshToken: process.env.OAUTH_REFRESH_TOKEN_RMUTI,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

/**
 * ส่งอีเมลแจ้งเตือน (รองรับหลายเหตุการณ์)
 * @param {string} toEmail - อีเมลผู้รับ
 * @param {string} subject - หัวข้ออีเมล
 * @param {string} message - เนื้อหาอีเมล (HTML)
 */

const sendEmail = async (toEmail, subject, message, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const mailOptions = {
        from: `"ระบบจัดการวันลาคณะวิศวกรรมศาสตร์" <${process.env.EMAIL_USER}>`,
        to: toEmail,
        subject,
        html: message,
      };

      const info = await transporter.sendMail(mailOptions);
      console.log("Email sent: " + info.response);
      return info;
    } catch (error) {
      console.error("Error sending email: ", error);
      if (i === retries - 1) throw error;
    }
  }
};

const sendEmailTest = async (toEmail, subject, message) => {
  try {
    const mailOptions = {
      from: `"1+1=?" <${process.env.EMAIL_USER}>`,
      to: toEmail,
      subject,
      html: message,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent: " + info.response);
    return info;
  } catch (error) {
    console.error("Error sending email: ", error);
    throw error;
  }
};

function getEmailTemplate(eventType, data) {
  // data ควรมีข้อมูลที่เกี่ยวข้อง เช่น userName, documentNumber, documentIssuedDate, remarks, etc.
  switch (eventType) {
    case "SUBMISSION":
      return {
        subject: "คำขอลาใหม่รอการอนุมัติ",
        html: `<p>เรียน Approver_1,</p>
            <p>มีคำขอลาใหม่จาก ${data.userName} กรุณาตรวจสอบคำขอลาในระบบ</p>`,
      };
    case "APPROVER1_APPROVED":
      return {
        subject: "คำขอลาได้รับการอนุมัติจากหัวหน้าสาขา",
        html: `<p>เรียน ผู้ตรวจสอบ,</p>
            <p>คำขอลาจาก ${data.userName} ได้รับการอนุมัติจากหัวหน้าสาขา กรุณาตรวจสอบข้อมูล</p>`,
      };
    case "VERIFIER_APPROVED":
      return {
        subject: "คำขอลาได้รับการตรวจสอบจากผู้ตรวจสอบ",
        html: `<p>เรียน ผู้รับหนังสือ,</p>
            <p>คำขอลาจาก ${data.userName} ได้รับการตรวจสอบผ่านจากผู้ตรวจสอบ กรุณาออกเลขที่เอกสาร</p>`,
      };
    case "RECEIVER_ISSUED":
      return {
        subject: "เอกสารคำขอลาออกแล้ว",
        html: `<p>เรียน หัวหน้าคณะ,</p>
            <p>คำขอลาจาก ${data.userName} มีเอกสารออกแล้ว (เลขที่: ${data.documentNumber}, วันที่: ${data.documentIssuedDate}) กรุณาอนุมัติขั้นต่อไป</p>`,
      };
    case "APPROVER2_APPROVED":
      return {
        subject: "คำขอลาได้รับการอนุมัติจากหัวหน้าคณะ",
        html: `<p>เรียน รองคณบดี,</p>
            <p>คำขอลาจาก ${data.userName} ได้รับการอนุมัติจากหัวหน้าคณะ กรุณาตรวจสอบและอนุมัติขั้นต่อไป</p>`,
      };
    case "APPROVER3_APPROVED":
      return {
        subject: "คำขอลาได้รับการอนุมัติจากรองคณบดี",
        html: `<p>เรียน คณบดี,</p>
            <p>คำขอลาจาก ${data.userName} ได้รับการอนุมัติจากรองคณบดี กรุณาตรวจสอบและอนุมัติขั้นสุดท้าย</p>`,
      };
    case "STEP_APPROVED_1":
      return {
        subject: "คำขอลาของคุณได้รับการอนุมัติเรียบร้อยแล้ว จากหัวหน้าสาขา",
        html: `<p>เรียน ${data.userName},</p>
            <p>คำขอลาของคุณได้รับการอนุมัติเรียบร้อยแล้วจากหัวหน้าสาขา กรุณาตรวจสอบในระบบ</p>`,
      };
    case "STEP_APPROVED_2":
      return {
        subject: "คำขอลาของคุณได้รับการอนุมัติเรียบร้อยแล้ว จากผู้ตรวจสอบ",
        html: `<p>เรียน ${data.userName},</p>
            <p>คำขอลาของคุณได้รับการอนุมัติเรียบร้อยแล้วจากผู้ตรวจสอบ กรุณาตรวจสอบในระบบ</p>`,
      };
    case "STEP_APPROVED_3":
      return {
        subject: "คำขอลาของคุณได้รับการอนุมัติเรียบร้อยแล้ว จากหัวหน้าคณะ",
        html: `<p>เรียน ${data.userName},</p>
            <p>คำขอลาของคุณได้รับการอนุมัติเรียบร้อยแล้วจากหัวหน้าคณะ กรุณาตรวจสอบในระบบ</p>`,
      };
    case "STEP_APPROVED_4":
      return {
        subject: "คำขอลาของคุณได้รับการอนุมัติเรียบร้อยแล้ว จากรองคณบดี",
        html: `<p>เรียน ${data.userName},</p>
            <p>คำขอลาของคุณได้รับการอนุมัติเรียบร้อยแล้วจากรองคณบดี กรุณาตรวจสอบในระบบ</p>`,
      };
    case "FULLY_APPROVED":
      return {
        subject: "คำขอลาของคุณได้รับการอนุมัติเรียบร้อยแล้ว",
        html: `<p>เรียน ${data.userName},</p>
            <p>คำขอลาของคุณได้รับการอนุมัติครบทุกขั้นตอนแล้ว ระบบได้ตัดยอดวันลาออกเรียบร้อยแล้ว</p>`,
      };
    case "REJECTION":
      return {
        subject: "คำขอลาของคุณถูกปฏิเสธ",
        html: `<p>เรียน ${data.userName},</p>
            <p>คำขอลาของคุณถูกปฏิเสธด้วยเหตุผล: ${data.remarks}</p>`,
      };
    default:
      return {
        subject: "แจ้งเตือนจากระบบลาคณะวิศวกรรมศาสตร์",
        html: `<p>ข้อมูลแจ้งเตือน</p>`,
      };
  }
}

// ฟังก์ชันส่ง notification อีเมลตาม event type
async function sendNotification(eventType, data) {
  const template = getEmailTemplate(eventType, data);
  if (!data.to) {
    throw createError(400, "ไม่พบที่อยู่อีเมลผู้รับ");
  }
  return await sendEmail(data.to, template.subject, template.html);
}

module.exports = {
  sendEmail,
  sendEmailTest,
  sendNotification,
  getEmailTemplate,
};
