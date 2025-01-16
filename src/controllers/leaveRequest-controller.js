const LeaveRequestService = require('../services/leaveRequest-service');
const LeaveBalanceService = require('../services/leaveBalance-service');
const AuditLogService = require('../services/auditLog-service');
const createError = require('../utils/createError');
const multer = require('multer');
const upload = multer();

exports.createLeaveRequest = async (req, res, next) => {
    try {
        const { leaveTypeId, startDate, endDate, reason, isEmergency} = req.body;
        console.log("req.user.id = " + req.user.id);
        const leaveBalance = await LeaveBalanceService.getUserBalance(req.userId, leaveTypeId);
        const requestedDays = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24) + 1;
        if (requestedDays > leaveBalance.totalDays - leaveBalance.usedDays) {
            return createError(400, 'Leave balance is not enough');
        }

        if (!leaveBalance) {
            throw createError(404, `Leave balance not found`);
        }

        console.log(req.body);
        console.log(leaveTypeId);
        if (!leaveTypeId) {
            throw createError(400, 'Leave type ID is required');
        }
    
        const leaveRequest = await LeaveRequestService.createRequest(req.user.id, leaveTypeId, startDate, endDate, reason, isEmergency);
        await LeaveBalanceService.updateLeaveBalance(req.user.id, leaveTypeId, requestedDays);
        await AuditLogService.createLog(req.user.id, 'Create Request', leaveRequest.id, `Leave created: ${reason}`, `isEemergency: ${req.body.isEmergency}`);
        res.status(201).json({ message: 'Leave request created', requestId: leaveRequest.id, });
    } catch (err) {
        next(err);
    }
};

exports.updateLeaveStatus = async (req, res, next) => {
    try {
        const { requestId, status } = req.body;
        const approverId = req.user.id;
        await LeaveRequestService.updateRequestStatus(requestId, status, approverId);
        await AuditLogService.createLog(req.user.id, 'Update Status', requestId, `Status updated to: ${status}`);
        res.status(200).json({ message: 'Leave status updated' });
    } catch (err) {
        next(err);
    }
};

exports.getLeaveRequest = async (req, res, next) => {
    try {
        const { requestId, userId } = req.query;

        const role = req.user.role;

        const whereCondition = {};
        if (requestId) {
            whereCondition.id = parseInt(requestId);
        }
        if (role === 'USER' && !requestId) {
            whereCondition.userId = req.user.id;
        } else if (role === 'APPROVER' && !requestId) {
            whereCondition.ApprovalSteps = {
                some: {
                    approverId: req.user.id,
                }
            };
        } else if (role === 'ADMIN' && userId) {
            whereCondition.userId = parseInt(userId);
        }

        const leaveRequests = await LeaveRequestService.getRequests(whereCondition);
        res.status(200).json({
            message: 'Leave requests retrieved',
            data: leaveRequests
        });

    } catch (err) {
        next(err);
    }
};

exports.getLeaveRequestIsMine = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const leaveRequests = await LeaveRequestService.getRequests({
            userId: userId
        });

        if (!leaveRequests) {
            throw createError(404, 'Leave request not found');
        }

        res.status(200).json({
            message: 'Leave request retrieved',
            data: leaveRequests
        })
    } catch (err) {
        next (err);
    }
};

exports.updateLeaveRequest = [ upload.none(), async (req, res, next) => {
    const leaveRequestId = parseInt(req.params.id);
    const updateData = req.body;
    try {
        const leaveRequest = await LeaveRequestService.getRequestsById(leaveRequestId);
        if (!leaveRequest) {
            throw createError(404, 'Leave request not found');
        }
        if (leaveRequest.userId !== req.user.id) {
            throw createError(403, 'You are not allowed to update');
        }

        const updateRequest = await LeaveRequestService.updateRequest(leaveRequestId, updateData);
        res.status(200).json({
            message: 'Leave request updated',
            data: updateRequest
        });

    } catch (err) {
        next(err);
    }
}];

exports.approveLeaveRequest = async (req, res, next) => {
    try {
        const leaveRequestId = parseInt(req.params.id);
        const approverId = req.user.id;

        const updatedLeaveRequest = await LeaveRequestService.approveRequest(leaveRequestId, approverId);

        res.status(200).json({
            message: 'Leave request approved',
            leaveRequestId: updatedLeaveRequest,
        });
    } catch (err) {
        next(err);
    }
};

exports.rejectLeaveRequest = async (req, res, next) => {
    try {
        const leaveRequestId = parseInt(req.params.id);
        const { remarks } = req.body;
        const approverId = req.user.id

        const updatedLeaveRequest = await LeaveRequestService.rejectRequest(leaveRequestId, remarks, approverId);

        res.status(200).json({
            message: 'Leave request rejected',
            leaveRequest: updatedLeaveRequest,
        });
    } catch (err) {
        next(err);
    }
};

exports.deleteLeaveRequest = async (req, res, next) => {
    const leaveRequestId = parseInt(req.params.id);

    try {
        const result = await LeaveRequestService.deleteRequest(leaveRequestId);

        if (!result) {
            return createError(404, 'Leave request not found');
        }

        res.status(200).json({ message: 'Leave request deleted' });
    } catch (err) {
        next(err);
    }
};

exports.getLeaveRequestLanding = async (req, res, next) => {
    try {
        const leaveRequest = await LeaveRequestService.getLanding();
        if (!leaveRequest) {
            throw createError(404, 'Leave request not found');
        }
        res.status(200).json({ leaveRequest });
    } catch (err) {
        next(err);
    }
};