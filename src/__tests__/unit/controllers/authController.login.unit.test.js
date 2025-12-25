jest.mock("../../../services/user-service");
jest.mock("bcryptjs", () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));
jest.mock("jsonwebtoken", () => ({
  sign: jest.fn(),
}));

const UserService = require("../../../services/user-service");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const authController = require("../../../controllers/auth-controller");

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe("auth-controller.login", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = "test_secret";
    process.env.JWT_EXPIRESIN = "1h";

    jwt.sign.mockReturnValue("jwt_token");
    bcrypt.compare.mockResolvedValue(true);

    UserService.getUserByEmail.mockResolvedValue(null);
    UserService.getUserByUsername.mockResolvedValue([]);
    UserService.getUserByIdWithRoles.mockResolvedValue({
      userRoles: [{ role: { name: "USER" } }],
    });
    UserService.getDepartment.mockResolvedValue({ id: 10, name: "D" });
    UserService.getOrganization.mockResolvedValue({ id: 20, name: "O" });
    UserService.getPersonnelType.mockResolvedValue({ id: 30, name: "P" });
  });

  it("calls next(error) when email/password missing", async () => {
    const req = { body: { email: "a@rmuti.ac.th" } };
    const res = makeRes();
    const next = jest.fn();

    await authController.login(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(400);
  });

  it("calls next(error) when user not found by email", async () => {
    const req = { body: { email: "a@rmuti.ac.th", password: "pw" } };
    const res = makeRes();
    const next = jest.fn();

    UserService.getUserByEmail.mockResolvedValue(null);

    await authController.login(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(404);
  });

  it("calls next(error) when password mismatch", async () => {
    const req = { body: { email: "a@rmuti.ac.th", password: "bad" } };
    const res = makeRes();
    const next = jest.fn();

    UserService.getUserByEmail.mockResolvedValue({
      id: 1,
      email: "a@rmuti.ac.th",
      password: "hash",
    });
    bcrypt.compare.mockResolvedValue(false);

    await authController.login(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(401);
  });

  it("returns 200 with token on success (email login)", async () => {
    const req = { body: { email: "a@rmuti.ac.th", password: "pw" } };
    const res = makeRes();
    const next = jest.fn();

    UserService.getUserByEmail.mockResolvedValue({
      id: 1,
      email: "a@rmuti.ac.th",
      prefixName: "นาย",
      firstName: "A",
      lastName: "B",
      sex: "M",
      phone: "000",
      hireDate: null,
      employmentType: "ACADEMIC",
      profilePicturePath: null,
      password: "hash",
    });

    await authController.login(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(jwt.sign).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ token: "jwt_token" });
  });

  it("resolves username login by matching local-part and returns 200", async () => {
    const req = { body: { email: "user1", password: "pw" } };
    const res = makeRes();
    const next = jest.fn();

    UserService.getUserByUsername.mockResolvedValue([
      {
        id: 1,
        email: "user1@rmuti.ac.th",
        prefixName: "นาย",
        firstName: "A",
        lastName: "B",
        sex: "M",
        phone: "000",
        hireDate: null,
        employmentType: "ACADEMIC",
        profilePicturePath: null,
        password: "hash",
      },
      { id: 2, email: "other@rmuti.ac.th", password: "hash2" },
    ]);

    await authController.login(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(UserService.getUserByUsername).toHaveBeenCalledWith("user1");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ token: "jwt_token" });
  });
});
