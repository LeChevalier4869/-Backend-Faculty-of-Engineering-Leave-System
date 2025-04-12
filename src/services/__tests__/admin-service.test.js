// ✅ admin-service.test.js - Unit test ด้วย Jest
const AdminService = require("../admin-service");
const prisma = require("../../config/prisma");

jest.mock("../../config/prisma");

describe("AdminService", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getAdminList", () => {
    it("should return list of admins", async () => {
      const mockAdmins = [
        { id: 1, firstName: "Admin", lastName: "One", email: "admin@example.com" },
      ];
      prisma.user.findMany.mockResolvedValue(mockAdmins);

      const result = await AdminService.getAdminList();
      expect(prisma.user.findMany).toHaveBeenCalled();
      expect(result).toEqual(mockAdmins);
    });
  });

  describe("createLeaveRequestForUser", () => {
    it("should create a new leave request", async () => {
      const input = {
        userId: 1,
        leaveTypeId: 2,
        startDate: "2024-04-20",
        endDate: "2024-04-22",
        reason: "ทดสอบ",
        isEmergency: false,
        verifierId: 5,
        receiverId: 6,
      };
      const mockRequest = { id: 101, ...input };
      prisma.leaveRequest.create.mockResolvedValue(mockRequest);

      const result = await AdminService.createLeaveRequestForUser(input);
      expect(prisma.leaveRequest.create).toHaveBeenCalledWith({
        data: {
          ...input,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          isEmergency: false,
          status: "PENDING",
        },
      });
      expect(result).toEqual(mockRequest);
    });
  });

  describe("getHoliday", () => {
    it("should return holiday list", async () => {
      const mockHolidays = [{ id: 1, date: new Date(), description: "วันหยุด" }];
      prisma.holiday.findMany.mockResolvedValue(mockHolidays);

      const result = await AdminService.getHoliday();
      expect(prisma.holiday.findMany).toHaveBeenCalled();
      expect(result).toEqual(mockHolidays);
    });
  });
});
