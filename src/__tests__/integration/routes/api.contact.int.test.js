const request = require("supertest");

jest.mock("../../../services/api-service", () => ({
  getContactInfo: jest.fn(),
}));

const APIService = require("../../../services/api-service");
const app = require("../../../app");

describe("GET /api/contact", () => {
  it("returns contact info", async () => {
    APIService.getContactInfo.mockResolvedValue([
      { id: 1, key: "AdminName", value: "Admin" },
      { id: 2, key: "AdminPhone", value: "0123456789" },
    ]);

    const res = await request(app).get("/api/contact").expect(200);
    expect(res.body).toEqual([
      { id: 1, key: "AdminName", value: "Admin" },
      { id: 2, key: "AdminPhone", value: "0123456789" },
    ]);
  });
});
