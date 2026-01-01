jest.mock("../../../config/prisma");

const prisma = require("../../../config/prisma");
const APIService = require("../../../services/api-service");

describe("APIService.getContactInfo", () => {
  it("queries prisma.setting.findMany with correct filter", async () => {
    prisma.setting.findMany.mockResolvedValue([
      { id: 1, key: "AdminName", value: "A" },
    ]);

    const result = await APIService.getContactInfo();

    expect(prisma.setting.findMany).toHaveBeenCalledWith({
      where: {
        key: {
          in: ["AdminName", "AdminPhone", "AdminMail"],
        },
      },
      orderBy: { id: "asc" },
    });

    expect(result).toEqual([{ id: 1, key: "AdminName", value: "A" }]);
  });
});
