jest.mock("../../config/prisma", () => ({
  user: { findUnique: jest.fn() },
}));

jest.mock("jsonwebtoken", () => ({ verify: jest.fn() }));

const prisma = require("../../config/prisma");
const jwt = require("jsonwebtoken");

let app;
const request = require("supertest");

describe("Smoke integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete require.cache[require.resolve("../../app")];
    app = require("../../app");
  });

  it("GET /auth/profile requires auth and returns user on success", async () => {
    jwt.verify.mockReturnValue({ userId: 42 });
    prisma.user.findUnique.mockResolvedValue({
      id: 42,
      email: "a@b.com",
      userRoles: [{ role: { name: "ADMIN" } }],
      department: { id: 1, organization: { id: 9 } },
      personnelType: { name: "X" },
    });

    const res = await request(app)
      .get("/auth/profile")
      .set("Authorization", "Bearer token")
      .expect(200);

    expect(res.body).toHaveProperty("message", "This is protected");
    expect(res.body.user).toBeDefined();
    expect(res.body.user.id).toBe(42);
  });

  it("POST /api/export-report returns 400 when missing fields", async () => {
    const res = await request(app)
      .post("/api/export-report")
      .send({ organizationId: 10, countReport: 1, startDate: "2025-01-01" }) // missing endDate & format
      .expect(400);

    expect(res.body).toHaveProperty("error");
  });
});
