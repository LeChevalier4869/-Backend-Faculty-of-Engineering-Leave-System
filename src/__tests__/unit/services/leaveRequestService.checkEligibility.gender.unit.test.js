// เทสว่า checkEligibility บังคับเงื่อนไขเพศจริง (ไม่ใช่แค่ซ่อนใน UI)
// checkEligibility เป็นจุดร่วมของทั้งการยื่นเอง (user) และยื่นแทนโดย admin
jest.mock("../../../config/prisma", () => ({
  user: { findUnique: jest.fn() },
  leaveType: { findUnique: jest.fn() },
  setting: { findUnique: jest.fn() },
  userRank: { findFirst: jest.fn() },
  leaveBalance: { findFirst: jest.fn() },
}));

const prisma = require("../../../config/prisma");
const LeaveRequestService = require("../../../services/leaveRequest-service");

const MATERNITY = { id: 2, name: "ลาคลอดบุตร" };
const MILITARY = { id: 6, name: "ลาเข้ารับการตรวจเลือกเข้ารับการเตรียมพล" };

const mockUser = (sex) =>
  prisma.user.findUnique.mockResolvedValue({
    id: 10,
    sex,
    personnelType: { id: 1 },
  });

beforeEach(() => {
  jest.clearAllMocks();
  prisma.setting.findUnique.mockResolvedValue({ value: "2025" });
  prisma.userRank.findFirst.mockResolvedValue(null);
  prisma.leaveBalance.findFirst.mockResolvedValue({ remainingDays: 90 });
});

describe("checkEligibility — เงื่อนไขเพศ", () => {
  it("ชาย ยื่นลาคลอดบุตร → โยน 400", async () => {
    mockUser("ชาย");
    prisma.leaveType.findUnique.mockResolvedValue(MATERNITY);

    await expect(
      LeaveRequestService.checkEligibility(10, MATERNITY.id, 1),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("หญิง ยื่นลาตรวจเลือกทหาร → โยน 400", async () => {
    mockUser("หญิง");
    prisma.leaveType.findUnique.mockResolvedValue(MILITARY);

    await expect(
      LeaveRequestService.checkEligibility(10, MILITARY.id, 1),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("หญิง ยื่นลาคลอดบุตร → ผ่านด่านเพศ (ไม่โยน error เพศ)", async () => {
    mockUser("หญิง");
    prisma.leaveType.findUnique.mockResolvedValue(MATERNITY);

    const result = await LeaveRequestService.checkEligibility(10, MATERNITY.id, 1);
    expect(result.success).toBe(true);
  });

  it("ชาย ยื่นลาตรวจเลือกทหาร → ผ่านด่านเพศ (ประเภทไม่หักวัน คืน success)", async () => {
    mockUser("ชาย");
    prisma.leaveType.findUnique.mockResolvedValue(MILITARY);

    const result = await LeaveRequestService.checkEligibility(10, MILITARY.id, 1);
    expect(result.success).toBe(true);
  });
});
