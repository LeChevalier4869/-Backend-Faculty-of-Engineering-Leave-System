const createError = require("../utils/createError");
const LeaveRequestService = require("../services/leaveRequest-service");

// POST /leave-requests/
exports.createLeaveRequest = async (req, res, next) => {
  try {
    const result = await LeaveRequestService.createLeaveRequest(
      req.user.id,
      req.body,
      req.files
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

// GET /leave-requests/me
exports.getLeaveRequestIsMine = async (req, res, next) => {
  try {
    const list = await LeaveRequestService.getLeaveRequestIsMine(req.user.id);
    res.json({ data: list });
  } catch (err) {
    next(err);
  }
};

// GET /leave-requests/:id
exports.getLeaveRequest = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const data = await LeaveRequestService.getLeaveRequest(id, req.user);
    res.json({ data });
  } catch (err) {
    next(err);
  }
};

// PATCH /leave-requests/:id
exports.updateLeaveRequest = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const updated = await LeaveRequestService.updateLeaveRequest(id, req.user.id, req.body);
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
};

// PATCH /leave-requests/:id/status
exports.updateLeaveStatus = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const updated = await LeaveRequestService.updateLeaveStatus(id, req.user.id, req.body);
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
};

// POST /leave-requests/:id/approve
exports.approveLeaveRequest = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await LeaveRequestService.approveLeaveRequest(id, req.user.id);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
};

// POST /leave-requests/:id/reject
exports.rejectLeaveRequest = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await LeaveRequestService.rejectLeaveRequest(id, req.user.id, req.body);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
};

// DELETE /leave-requests/:id
exports.deleteLeaveRequest = async (req, res, next) => {
  try {
    await LeaveRequestService.deleteLeaveRequest(parseInt(req.params.id, 10), req.user.id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    next(err);
  }
};

// GET /leave-requests/landing
exports.getLeaveRequestLanding = async (req, res, next) => {
  try {
    const summary = await LeaveRequestService.getLeaveRequestLanding();
    res.json({ data: summary });
  } catch (err) {
    next(err);
  }
};

