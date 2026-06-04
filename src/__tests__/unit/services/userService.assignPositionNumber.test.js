const UserService = require("../../../services/user-service");

// สร้าง tx mock ที่จำลองพฤติกรรมของ prisma transaction client
const makeTx = ({ holder = null, ownCurrent = null } = {}) => {
  const findFirst = jest
    .fn()
    // ครั้งแรก: หา current holder ของ positionNumber
    .mockResolvedValueOnce(holder)
    // ครั้งที่สอง: หา current record ของ user เอง
    .mockResolvedValueOnce(ownCurrent);

  return {
    userPositionNumber: {
      findFirst,
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ id: 999, ...data })
      ),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({ id: 1 }),
    },
  };
};

describe("UserService.assignPositionNumberToUser", () => {
  it("สร้าง record ใหม่เมื่อยังไม่มีใครถือเลขนี้และ user ยังไม่มีเลข", async () => {
    const tx = makeTx();
    const result = await UserService.assignPositionNumberToUser(tx, 10, "ENG-001", 1);

    expect(tx.userPositionNumber.update).not.toHaveBeenCalled();
    expect(tx.userPositionNumber.create).toHaveBeenCalledWith({
      data: {
        userId: 10,
        positionNumber: "ENG-001",
        effectiveFrom: expect.any(Date),
        isCurrent: true,
      },
    });
    expect(tx.auditLog.create).toHaveBeenCalled();
    expect(result.positionNumber).toBe("ENG-001");
    expect(result.isCurrent).toBe(true);
  });

  it("ย้ายเลขจากเจ้าของเดิม (ปิด record เดิม) แล้วสร้างให้คนใหม่", async () => {
    const holder = { id: 5, userId: 7, positionNumber: "ENG-001", isCurrent: true };
    const tx = makeTx({ holder });

    await UserService.assignPositionNumberToUser(tx, 10, "ENG-001", 1);

    // ปลดเลขจากเจ้าของเดิม
    expect(tx.userPositionNumber.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { isCurrent: false, effectiveTo: expect.any(Date) },
    });
    // ลบ closed record ที่อาจชน unique
    expect(tx.userPositionNumber.deleteMany).toHaveBeenCalled();
    // สร้างให้คนใหม่
    expect(tx.userPositionNumber.create).toHaveBeenCalledWith({
      data: {
        userId: 10,
        positionNumber: "ENG-001",
        effectiveFrom: expect.any(Date),
        isCurrent: true,
      },
    });
  });

  it("ไม่ทำอะไรถ้า user ถือเลขนี้อยู่แล้ว", async () => {
    const ownCurrent = { id: 8, userId: 10, positionNumber: "ENG-001", isCurrent: true };
    // holder ของเลขนี้คือ user เอง -> ไม่เข้าเงื่อนไขย้าย
    const tx = makeTx({ holder: ownCurrent, ownCurrent });

    const result = await UserService.assignPositionNumberToUser(tx, 10, "ENG-001", 1);

    expect(tx.userPositionNumber.create).not.toHaveBeenCalled();
    expect(result).toEqual(ownCurrent);
  });

  it("โยน error เมื่อ positionNumber ว่าง", async () => {
    const tx = makeTx();
    await expect(
      UserService.assignPositionNumberToUser(tx, 10, "   ", 1)
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(tx.userPositionNumber.create).not.toHaveBeenCalled();
  });

  it("ไม่สร้าง audit log เมื่อไม่ส่ง changedByUserId", async () => {
    const tx = makeTx();
    await UserService.assignPositionNumberToUser(tx, 10, "ENG-002", null);
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
