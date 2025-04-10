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
    static async getHoliday() {
        return await prisma.holidays.findMany();
    }
    static async updateHolidayById(holidayId, updateData) {
        return await prisma.holidays.update({
            where: { id: holidayId },
            data: updateData,
        });
    }
    static async deleteHoliday(holidayId) {
        return await prisma.holidays.delete({
            where: { id: holidayId }
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

    //---------------------- Approver -------------
    static async approverList() {
        return await prisma.approver.findMany();
    }
    static async createApprover(name) {
        return await prisma.approver.create({data: {name}});
    }
    static async updateApprover(id, name) {
        return await prisma.approver.update({
            where: { id },
            data: {
                name: name
            }
        });
    }
    static async deleteApprover(id) {
        return await prisma.approver.delete({
            where: { id }
        });
    }

    //------------------------ Department -------------
    static async departmentList() {
        return await prisma.department.findMany();
    }
    static async createDepartment(data) {
        return await prisma.department.create({data});
    }
    static async updateDepartment(data) {

    }
    static async deleteDepartment(id) {

    }

    //------------------------ Organization -----------
    static async organizationList() {
        return await prisma.organization.findMany();
    }
    static async createOrganization(name) {
        return await prisma.organization.create({data: {name}});
    }
    static async updateOrganization(id, name) {
        return await prisma.organization.update({
            where: { id },
            data: {
                name,
            }
        });
    }
    static async deleteOrganization(id) {
        return await prisma.organization.delete({
            where: { id },
        })
    }
    static async getOrganizationById(id) {
        return await prisma.organization.findUniqe({
            where: { id },
        });
    }
}

module.exports = AdminService;