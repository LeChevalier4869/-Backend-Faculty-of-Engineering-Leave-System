const prisma = require("../config/prisma");
const createError = require("../utils/createError");

exports.createSetting = async (data) => {
  const existing = await prisma.Setting.findFirst({
    where: { key: data.key },
  });

  if (existing) {
    const error = new Error("Key นี้มีอยู่ในระบบแล้ว");
    error.status = 409;
    throw error;
  }

  return await prisma.Setting.create({ data });
};

exports.getAllSettings = async () => {
  return await prisma.Setting.findMany();
};

exports.getSettingById = async (id) => {
  const existing = await prisma.Setting.findUnique({
    where: { id: parseInt(id) },
  });

  if (!existing) {
    const error = new Error("ID ไม่ถูกต้อง");
    error.status = 404;
    throw error;
  }

  return await prisma.Setting.findUnique({ where: { id: parseInt(id) } });
};

exports.updateSetting = async (id, data) => {
  const existing = await prisma.Setting.findUnique({
    where: { id: parseInt(id) },
  });

  if (!existing) {
    const error = new Error("ID ไม่ถูกต้อง");
    error.status = 404;
    throw error;
  }

  return await prisma.Setting.update({
    where: { id: parseInt(id) },
    data,
  });
};

exports.deleteSetting = async (id) => {
  const existing = await prisma.Setting.findUnique({
    where: { id: parseInt(id) },
  });

  if (!existing) {
    const error = new Error("ID ไม่ถูกต้อง");
    error.status = 404;
    throw error;
  }

  return await prisma.Setting.delete({
    where: { id: parseInt(id) },
  });
};