const LeaveRequestService = require('../services/leaveRequest-service');
const LeaveBalanceService = require('../services/leaveBalance-service');
const AuditLogService = require('../services/auditLog-service');
const createError = require('../utils/createError');

exports.createLeaveRequest = async (req, res, next) => {
    try {
        const { leaveTypeId, startDate, endDate, reason, isEmergency} = req.body;
        const leaveBalance = await LeaveBalanceService.getUserBalance(req.userId, leaveTypeId);
        const requestedDays = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24) + 1;
        if (requestedDays > leaveBalance.totalDays - leaveBalance.usedDays) {
            return createError(400, 'Leave balance is not enough');
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

exports.updateLeaveRequest = async (req, res, next) => {
    try {
        const { requestId } = req.params;
        const { reason, startDate, endDate, isEmergency } = req.body;

        if (!Date.parse(startDate) || !Date.parse(endDate)) {
            return res.status(400).json({ message: 'Invalid date format' });
        }

        const leaveRequest = await LeaveRequestService.getRequestsById(requestId);
        if (!leaveRequest) {
            return createError(404, 'Leave request not found');
        }
        if (req.user.role === 'USER' && leaveRequest.userId !== req.user.id) {
            return createError(403, 'You are not allowed to update');
        }

        const updateRequest = await LeaveRequestService.updateRequest(
            requestId,
            reason,
            startDate,
            endDate,
            isEmergency
        );
        res.status(200).json({
            message: 'Leave request updated',
            data: updateRequest
        });

    } catch (err) {
        next(err)
    }
};