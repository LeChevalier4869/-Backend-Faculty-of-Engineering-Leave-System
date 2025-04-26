const prisma = require("../config/prisma");
const createError = require("../utils/createError");

exports.createSetting = async (data) => {
  const existing = await prisma.setting.findFirst({
    where: { key: data.key },
  });

  if (existing) {
    const error = new Error("Key นี้มีอยู่ในระบบแล้ว");
    error.status = 409;
    throw error;
  }

  return await prisma.setting.create({ data });
};

exports.getAllSettings = async () => {
  return await prisma.setting.findMany();
};

exports.getSettingById = async (id) => {
  const existing = await prisma.setting.findUnique({
    where: { id: parseInt(id) },
  });

  if (!existing) {
    const error = new Error("ID ไม่ถูกต้อง");
    error.status = 404;
    throw error;
  }

  return await prisma.setting.findUnique({ where: { id: parseInt(id) } });
};

exports.updateSetting = async (id, data) => {
  const existing = await prisma.setting.findUnique({
    where: { id: parseInt(id) },
  });

  if (!existing) {
    const error = new Error("ID ไม่ถูกต้อง");
    error.status = 404;
    throw error;
  }

  return await prisma.setting.update({
    where: { id: parseInt(id) },
    data,
  });
};

exports.deleteSetting = async (id) => {
  const existing = await prisma.setting.findUnique({
    where: { id: parseInt(id) },
  });

  if (!existing) {
    const error = new Error("ID ไม่ถูกต้อง");
    error.status = 404;
    throw error;
  }

  return await prisma.setting.delete({
    where: { id: parseInt(id) },
  });
};