// เทส routing กล่อง inbox หัวหน้าสาขา (ขั้นที่ 1): ต้องกรองด้วย approverId ที่ถูก assign ให้เราจริง
// ไม่ใช่กรองด้วย departmentId ของหัวหน้าที่ล็อกอิน (ต้นตอบั๊กใบลาข้ามแผนก/ไม่ไปไหนเลย)
jest.mock("../../../config/prisma", () => ({
  proxyApproval: { findMany: jest.fn() },
  leaveRequest: { findMany: jest.fn() },
}));

const prisma = require("../../../config/prisma");
const LeaveRequestService = require("../../../services/leaveRequest-service");

beforeEach(() => jest.clearAllMocks());

describe("getPendingRequestsByFirstApprover — route by assigned approverId", () => {
  it("กรองด้วย stepOrder 1 + approverId = ผู้ล็อกอิน และไม่กรองด้วยแผนกของผู้ยื่น", async () => {
    prisma.proxyApproval.findMany.mockResolvedValue([]);
    prisma.leaveRequest.findMany.mockResolvedValue([]);

    await LeaveRequestService.getPendingRequestsByFirstApprover(58);

    const arg = prisma.leaveRequest.findMany.mock.calls[0][0];
    // ต้นตอบั๊ก: เดิมมี where.user.departmentId — ต้องไม่มีแล้ว
    expect(arg.where.user).toBeUndefined();
    const some = arg.where.leaveRequestDetails.some;
    expect(some.stepOrder).toBe(1);
    expect(some.status).toBe("PENDING");
    expect(some.approverId).toEqual({ in: [58] });
    expect(arg.where.status).toBe("PENDING");
  });

  it("รวม originalApproverId ของ proxy ระดับ 1 ที่มอบอำนาจให้เรา", async () => {
    prisma.proxyApproval.findMany.mockResolvedValue([
      { originalApproverId: 12 },
      { originalApproverId: 33 },
    ]);
    prisma.leaveRequest.findMany.mockResolvedValue([]);

    await LeaveRequestService.getPendingRequestsByFirstApprover(58);

    expect(prisma.proxyApproval.findMany).toHaveBeenCalledWith({
      where: { proxyApproverId: 58, approverLevel: 1, status: "ACTIVE" },
      select: { originalApproverId: true },
    });
    const arg = prisma.leaveRequest.findMany.mock.calls[0][0];
    expect(arg.where.leaveRequestDetails.some.approverId).toEqual({
      in: [58, 12, 33],
    });
    // include ก็ต้องกรอง step-1 detail ด้วยชุด approver เดียวกัน
    expect(arg.include.leaveRequestDetails.where.approverId).toEqual({
      in: [58, 12, 33],
    });
  });
});
