const prisma = require('../config/prisma');
const createError = require('../utils/createError');
const UserService = require('../services/user-service');
const LeaveTypeService = require('../services/leaveType-service');

class LeaveRequestService {
    static async createRequest(userId, leaveTypeId, startDate, endDate, reason, isEmergency) {
        //cal request day
        const requestDays = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24) + 1;

        // query user and leave type
        const user = await UserService.getUserById(userId);
        if (!user) {
            console.log(user);
            throw createError(404, 'User not found');
        }

        const leaveType = await LeaveTypeService.getLeaveTypeByID(leaveTypeId);
        if (!leaveType) {
            console.log(leaveType);
            throw createError(404, 'Leave type not found');
        }

        //check maxDays
        const personnelType = user.personnelType.name;
        let maxDays = leaveType.maxDays;

        // to-do here (conditions for leave) //not complete
        if (personnelType === "permanent") {
            maxDays = 60;
        } else if (personnelType === "government") {
            maxDays = 30;
        }

        if (requestDays > maxDays) {
            throw createError(400, `Requested leave exceeds the maximum allowed days (${maxDays})`);
        }

        //create request
        return await prisma.leaveRequests.create({
            data: {
                userId,
                leaveTypeId,
                startDate: new Date(startDate),
                endDate: new Date(endDate),
                reason,
                isEmergency,
            },
        });
    }
    static async updateRequestStatus(requestId, status, approverId) {
        return await prisma.leaveRequests.update({
            where: { id: requestId },
            data: { status, approverId },
        });
    }
}

module.exports = LeaveRequestService;