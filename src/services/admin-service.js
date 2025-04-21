const prisma = require("../config/prisma");
const createError = require("../utils/createError");
const LeaveRequestService = require("./leaveRequest-service");
const { calculateWorkingDays } = require("../utils/dateCalculate");
const LeaveBalanceService = require("./leaveBalance-service");
const nodemailer = require("nodemailer");

class AdminService {
  // ✅ ดึงรายชื่อผู้ใช้งานที่มี role ADMIN
  static async getAdminList() {
    return await prisma.user.findMany({
      where: {
        userRoles: {
          some: {
            role: {
              name: "ADMIN",
            },
          },
        },
      },
      select: {
        id: true,
        prefixName: true,
        firstName: true,
        lastName: true,
        email: true,
        position: true,
      },
    });
  }

  // ✅ สร้างคำขอลาแทนผู้ใช้งาน (ใช้โดย ADMIN เท่านั้น)
  static async createLeaveRequestForUser(data, adminId = null) {
    const {
      userId,
      leaveTypeId,
      startDate,
      endDate,
      reason,
      isEmergency,
      verifierId,
      receiverId,
      contact,
    } = data;

    if (!userId || !leaveTypeId || !startDate || !endDate) {
      throw createError(400, "ข้อมูลไม่ครบถ้วน");
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const requestedDays = await calculateWorkingDays(start, end);
    if (requestedDays <= 0) throw createError(400, "จำนวนวันลาต้องมากกว่า 0");

    const eligibility = await LeaveRequestService.checkEligibility(
      userId,
      leaveTypeId,
      requestedDays
    );
    if (!eligibility.success) throw createError(400, eligibility.message);

    const leaveRequest = await prisma.leaveRequest.create({
      data: {
        userId,
        leaveTypeId,
        startDate: start,
        endDate: end,
        reason,
        isEmergency: Boolean(isEmergency),
        verifierId,
        receiverId,
        contact,
        status: "APPROVED",
        leavedDays: requestedDays,
        thisTimeDays: requestedDays,
        totalDays: eligibility.balance.usedDays + requestedDays,
        balanceDays: eligibility.balance.remainingDays,
        documentNumber: `ADM-${Date.now()}`,
        documentIssuedDate: new Date(),
      },
    });

    await LeaveBalanceService.finalizeLeaveBalance(
      userId,
      leaveTypeId,
      requestedDays
    );

    await prisma.leaveRequestDetail.create({
      data: {
        leaveRequestId: leaveRequest.id,
        approverId: adminId || 0,
        stepOrder: 0,
        status: "APPROVED",
        reviewedAt: new Date(),
        remarks: "บันทึกโดยผู้ดูแลระบบ",
      },
    });

    if (adminId) {
      await AuditLogService.createLog(
        adminId,
        "AdminCreateLeave",
        leaveRequest.id,
        `Admin created leave for userId=${userId}`
      );
    }
    return leaveRequest;
  }

  // ✅ จัดการวันหยุด
  static async createHoliday({
    date,
    description,
    fiscalYear,
    isRecurring = false,
    holidayType,
  }) {
    return await prisma.holiday.create({
      data: {
        date: new Date(date),
        description,
        fiscalYear,
        isRecurring,
        holidayType,
      },
    });
  }
  static async getHoliday() {
    return await prisma.holiday.findMany({
      orderBy: { date: "asc" },
    });
  }
  static async updateHolidayById(holidayId, updateData) {
    const existingHoliday = await prisma.holiday.findUnique({
      where: { id: holidayId },
    });

    if (!existingHoliday) {
      throw createError(404, "Holiday not found");
    }

    return await prisma.holiday.update({
      where: { id: holidayId },
      data: updateData,
    });
  }
  static async deleteHoliday(holidayId) {
    const existingHoliday = await prisma.holiday.findUnique({
      where: { id: holidayId },
    });

    if (!existingHoliday) {
      throw createError(404, "Holiday not found");
    }
    return await prisma.holiday.delete({
      where: { id: holidayId },
    });
  }

  //---------------------- Approver -------------
  static async approverList() {
    return await prisma.approver.findMany();
  }
  static async createApprover(name) {
    return await prisma.approver.create({ data: { name } });
  }
  static async updateApprover(id, name) {
    return await prisma.approver.update({
      where: { id },
      data: {
        name: name,
      },
    });
  }
  static async deleteApprover(id) {
    return await prisma.approver.delete({
      where: { id },
    });
  }

  //------------------------ Department -------------
  static async departmentList() {
    return await prisma.department.findMany();
  }
  static async createDepartment(data) {
    return await prisma.department.create({ data });
  }
  static async updateDepartment(data) {
    const { id, name, organizationId, appointDate, headId } = data;
    return await prisma.department.update({
      where: { id },
      data: { name, organizationId, appointDate, headId },
    });
  }

  static async deleteDepartment(id) {
    return await prisma.department.delete({
      where: { id },
    });
  }

  //------------------------ Organization -----------
  static async organizationList() {
    return await prisma.organization.findMany();
  }
  static async createOrganization(name) {
    return await prisma.organization.create({ data: { name } });
  }
  static async updateOrganization(id, name) {
    return await prisma.organization.update({
      where: { id },
      data: {
        name,
      },
    });
  }
  static async deleteOrganization(id) {
    return await prisma.organization.delete({
      where: { id },
    });
  }
  static async getOrganizationById(id) {
    return await prisma.organization.findUnique({
      where: { id },
    });
  }

  //------------------------ Role -----------
  static async roleList() {
    return await prisma.role.findMany();
  }
  static async createRole(name) {
    return await prisma.role.create({ data: { name } });
  }
  static async updateRole(id, name) {
    return await prisma.role.update({
      where: { id },
      data: {
        name,
      },
    });
  }
  static async deleteRole(id) {
    return await prisma.role.delete({
      where: { id },
    });
  }
  static async getRoleById(id) {
    return await prisma.role.findUnique({
      where: { id },
    });
  }

  static async assignHead(departmentId, headId) {
    const department = await prisma.department.findUnique({
      where: { id: departmentId },
    });
    if (!department) throw createError(404, "Department not found");

    const user = await prisma.user.findUnique({
      where: { id: headId },
    });
    if (!user) throw createError(404, "User not found");

    const updated = await prisma.department.update({
      where: { id: departmentId },
      data: { headId },
      include: { head: true },
    });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER_RMUTI2,
        pass: process.env.EMAIL_APP_PASS2,
      },
    });

    const email = user.email;

    await transporter.sendMail({
      from: `"ระบบลาคณะวิศวกรรมศาสตร์" <${process.env.EMAIL_USER_RMUTI2}>`,
      to: email,
      subject: `คุณได้รับการแต่งตั้งเป็นหัวหน้าสาขา`,
      html: `
        <p>เรียนคุณ ${user.firstName} ${user.lastName},</p>
        <p>คุณได้รับการแต่งตั้งเป็นหัวหน้าสาขา ${department.name} ในระบบลาคณะวิศวกรรมศาสตร์ เรียบร้อยแล้ว</p>
        <p>ขอแสดงความยินดี!</p>
        <p>จากระบบการจัดการของคณะวิศวกรรมศาสตร์</p>
      `,
    });

    return updated;
  }

  //------------ Manage User -----------

  static async deleteUserById(userId) {
    // ✅ ตรวจว่ามีผู้ใช้จริง
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw createError(404, "User not found");

    // ตัวอย่าง: ไม่ให้ลบตัวเองหรือ ADMIN คนสุดท้าย
    // (ตัดทิ้งได้ถ้าไม่จำเป็น)
    // const adminCount = await prisma.user.count({
    //   where: { userRoles: { some: { role: { name: "ADMIN" } } } }
    // });
    // if (adminCount === 1 && existing.userRoles.some(r => r.role.name === "ADMIN"))
    //   throw createError(400, "Cannot delete the last ADMIN");

    // 🔥 ลบ – ถ้ามี FK ต้องใส่ `onDelete: Cascade` ใน schema หรือจัดการ manual cleaning
    await prisma.user.delete({ where: { id: userId } });

    // (ถ้ามี audit log)
    // await AuditLogService.createLog(adminId, "AdminDeleteUser", userId, `Deleted user ${userId}`);

    return { message: "User deleted successfully" };
  }
}


module.exports = AdminService;