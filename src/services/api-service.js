const prisma = require("../config/prisma");

class APIService {
  // ดึงข้อมูลติดต่อทั้งหมด
  static async getContactInfo() {
    return await prisma.setting.findMany({
      where: {
        key: {
          in: ["AdminName", "AdminPhone", "AdminMail"],
        },
      },
      orderBy: { id: "asc" },
    });
  }

  // แก้ไขค่า value ของ setting
  static async updateContactValue(key, value) {
    const setting = await prisma.setting.findUnique({ where: { key } });
    if (!setting) {
      throw new Error("NOT_FOUND");
    }

    return await prisma.setting.update({
      where: { key },
      data: { value },
    });
  }
}

module.exports = APIService;
