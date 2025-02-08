const TestService = require('../services/test-service');
const UserService = require('../services/user-service');
const createError = require('../utils/createError');
const { sendEmailTest } = require('../utils/emailService');

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