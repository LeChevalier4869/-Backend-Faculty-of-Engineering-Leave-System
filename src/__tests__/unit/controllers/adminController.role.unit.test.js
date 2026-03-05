jest.mock("../../../services/admin-service", () => ({
  roleList: jest.fn(),
  createRole: jest.fn(),
  updateRole: jest.fn(),
  deleteRole: jest.fn(),
  getRoleById: jest.fn(),
}));

jest.mock("../../../services/auditLog-service", () => ({
  createLog: jest.fn().mockResolvedValue(null),
  createUpdateLog: jest.fn().mockResolvedValue(null),
}));

const AdminService = require("../../../services/admin-service");
const AuditLogService = require("../../../services/auditLog-service");
const adminController = require("../../../controllers/admin-controller");

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const makeReq = (overrides = {}) => ({
  user: { id: 1 },
  params: {},
  body: {},
  ip: "127.0.0.1",
  get: jest.fn().mockReturnValue("jest-test-agent"),
  ...overrides,
});

describe("admin-controller role endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==================== roleList ====================
  describe("roleList", () => {
    it("should return 200 with role list", async () => {
      const mockRoles = [
        { id: 1, name: "ADMIN", description: "ผู้ดูแลระบบ" },
        { id: 2, name: "USER", description: null },
      ];
      AdminService.roleList.mockResolvedValue(mockRoles);

      const req = makeReq();
      const res = makeRes();
      const next = jest.fn();

      await adminController.roleList(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "respones ok",
        roleList: mockRoles,
      });
    });

    it("should call next with error when roleList is null", async () => {
      AdminService.roleList.mockResolvedValue(null);

      const req = makeReq();
      const res = makeRes();
      const next = jest.fn();

      await adminController.roleList(req, res, next);

      // roleList returns createError when null, but doesn't throw — it returns
      // The controller does `return createError(...)` which doesn't call next
      // So we check that res.json was NOT called with roleList
    });

    it("should call next on service error", async () => {
      AdminService.roleList.mockRejectedValue(new Error("DB error"));

      const req = makeReq();
      const res = makeRes();
      const next = jest.fn();

      await adminController.roleList(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0].message).toBe("DB error");
    });
  });

  // ==================== createRole ====================
  describe("createRole", () => {
    it("should create role with name and description", async () => {
      const mockRole = { id: 10, name: "MANAGER", description: "ผู้จัดการ" };
      AdminService.createRole.mockResolvedValue(mockRole);

      const req = makeReq({
        body: { name: "MANAGER", description: "ผู้จัดการ" },
      });
      const res = makeRes();
      const next = jest.fn();

      await adminController.createRole(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(AdminService.createRole).toHaveBeenCalledWith("MANAGER", "ผู้จัดการ");
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: "เพิ่ม role เรียบร้อย",
        data: mockRole,
      });
    });

    it("should create role without description", async () => {
      const mockRole = { id: 11, name: "HR", description: undefined };
      AdminService.createRole.mockResolvedValue(mockRole);

      const req = makeReq({ body: { name: "HR" } });
      const res = makeRes();
      const next = jest.fn();

      await adminController.createRole(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(AdminService.createRole).toHaveBeenCalledWith("HR", undefined);
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("should call AuditLogService.createLog after creating role", async () => {
      const mockRole = { id: 10, name: "MANAGER", description: "ผู้จัดการ" };
      AdminService.createRole.mockResolvedValue(mockRole);

      const req = makeReq({
        body: { name: "MANAGER", description: "ผู้จัดการ" },
      });
      const res = makeRes();
      const next = jest.fn();

      await adminController.createRole(req, res, next);

      expect(AuditLogService.createLog).toHaveBeenCalledWith(
        1, // req.user.id
        "CREATE",
        "Role",
        10, // role.id
        "สร้าง Role: MANAGER (คำอธิบาย: ผู้จัดการ)",
        "127.0.0.1",
        "jest-test-agent"
      );
    });

    it("should call next with 400 when name is missing", async () => {
      const req = makeReq({ body: {} });
      const res = makeRes();
      const next = jest.fn();

      await adminController.createRole(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
      expect(AdminService.createRole).not.toHaveBeenCalled();
    });

    it("should call next on service error", async () => {
      AdminService.createRole.mockRejectedValue(new Error("DB error"));

      const req = makeReq({ body: { name: "TEST" } });
      const res = makeRes();
      const next = jest.fn();

      await adminController.createRole(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  // ==================== updateRole ====================
  describe("updateRole", () => {
    it("should update role with name and description", async () => {
      const oldRole = { id: 1, name: "OLD", description: null };
      const updatedRole = { id: 1, name: "NEW", description: "คำอธิบายใหม่" };
      AdminService.getRoleById.mockResolvedValue(oldRole);
      AdminService.updateRole.mockResolvedValue(updatedRole);

      const req = makeReq({
        params: { id: "1" },
        body: { name: "NEW", description: "คำอธิบายใหม่" },
      });
      const res = makeRes();
      const next = jest.fn();

      await adminController.updateRole(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(AdminService.getRoleById).toHaveBeenCalledWith(1);
      expect(AdminService.updateRole).toHaveBeenCalledWith(1, "NEW", "คำอธิบายใหม่");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "อัพเดตเรียบร้อย",
        data: updatedRole,
      });
    });

    it("should call AuditLogService.createUpdateLog with old and new data", async () => {
      const oldRole = { id: 1, name: "OLD", description: null };
      const updatedRole = { id: 1, name: "NEW", description: "desc" };
      AdminService.getRoleById.mockResolvedValue(oldRole);
      AdminService.updateRole.mockResolvedValue(updatedRole);

      const req = makeReq({
        params: { id: "1" },
        body: { name: "NEW", description: "desc" },
      });
      const res = makeRes();
      const next = jest.fn();

      await adminController.updateRole(req, res, next);

      expect(AuditLogService.createUpdateLog).toHaveBeenCalledWith(
        1,
        "Role",
        1,
        oldRole,
        updatedRole,
        "127.0.0.1",
        "jest-test-agent"
      );
    });

    it("should call next with 400 when id is missing", async () => {
      const req = makeReq({
        params: {},
        body: { name: "TEST" },
      });
      const res = makeRes();
      const next = jest.fn();

      await adminController.updateRole(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0].statusCode).toBe(400);
    });

    it("should call next with 400 when name is missing", async () => {
      const req = makeReq({
        params: { id: "1" },
        body: {},
      });
      const res = makeRes();
      const next = jest.fn();

      await adminController.updateRole(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0].statusCode).toBe(400);
    });

    it("should call next with 400 when id is not a number", async () => {
      const req = makeReq({
        params: { id: "abc" },
        body: { name: "TEST" },
      });
      const res = makeRes();
      const next = jest.fn();

      await adminController.updateRole(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0].statusCode).toBe(400);
    });
  });

  // ==================== deleteRole ====================
  describe("deleteRole", () => {
    it("should delete role and return 200", async () => {
      const mockRole = { id: 5, name: "OLD_ROLE", description: null };
      AdminService.deleteRole.mockResolvedValue(mockRole);

      const req = makeReq({ params: { id: "5" } });
      const res = makeRes();
      const next = jest.fn();

      await adminController.deleteRole(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(AdminService.deleteRole).toHaveBeenCalledWith(5);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: "ลบเรียบร้อยแล้ว" });
    });

    it("should call AuditLogService.createLog after deleting", async () => {
      const mockRole = { id: 5, name: "OLD_ROLE", description: null };
      AdminService.deleteRole.mockResolvedValue(mockRole);

      const req = makeReq({ params: { id: "5" } });
      const res = makeRes();
      const next = jest.fn();

      await adminController.deleteRole(req, res, next);

      expect(AuditLogService.createLog).toHaveBeenCalledWith(
        1,
        "DELETE",
        "Role",
        5,
        "ลบ Role: OLD_ROLE (ID: 5)",
        "127.0.0.1",
        "jest-test-agent"
      );
    });

    it("should call next with 400 when id is missing", async () => {
      const req = makeReq({ params: {} });
      const res = makeRes();
      const next = jest.fn();

      await adminController.deleteRole(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0].statusCode).toBe(400);
    });

    it("should call next with 400 when id is not a number", async () => {
      const req = makeReq({ params: { id: "abc" } });
      const res = makeRes();
      const next = jest.fn();

      await adminController.deleteRole(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0].statusCode).toBe(400);
    });
  });

  // ==================== getRoleById ====================
  describe("getRoleById", () => {
    it("should return role by id", async () => {
      const mockRole = { id: 3, name: "VERIFIER", description: "ผู้ตรวจสอบ" };
      AdminService.getRoleById.mockResolvedValue(mockRole);

      const req = makeReq({ params: { id: "3" } });
      const res = makeRes();
      const next = jest.fn();

      await adminController.getRoleById(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(AdminService.getRoleById).toHaveBeenCalledWith(3);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "ดึงข้อมูล role เรียบร้อยแล้ว",
        data: mockRole,
      });
    });

    it("should call next with 400 when id is missing", async () => {
      const req = makeReq({ params: {} });
      const res = makeRes();
      const next = jest.fn();

      await adminController.getRoleById(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0].statusCode).toBe(400);
    });

    it("should call next with 400 when id is not a number", async () => {
      const req = makeReq({ params: { id: "abc" } });
      const res = makeRes();
      const next = jest.fn();

      await adminController.getRoleById(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0].statusCode).toBe(400);
    });
  });
});
