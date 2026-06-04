// ตั้งค่า env ให้ทั้ง 2 ช่องทาง Gmail (OAuth2 + app password) ถือว่า "configured" ก่อน require
process.env.EMAIL_USER_RMUTI = process.env.EMAIL_USER_RMUTI || "noreply@rmuti.ac.th";
process.env.EMAIL_APP_PASS = process.env.EMAIL_APP_PASS || "app pass test";
process.env.OAUTH_CLIENT_ID_RMUTI = process.env.OAUTH_CLIENT_ID_RMUTI || "test-client-id";
process.env.OAUTH_CLIENT_SECRET_RMUTI = process.env.OAUTH_CLIENT_SECRET_RMUTI || "test-secret";
process.env.OAUTH_REFRESH_TOKEN_RMUTI = process.env.OAUTH_REFRESH_TOKEN_RMUTI || "test-refresh";

// Mock nodemailer — ทุก transporter ใช้ mockSendMail ร่วมกัน
const mockSendMail = jest.fn();
jest.mock("nodemailer", () => ({
  createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
}));

const {
  getEmailTemplate,
  sendNotification,
  sendEmail,
  sendEmailTest,
  EVENT_ALIASES,
} = require("../../../utils/emailService");

describe("emailService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSendMail.mockResolvedValue({ messageId: "test-id" });
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("getEmailTemplate", () => {
    const canonicalKeys = [
      "SUBMISSION",
      "APPROVER1_APPROVED",
      "VERIFIER_APPROVED",
      "APPROVER2_APPROVED",
      "APPROVER3_APPROVED",
      "STEP_APPROVED_1",
      "STEP_APPROVED_2",
      "STEP_APPROVED_3",
      "STEP_APPROVED_4",
      "FULLY_APPROVED",
      "REJECTION",
    ];

    it.each(canonicalKeys)(
      "คืน subject และ html ที่มีแบรนด์ สำหรับ event %s",
      (key) => {
        const tpl = getEmailTemplate(key, {
          userName: "นายทดสอบ ระบบ",
          remarks: "เหตุผลทดสอบ",
        });
        expect(typeof tpl.subject).toBe("string");
        expect(tpl.subject.length).toBeGreaterThan(0);
        expect(tpl.html).toContain("ระบบจัดการวันลา คณะวิศวกรรมศาสตร์");
        expect(tpl.html).toContain("เข้าสู่ระบบ"); // ปุ่มลิงก์เข้าระบบ
      }
    );

    it("REJECTION แสดงเหตุผลที่ส่งมา", () => {
      const tpl = getEmailTemplate("REJECTION", {
        userName: "นายทดสอบ",
        remarks: "เอกสารไม่ครบ",
      });
      expect(tpl.html).toContain("เอกสารไม่ครบ");
    });

    it("REJECTION ใช้ข้อความ fallback เมื่อไม่มี remarks", () => {
      const tpl = getEmailTemplate("REJECTION", { userName: "นายทดสอบ" });
      expect(tpl.html).toContain("ไม่ได้ระบุเหตุผล");
    });

    it("ใส่ชื่อผู้ใช้ลงใน template ที่เกี่ยวข้อง", () => {
      const tpl = getEmailTemplate("FULLY_APPROVED", { userName: "นางสาวเอ บีซี" });
      expect(tpl.html).toContain("นางสาวเอ บีซี");
    });

    it("เพิ่มบรรทัดผู้รับมอบอำนาจเมื่อเป็น proxy", () => {
      const tpl = getEmailTemplate("APPROVER1_APPROVED", {
        userName: "ผู้ลา ก",
        proxyApprover: "ผู้แทน ข",
        originalApprover: "หัวหน้า ค",
      });
      expect(tpl.html).toContain("ผู้รับมอบอำนาจ");
      expect(tpl.html).toContain("ผู้แทน ข");
      expect(tpl.html).toContain("หัวหน้า ค");
    });

    it("ไม่มีบรรทัด proxy เมื่อไม่ใช่ proxy", () => {
      const tpl = getEmailTemplate("APPROVER1_APPROVED", { userName: "ผู้ลา ก" });
      expect(tpl.html).not.toContain("ผู้รับมอบอำนาจ");
    });

    it("event ที่ไม่รู้จัก คืน template เริ่มต้น", () => {
      const tpl = getEmailTemplate("UNKNOWN_EVENT", {});
      expect(tpl.subject).toBe("แจ้งเตือนจากระบบลาคณะวิศวกรรมศาสตร์");
    });
  });

  describe("เทมเพลตใหม่ + รายละเอียด (details)", () => {
    it("SUBMISSION แสดงผู้ยื่นและรายละเอียดคำขอ", () => {
      const tpl = getEmailTemplate("SUBMISSION", {
        userName: "หัวหน้าสาขา",
        requesterName: "นางสาวสมหญิง ใจดี",
        requestedDays: 3,
        reason: "ลากิจ",
        contact: "081-000-0000",
      });
      expect(tpl.html).toContain("นางสาวสมหญิง ใจดี");
      expect(tpl.html).toContain("3 วัน");
      expect(tpl.html).toContain("ลากิจ");
    });

    it("SUBMISSION_CONFIRM ยืนยันกลับผู้ลา", () => {
      const tpl = getEmailTemplate("SUBMISSION_CONFIRM", {
        userName: "นางสาวสมหญิง",
        requestedDays: 2,
      });
      expect(tpl.subject).toContain("ได้รับคำขอลา");
      expect(tpl.html).toContain("2 วัน");
    });

    it("CANCELLATION แสดงเลขที่ใบลาและช่วงวันที่", () => {
      const tpl = getEmailTemplate("CANCELLATION", {
        userName: "นายทดสอบ",
        documentNumber: "ENG-2569-0042",
        leaveTypeName: "ลากิจส่วนตัว",
        requestedDays: 3,
        dateRange: "10/06/2569 - 12/06/2569",
      });
      expect(tpl.html).toContain("ENG-2569-0042");
      expect(tpl.html).toContain("ลากิจส่วนตัว");
      expect(tpl.html).toContain("10/06/2569 - 12/06/2569");
    });

    it("มี status badge (pill) ในอีเมล", () => {
      const tpl = getEmailTemplate("FULLY_APPROVED", { userName: "x" });
      expect(tpl.html).toContain("อนุมัติสมบูรณ์");
    });

    it("ใช้สีเลือดหมูของคณะ (maroon) ในเทมเพลต", () => {
      const tpl = getEmailTemplate("SUBMISSION", { userName: "x" });
      expect(tpl.html).toContain("#7A1B22");
    });

    it("PROXY_ASSIGNED แจ้งผู้รับมอบอำนาจพร้อมรายละเอียด", () => {
      const tpl = getEmailTemplate("PROXY_ASSIGNED", {
        userName: "นายบี ผู้แทน",
        originalApproverName: "นายเอ หัวหน้า",
        levelLabel: "หัวหน้าสาขา (ผู้อนุมัติระดับ 1)",
        period: "10/06/2569 - 12/06/2569",
        reason: "ไปราชการ",
      });
      expect(tpl.subject).toContain("อนุมัติแทน");
      expect(tpl.html).toContain("นายเอ หัวหน้า");
      expect(tpl.html).toContain("หัวหน้าสาขา (ผู้อนุมัติระดับ 1)");
      expect(tpl.html).toContain("10/06/2569 - 12/06/2569");
    });

    it("PROXY_CANCELLED แจ้งยกเลิกการมอบอำนาจ", () => {
      const tpl = getEmailTemplate("PROXY_CANCELLED", {
        userName: "นายบี ผู้แทน",
        originalApproverName: "นายเอ หัวหน้า",
        levelLabel: "ผู้ตรวจสอบ",
        period: "รายวัน: 10/06/2569",
      });
      expect(tpl.subject).toContain("ยกเลิก");
      expect(tpl.html).toContain("นายเอ หัวหน้า");
    });

    it("ROLE_UPDATED แสดงบทบาทใหม่", () => {
      const tpl = getEmailTemplate("ROLE_UPDATED", {
        userName: "นายทดสอบ",
        roles: "ADMIN, APPROVER_1",
      });
      expect(tpl.subject).toContain("บทบาท");
      expect(tpl.html).toContain("ADMIN, APPROVER_1");
    });

    it("WELCOME ต้อนรับผู้ใช้ใหม่ + แสดงอีเมลเข้าระบบ", () => {
      const tpl = getEmailTemplate("WELCOME", {
        userName: "นายใหม่ เพิ่งเข้า",
        email: "new.user@rmuti.ac.th",
        position: "อาจารย์",
      });
      expect(tpl.subject).toContain("ยินดีต้อนรับ");
      expect(tpl.html).toContain("new.user@rmuti.ac.th");
      expect(tpl.html).toContain("อาจารย์");
    });

    it("PENDING_REMINDER แสดงจำนวนคำขอค้างและจำนวนวัน", () => {
      const tpl = getEmailTemplate("PENDING_REMINDER", {
        userName: "นายอนุมัติ",
        count: 5,
        oldestDays: 7,
      });
      expect(tpl.subject).toContain("รอการพิจารณา");
      expect(tpl.html).toContain("5 รายการ");
      expect(tpl.html).toContain("7 วัน");
    });
  });

  describe("alias keys (กันบั๊ก key พิมพ์ผิดเดิม)", () => {
    it.each(Object.entries(EVENT_ALIASES))(
      "alias %s ให้ผลเหมือน key มาตรฐาน %s",
      (aliasKey, canonicalKey) => {
        const data = { userName: "นายทดสอบ", remarks: "เหตุผล" };
        const fromAlias = getEmailTemplate(aliasKey, data);
        const fromCanonical = getEmailTemplate(canonicalKey, data);
        expect(fromAlias.subject).toBe(fromCanonical.subject);
        expect(fromAlias.html).toBe(fromCanonical.html);
      }
    );

    it("alias เดิมไม่ตกไป template เริ่มต้น (ไม่ใช่ generic)", () => {
      const tpl = getEmailTemplate("STEP_APPROVER1", { userName: "นายทดสอบ" });
      expect(tpl.subject).not.toBe("แจ้งเตือนจากระบบลาคณะวิศวกรรมศาสตร์");
    });
  });

  describe("sendNotification", () => {
    it("throw 400 เมื่อไม่มีอีเมลผู้รับ", async () => {
      await expect(sendNotification("REJECTION", {})).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it("ส่งอีเมลด้วย to/subject/html/from ที่ถูกต้อง", async () => {
      await sendNotification("FULLY_APPROVED", {
        to: "user@rmuti.ac.th",
        userName: "นายทดสอบ",
      });
      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const arg = mockSendMail.mock.calls[0][0];
      expect(arg.to).toBe("user@rmuti.ac.th");
      expect(arg.subject).toContain("อนุมัติ");
      expect(arg.html).toContain("นายทดสอบ");
      expect(arg.from).toContain("rmuti.ac.th"); // ส่งจากบัญชี Workspace ของคณะ
    });
  });

  describe("sendEmail (Gmail nodemailer + fallback)", () => {
    it("ใช้ OAuth2 เป็นช่องทางหลักเมื่อสำเร็จ", async () => {
      const result = await sendEmail("a@b.com", "หัวข้อ", "<p>hi</p>");
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "a@b.com", subject: "หัวข้อ", html: "<p>hi</p>" })
      );
      expect(mockSendMail).toHaveBeenCalledTimes(1); // ไม่ต้อง fallback
      expect(result).toMatchObject({ ok: true, provider: "gmail-oauth2" });
    });

    it("fallback ไป app password เมื่อ OAuth2 ล้มเหลว", async () => {
      mockSendMail.mockRejectedValueOnce(new Error("invalid_grant"));
      const result = await sendEmail("a@b.com", "หัวข้อ", "<p>hi</p>");
      expect(mockSendMail).toHaveBeenCalledTimes(2); // OAuth2 ล้ม → app password
      expect(result).toMatchObject({ ok: true, provider: "gmail-app" });
    });

    it("ไม่ throw แม้ทุกช่องทางล้มเหลว แต่คืน ok:false (กันไม่ให้ flow อนุมัติพัง)", async () => {
      mockSendMail
        .mockRejectedValueOnce(new Error("invalid_grant"))
        .mockRejectedValueOnce(new Error("BadCredentials"));
      const result = await sendEmail("a@b.com", "x", "y");
      expect(result.ok).toBe(false);
      expect(result.errors).toHaveLength(2);
    });
  });

  describe("sendEmailTest", () => {
    it("throw error เมื่อส่งล้มเหลวทุกช่องทาง (สำหรับหน้าทดสอบ)", async () => {
      mockSendMail
        .mockRejectedValueOnce(new Error("invalid_grant"))
        .mockRejectedValueOnce(new Error("BadCredentials"));
      await expect(sendEmailTest("a@b.com", "x", "y")).rejects.toThrow(/ส่งอีเมลไม่สำเร็จ/);
    });

    it("สำเร็จเมื่ออย่างน้อยหนึ่งช่องทางส่งได้", async () => {
      await expect(sendEmailTest("a@b.com", "x", "y")).resolves.toMatchObject({ ok: true });
    });
  });
});
