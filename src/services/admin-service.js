const prisma = require('../config/prisma');
const createError = require('../utils/createError');

class AdminService {
    static async adminList() {
        return await prisma.user_role.findMany({
            where: { roleId: 2 },
            include: {
                roles: {
                    select: {
                        id: true,
                        name: true,
                        description: true,
                    }
                },
                users: {
                    select: {
                        id: true,
                        prefixName: true,
                        firstName: true,
                        lastName: true,
                        sex: true,
                        email: true,
                        phone: true,
                        hireDate: true,
                        inActive: true,
                        employmentType: true,
                        profilePicturePath: true, 
                    },
                    include: {
                        personneltypes: true,
                        organizations: true,
                        departments: true,
                    }
                }
            }
        });
    }
}

module.exports = AdminService;