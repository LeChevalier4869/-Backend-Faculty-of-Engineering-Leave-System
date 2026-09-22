// เทสกฎ "1 คน = หัวหน้าได้เพียง 1 แผนก" ใน AdminService.assignHead
jest.mock("../../../config/prisma", () => ({
  department: { findUnique: jest.fn(), findFirst: jest.fn() },
  user: { findUnique: jest.fn() },
  role: { findFirst: jest.fn() },
  $transaction: jest.fn(),
}));
jest.mock("nodemailer", () => ({
  createTransport: () => ({ sendMail: jest.fn().mockResolvedValue({}) }),
}));

const prisma = require("../../../config/prisma");
const AdminService = require("../../../services/admin-service");

beforeEach(() => jest.clearAllMocks());

describe("AdminService.assignHead — 1 แผนก 1 หัวหน้า / 1 คน 1 แผนก", () => {
  it("บล็อก (409) เมื่อผู้ใช้เป็นหัวหน้าแผนกอื่นอยู่แล้ว และไม่แตะทรานแซกชัน", async () => {
    prisma.department.findUnique.mockResolvedValue({ id: 11, headId: null });
    prisma.user.findUnique.mockResolvedValue({
      id: 12, prefixName: "นาย", firstName: "อานนท์", lastName: "สิโกมาตย์",
    });
    prisma.department.findFirst.mockResolvedValue({ name: "วิศวกรรมคอมพิวเตอร์" });

    await expect(AdminService.assignHead(11, 12)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(prisma.department.findFirst).toHaveBeenCalledWith({
      where: { headId: 12, id: { not: 11 } },
      select: { name: true },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("ผ่าน guard เมื่อไม่ได้เป็นหัวหน้าที่อื่น → เข้าสู่ทรานแซกชัน", async () => {
    prisma.department.findUnique.mockResolvedValue({ id: 11, headId: null });
    prisma.user.findUnique.mockResolvedValue({
      id: 58, prefixName: "นาง", firstName: "ทดสอบ", lastName: "ระบบ",
    });
    prisma.department.findFirst.mockResolvedValue(null);
    prisma.role.findFirst.mockResolvedValue({ id: 3 });
    prisma.$transaction.mockResolvedValue({ id: 11, headId: 58, head: {} });

    await AdminService.assignHead(11, 58);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe("AdminService.vacateHead — ปลดหัวหน้าสาขา", () => {
  it("ปลดสำเร็จ → เข้าทรานแซกชัน และคืนชื่อหัวหน้าเดิม", async () => {
    prisma.department.findUnique.mockResolvedValue({
      id: 11, name: "เคมี", headId: 58,
      head: { id: 58, prefixName: "นาง", firstName: "ทดสอบ", lastName: "ระบบ" },
    });
    prisma.role.findFirst.mockResolvedValue({ id: 3 });
    prisma.$transaction.mockResolvedValue(undefined);

    const result = await AdminService.vacateHead(11);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ id: 11, name: "เคมี", previousHead: { id: 58 } });
  });

  it("บล็อก (400) เมื่อแผนกยังไม่มีหัวหน้า", async () => {
    prisma.department.findUnique.mockResolvedValue({
      id: 11, name: "เคมี", headId: null, head: null,
    });
    await expect(AdminService.vacateHead(11)).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
