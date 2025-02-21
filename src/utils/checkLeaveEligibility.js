const prisma = require("../config/prisma.js");

async function checkLeaveEligibility(userId, leaveTypeId, requestedDays) {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    include: { personneltypes: true, leavebalances: true },
  });

  let leaveTypeIdInt = parseInt(leaveTypeId);

  if (!user) throw new Error("ไม่พบข้อมูลผู้ใช้งาน");

  const { name: personnelType } = user.personneltypes;

  const balance = await prisma.leavebalances.findFirst({
    where: { userId, leaveTypeId: leaveTypeIdInt },
  });

  if (!balance) throw new Error("ไม่พบข้อมูลสิทธิ์การลา");

  let maxDaysAllowed = 0;
  let hireMonths = Math.floor(
    (new Date() - user.hireDate) / (30 * 24 * 60 * 60 * 1000)
  );

  switch (leaveTypeIdInt) {
    case 1: //ลาป่วย
      if (
        [
          "ข้าราชการพลเรือนในสถาบันอุดมศึกษา",
          "ลูกจ้างประจำ",
          "พนักงานในสถาบันอุดมศึกษา",
        ].includes(personnelType)
      ) {
        maxDaysAllowed = 60;
      } else if (personnelType === "พนักงานราชการ") {
        maxDaysAllowed = 30;
      } else if (personnelType === "ลูกจ้างเงินรายได้") {
        maxDaysAllowed = hireMonths < 6 ? 8 : 15;
      }
      break;

    case 2: //ลากิจส่วนตัว
      if (
        [
          "ข้าราชการพลเรือนในสถาบันอุดมศึกษา",
          "ลูกจ้างประจำ",
          "พนักงานในสถาบันอุดมศึกษา",
        ].includes(personnelType)
      ) {
        maxDaysAllowed = 45;
      } else if (personnelType === "พนักงานราชการ") {
        maxDaysAllowed = hireMonths < 6 ? 0 : 10;
      }
      break;

    case 3: //ลาพักผ่อน
      if (
        [
          "ข้าราชการพลเรือนในสถาบันอุดมศึกษา",
          "ลูกจ้างประจำ",
          "พนักงานในสถาบันอุดมศึกษา",
        ].includes(personnelType)
      ) {
        if (hireMonths < 6) maxDaysAllowed = 0;
        else if (hireMonths < 120) maxDaysAllowed = 20;
        else maxDaysAllowed = 30;
      } else if (personnelType === "พนักงานราชการ") {
        maxDaysAllowed = hireMonths < 6 ? 0 : 15;
      } else if (personnelType === "ลูกจ้างเงินรายได้") {
        maxDaysAllowed = hireMonths < 6 ? 0 : 10;
      }
      break;
    
    // // ตั้งแต่ case 4 admin จะเป็นคนคีย์ข้อมูล
    // case 4: // ลาคลอดบุตร
    //   maxDaysAllowed = 90;
    //   break;

    // case 5: // ลาช่วยภริยาที่คลอดบุตร
    //   if (!["ลูกจ้างเงินรายได้"].includes(personnelType)) {
    //     maxDaysAllowed = 15;
    //   } else {

    //   }
    //   break;

    // case 6: // ลาอุปสมบท หรือประกอบพิธีฮัจย์
    //   if (["ข้าราชการพลเรือนในสถาบันอุดมศึกษา"].includes(personnelType)) {
    //     maxDaysAllowed = 120;
    //   } else {
    //     throw new Error("ประเภทบุคลากรนี้ไม่มีสิทธิ์ลาอุปสมบทหรือฮัจย์");
    //   }
    //   break;

    // case 8: // ลาเข้ารับการตรวจเลือกหรือเข้ารับการเตรียมพล
    //   maxDaysAllowed = 1;
    //   break;

    default:
      throw new Error("ประเภทการลาไม่ถูกต้อง");
  }

  if (requestedDays > maxDaysAllowed) {
    throw new Error(`สิทธิ์การลาเกินกว่ากำหนด (${maxDaysAllowed} วัน)`);
  }

  const departmentId = await prisma.users.findUnique({
    where: { id: userId },
    select: {
      departmentId: true,
    },
  });

  return {
    success: true,
    message: `สามารถลาได้ ${requestedDays} วัน`,
    departmentId: departmentId,
  };
}

module.exports = { checkLeaveEligibility };
