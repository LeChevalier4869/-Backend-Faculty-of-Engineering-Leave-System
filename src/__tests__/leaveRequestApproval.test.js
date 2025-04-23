// ยังไม่สามารถทดสอบได้
const LeaveRequestService = require("../services/leaveRequest-service");
const prisma = require("../config/prisma");

jest.mock("../config/prisma");
jest.mock("../utils/emailService");
jest.mock("../services/leaveBalance-service");
jest.mock("../services/user-service");

const mockUser = {
  id: 1,
  prefixName: "นาย",
  firstName: "สมชาย",
  lastName: "ใจดี",
  email: "somchai@example.com",
  personnelTypeId: 1,
  department: { headId: 2 },
};

const mockVerifier = { id: 3 };
const mockReceiver = { id: 4 };
const mockRank = { rank: "A", receiveDays: 10, maxDays: 30, isBalance: true };
const mockBalance = { usedDays: 0, remainingDays: 10 };

// Mock holiday, rank, and balance
prisma.holiday = { findMany: jest.fn().mockResolvedValue([]) };
prisma.user_Rank = {
  findFirst: jest.fn().mockResolvedValue(mockRank),
};

beforeEach(() => {
  jest.clearAllMocks();

  prisma.user.findUnique.mockResolvedValue(mockUser);
  prisma.leaveType.findUnique.mockResolvedValue({ id: 1, name: "ลาพักผ่อน" });
  prisma.leaveBalance.findFirst.mockResolvedValue(mockBalance);

  prisma.leaveRequest = {
    create: jest.fn().mockResolvedValue({ id: 100 }),
    update: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
  };

  prisma.leaveRequestDetail = {
    create: jest.fn().mockResolvedValue({ id: 1 }),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  };

  require("../services/user-service").getVerifier.mockResolvedValue(mockVerifier);
  require("../services/user-service").getReceiver.mockResolvedValue(mockReceiver);
  require("../services/user-service").getUserByIdWithRoles.mockResolvedValue(mockUser);
  require("../services/rank-service").getRankForUser = jest.fn().mockResolvedValue(mockRank);
  require("../services/leaveBalance-service").finalizeLeaveBalance = jest.fn();
});

test("✅ should create leave request and first approval step", async () => {
  const result = await LeaveRequestService.createRequest(
    mockUser.id,
    1,
    "2025-05-01",
    "2025-05-03",
    "ไปพักผ่อน",
    false,
    "ติดต่อได้ที่เบอร์เดิม"
  );

  expect(result).toHaveProperty("id");
  expect(prisma.leaveRequest.create).toHaveBeenCalled();
  expect(prisma.leaveRequestDetail.create).toHaveBeenCalledWith(
    expect.objectContaining({
      approverId: mockUser.department.headId,
      stepOrder: 1,
      status: "PENDING",
    })
  );
});
