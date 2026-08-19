jest.mock("../../../services/leaveRequest-service", () => ({
  getLeaveRequestsByUser: jest.fn(),
  getRequestsById: jest.fn(),
  getRequestById: jest.fn(),
  getApprovalSteps: jest.fn(),
  updateRequest: jest.fn(),
  deleteRequest: jest.fn(),
  getLastLeaveBefore: jest.fn(),
  getLastApprovedRequestIsMine: jest.fn(),
}));

jest.mock("../../../services/user-service", () => ({
  getHeadOfDepartment: jest.fn(),
  getUserByIdWithRoles: jest.fn(),
}));

const LeaveRequestService = require("../../../services/leaveRequest-service");
const UserService = require("../../../services/user-service");
const leaveRequestController = require("../../../controllers/leaveRequest-controller");

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe("leaveRequest-controller flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  describe("getMyLeaveRequests", () => {
    it("returns list", async () => {
      LeaveRequestService.getLeaveRequestsByUser.mockResolvedValue([{ id: 1 }]);

      const req = { user: { id: 10 } };
      const res = makeRes();

      await leaveRequestController.getMyLeaveRequests(req, res);

      expect(LeaveRequestService.getLeaveRequestsByUser).toHaveBeenCalledWith(10);
      expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
    });

    it("returns 500 on error", async () => {
      LeaveRequestService.getLeaveRequestsByUser.mockRejectedValue(new Error("boom"));

      const req = { user: { id: 10 } };
      const res = makeRes();

      await leaveRequestController.getMyLeaveRequests(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: "Internal server error" });
    });
  });

  describe("getLeaveRequest", () => {
    it("calls next with 404 when request not found", async () => {
      LeaveRequestService.getRequestsById.mockResolvedValue(null);

      const req = {
        params: { id: "5" },
        user: { id: 10, department: { id: 1 } },
      };
      const res = makeRes();
      const next = jest.fn();

      await leaveRequestController.getLeaveRequest(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(404);
    });

    it("calls next with 404 when request id matches nothing", async () => {
      // getRequestsById คืน array — ไม่พบจะได้ [] ซึ่งเป็น truthy
      // เดิมหลุดไปพังที่ leaveRequests[0].user (500) แทนที่จะเป็น 404
      LeaveRequestService.getRequestsById.mockResolvedValue([]);

      const req = {
        params: { id: "5" },
        user: { id: 10, department: { id: 1 } },
      };
      const res = makeRes();
      const next = jest.fn();

      await leaveRequestController.getLeaveRequest(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(404);
    });

    it("does not require the viewer to have a department", async () => {
      // ผู้ดูอาจไม่ใช่คนในสาขาเดียวกับผู้ยื่น การเช็คแผนกของ "ผู้ดู" จึงผิด
      LeaveRequestService.getRequestsById.mockResolvedValue([
        {
          id: 5,
          verifierId: 99,
          user: { id: 7, department: { id: 1 } },
          leaveRequestDetails: [],
        },
      ]);
      UserService.getHeadOfDepartment.mockResolvedValue(null);

      const req = {
        params: { id: "5" },
        user: { id: 10, department: null },
      };
      const res = makeRes();
      const next = jest.fn();

      await leaveRequestController.getLeaveRequest(req, res, next);

      const badRequest = next.mock.calls.find((c) => c[0]?.statusCode === 400);
      expect(badRequest).toBeUndefined();
    });

    it("returns detail with head/verifier/steps", async () => {
      LeaveRequestService.getRequestsById.mockResolvedValue([
        { 
          id: 5, 
          verifierId: 99, 
          userId: 10, 
          foo: "bar",
          user: {
            id: 10,
            department: { id: 1 }
          }
        },
      ]);
      LeaveRequestService.getApprovalSteps.mockResolvedValue([{ stepOrder: 1 }]);
      UserService.getHeadOfDepartment.mockResolvedValue(777);
      UserService.getUserByIdWithRoles
        .mockResolvedValueOnce({ 
          id: 777, 
          name: "head",
          userRoles: [{ role: { name: "APPROVER_1" } }],
          departmentId: 1
        }) // ครั้งที่ 1: ตรวจสอบ headUser สำหรับ validation
        .mockResolvedValueOnce({ 
          id: 777, 
          name: "head",
          userRoles: [{ role: { name: "APPROVER_1" } }],
          departmentId: 1
        }) // ครั้งที่ 2: headOfDepartment ใน response
        .mockResolvedValueOnce({ id: 99, name: "verifier" }); // ครั้งที่ 3: verifier

      const req = {
        params: { id: "5" },
        user: { id: 10, department: { id: 1 } },
      };
      const res = makeRes();
      const next = jest.fn();

      await leaveRequestController.getLeaveRequest(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(UserService.getHeadOfDepartment).toHaveBeenCalledWith(1);
      expect(LeaveRequestService.getApprovalSteps).toHaveBeenCalledWith(5);
      expect(res.status).toHaveBeenCalledWith(200);

      const payload = res.json.mock.calls[0][0];
      expect(payload.message).toBe("Leave requests retrieved");
      expect(payload.data.id).toBe(5);
      expect(payload.data.headOfDepartment).toEqual({ 
        id: 777, 
        name: "head",
        userRoles: [{ role: { name: "APPROVER_1" } }],
        departmentId: 1
      });
      expect(payload.data.verifier).toEqual({ id: 99, name: "verifier" });
      expect(payload.data.approvalSteps).toEqual([{ stepOrder: 1 }]);
    });
  });

  describe("updateLeaveRequest", () => {
    it("calls next with 404 when request not found", async () => {
      LeaveRequestService.getRequestById.mockResolvedValue(null);

      const req = {
        params: { id: "5" },
        body: { reason: "x" },
        user: { id: 10 },
      };
      const res = makeRes();
      const next = jest.fn();

      await leaveRequestController.updateLeaveRequest(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(404);
    });

    it("calls next with 403 when not owner", async () => {
      LeaveRequestService.getRequestById.mockResolvedValue({ id: 5, userId: 999 });

      const req = {
        params: { id: "5" },
        body: { reason: "x" },
        user: { id: 10 },
      };
      const res = makeRes();
      const next = jest.fn();

      await leaveRequestController.updateLeaveRequest(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(403);
      expect(LeaveRequestService.updateRequest).not.toHaveBeenCalled();
    });

    it("updates and returns 200", async () => {
      LeaveRequestService.getRequestById.mockResolvedValue({ id: 5, userId: 10 });
      LeaveRequestService.updateRequest.mockResolvedValue({ id: 5, reason: "y" });

      const req = {
        params: { id: "5" },
        body: { reason: "y" },
        user: { id: 10 },
      };
      const res = makeRes();
      const next = jest.fn();

      await leaveRequestController.updateLeaveRequest(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(LeaveRequestService.updateRequest).toHaveBeenCalledWith("5", {
        reason: "y",
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "อัปเดตคำขอลา",
        data: { id: 5, reason: "y" },
      });
    });
  });

  describe("deleteLeaveRequest", () => {
    it("owner deletes and returns 200", async () => {
      LeaveRequestService.getRequestById.mockResolvedValue({ id: 5, userId: 10 });
      LeaveRequestService.deleteRequest.mockResolvedValue(true);

      const req = { params: { id: "5" }, user: { id: 10, role: [] } };
      const res = makeRes();
      const next = jest.fn();

      await leaveRequestController.deleteLeaveRequest(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(LeaveRequestService.deleteRequest).toHaveBeenCalledWith(5);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: "ลบคำขอลา" });
    });

    it("admin can delete another user's request", async () => {
      LeaveRequestService.getRequestById.mockResolvedValue({ id: 5, userId: 999 });
      LeaveRequestService.deleteRequest.mockResolvedValue(true);

      const req = { params: { id: "5" }, user: { id: 10, role: ["ADMIN"] } };
      const res = makeRes();
      const next = jest.fn();

      await leaveRequestController.deleteLeaveRequest(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(LeaveRequestService.deleteRequest).toHaveBeenCalledWith(5);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("calls next with 404 when request not found", async () => {
      LeaveRequestService.getRequestById.mockResolvedValue(null);

      const req = { params: { id: "5" }, user: { id: 10, role: [] } };
      const res = makeRes();
      const next = jest.fn();

      await leaveRequestController.deleteLeaveRequest(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0].statusCode).toBe(404);
      expect(LeaveRequestService.deleteRequest).not.toHaveBeenCalled();
    });

    it("calls next with 403 when not owner and not admin", async () => {
      LeaveRequestService.getRequestById.mockResolvedValue({ id: 5, userId: 999 });

      const req = { params: { id: "5" }, user: { id: 10, role: ["USER"] } };
      const res = makeRes();
      const next = jest.fn();

      await leaveRequestController.deleteLeaveRequest(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0].statusCode).toBe(403);
      expect(LeaveRequestService.deleteRequest).not.toHaveBeenCalled();
    });

    it("calls next with 400 when cannot delete", async () => {
      LeaveRequestService.getRequestById.mockResolvedValue({ id: 5, userId: 10 });
      LeaveRequestService.deleteRequest.mockResolvedValue(null);

      const req = { params: { id: "5" }, user: { id: 10, role: [] } };
      const res = makeRes();
      const next = jest.fn();

      await leaveRequestController.deleteLeaveRequest(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
    });
  });

  describe("getLastLeaveBefore", () => {
    it("returns 400 when userId invalid", async () => {
      const req = { params: { userId: "abc" }, body: { leaveTypeId: 1 } };
      const res = makeRes();

      await leaveRequestController.getLastLeaveBefore(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "userId (params) is invalid" });
    });

    it("returns 400 when leaveTypeId missing", async () => {
      const req = { params: { userId: "10" }, body: {} };
      const res = makeRes();

      await leaveRequestController.getLastLeaveBefore(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "leaveTypeId is required in body" });
    });

    it("returns 200 with data", async () => {
      LeaveRequestService.getLastLeaveBefore.mockResolvedValue({ id: 1 });

      const req = {
        params: { userId: "10" },
        body: { leaveTypeId: 3, beforeDate: "2025-01-20" },
      };
      const res = makeRes();

      await leaveRequestController.getLastLeaveBefore(req, res);

      expect(LeaveRequestService.getLastLeaveBefore).toHaveBeenCalledWith(
        10,
        3,
        expect.any(Date)
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: { id: 1 } });
    });

    it("returns 500 on error", async () => {
      LeaveRequestService.getLastLeaveBefore.mockRejectedValue(new Error("boom"));

      const req = {
        params: { userId: "10" },
        body: { leaveTypeId: 3 },
      };
      const res = makeRes();

      await leaveRequestController.getLastLeaveBefore(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์",
      });
    });
  });

  describe("getMyLastApprovedLeaveRequest", () => {
    it("calls next with 404 when none", async () => {
      LeaveRequestService.getLastApprovedRequestIsMine.mockResolvedValue(null);

      const req = { user: { id: 10 } };
      const res = makeRes();
      const next = jest.fn();

      await leaveRequestController.getMyLastApprovedLeaveRequest(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(404);
    });

    it("returns 200 with last approved", async () => {
      LeaveRequestService.getLastApprovedRequestIsMine.mockResolvedValue({ id: 5 });

      const req = { user: { id: 10 } };
      const res = makeRes();
      const next = jest.fn();

      await leaveRequestController.getMyLastApprovedLeaveRequest(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(LeaveRequestService.getLastApprovedRequestIsMine).toHaveBeenCalledWith(10);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "Last approved leave request retrieved",
        data: { id: 5 },
      });
    });
  });
});
