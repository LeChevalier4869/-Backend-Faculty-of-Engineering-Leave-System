const LeaveRequestService = require('../services/leaveRequest-service');

exports.createLeaveRequest = async (req, res) => {
    const { leaveTypeId, startDate, endDate, reason, isEmergency} = req.body;
    const leaveRequest = await LeaveRequestService.createRequest(req.user.id, leaveTypeId, startDate, endDate, reason, isEmergency);
    res.status(201).json({ message: 'Leave request created' });
};