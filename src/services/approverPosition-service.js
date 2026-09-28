const prisma = require("../config/prisma");
const createError = require("../utils/createError");

/**
 * ทะเบียนผู้ดำรงตำแหน่งผู้อนุมัติระดับคณะ (ApproverPosition)
 *
 * หมายเหตุสำคัญ:
 * - "แหล่งความจริง" ที่เครื่องยนต์อนุมัติใช้จริงคือ UserRole ทุกครั้งที่แก้ทะเบียนนี้
 *   จึงต้อง sync UserRole ไปพร้อมกันใน transaction เดียวเสมอ
 * - ระดับ 1 (APPROVER_1 / หัวหน้าสาขา) ไม่เก็บที่นี่ เพราะผูกกับ Department.headId
 *   ซึ่งมีได้หลายคนตามจำนวนสาขา — จัดการผ่าน /admin/assign-head
 */
const FACULTY_LEVELS = {
  2: { roleName: "APPROVER_2", label: "สารบรรณคณะ" },
  3: { roleName: "APPROVER_3", label: "หัวหน้าสำนักงานคณบดี" },
  4: { roleName: "APPROVER_4", label: "รองคณบดีฝ่ายบริหาร" },
  5: { roleName: "APPROVER_5", label: "คณบดี" },
};

// ระดับผู้อนุมัติ -> stepOrder ของ LeaveRequestDetail
const STEP_BY_LEVEL = { 2: 2, 3: 4, 4: 5, 5: 6 };

const USER_PICK = {
  id: true,
  prefixName: true,
  firstName: true,
  lastName: true,
  email: true,
  position: true,
  department: { select: { id: true, name: true } },
};

class ApproverPositionService {
  static get facultyLevels() {
    return FACULTY_LEVELS;
  }

  static assertFacultyLevel(level) {
    const meta = FACULTY_LEVELS[level];
    if (!meta) {
      throw createError(
        400,
        `ระดับผู้อนุมัติไม่ถูกต้อง (รองรับ ${Object.keys(FACULTY_LEVELS).join(", ")})`
      );
    }
    return meta;
  }

  /** หน่วยงานหลักที่ใช้บันทึกทะเบียน (ระบบนี้ใช้คณะเดียวเป็นหลัก) */
  static async getDefaultOrganizationId() {
    const org = await prisma.organization.findFirst({ orderBy: { id: "asc" } });
    if (!org) throw createError(400, "ยังไม่มีข้อมูลหน่วยงานในระบบ");
    return org.id;
  }

  /**
   * ผู้ดำรงตำแหน่งปัจจุบันของทุกระดับคณะ
   * ส่งทั้งข้อมูลทะเบียน (position) และผู้ถือ role จริง (roleHolders)
   * เพื่อให้ UI เตือนได้เมื่อทั้งสองไม่ตรงกัน
   */
  static async listCurrent() {
    const levels = Object.keys(FACULTY_LEVELS).map(Number);

    const [positions, roles] = await Promise.all([
      prisma.approverPosition.findMany({
        where: { level: { in: levels }, isActive: true },
        include: { user: { select: USER_PICK } },
        orderBy: { appointDate: "desc" },
      }),
      prisma.role.findMany({
        where: {
          name: { in: levels.map((l) => FACULTY_LEVELS[l].roleName) },
        },
        include: {
          userRoles: { include: { user: { select: USER_PICK } } },
        },
      }),
    ]);

    const roleByName = new Map(roles.map((r) => [r.name, r]));

    return levels.map((level) => {
      const { roleName, label } = FACULTY_LEVELS[level];
      const position = positions.find((p) => p.level === level) || null;
      const roleHolders = (roleByName.get(roleName)?.userRoles || []).map(
        (ur) => ur.user
      );

      // ทะเบียนตรงกับสิทธิ์จริงหรือไม่ (ต้องมีผู้ถือ role คนเดียวและตรงกับทะเบียน)
      const inSync =
        roleHolders.length === 1 &&
        !!position &&
        roleHolders[0].id === position.userId;

      return {
        level,
        roleName,
        label,
        position,
        holder: position?.user || null,
        roleHolders,
        inSync,
      };
    });
  }

  /** ประวัติการดำรงตำแหน่งของระดับที่ระบุ (ล่าสุดก่อน) */
  static async history(level) {
    this.assertFacultyLevel(level);
    return prisma.approverPosition.findMany({
      where: { level },
      include: { user: { select: USER_PICK } },
      orderBy: [{ isActive: "desc" }, { appointDate: "desc" }],
    });
  }

  /**
   * แต่งตั้งผู้ดำรงตำแหน่งระดับคณะ (แทนที่คนเดิมถ้ามี)
   * ทำใน transaction เดียว: ปิดทะเบียนเดิม → ถอด role คนเดิม → เปิดทะเบียนใหม่ → ให้ role คนใหม่
   */
  static async assign(level, userId) {
    const { roleName, label } = this.assertFacultyLevel(level);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw createError(404, "ไม่พบผู้ใช้งานที่ระบุ");

    const role = await prisma.role.findFirst({ where: { name: roleName } });
    if (!role) throw createError(400, `ไม่พบบทบาท ${roleName} ในระบบ`);

    const organizationId = await this.getDefaultOrganizationId();
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const active = await tx.approverPosition.findMany({
        where: { level, isActive: true },
      });

      // ปิดทะเบียนของผู้ดำรงตำแหน่งเดิม
      if (active.length) {
        await tx.approverPosition.updateMany({
          where: { id: { in: active.map((a) => a.id) } },
          data: { isActive: false, endDate: now },
        });
      }

      // ถอดบทบาทจากคนเดิมที่ไม่ใช่คนใหม่
      const previousUserIds = [
        ...new Set(active.map((a) => a.userId)),
      ].filter((id) => id !== userId);
      if (previousUserIds.length) {
        await tx.userRole.deleteMany({
          where: { userId: { in: previousUserIds }, roleId: role.id },
        });
      }

      // เก็บกวาดผู้ถือบทบาทที่ไม่มีทะเบียนรองรับ (ข้อมูลเก่าก่อนมีระบบทะเบียน)
      await tx.userRole.deleteMany({
        where: { roleId: role.id, userId: { not: userId } },
      });

      const position = await tx.approverPosition.create({
        data: {
          userId,
          organizationId,
          level,
          appointDate: now,
          isActive: true,
        },
        include: { user: { select: USER_PICK } },
      });

      await tx.userRole.createMany({
        data: [{ userId, roleId: role.id }],
        skipDuplicates: true,
      });

      const transferred = await this.reassignPendingSteps(level, tx);

      return { position, roleName, label, transferred };
    });
  }

  /**
   * โอนคำขอที่ค้างอยู่ขั้นของระดับนี้ ไปให้ผู้ถือบทบาทปัจจุบัน
   *
   * คิวอนุมัติกรองด้วย "approverId ที่บันทึกไว้ ∈ ผู้ถือบทบาทตอนนี้" เมื่อเปลี่ยนตัวผู้ดำรงตำแหน่ง
   * คำขอที่บันทึก approverId เป็นคนเดิมจึงหลุดคิวทั้งของคนเดิม (ถูกถอด role) และคนใหม่
   * — แบบเดียวกับที่ assignHead ทำกับขั้นหัวหน้าสาขา
   * ไม่ตัดผู้ยื่นออก (สอดคล้องกับ pickNextApprover: แต่ละบทบาทมีผู้ถือคนเดียว)
   */
  static async reassignPendingSteps(level, client = prisma) {
    const meta = FACULTY_LEVELS[level];
    const stepOrder = STEP_BY_LEVEL[level];
    if (!meta || !stepOrder) return 0;

    const holders = await client.userRole.findMany({
      where: { role: { name: meta.roleName } },
      select: { userId: true },
      orderBy: { id: "asc" },
    });
    // ไม่มีผู้ดำรงตำแหน่ง — ปล่อยไว้ รอแต่งตั้งคนใหม่แล้วค่อยโอน
    if (!holders.length) return 0;

    const holderIds = holders.map((h) => h.userId);
    const targetId = holderIds[0];

    const moved = await client.leaveRequestDetail.updateMany({
      where: {
        stepOrder,
        status: "PENDING",
        approverId: { notIn: holderIds },
        leaveRequest: { status: "PENDING" },
      },
      data: { approverId: targetId },
    });

    // ผู้ตรวจสอบที่แสดงบนใบลา (verifierId) ให้ตรงกับผู้ถือบทบาทปัจจุบันด้วย
    if (level === 2) {
      await client.leaveRequest.updateMany({
        where: { status: "PENDING", verifierId: { notIn: holderIds } },
        data: { verifierId: targetId },
      });
    }

    return moved.count;
  }

  /** ปลดผู้ดำรงตำแหน่งระดับที่ระบุ (ไม่มีผู้รับผิดชอบ) */
  static async vacate(level) {
    const { roleName } = this.assertFacultyLevel(level);

    const role = await prisma.role.findFirst({ where: { name: roleName } });
    if (!role) throw createError(400, `ไม่พบบทบาท ${roleName} ในระบบ`);

    const now = new Date();

    return prisma.$transaction(async (tx) => {
      const active = await tx.approverPosition.findMany({
        where: { level, isActive: true },
      });

      if (active.length) {
        await tx.approverPosition.updateMany({
          where: { id: { in: active.map((a) => a.id) } },
          data: { isActive: false, endDate: now },
        });
      }

      // ถอดบทบาทออกจากทุกคนที่ถืออยู่ เพื่อให้ทะเบียนกับสิทธิ์ตรงกัน
      const removed = await tx.userRole.deleteMany({
        where: { roleId: role.id },
      });

      return { closed: active.length, rolesRemoved: removed.count };
    });
  }
}

module.exports = ApproverPositionService;
