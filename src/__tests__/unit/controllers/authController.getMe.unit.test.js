const authController = require("../../../controllers/auth-controller");

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe("auth-controller.getMe", () => {
  it("returns req.user with 200", async () => {
    const req = { user: { id: 1, email: "a@b.com", role: ["ADMIN"] } };
    const res = makeRes();
    const next = jest.fn();

    await authController.getMe(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(req.user);
  });
});
