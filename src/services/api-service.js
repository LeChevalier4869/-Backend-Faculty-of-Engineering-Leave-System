const prisma = require("../config/prisma");
class APIService {
  // ดึงข้อมูลติดต่อ Admin ทั้งหมด
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

  // แก้ไขข้อมูลติดต่อ Admin
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

  // static async getSettingByKey(key) {
  //   const setting = await prisma.setting.findUnique({
  //     where: { key },
  //   });
  //   return setting;
  // }
}

module.exports = APIService;
