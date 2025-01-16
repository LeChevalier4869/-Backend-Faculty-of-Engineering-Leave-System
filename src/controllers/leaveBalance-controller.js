const LeaveBalanceService = require('../services/leaveBalance-service');
const createError = require('../utils/createError');

exports.getLeaveBalanceByUserId = async (req, res, next) => {
    const userId = req.user.id;
    //console.log('user id = ' + req.user.id);
    try {
        const leaveBalance = await LeaveBalanceService.getByUserId(userId);

        if (!leaveBalance) {
            throw createError(404, 'Leave balance not found');
        }

        res.status(200).json({ leaveBalance });
    } catch (err) {
        next(err);
    }
};