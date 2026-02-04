jest.mock("../../../middlewares/auth", () => {
  const original = jest.requireActual("../../../middlewares/auth");
  return { ...original };
});

jest.mock("jsonwebtoken", () => ({
  verify: jest.fn(),
}));

jest.mock("../../../config/prisma", () => ({
  user: { findUnique: jest.fn() },
}));

const { authenticate } = require("../../../middlewares/auth");
const jwt = require("jsonwebtoken");
const prisma = require("../../../config/prisma");

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  setImmediate;
  return res;
};

const makeNext = () => jest.fn();

describe("middleware.authenticate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_ACCESS_SECRET = "access_secret";
  });

  it("returns 401 when Authorization header missing", async () => {
    const req = { headers: {} };
    const res = makeRes();
    const next = makeNext();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: "Missing or invalid Authorization header",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when Authorization header not Bearer", async () => {
    const req = { headers: { authorization: "Token abc" } };
    const res = makeRes();
    const next = makeNext();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: "Missing or invalid Authorization header",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when jwt.verify throws", async () => {
    const req = { headers: { authorization: "Bearer bad" } };
    const res = makeRes();
    const next = makeNext();

    jwt.verify.mockImplementation(() => {
      throw new Error("jwt invalid");
    });

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: "Unauthorized",
      error: "jwt invalid",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when user not found", async () => {
    const req = { headers: { authorization: "Bearer good" } };
    const res = makeRes();
    const next = makeNext();

    jwt.verify.mockReturnValue({ userId: 123 });
    prisma.user.findUnique.mockResolvedValue(null);

    await authenticate(req, res, next);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 123 },
      include: {
        userRoles: { include: { role: true } },
        department: { include: { organization: true } },
        personnelType: { select: { name: true } },
        positionNumbers: {
          where: { isCurrent: true },
          select: {
            positionNumber: true,
            effectiveFrom: true,
          },
        },
      },
    });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "User not found" });
    expect(next).not.toHaveBeenCalled();
  });

  it("attaches req.user with role names and calls next on success", async () => {
    const req = { headers: { authorization: "Bearer good" } };
    const res = makeRes();
    const next = makeNext();

    jwt.verify.mockReturnValue({ userId: 42 });
    prisma.user.findUnique.mockResolvedValue({
      id: 42,
      email: "a@b.com",
      userRoles: [
        { role: { name: "ADMIN" } },
        { role: { name: "APPROVER_1" } },
      ],
      department: { id: 5, organization: { id: 9 } },
      personnelType: { name: "X" },
      positionNumbers: [{
        positionNumber: "ENG-001",
        effectiveFrom: new Date("2024-01-01")
      }],
    });

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toBeDefined();
    expect(req.user.id).toBe(42);
    expect(req.user.role).toEqual(["ADMIN", "APPROVER_1"]);
    expect(req.user.roles).toEqual(["ADMIN", "APPROVER_1"]);
  });
});
