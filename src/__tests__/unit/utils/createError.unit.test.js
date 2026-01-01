const createError = require("../../../utils/createError");

describe("createError", () => {
  it("throws an Error with statusCode and message", () => {
    try {
      createError(400, "Bad Request");
      throw new Error("Expected createError to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe("Bad Request");
      expect(err.statusCode).toBe(400);
    }
  });
});
