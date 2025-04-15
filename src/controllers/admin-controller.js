const AdminService = require("../services/admin-service");
const LeaveRequestService = require("../services/leaveRequest-service");
const LeaveBalanceService = require("../services/leaveBalance-service");
const createError = require("../utils/createError");
const { sendEmail } = require("../utils/emailService");
const { calculateWorkingDays } = require("../utils/dateCalculate");

exports.adminList = async (req, res, next) => {
  try {
    const list = await AdminService.getAdminList();
    //console.log("Debug list: ", list);

    if (!list) {
      throw createError(404, `ไม่พบ admin`);
    }

    res.status(200).json({ message: "response ok", adminList: list });
  } catch (err) {
    next(err);
  }
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
    const { fiscalYear, date, description, isRecurring, holidayType } =
      req.body;

    if (
      date === undefined ||
      description === undefined ||
      fiscalYear === undefined ||
      isRecurring === undefined ||
      holidayType === undefined
    ) {
      throw createError(400, "Required field");
    }

    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      throw createError(400, "Invalid date format");
    }

    const holiday = await AdminService.createHoliday({
      date: parsedDate,
      description,
      fiscalYear:parseInt(fiscalYear),
      isRecurring,
      holidayType,
    });

    res.status(201).json({ message: "Added holiday completed", data: holiday });
  } catch (err) {
    next(err);
  }
};

exports.updateHoliday = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id); // 👈 แปลงเป็น int

    if (isNaN(id)) {
      throw createError(400, "Invalid holiday ID");
    }

    const { date, description, fiscalYear, isRecurring, holidayType } = req.body;

    const updateData = {};

    if (date) {
      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        throw createError(400, "Invalid date format");
      }
      updateData.date = parsedDate;
    }

    if (description !== undefined) updateData.description = description;
    if (fiscalYear !== undefined) {
      const yearInt = parseInt(fiscalYear);
      if (isNaN(yearInt)) {
        throw createError(400, "Invalid fiscal year");
      }
      updateData.fiscalYear = yearInt;
    }

    if (isRecurring !== undefined) updateData.isRecurring = isRecurring;
    if (holidayType !== undefined) updateData.holidayType = holidayType;

    const updatedHoliday = await AdminService.updateHolidayById(id, updateData);

    res.status(200).json({ message: "Updated holiday successfully", data: updatedHoliday });
  } catch (err) {
    next(err);
  }
};

exports.deleteHoliday = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id); // แปลง id เป็น number

    if (isNaN(id)) {
      throw createError(400, "Invalid holiday ID");
    }

    await AdminService.deleteHoliday(id); // เรียก service

    res.status(200).json({ message: "Deleted holiday successfully" });
  } catch (err) {
    next(err);
  }
};




//--------------------- Approver --------------------

exports.approverList = async (req, res, next) => {
  try {
    const approverList = await AdminService.approverList();

    if (!approverList) {
      console.log("Debug approverList: ", approverList);
      return createError(404, "approverList not found");
    }

    res.status(200).json({ message: "respones ok", approverList });
  } catch (err) {
    next(err);
  }
};

exports.createApprover = async (req, res, next) => {
  try {
    const { name } = req.body;

    // console.log('Debug name: ', name);
    if (!name) throw createError(400, "กรุณาใส่ชื่อ");

    const approver = await AdminService.createApprover(name);

    res
      .status(201)
      .json({ message: "เพิ่ม approver เรียบร้อย", Approver: approver });
  } catch (err) {
    next(err);
  }
};

exports.updateApprover = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!id || !name) throw createError(400, "ไม่สามารถอัพเดตได้");
    if (isNaN(id)) throw createError(400, "ไอดีต้องเป็นตัวเลขเท่านั้น");

    const approver = await AdminService.updateApprover(parseInt(id), name);

    res.status(200).json({ message: "อัพเดตเรียบร้อย", Approver: approver });
  } catch (err) {
    next(err);
  }
};

exports.deleteApprover = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) throw createError(400, "ไม่พบไอดี");
    if (isNaN(id)) throw createError(400, "ไอดีต้องเป็นตัวเลขเท่านั้น");

    const approver = await AdminService.deleteApprover(parseInt(id));

    res.status(200).json({ message: "ลบเรียบร้อยแล้ว" });
  } catch (err) {
    next(err);
  }
};
