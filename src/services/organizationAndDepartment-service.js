const prisma = require("../config/prisma");
const createError = require("../utils/createError");

// This is organization and department services.
class OrgAndDeptService {
  // Organization -----------------------------------
  static async getAllOrganizations() {
    return await prisma.organization.findMany();
  }

  static async getOrganizationById(id) {
    return await prisma.organization.findUnique({
      where: { id: parseInt(id) },
    });
  }

  static async createOrganization(name) {
    const clean = String(name || "").trim();
    if (!clean) throw createError(400, "กรุณาระบุชื่อองค์กร");
    const existing = await prisma.organization.findFirst({ where: { name: clean } });
    if (existing) throw createError(409, `มีองค์กรชื่อ "${clean}" อยู่แล้ว`);
    return await prisma.organization.create({ data: { name: clean } });
  }

  static async updateOrganization(id, name) {
    const clean = String(name || "").trim();
    if (!clean) throw createError(400, "กรุณาระบุชื่อองค์กร");
    const dup = await prisma.organization.findFirst({
      where: { name: clean, NOT: { id: parseInt(id) } },
    });
    if (dup) throw createError(409, `มีองค์กรชื่อ "${clean}" อยู่แล้ว`);
    return await prisma.organization.update({
      where: { id: parseInt(id) },
      data: { name: clean },
    });
  }

  static async deleteOrganization(id) {
    return await prisma.organization.delete({
      where: { id: parseInt(id) },
    });
  }

  // Department --------------------------------------
  static async getAllDepartments() {
    return await prisma.department.findMany({
      include: {
        head: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        organization: true, // รวมข้อมูลขององค์กร
      },
    });
  }

  static async getDepartmentById(id) {
    return await prisma.department.findUnique({
      where: { id: parseInt(id) }, // ตรวจสอบให้แน่ใจว่า id เป็น Int
      include: {
        head: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        organization: true,
      },
    });
  }

  static async createDepartment(data) {
    return await prisma.department.create({
      data,
    });
  }

  static async updateDepartment(id, data) {
    if (data.headId) {
      const headExists = await prisma.user.findUnique({
        where: { id: data.headId },
      });
      if (!headExists) {
        throw createError(400, "ไม่พบผู้ใช้งานที่เป็นหัวหน้าของแผนก");
      }
    }
    return await prisma.department.update({
      where: { id: parseInt(id) }, // ตรวจสอบให้แน่ใจว่า id เป็น Int
      data,
    });
  }

  static async deleteDepartment(id) {
    return await prisma.department.delete({
      where: { id: parseInt(id) }, // ตรวจสอบให้แน่ใจว่า id เป็น Int
    });
  }

  // PersonnelType ------------------------------------
  static async getAllPersonnelTypes() {
    return await prisma.personnelType.findMany();
  }

  static async getPersonnelTypeById(id) {
    return await prisma.personnelType.findUnique({
      where: { id },
    });
  }

  static async createPersonnelType(name) {
    const clean = String(name || "").trim();
    if (!clean) throw createError(400, "กรุณาระบุชื่อประเภทบุคลากร");
    const existing = await prisma.personnelType.findFirst({ where: { name: clean } });
    if (existing) throw createError(409, `มีประเภทบุคลากรชื่อ "${clean}" อยู่แล้ว`);
    return await prisma.personnelType.create({ data: { name: clean } });
  }

  static async updatePersonnelType(id, name) {
    const clean = String(name || "").trim();
    if (!clean) throw createError(400, "กรุณาระบุชื่อประเภทบุคลากร");
    const dup = await prisma.personnelType.findFirst({
      where: { name: clean, NOT: { id: parseInt(id) } },
    });
    if (dup) throw createError(409, `มีประเภทบุคลากรชื่อ "${clean}" อยู่แล้ว`);
    return await prisma.personnelType.update({
      where: { id: parseInt(id) },
      data: { name: clean },
    });
  }

  static async deletePersonnelType(id) {
    return await prisma.personnelType.delete({
      where: { id },
    });
  }

  // ---------- Relation counts ----------

  // นับ relations ของ Organization ก่อนลบ
  static async countOrganizationRelations(organizationId) {
    const [departmentCount, approverPositionCount] = await Promise.all([
      prisma.department.count({ where: { organizationId } }),
      prisma.approverPosition.count({ where: { organizationId } }),
    ]);
    return { departmentCount, approverPositionCount };
  }

  // นับ User ที่สังกัด Department
  static async countUsersByDepartmentId(departmentId) {
    return await prisma.user.count({ where: { departmentId } });
  }

  // นับ relations ของ PersonnelType ก่อนลบ
  static async countPersonnelTypeRelations(personnelTypeId) {
    const [userCount, rankCount] = await Promise.all([
      prisma.user.count({ where: { personnelTypeId } }),
      prisma.rank.count({ where: { personnelTypeId } }),
    ]);
    return { userCount, rankCount };
  }

  // นับ Rank config ของ PersonnelType
  static async countRanksByPersonnelTypeId(personnelTypeId) {
    return await prisma.rank.count({ where: { personnelTypeId } });
  }
}

module.exports = OrgAndDeptService;
