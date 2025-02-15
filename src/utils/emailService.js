const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    service: 'gmail',
    port: process.env.EMAIL_PORT,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASS
    },
    tls: {
        rejectUnauthorized: false
    }
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
                html: message
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
            html: message
        };

        const info = await transporter.sendMail(mailOptions);
        console.log("Email sent: " + info.response);
        return info;
    } catch (error) {
        console.error("Error sending email: ", error);
        throw error;
    }
};

module.exports = { sendEmail, sendEmailTest };