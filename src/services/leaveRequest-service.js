const prisma = require('../config/prisma');
const createError = require('../utils/createError');
const UserService = require('../services/user-service');
const LeaveTypeService = require('../services/leaveType-service');

// ในการ update leave request สามารถใช้ updateRequestStatus ได้แบบ Dynamics
// หรือ แยกแบบ approved or rejected ได้ที่ approved or rejected method

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
        return await prisma.leaverequests.create({
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
            const leaveRequest = await prisma.leaverequests.findUnique({
                where: { id: requestId },
              });
            
            if (!leaveRequest) {
                throw new Error('Leave request not found');
            }
    
            const currentStep = await prisma.approvalsteps.count({
                where: { leaveRequestId: requestId }
            });
    
            const stepOrder = currentStep + 1;
    
            if (!['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
                throw new Error('Invalid status');
            }
    
            await prisma.approvalsteps.create({
                data: {
                  leaveRequestId: requestId,
                  approverId: approverId,
                  stepOrder: stepOrder, // คุณสามารถปรับ stepOrder ตามลำดับขั้นตอน
                  status: status, // เช่น 'APPROVED',
                  reviewedAt: new Date()
                },
              });
            
            return await prisma.leaverequests.update({
                where: { id: requestId },
                data: { status },
            });
        } catch (error) {
            throw new Error(`Failed to update request status: ${error.message}`);
        }
    }
    static async getRequests(whereCondition) {
        return await prisma.leaverequests.findMany({
            where: whereCondition,
            include: {
                users: {
                    select: {
                        prefixName: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                    }
                },
                leavetypes: {
                    select: {
                        name: true,
                        maxDays: true,
                    }
                },
                approvalsteps: {
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
        return await prisma.leaverequests.findUnique({
            where: { id: parseInt(requestId) }
        });
    }
    static async updateRequest(requestId, updateData) {
        try {
            return await prisma.leaverequests.update({
                where: { id: requestId },
                data: updateData
            });

        } catch (error) {
            throw createError(500, `Failed to update leave request: ${error.message}`);
        }
    }
    static async approveRequest(requestId, approverId) {
        try {
            const approvedRequest = await prisma.leaverequests.update({
                where: { id: requestId },
                data: {
                    status: 'APPROVED',
                    approvalsteps: {
                        create: {
                            stepOrder: 1,
                            status: 'APPROVED',
                            approverId: approverId, //คนที่เข้าสู่ระบบจะเป็นคนอนุมัติ
                        },
                    },
                },
            });

            await prisma.auditlogs.create({
                data: {
                    action: 'Approved leave request',
                    details: {
                        leaveRequestId: requestId,
                        status: 'APPROVED',
                    },
                    users: {
                        connect: {
                            id: approverId,
                        },
                    },
                    leaverequests: {
                        connect: {
                            id: requestId,
                        },
                    },
                },
            });

            return approvedRequest;
        } catch (err) {
            console.error(err);
            throw new Error('Error updating leave request status');
        }
    }
    static async rejectRequest(requestId, remarks, approverId) {
        try {
            const rejectRequest = await prisma.leaverequests.update({
                where: { id: requestId },
                data: {
                    status: 'REJECTED',
                    approvalsteps: {
                        create: {
                            stepOrder: 1,
                            status: 'REJECTED',
                            remarks: String(remarks),
                            approverId: approverId,
                        },
                    },
                },
            });

            await prisma.auditlogs.create({
                data: {
                    action: 'Rejected leave request',
                    details: {
                        leaveRequestId: requestId,
                        status: 'REJECTED',
                        remarks: String(remarks),
                    },
                    users: {
                        connect: {
                            id: approverId,
                        },
                    },
                    leaverequests: {
                        connect: {
                            id: requestId,
                        },
                    },
                },
            });

            return rejectRequest;
        } catch (err) {
            console.error(err);
            throw new Error('Error updating leave request status');
        }
    }
    static async deleteRequest(requestId) {
        try {
            const leaveRequest = await prisma.leaverequests.findUnique({
                where: {
                    id: requestId,
                },
            });

            if (!leaveRequest) {
                return null;
            }

            await prisma.leaverequests.delete({
                where: { id: requestId }
            });

            return true;
        } catch (err) {
            throw new Error('Error to delete leave request');
        }
    }
    static async getLanding() {
        try {
            return await prisma.leaverequests.findMany({
                where: {
                    status: 'PENDING',
                },
                include: {
                    leavetypes: true,
                    users:true,
                }
            });
        } catch (err) {
            throw new Error("Leave requests not found");
        }
    }
}

module.exports = LeaveRequestService;