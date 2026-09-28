// เปลี่ยนผู้ดำรงตำแหน่งระดับคณะ (เช่น สารบรรณคณะ) ต้องโอนคำขอที่ค้างขั้นนั้นไปให้คนใหม่
// ไม่งั้นคำขอที่บันทึก approverId เป็นคนเดิมจะหลุดจากคิวของทุกคน
jest.mock("../../../config/prisma", () => ({
  user: { findUnique: jest.fn() },
  role: { findFirst: jest.fn() },
  organization: { findFirst: jest.fn() },
  userRole: { findMany: jest.fn() },
  leaveRequestDetail: { updateMany: jest.fn() },
  leaveRequest: { updateMany: jest.fn() },
  $transaction: jest.fn(),
}));

const prisma = require("../../../config/prisma");
const ApproverPositionService = require("../../../services/approverPosition-service");

beforeEach(() => jest.clearAllMocks());

describe("ApproverPositionService.reassignPendingSteps", () => {
  it("โอนขั้นที่ 2 (สารบรรณคณะ) ที่ค้างกับคนเดิมไปให้ผู้ถือบทบาทปัจจุบัน + อัปเดต verifierId", async () => {
    prisma.userRole.findMany.mockResolvedValue([{ userId: 7 }]);
    prisma.leaveRequestDetail.updateMany.mockResolvedValue({ count: 3 });
    prisma.leaveRequest.updateMany.mockResolvedValue({ count: 3 });

    const moved = await ApproverPositionService.reassignPendingSteps(2);

    expect(moved).toBe(3);
    expect(prisma.userRole.findMany).toHaveBeenCalledWith({
      where: { role: { name: "APPROVER_2" } },
      select: { userId: true },
      orderBy: { id: "asc" },
    });
    expect(prisma.leaveRequestDetail.updateMany).toHaveBeenCalledWith({
      where: {
        stepOrder: 2,
        status: "PENDING",
        approverId: { notIn: [7] },
        leaveRequest: { status: "PENDING" },
      },
      data: { approverId: 7 },
    });
    expect(prisma.leaveRequest.updateMany).toHaveBeenCalledWith({
      where: { status: "PENDING", verifierId: { notIn: [7] } },
      data: { verifierId: 7 },
    });
  });

  it("ระดับ 5 (คณบดี) ใช้ stepOrder 6 และไม่แตะ verifierId", async () => {
    prisma.userRole.findMany.mockResolvedValue([{ userId: 9 }]);
    prisma.leaveRequestDetail.updateMany.mockResolvedValue({ count: 1 });

    await ApproverPositionService.reassignPendingSteps(5);

    expect(prisma.leaveRequestDetail.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ stepOrder: 6 }),
        data: { approverId: 9 },
      })
    );
    expect(prisma.leaveRequest.updateMany).not.toHaveBeenCalled();
  });

  it("ไม่มีผู้ถือบทบาท (ตำแหน่งว่าง) → ไม่โอน รอแต่งตั้งคนใหม่", async () => {
    prisma.userRole.findMany.mockResolvedValue([]);

    const moved = await ApproverPositionService.reassignPendingSteps(2);

    expect(moved).toBe(0);
    expect(prisma.leaveRequestDetail.updateMany).not.toHaveBeenCalled();
  });

  it("ระดับที่ไม่ใช่ระดับคณะ (1) → ไม่ทำอะไร", async () => {
    const moved = await ApproverPositionService.reassignPendingSteps(1);
    expect(moved).toBe(0);
    expect(prisma.userRole.findMany).not.toHaveBeenCalled();
  });
});

describe("ApproverPositionService.assign — โอนคำขอค้างในทรานแซกชันเดียวกัน", () => {
  it("แต่งตั้งสารบรรณคณะคนใหม่ → โอนขั้นที่ 2 ที่ค้างให้คนใหม่", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 7 });
    prisma.role.findFirst.mockResolvedValue({ id: 22 });
    prisma.organization.findFirst.mockResolvedValue({ id: 1 });

    const tx = {
      approverPosition: {
        findMany: jest.fn().mockResolvedValue([{ id: 100, userId: 5 }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: 101, userId: 7 }),
      },
      userRole: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([{ userId: 7 }]),
      },
      leaveRequestDetail: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      leaveRequest: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    prisma.$transaction.mockImplementation((fn) => fn(tx));

    const result = await ApproverPositionService.assign(2, 7);

    expect(result.transferred).toBe(2);
    expect(tx.leaveRequestDetail.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          stepOrder: 2,
          status: "PENDING",
          approverId: { notIn: [7] },
        }),
        data: { approverId: 7 },
      })
    );
    // ต้องโอนหลังให้บทบาทคนใหม่แล้ว (อ่านผู้ถือบทบาทจาก tx เดียวกัน)
    expect(tx.userRole.createMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.userRole.findMany.mock.invocationCallOrder[0]
    );
    // ไม่ใช้ prisma นอกทรานแซกชัน
    expect(prisma.leaveRequestDetail.updateMany).not.toHaveBeenCalled();
  });
});
