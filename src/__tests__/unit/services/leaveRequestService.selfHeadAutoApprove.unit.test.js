// เทส: หัวหน้าสาขายื่นลาเอง -> อนุมัติขั้น 1 อัตโนมัติ + สร้างขั้น 2 (สารบรรณคณะ) PENDING
// คนอื่นยื่น -> สร้างขั้น 1 PENDING ตามปกติ
jest.mock("../../../config/prisma", () => ({
  leaveRequest: { create: jest.fn() },
  user: { findUnique: jest.fn() },
  leaveRequestDetail: { create: jest.fn() },
  userRole: { findFirst: jest.fn() },
}));
jest.mock("../../../utils/dateCalculate", () => ({
  calculateWorkingDays: jest.fn().mockResolvedValue(2),
}));
jest.mock("../../../services/user-service", () => ({
  getApproversForLevel: jest.fn(),
}));

const prisma = require("../../../config/prisma");
const UserService = require("../../../services/user-service");
const LeaveRequestService = require("../../../services/leaveRequest-service");

const args = () => [12, 1, "2025-11-10", "2025-11-11", "เหตุผล", "ติดต่อ"];

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .spyOn(LeaveRequestService, "checkEligibility")
    .mockResolvedValue({ success: true, balance: { usedDays: 0, remainingDays: 10 } });
  jest.spyOn(LeaveRequestService, "notifyApprover").mockResolvedValue();
  jest.spyOn(LeaveRequestService, "notifyRequester").mockResolvedValue();
  prisma.leaveRequest.create.mockResolvedValue({ id: 500, thisTimeDays: 2 });
  UserService.getApproversForLevel.mockResolvedValue([{ id: 58 }]); // สารบรรณคณะ (APPROVER_2)
});

afterEach(() => jest.restoreAllMocks());

describe("createRequest — หัวหน้าสาขายื่นลาเอง (auto-approve step 1)", () => {
  it("ผู้ยื่น = หัวหน้าสาขา -> ขั้น 1 APPROVED อัตโนมัติ + ขั้น 2 PENDING ให้สารบรรณคณะ", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 12, department: { headId: 12 } });
    jest
      .spyOn(LeaveRequestService, "resolveFirstPendingStep")
      .mockResolvedValue({ approverId: 12, stepOrder: 1 }); // head = ผู้ยื่นเอง

    await LeaveRequestService.createRequest(...args());

    expect(prisma.leaveRequestDetail.create).toHaveBeenCalledTimes(2);
    const first = prisma.leaveRequestDetail.create.mock.calls[0][0].data;
    const second = prisma.leaveRequestDetail.create.mock.calls[1][0].data;
    expect(first).toMatchObject({ approverId: 12, stepOrder: 1, status: "APPROVED" });
    expect(second).toMatchObject({ approverId: 58, stepOrder: 2, status: "PENDING" });
    // แจ้งเตือนไปยังขั้นถัดไป (สารบรรณคณะ)
    expect(LeaveRequestService.notifyApprover).toHaveBeenCalledWith(
      expect.objectContaining({ approverId: 58 }),
    );
  });

  it("ผู้ยื่น = ลูกน้อง (ไม่ใช่หัวหน้า) -> ขั้น 1 PENDING ส่งให้หัวหน้าสาขาปกติ", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 99, department: { headId: 12 } });
    jest
      .spyOn(LeaveRequestService, "resolveFirstPendingStep")
      .mockResolvedValue({ approverId: 12, stepOrder: 1 }); // head = คนอื่น (12)

    await LeaveRequestService.createRequest(99, 1, "2025-11-10", "2025-11-11", "r", "c");

    expect(prisma.leaveRequestDetail.create).toHaveBeenCalledTimes(1);
    const only = prisma.leaveRequestDetail.create.mock.calls[0][0].data;
    expect(only).toMatchObject({ approverId: 12, stepOrder: 1, status: "PENDING" });
    expect(LeaveRequestService.notifyApprover).toHaveBeenCalledWith(
      expect.objectContaining({ approverId: 12 }),
    );
  });
});
