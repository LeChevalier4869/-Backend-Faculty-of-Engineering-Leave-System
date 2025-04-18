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
    return await prisma.organization.create({ data: { name } });
  }
  static async updateOrganization(id, name) {
    return await prisma.organization.update({
      where: { id: parseInt(id) },
      data: { name },
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
    return await prisma.personnelType.create({ data: { name} });
  }
  static async updatePersonnelType(id, name) {
    return await prisma.personnelType.update({
      where: { id },
      data: {
        name
      },
    });
  }
  static async deletePersonnelType(id) {
    return await prisma.personnelType.delete({
      where: { id },
    });
  }
}

module.exports = OrgAndDeptService;
