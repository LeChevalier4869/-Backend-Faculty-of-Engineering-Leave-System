const prisma = require('../config/prisma');
const createError = require('../utils/createError');

class AdminService {
    static async adminList() {
        return await prisma.user_role.findMany({
            where: { roleId: 2 },
            some: {
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
                        personnelTypeId: true,
                        organizations: {
                            select: {
                                name: true,
                            }
                        },
                        departments: {
                            select: {
                                name: true,
                                isHeadId: true
                            }
                        }
                    },
                }
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
    static async getHoliday() {
        return await prisma.holidays.findMany();
    }
    static async updateHolidayById(holidayId, updateData) {
        return await prisma.holidays.update({
            where: { id: holidayId },
            data: updateData,
        });
    }
    static async createRequestByAdmin(
        userId,
        leaveTypeId,
        startDate,
        endDate,
        reason,
        isEmergency,
        status
      ) {
        if (!userId || !leaveTypeId || !startDate || !endDate || !status) {
          throw createError(400, "Missing required fields.");
        }
        //create request
        const newRequest = await prisma.leaverequests.create({
          data: {
            userId,
            leaveTypeId: parseInt(leaveTypeId),
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            reason,
            isEmergency: Boolean(isEmergency),
            status,
          },
        });

        return newRequest;
      }
}

module.exports = AdminService;