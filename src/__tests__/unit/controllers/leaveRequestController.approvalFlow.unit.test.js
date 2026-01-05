jest.mock("../../../services/leaveRequest-service", () => ({
  approveByFirstApprover: jest.fn(),
  rejectByFirstApprover: jest.fn(),
  approveByVerifier: jest.fn(),
  rejectByVerifier: jest.fn(),
  approveBySecondApprover: jest.fn(),
  rejectBySecondApprover: jest.fn(),
  approveByThirdApprover: jest.fn(),
  rejectByThirdApprover: jest.fn(),
  approveByFourthApprover: jest.fn(),
  rejectByFourthApprover: jest.fn(),
}));

jest.mock("../../../services/user-service", () => ({
  getApproversForLevel: jest.fn(),
}));

const LeaveRequestService = require("../../../services/leaveRequest-service");
const UserService = require("../../../services/user-service");
const leaveRequestController = require("../../../controllers/leaveRequest-controller");

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const expectInvalidId = async (handler) => {
  const req = {
    params: { id: "abc" },
    body: { remarks: "r", comment: "c" },
    user: { id: 10 },
  };
  const res = makeRes();
  const next = jest.fn();

  await handler(req, res, next);

  expect(next).toHaveBeenCalledTimes(1);
  const err = next.mock.calls[0][0];
  expect(err).toBeInstanceOf(Error);
  expect(err.statusCode).toBe(400);
};

describe("leaveRequest-controller approval/verifier flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  describe("approve/reject approver1", () => {
    it("approveByFirstApprover -> 400 when id invalid", async () => {
      await expectInvalidId(leaveRequestController.approveByFirstApprover);
      expect(LeaveRequestService.approveByFirstApprover).not.toHaveBeenCalled();
    });

    it("approveByFirstApprover -> calls service and returns res.json", async () => {
      LeaveRequestService.approveByFirstApprover.mockResolvedValue({ ok: true });

      const req = {
        params: { id: "123" },
        body: { remarks: "r", comment: "c" },
        user: { id: 10 },
      };
      const res = makeRes();
      const next = jest.fn();

      await leaveRequestController.approveByFirstApprover(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(LeaveRequestService.approveByFirstApprover).toHaveBeenCalledWith({
        id: 123,
        approverId: 10,
        remarks: "r",
        comment: "c",
      });
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });

    it("rejectByFirstApprover -> 400 when id invalid", async () => {
      await expectInvalidId(leaveRequestController.rejectByFirstApprover);
      expect(LeaveRequestService.rejectByFirstApprover).not.toHaveBeenCalled();
    });

    it("rejectByFirstApprover -> calls service and returns res.status(200).json", async () => {
      LeaveRequestService.rejectByFirstApprover.mockResolvedValue({ ok: true });

      const req = {
        params: { id: "123" },
        body: { remarks: "r", comment: "c" },
        user: { id: 10 },
      };
      const res = makeRes();
      const next = jest.fn();

      await leaveRequestController.rejectByFirstApprover(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(LeaveRequestService.rejectByFirstApprover).toHaveBeenCalledWith({
        id: 123,
        approverId: 10,
        remarks: "r",
        comment: "c",
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });
  });

  describe("approve/reject verifier", () => {
    it("approveByVerifier -> 400 when id invalid", async () => {
      await expectInvalidId(leaveRequestController.approveByVerifier);
      expect(LeaveRequestService.approveByVerifier).not.toHaveBeenCalled();
    });

    it("approveByVerifier -> calls service and returns res.json", async () => {
      LeaveRequestService.approveByVerifier.mockResolvedValue({ ok: true });
      
      // Mock UserService.getApproversForLevel to return user as verifier
      UserService.getApproversForLevel.mockResolvedValue([
        { id: 10 }, // User is in verifier list
      ]);

      const req = {
        params: { id: "123" },
        body: { remarks: "r", comment: "c" },
        user: { id: 10 },
      };
      const res = makeRes();
      const next = jest.fn();

      await leaveRequestController.approveByVerifier(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(LeaveRequestService.approveByVerifier).toHaveBeenCalledWith({
        id: 123,
        approverId: 10,
        remarks: "r",
        comment: "c",
      });
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });

    it("rejectByVerifier -> 400 when id invalid", async () => {
      await expectInvalidId(leaveRequestController.rejectByVerifier);
      expect(LeaveRequestService.rejectByVerifier).not.toHaveBeenCalled();
    });

    it("rejectByVerifier -> calls service and returns res.status(200).json", async () => {
      LeaveRequestService.rejectByVerifier.mockResolvedValue({ ok: true });
      
      // Mock UserService.getApproversForLevel to return user as verifier
      UserService.getApproversForLevel.mockResolvedValue([
        { id: 10 }, // User is in verifier list
      ]);

      const req = {
        params: { id: "123" },
        body: { remarks: "r", comment: "c" },
        user: { id: 10 },
      };
      const res = makeRes();
      const next = jest.fn();

      await leaveRequestController.rejectByVerifier(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(LeaveRequestService.rejectByVerifier).toHaveBeenCalledWith({
        id: 123,
        approverId: 10,
        remarks: "r",
        comment: "c",
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });
  });

  describe("approve/reject approver2", () => {
    it("approveBySecondApprover -> 400 when id invalid", async () => {
      await expectInvalidId(leaveRequestController.approveBySecondApprover);
      expect(LeaveRequestService.approveBySecondApprover).not.toHaveBeenCalled();
    });

    it("approveBySecondApprover -> calls service and returns res.json", async () => {
      LeaveRequestService.approveBySecondApprover.mockResolvedValue({ ok: true });

      const req = {
        params: { id: "123" },
        body: { remarks: "r", comment: "c" },
        user: { id: 10 },
      };
      const res = makeRes();
      const next = jest.fn();

      await leaveRequestController.approveBySecondApprover(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(LeaveRequestService.approveBySecondApprover).toHaveBeenCalledWith({
        id: 123,
        approverId: 10,
        remarks: "r",
        comment: "c",
      });
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });

    it("rejectBySecondApprover -> 400 when id invalid", async () => {
      await expectInvalidId(leaveRequestController.rejectBySecondApprover);
      expect(LeaveRequestService.rejectBySecondApprover).not.toHaveBeenCalled();
    });

    it("rejectBySecondApprover -> calls service and returns res.status(200).json", async () => {
      LeaveRequestService.rejectBySecondApprover.mockResolvedValue({ ok: true });

      const req = {
        params: { id: "123" },
        body: { remarks: "r", comment: "c" },
        user: { id: 10 },
      };
      const res = makeRes();
      const next = jest.fn();

      await leaveRequestController.rejectBySecondApprover(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(LeaveRequestService.rejectBySecondApprover).toHaveBeenCalledWith({
        id: 123,
        approverId: 10,
        remarks: "r",
        comment: "c",
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });
  });

  describe("approve/reject approver3", () => {
    it("approveByThirdApprover -> 400 when id invalid", async () => {
      await expectInvalidId(leaveRequestController.approveByThirdApprover);
      expect(LeaveRequestService.approveByThirdApprover).not.toHaveBeenCalled();
    });

    it("approveByThirdApprover -> calls service and returns res.json", async () => {
      LeaveRequestService.approveByThirdApprover.mockResolvedValue({ ok: true });

      const req = {
        params: { id: "123" },
        body: { remarks: "r", comment: "c" },
        user: { id: 10 },
      };
      const res = makeRes();
      const next = jest.fn();

      await leaveRequestController.approveByThirdApprover(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(LeaveRequestService.approveByThirdApprover).toHaveBeenCalledWith({
        id: 123,
        approverId: 10,
        remarks: "r",
        comment: "c",
      });
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });

    it("rejectByThirdApprover -> 400 when id invalid", async () => {
      await expectInvalidId(leaveRequestController.rejectByThirdApprover);
      expect(LeaveRequestService.rejectByThirdApprover).not.toHaveBeenCalled();
    });

    it("rejectByThirdApprover -> calls service and returns res.status(200).json", async () => {
      LeaveRequestService.rejectByThirdApprover.mockResolvedValue({ ok: true });

      const req = {
        params: { id: "123" },
        body: { remarks: "r", comment: "c" },
        user: { id: 10 },
      };
      const res = makeRes();
      const next = jest.fn();

      await leaveRequestController.rejectByThirdApprover(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(LeaveRequestService.rejectByThirdApprover).toHaveBeenCalledWith({
        id: 123,
        approverId: 10,
        remarks: "r",
        comment: "c",
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });
  });

  describe("approve/reject approver4", () => {
    it("approveByFourthApprover -> 400 when id invalid", async () => {
      await expectInvalidId(leaveRequestController.approveByFourthApprover);
      expect(LeaveRequestService.approveByFourthApprover).not.toHaveBeenCalled();
    });

    it("approveByFourthApprover -> calls service and returns res.json", async () => {
      LeaveRequestService.approveByFourthApprover.mockResolvedValue({ ok: true });

      const req = {
        params: { id: "123" },
        body: { remarks: "r", comment: "c" },
        user: { id: 10 },
      };
      const res = makeRes();
      const next = jest.fn();

      await leaveRequestController.approveByFourthApprover(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(LeaveRequestService.approveByFourthApprover).toHaveBeenCalledWith({
        id: 123,
        approverId: 10,
        remarks: "r",
        comment: "c",
      });
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });

    it("rejectByFourthApprover -> 400 when id invalid", async () => {
      await expectInvalidId(leaveRequestController.rejectByFourthApprover);
      expect(LeaveRequestService.rejectByFourthApprover).not.toHaveBeenCalled();
    });

    it("rejectByFourthApprover -> calls service and returns res.status(200).json", async () => {
      LeaveRequestService.rejectByFourthApprover.mockResolvedValue({ ok: true });

      const req = {
        params: { id: "123" },
        body: { remarks: "r", comment: "c" },
        user: { id: 10 },
      };
      const res = makeRes();
      const next = jest.fn();

      await leaveRequestController.rejectByFourthApprover(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(LeaveRequestService.rejectByFourthApprover).toHaveBeenCalledWith({
        id: 123,
        approverId: 10,
        remarks: "r",
        comment: "c",
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });
  });
});
