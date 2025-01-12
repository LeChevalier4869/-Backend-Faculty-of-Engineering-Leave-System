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
                leaveTypeId: parseInt(leaveTypeId),
                startDate: new Date(startDate),
                endDate: new Date(endDate),
                reason,
                isEmergency,
            },
        });
    }
    static async updateRequestStatus(requestId, status, approverId) {
        try {
            const leaveRequest = await prisma.leaveRequests.findUnique({
                where: { id: requestId },
              });
            
            if (!leaveRequest) {
                throw new Error('Leave request not found');
            }
    
            const currentStep = await prisma.approvalSteps.count({
                where: { leaveRequestId: requestId }
            });
    
            const stepOrder = currentStep + 1;
    
            if (!['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
                throw new Error('Invalid status');
            }
    
            await prisma.approvalSteps.create({
                data: {
                  leaveRequestId: requestId,
                  approverId: approverId,
                  stepOrder: stepOrder, // คุณสามารถปรับ stepOrder ตามลำดับขั้นตอน
                  status: status, // เช่น 'APPROVED',
                  reviewedAt: new Date()
                },
              });
            
            return await prisma.leaveRequests.update({
                where: { id: requestId },
                data: { status },
            });
        } catch (error) {
            throw new Error(`Failed to update request status: ${error.message}`);
        }
    }
    static async getRequests(whereCondition) {
        return await prisma.leaveRequests.findMany({
            where: whereCondition,
            include: {
                user: {
                    select: {
                        prefixName: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                    }
                },
                leaveType: {
                    select: {
                        name: true,
                        maxDays: true,
                    }
                },
                ApprovalSteps: {
                    select: {
                        stepOrder: true,
                        status: true,
                        approverId: true,
                    }
                }
            }
        });
    }
    static async getRequestsById(requestId) {
        return await prisma. leaveRequests.findUnique({
            where: { id: parseInt(requestId) }
        });
    }
    static async updateRequest(requestId, reason, startDate, endDate, isEmergency) {
        try {
            const leaveRequest = await prisma.leaveRequests.findUnique({
                where: { id: parseInt(requestId) }
            });
            if (!leaveRequest) {
                throw createError(404, 'Leave request not found');
            }

            return await prisma.leaveRequests.update({
                where: { id: parseInt(requestId) },
                data: {
                    reason,
                    startDate: new Date(startDate),
                    endDate: new Date(endDate),
                    isEmergency
                }
            });

        } catch (error) {
            throw createError(500, `Failed to update leave request: ${error.message}`);
        }
    }
}

module.exports = LeaveRequestService;