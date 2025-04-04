const prisma = require("../config/prisma");
const createError = require("../utils/createError");

class OrgAndDept {
    static async getAllOrganization() {
        return await prisma.organizations.findMany();
    }
    static async getDepartmentById(organizationId) {
        return await prisma.departments.findMany({
            where: { organizationId },
        });
    }
    static async getPersonnelType() {
        return await prisma.personneltypes.findMany();
    }
}

module.exports = OrgAndDept;