const LeaveRequestService = require('../services/leaveRequest-service');
const LeaveBalanceService = require('../services/leaveBalance-service');
const AuditLogService = require('../services/auditLog-service');
const createError = require('../utils/createError');

exports.createLeaveRequest = async (req, res) => {
    const { leaveTypeId, startDate, endDate, reason, isEmergency} = req.body;
    const leaveBalance = await LeaveBalanceService.getUserBalance(req.userId, leaveTypeId);
    const requestedDays = (new Date(endDate) - new Date(startDate)) / (1000, 60, 60, 24) + 1;
    if (requestedDays > leaveBalance.totalDays - leaveBalance.usedDays) {
        return createError(400, 'Leave balance is not enough');
    }

    const leaveRequest = await LeaveRequestService.createRequest(req.user.id, leaveTypeId, startDate, endDate, reason, isEmergency);
    await LeaveBalanceModel.updateLeaveBalance(req.user.id, leaveTypeId, requestedDays);
    await AuditLogModel.createLog(req.user.id, 'Create Request', leaveRequest.id, `Leave created: ${reason}`, `isEemergency: ${req.body.isEmergency}`);
    res.status(201).json({ message: 'Leave request created', requestId: leaveRequest.id });
};

exports.updateLeaveStatus = async (req, res) => {
    const { requestId, status } = req.body;
    await LeaveRequestService.updateRequestStatus(requestId, status, req.user.id);
    await AuditLogService.createLog(req.user.id, 'Update Status', requestId, `Status updated to: ${status}`);
    res.status(200).json({ message: 'Leave status updated' });
};