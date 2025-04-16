const prisma = require("../config/prisma");

// This is organization and department services.
class OrgAndDeptService {

  // Organization -----------------------------------
  static async getAllOrganizations() {
    return await prisma.organization.findMany();
  }
  static async getOrganizationById(id) {
    return await prisma.organization.findUnique({ where: { id:parseInt(id) } });
  }
  static async createOrganization(name) {
    return await prisma.organization.create({ data: { name } });
  }
  static async updateOrganization(id, name) {
    return await prisma.organization.update({
      where: { id:parseInt(id) },
      data: { name },
    });
  }
  static async deleteOrganization(id) {
    return await prisma.organization.delete({
      where: { id:parseInt(id) },
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
        organization,
      },
    });
  }
  static async getDepartmentById(id) {
    return await prisma.department.findUnique({
      where: { id },
    });
  }
  static async createDepartment(data) {
    return await prisma.department.create({ data });
  }
  static async updateDepartment(id, data) {
    return await prisma.department.update({
      where: { id },
      data,
    });
  }
  static async deleteDepartment(id) {
    return await prisma.department.delete({ where: { id } });
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
  static async createPersonnelType(data) {
    return await prisma.personnelType.create({ data });
  }
  static async updatePersonnelType(id, data) {
    return await prisma.personnelType.update({
      where: { id },
      data,
    });
  }
  static async deletePersonnelType(id) {
    return await prisma.personnelType.delete({
      where: { id },
    });
  }
}

module.exports = OrgAndDeptService;