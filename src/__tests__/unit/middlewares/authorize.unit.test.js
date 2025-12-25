const { authorize } = require("../../../middlewares/auth");

describe("authorize middleware", () => {
  it("calls next() when user has required role (role array)", () => {
    const mw = authorize(["ADMIN"]);
    const req = { user: { role: ["ADMIN"] } };
    const res = {};
    const next = jest.fn();

    mw(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it("calls next() when user has required role (roles array)", () => {
    const mw = authorize(["ADMIN"]);
    const req = { user: { roles: ["ADMIN"] } };
    const res = {};
    const next = jest.fn();

    mw(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it("passes 403 error to next() when user lacks role", () => {
    const mw = authorize(["ADMIN"]);
    const req = { user: { role: ["USER"] } };
    const res = {};
    const next = jest.fn();

    expect(() => mw(req, res, next)).toThrow("Forbidden");
  });

  it("passes 403 error to next() when req.user is missing", () => {
    const mw = authorize(["ADMIN"]);
    const req = {};
    const res = {};
    const next = jest.fn();

    expect(() => mw(req, res, next)).toThrow("Forbidden");
  });
});
