jest.mock("../../../services/admin-service", () => ({
  getApproverPreviewForUser: jest.fn(),
  createLeaveRequestForUser: jest.fn(),
}));

jest.mock("../../../services/user-service", () => ({
  getVerifier: jest.fn(),
}));

jest.mock("../../../services/leaveRequest-service", () => ({
  attachImages: jest.fn(),
}));

jest.mock("../../../utils/cloudUpload", () => jest.fn());

const AdminService = require("../../../services/admin-service");
const UserService = require("../../../services/user-service");
const LeaveRequestService = require("../../../services/leaveRequest-service");
const cloudUpload = require("../../../utils/cloudUpload");
const adminController = require("../../../controllers/admin-controller");

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe("admin-controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getApproverPreviewForUser", () => {
    it("returns 400 when userId invalid", async () => {
      const req = { params: { userId: "abc" } };
      const res = makeRes();
      const next = jest.fn();

      await adminController.getApproverPreviewForUser(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(Error);
      expect(err.statusCode).toBe(400);
      expect(AdminService.getApproverPreviewForUser).not.toHaveBeenCalled();
    });

    it("returns 200 with steps", async () => {
      AdminService.getApproverPreviewForUser.mockResolvedValue([
        { stepOrder: 1, roleName: "APPROVER_1" },
      ]);

      const req = { params: { userId: "12" } };
      const res = makeRes();
      const next = jest.fn();

      await adminController.getApproverPreviewForUser(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(AdminService.getApproverPreviewForUser).toHaveBeenCalledWith(12);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "ok",
        data: [{ stepOrder: 1, roleName: "APPROVER_1" }],
      });
    });
  });

  describe("createRequestByAdmin", () => {
    it("returns 401 when no adminId", async () => {
      const req = { user: null, body: {} };
      const res = makeRes();
      const next = jest.fn();

      await adminController.createRequestByAdmin(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(Error);
      expect(err.statusCode).toBe(401);
      expect(AdminService.createLeaveRequestForUser).not.toHaveBeenCalled();
    });

    it("returns 400 when required fields missing", async () => {
      const req = {
        user: { id: 99 },
        body: {
          userId: 1,
          leaveTypeId: 2,
          startDate: "2025-01-01",
          // endDate missing
          documentNumber: 10,
        },
      };
      const res = makeRes();
      const next = jest.fn();

      await adminController.createRequestByAdmin(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(Error);
      expect(err.statusCode).toBe(400);
      expect(AdminService.createLeaveRequestForUser).not.toHaveBeenCalled();
    });

    it("returns 400 when approvalDetails is invalid JSON string", async () => {
      const req = {
        user: { id: 99 },
        body: {
          userId: 1,
          leaveTypeId: 2,
          startDate: "2025-01-01",
          endDate: "2025-01-02",
          documentNumber: 10,
          approvalDetails: "{bad json}",
        },
      };
      const res = makeRes();
      const next = jest.fn();

      await adminController.createRequestByAdmin(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(Error);
      expect(err.statusCode).toBe(400);
      expect(AdminService.createLeaveRequestForUser).not.toHaveBeenCalled();
    });

    it("creates leave request and returns 201 (no files)", async () => {
      UserService.getVerifier.mockResolvedValue({ id: 555 });
      AdminService.createLeaveRequestForUser.mockResolvedValue({ id: 777 });

      const req = {
        user: { id: 99 },
        body: {
          userId: 1,
          leaveTypeId: 2,
          startDate: "2025-01-01",
          endDate: "2025-01-02",
          reason: "x",
          contact: "y",
          documentNumber: 10,
          documentIssuedDate: "2025-01-01",
          approvalDetails: JSON.stringify([{ stepOrder: 1 }]),
        },
        files: [],
      };
      const res = makeRes();
      const next = jest.fn();

      await adminController.createRequestByAdmin(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(UserService.getVerifier).toHaveBeenCalledTimes(1);
      expect(AdminService.createLeaveRequestForUser).toHaveBeenCalledWith(
        1,
        2,
        "2025-01-01",
        "2025-01-02",
        "x",
        555,
        "y",
        10,
        "2025-01-01",
        99,
        [{ stepOrder: 1 }]
      );
      expect(LeaveRequestService.attachImages).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: "สร้างคำขอลาเรียบร้อย",
        data: { id: 777 },
      });
    });

    it("attaches images when req.files provided", async () => {
      UserService.getVerifier.mockResolvedValue({ id: 555 });
      AdminService.createLeaveRequestForUser.mockResolvedValue({ id: 777 });
      cloudUpload.mockResolvedValueOnce("http://img/1.png").mockResolvedValueOnce(
        "http://img/2.png"
      );

      const req = {
        user: { id: 99 },
        body: {
          userId: 1,
          leaveTypeId: 2,
          startDate: "2025-01-01",
          endDate: "2025-01-02",
          documentNumber: 10,
        },
        files: [{ path: "p1" }, { path: "p2" }],
      };
      const res = makeRes();
      const next = jest.fn();

      await adminController.createRequestByAdmin(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(cloudUpload).toHaveBeenCalledTimes(2);
      expect(cloudUpload).toHaveBeenNthCalledWith(1, "p1");
      expect(cloudUpload).toHaveBeenNthCalledWith(2, "p2");

      expect(LeaveRequestService.attachImages).toHaveBeenCalledWith([
        {
          type: "PAPER",
          filePath: "http://img/1.png",
          leaveRequestId: 777,
          name: expect.any(String),
        },
        {
          type: "PAPER",
          filePath: "http://img/2.png",
          leaveRequestId: 777,
          name: expect.any(String),
        },
      ]);
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });
});
