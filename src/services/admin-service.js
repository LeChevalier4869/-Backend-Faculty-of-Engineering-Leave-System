const prisma = require('../config/prisma');
const createError = require('../utils/createError');

class AdminService {
    static async adminList() {
        return await prisma.users.findMany({
            where: {
                user_role: {
                    some: {
                        roles: {
                            name: "ADMIN"
                        }
                    }
                }
            },
            include: {
                personneltypes: true,
                organizations: true,
                departments: true,
            }
        });
    }
    static async addHoliday(name, date, description) {
        return await prisma.holidays.create({
            data: {
                name,
                date: new Date(date),
                description,
            }
        });
    }
    static async updateHolidayById(holidayId, updateData) {
        return await prisma.holidays.update({
            where: { id: holidayId },
            data: updateData,
        });
    }
}

module.exports = AdminService;