const prisma = require("../config/prisma");

exports.createSignature = async (userId, imgUrl) => {
  // ตรวจสอบว่าผู้ใช้มีอยู่จริงหรือไม่
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    const error = new Error("ไม่พบผู้ใช้นี้ในระบบ");
    error.status = 404;
    throw error;
  }

  // ตรวจสอบว่าผู้ใช้มี signature อยู่แล้วหรือไม่
  const existing = await prisma.signature.findFirst({
    where: { userId },
  });

  if (existing) {
    const error = new Error("ผู้ใช้นี้มีลายเซ็นแล้ว");
    error.status = 409;
    throw error;
  }

  return await prisma.signature.create({
    data: {
      userId,
      file: imgUrl,
    },
  });
};

exports.getAllSignature = async () => {
  return await prisma.signature.findMany({
    include: {
      user: true, // รวมข้อมูลผู้ใช้ด้วย
    },
  });
};

exports.getSignatureById = async (id) => {
  const signature = await prisma.signature.findUnique({
    where: { id: parseInt(id) },
    include: { user: true },
  });

  if (!signature) {
    const error = new Error("ID ไม่ถูกต้อง");
    error.status = 404;
    throw error;
  }

  return signature;
};

exports.updateSignature = async (id, data) => {
  const signatureId = parseInt(id);

  // ตรวจสอบว่า signature ที่จะอัปเดตมีอยู่จริงหรือไม่
  const existing = await prisma.signature.findUnique({
    where: { id: signatureId },
  });

  if (!existing) {
    const error = new Error("ไม่พบลายเซ็นที่ต้องการอัปเดต");
    error.status = 404;
    throw error;
  }

  // ถ้ามีการส่ง userId มาใหม่ ให้ตรวจสอบว่าผู้ใช้นั้นมีอยู่จริงหรือไม่
  if (data.userId) {
    const user = await prisma.user.findUnique({
      where: { id: parseInt(data.userId) },
    });

    if (!user) {
      const error = new Error("ไม่พบผู้ใช้นี้ในระบบ");
      error.status = 404;
      throw error;
    }
  }

  return await prisma.signature.update({
    where: { id: signatureId },
    data,
  });
};

exports.deleteSignature = async (userId) => {
  const signatureId = parseInt(userId);

  // ตรวจสอบว่ามีลายเซ็นนี้อยู่หรือไม่
  const existing = await prisma.signature.findUnique({
    where: { userId: signatureId },
  });

  if (!existing) {
    const error = new Error("ไม่พบลายเซ็นที่ต้องการลบ");
    error.status = 404;
    throw error;
  }

  return await prisma.signature.delete({
    where: { userId: signatureId },
  });
};

exports.getSignatureIsMine = async (userId) => {
  const signature = await prisma.signature.findFirst({
    where: { userId },
    include: { user: true }, // ถ้าคุณต้องการข้อมูล user ด้วย
  });
  console.log("Signature for user ID:", userId, "is", signature);

  if (!signature) {
    const error = new Error("ยังไม่มีลายเซ็นสำหรับผู้ใช้นี้");
    error.status = 404;
    throw error;
  }

  return signature;
};


exports.getSignatureByUserId = async (userId) => {
  const signature = await prisma.signature.findFirst({
    where: { userId: parseInt(userId) },
    include: { user: true }, // ถ้าต้องการข้อมูล user ด้วย
  });

  if (!signature) {
    const error = new Error("ID ไม่ถูกต้อง");
    error.status = 404;
    throw error;
  }

  return signature;
}