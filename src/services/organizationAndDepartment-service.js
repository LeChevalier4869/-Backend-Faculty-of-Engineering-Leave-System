const prisma = require("../config/prisma");
const createError = require("../utils/createError");

class OrgAndDept {
    static async getAllOrganization() {
        return await prisma.organization.findMany();
    }
    static async getOrganizationAndDepartment() {
        return await prisma.organization.findMany({
          include: {
            departments: true,
          },
        });
      }
    static async getDepartmentById(organizationId) {
        return await prisma.department.findMany({
            where: { organizationId },
        });
    }
    static async getPersonnelType() {
        return await prisma.personnelType.findMany();
    }
}

module.exports = OrgAndDept;