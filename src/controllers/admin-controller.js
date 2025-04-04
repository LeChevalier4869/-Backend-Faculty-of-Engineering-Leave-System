const AdminService = require("../services/admin-service");
const LeaveRequestService = require("../services/leaveRequest-service");
const LeaveBalanceService = require("../services/leaveBalance-service");
const createError = require("../utils/createError");
const { sendEmail } = require("../utils/emailService");
const { calculateWorkingDays } = require("../utils/dateCalculate");

exports.adminList = async (req, res, next) => {
    try {
        const list = await AdminService.adminList();
        console.log("Debug list: ", list);

        if (!list) {
            throw createError(404, `ไม่พบ admin`);
        }

        res.status(200).json({ message: "response ok", adminList: list });
    } catch (err) {
        next(err);
    }

    res.status(200).json({ message: "response ok", adminList: list });
};

exports.createRequestByAdmin = async (req, res, next) => {
  try {
    const { leaveTypeId, startDate, endDate, reason, isEmergency, status } =
      req.body;
    // console.log("req.user.id = ", req.user.id);
    // console.log("Debug leaveTypeId con: ", leaveTypeId);
    // console.log("Debug req.user.id con: ", req.user.id);

    if (!leaveTypeId || !startDate || !endDate || !status) {
      console.log(
        "Debug createRequest leaveType, start, end",
        leaveTypeId,
        startDate,
        endDate,
        status
      );
      throw createError(
        400,
        "กรุณาเลือกวันที่เริ่มและวันที่สิ้นสุดและ leave type"
      );
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Validation: startDate ต้องไม่มากกว่า endDate
    if (start > end) {
      throw createError(400, "วันที่เริ่มต้องไม่มากกว่าวันที่สิ้นสุด");
    }

    const requestedDays = await calculateWorkingDays(start, end);
    
    const leaveBalance = await LeaveBalanceService.getUserBalance(
        req.user.id,
        leaveTypeId
      );

    // const requestedDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    if (requestedDays <= 0) {
      throw createError(400, "จำนวนวันลาต้องมากกว่า 0");
    }
    if (requestedDays > leaveBalance.maxDays - leaveBalance.usedDays) {
      return createError(400, "Leave balance is not enough");
    }

    if (!leaveBalance) {
      throw createError(404, `Leave balance not found`);
    }

    //not complete
    await LeaveBalanceService.updatePendingLeaveBalance(
        req.user.id,
        leaveTypeId,
        requestedDays
      );

    const leaveRequest = await AdminService.createRequestByAdmin(
      userId,
      leaveTypeId,
      startDate,
      endDate,
      reason,
      isEmergency,
      status.trim().toUpperCase()
    );

    const file = req.files;
    if (file && file.length > 0) {
      const imagesPromiseArray = file.map((file) => {
        return cloudUpload(file.path);
      });

      const imgUrlArray = await Promise.all(imagesPromiseArray);

      const attachImages = imgUrlArray.map((imgUrl) => {
        return {
          fileName: "attachment",
          filePath: imgUrl,
          leaveRequestId: leaveRequest.id,
        };
      });

      LeaveRequestService.attachImages(attachImages);
    }

    res
      .status(201)
      .json({ message: "Leave request created", LeaveRequest: leaveRequest });
  } catch (err) {
    next(err);
  }
};

exports.getHoliday = async (req, res, next) => {
  try {
    const holiday = await AdminService.getHoliday();

    res.status(200).json({ message: "Get holidays success", data: holiday });
  } catch (err) {
    next(err);
  }
};

exports.addHoliday = async (req, res, next) => {
  try {
    const { name, date, description } = req.body;

    if (!name || !date || description) {
      throw createError(400, "Required field");
    }

    const holiday = await AdminService.addHoliday(
      name,
      new Date(date),
      description
    );

    res.status(201).json({ message: "Added holiday completed", data: holiday });
  } catch (err) {
    next(err);
  }
};

exports.updateHoliday = async (req, res, next) => {};
