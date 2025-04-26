const prisma = require("../config/prisma");
const createError = require("../utils/createError");

// This is organization and department services.
class OrgAndDeptService {
  // Organization -----------------------------------
  static async getAllOrganizations() {
    return await prisma.Organization.findMany();
  }

  static async getOrganizationById(id) {
    return await prisma.Organization.findUnique({
      where: { id: parseInt(id) },
    });
  }

  static async createOrganization(name) {
    return await prisma.Organization.create({ data: { name } });
  }

  static async updateOrganization(id, name) {
    return await prisma.Organization.update({
      where: { id: parseInt(id) },
      data: { name },
    });
  }

  static async deleteOrganization(id) {
    return await prisma.Organization.delete({
      where: { id: parseInt(id) },
    });
  }

  // Department --------------------------------------
  static async getAllDepartments() {
    return await prisma.Department.findMany({
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
    return await prisma.Department.findUnique({
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
    return await prisma.Department.create({
      data,
    });
  }

  static async updateDepartment(id, data) {
    if (data.headId) {
      const headExists = await prisma.User.findUnique({
        where: { id: data.headId },
      });
      if (!headExists) {
        throw createError(400, "ไม่พบผู้ใช้งานที่เป็นหัวหน้าของแผนก");
      }
    }
    return await prisma.Department.update({
      where: { id: parseInt(id) }, // ตรวจสอบให้แน่ใจว่า id เป็น Int
      data,
    });
  }

  static async deleteDepartment(id) {
    return await prisma.Department.delete({
      where: { id: parseInt(id) }, // ตรวจสอบให้แน่ใจว่า id เป็น Int
    });
  }

  // PersonnelType ------------------------------------
  static async getAllPersonnelTypes() {
    return await prisma.PersonnelType.findMany();
  }

  static async getPersonnelTypeById(id) {
    return await prisma.PersonnelType.findUnique({
      where: { id },
    });
  }

  static async createPersonnelType(name) {
    return await prisma.PersonnelType.create({ data: { name } });
  }

  static async updatePersonnelType(id, name) {
    return await prisma.PersonnelType.update({
      where: { id },
      data: {
        name,
      },
    });
  }

  static async deletePersonnelType(id) {
    return await prisma.PersonnelType.delete({
      where: { id },
    });
  }
}

module.exports = OrgAndDeptService;
