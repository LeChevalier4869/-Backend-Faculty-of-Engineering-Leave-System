const TestService = require('../services/test-service');
const UserService = require('../services/user-service');
const createError = require('../utils/createError');
const { sendEmailTest, getEmailTemplate } = require('../utils/emailService');

// รายชื่อ event ทั้งหมดของระบบแจ้งเตือนอีเมล (ใช้สำหรับทดสอบส่งทุกเทมเพลต)
const ALL_EMAIL_EVENTS = [
  'SUBMISSION',
  'SUBMISSION_CONFIRM',
  'APPROVER1_APPROVED',
  'VERIFIER_APPROVED',
  'APPROVER2_APPROVED',
  'APPROVER3_APPROVED',
  'STEP_APPROVED_1',
  'STEP_APPROVED_2',
  'STEP_APPROVED_3',
  'STEP_APPROVED_4',
  'FULLY_APPROVED',
  'REJECTION',
  'CANCELLATION',
  'PROXY_ASSIGNED',
  'PROXY_CANCELLED',
  'ROLE_UPDATED',
];

exports.sendEmailTest = async (req, res, next) => {
    const userId = parseInt(req.params.id);

    try {
        if (!userId) {
            console.log("Debug userId: ", userId);
            return createError(400, 'User ID is empty');
        }

        if (isNaN(userId) || typeof userId !== 'number') {
            console.log("Debug userId: ", userId);
            return createError(400, 'User ID is not a number');
        }

        //send email
        const user = await UserService.getUserByIdWithRoles(userId);

        if (user) {
            const userEmail = user.email;
            const userName = `${user.prefixName} ${user.firstName} ${user.lastName}`;
            // const userEmail = 'sutthipong.th@rmuti.ac.th';
            // const userName = 'บอทหมายเลข 381';
            const subject = "ห้ามอ่านโดยไม่ได้รับอนุญาต!";
            const message = `
                <h3>สวัสดี ${userName}</h3>
                <p>แอบเล่นเกมอยู่หรือเปล่า</p>
                <br/>
                <p>โปรดระวังตัว</p>
                <p>ระบบ CCTV ใต้โต๊ะ</p>
            `;
            await sendEmailTest(userEmail, subject, message);
        }

        res.status(200).json({ message: "test completed" });
    } catch (err) {
        next(err);
    }
}

exports.sendEmailTest2 = async (req, res, next) => {
    try {
        await sendEmailTest(
            'assawin.in@rmuti.ac.th', // เปลี่ยนเป็นอีเมลผู้รับที่ต้องการ
            'ทดสอบส่งอีเมลผ่าน SendGrid SMTP',
            '<p>สวัสดี นี่คืออีเมลทดสอบจากระบบ eLeave</p>'
        );
        res.status(200).json({ message: 'ส่งอีเมลสำเร็จ' });
    } catch (err) {
        console.error('ส่งอีเมลไม่สำเร็จ:', err);
        next(err);
    }
};

/**
 * ทดสอบส่งอีเมลทุกเทมเพลตไปยังอีเมลที่ระบุ (default: assawin.in@rmuti.ac.th)
 * POST /test/send-all-templates  body: { email?: string }
 * คืนผลรายเทมเพลตว่าส่งสำเร็จ/ล้มเหลว
 */
exports.sendAllTemplates = async (req, res, next) => {
    try {
        const email =
            (req.body && req.body.email) ||
            req.query.email ||
            'assawin.in@rmuti.ac.th';

        // ข้อมูลตัวอย่างสำหรับเติมลงเทมเพลต (ครอบทุก field ที่เทมเพลตใช้)
        const sampleData = {
            to: email,
            userName: 'นายทดสอบ ระบบ',
            requesterName: 'นางสาวสมหญิง ใจดี',
            requestedDays: 3,
            reason: 'ลากิจไปทำธุระส่วนตัว',
            contact: '081-234-5678',
            remarks: 'เอกสารหลักฐานไม่ครบถ้วน',
            proxyApprover: 'นายผู้รับมอบอำนาจ แทนที่',
            originalApprover: 'นายหัวหน้าสาขา ตัวจริง',
            documentNumber: 'ENG-2569-0042',
            leaveTypeName: 'ลากิจส่วนตัว',
            dateRange: '10/06/2569 - 12/06/2569',
            originalApproverName: 'นายหัวหน้าสาขา ตัวจริง',
            levelLabel: 'หัวหน้าสาขา (ผู้อนุมัติระดับ 1)',
            period: '10/06/2569 - 12/06/2569',
            roles: 'ADMIN, APPROVER_1',
        };

        const results = [];
        for (const event of ALL_EMAIL_EVENTS) {
            const tpl = getEmailTemplate(event, sampleData);
            try {
                await sendEmailTest(
                    email,
                    `[ทดสอบ ${event}] ${tpl.subject}`,
                    tpl.html
                );
                results.push({ event, status: 'sent' });
            } catch (e) {
                results.push({ event, status: 'failed', error: e.message });
            }
        }

        const failed = results.filter((r) => r.status === 'failed').length;
        res.status(200).json({
            email,
            total: ALL_EMAIL_EVENTS.length,
            sent: results.length - failed,
            failed,
            results,
        });
    } catch (err) {
        next(err);
    }
};