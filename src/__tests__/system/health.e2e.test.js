const request = require("supertest");

const app = require("../../app");

describe("System/E2E smoke", () => {
  it("returns 404 for unknown route (app is up)", async () => {
    await request(app).get("/__e2e_smoke__").expect(404);
  });
});
