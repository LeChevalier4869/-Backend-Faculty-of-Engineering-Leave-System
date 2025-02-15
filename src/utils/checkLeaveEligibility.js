const prisma = require("../config/prisma.js");

async function checkLeaveEligibility(userId, leaveTypeId, requestedDays) {
    const user = await prisma.users.findUnique({
        where: { id: userId },
        include: { personneltypes: true, leavebalances: true },
    });

    if (!user) throw new Error("ไม่พบข้อมูลผู้ใช้งาน"); 

    const { name: personnelType } = user.personneltypes;
    
    const balance = await prisma.leavebalances.findFirst({
        where: { userId, leaveTypeId },
    });

    if (!balance) throw new Error("ไม่พบข้อมูลสิทธิ์การลา");

    let maxDaysAllowed = 0;
    let hireMonths = Math.floor((new Date() - user.hireDate) / (30 * 24 * 60 * 60 * 1000));

    switch (leaveTypeId) {
        case 1: //ลาป่วย
            if (["ข้าราชการพลเรือนในสถาบันอุดมศึกษา", "ลูกจ้างประจำ", "พนักงานในสถาบันอุดมศึกษา"].includes(personnelType)) {
                maxDaysAllowed = 60;
            } else if (personnelType === "พนักงานราชการ") {
                maxDaysAllowed = 30;
            } else if (personnelType === "ลูกจ้างเงินรายได้") {
                maxDaysAllowed = hireMonths < 6 ? 8 : 15;
            }
            break;

        case 2: //ลากิจส่วนตัว
            if (["ข้าราชการพลเรือนในสถาบันอุดมศึกษา", "ลูกจ้างประจำ", "พนักงานในสถาบันอุดมศึกษา"].includes(personnelType)) {
                maxDaysAllowed = 45;
            } else if (personnelType === "พนักงานราชการ") {
                maxDaysAllowed = hireMonths < 6 ? 0 : 10;
            }
            break;

        case 3: //ลาพักผ่อน
            if (["ข้าราชการพลเรือนในสถาบันอุดมศึกษา", "ลูกจ้างประจำ", "พนักงานในสถาบันอุดมศึกษา"].includes(personnelType)) {
                if (hireMonths < 6) maxDaysAllowed = 0;
                else if (hireMonths < 120) maxDaysAllowed = 20;
                else maxDaysAllowed = 30;
            } else if (personnelType === "พนักงานราชการ") {
                maxDaysAllowed = hireMonths < 6 ? 0 : 15;
            } else if (personnelType === "ลูกจ้างเงินรายได้") {
                maxDaysAllowed = hireMonths < 6 ? 0 : 10;
            }
            break;

        default:
            throw new Error("ประเภทการลาไม่ถูกต้อง");
    }

    if (requestedDays > maxDaysAllowed) {
        throw new Error(`สิทธิ์การลาเกินกว่ากำหนด (${maxDaysAllowed} วัน)`);
    }

    return { success: true, message: `สามารถลาได้ ${requestedDays} วัน` };
}

module.exports = { checkLeaveEligibility };