// 📦 user-service.test.js
const UserService = require("../user-service");
const prisma = require("../../config/prisma");

describe("UserService", () => {
  describe("getVerifier", () => {
    it("should return a user with the role VERIFIER", async () => {
        jest.setTimeout(10000);
      // Arrange: สร้าง user มี role VERIFIER
      const user = await prisma.user.create({
        data: {
          firstName: "Verifier",
          lastName: "Test",
          email: `verifier-${Date.now()}@test.com`,
          password: "testpass",
          sex: "M",
          hireDate: new Date(),
          department: {
            create: {
              name: "TestDept",
              organization: { create: { name: "TestOrg" } },
            },
          },
          personnelType: {
            create: { name: "TestPersonnel" },
          },
          userRoles: {
            create: {
              role: {
                connectOrCreate: { 
                    where: { name: "VERIFIER" },    
                    create: { name: "VERIFIER" },
                },
              },
            },
          },
        },
        include: { userRoles: true },
      });

      // Act
      const result = await UserService.getVerifier();

      // Assert
      expect(result).toBeDefined();
      expect(result.email).toBe(user.email);

      // Cleanup
      await prisma.user.delete({ where: { id: user.id } });
    });
  });

  describe("getReceiver", () => {
    it("should return a user with the role RECEIVER", async () => {
      const user = await prisma.user.create({
        data: {
          firstName: "Receiver",
          lastName: "Test",
          email: `receiver-${Date.now()}@test.com`,
          password: "testpass",
          sex: "F",
          hireDate: new Date(),
          department: {
            create: {
              name: "TestDept2",
              organization: { create: { name: "TestOrg2" } },
            },
          },
          personnelType: {
            create: { name: "TestPersonnel2" },
          },
          userRoles: {
            create: {
              role: {
                connectOrCreate: { 
                    where: { name: "RECEIVER" },
                    create: { name: "RECEIVER" }
                },
              },
            },
          },
        },
        include: { userRoles: true },
      });

      const result = await UserService.getReceiver();

      expect(result).toBeDefined();
      expect(result.email).toBe(user.email);

      await prisma.user.delete({ where: { id: user.id } });
    });
  });
});

afterAll(async () => {
    await prisma.$disconnect();
  });