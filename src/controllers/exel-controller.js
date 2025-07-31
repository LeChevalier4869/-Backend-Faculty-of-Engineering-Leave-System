const xlsx = require("xlsx");
const bcrypt = require("bcryptjs");
const prisma = require("../config/prisma");

exports.uploadUserExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const users = xlsx.utils.sheet_to_json(sheet);

    const createdUsers = [];
    const failedUsers = [];

    for (const user of users) {
      const {
        prefixName,
        firstName,
        lastName,
        sex,
        email,
        password,
        phone,
        position,
        hireDate,
        inActive,
        employmentType,
        departmentName,
        personnelTypeName,
      } = user;

      let mappedEmploymentType = null;
      if (employmentType === "สายสนับสนุน") {
        mappedEmploymentType = "SUPPORT";
      } else if (employmentType === "สายวิชาการ") {
        mappedEmploymentType = "ACADEMIC";
      } else {
        mappedEmploymentType = null;
      }

      // เช็ค domain email
      if (!/@rmuti\.ac\.th$/.test(email)) {
        failedUsers.push({ email, reason: "Invalid email domain" });
        continue;
      }

      // เช็ค email ซ้ำ
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        failedUsers.push({ email, reason: "Duplicate email" });
        continue;
      }

      // หา departmentId และ personnelTypeId
      const department = await prisma.department.findFirst({
        where: { name: departmentName },
      });
      const personnelType = await prisma.personnelType.findFirst({
        where: { name: personnelTypeName },
      });

      if (!department || !personnelType) {
        failedUsers.push({
          email,
          reason: "Invalid department or personnel type",
        });
        continue;
      }

      const hashedPassword = await bcrypt.hash(password.toString(), 10);

      const newUser = await prisma.user.create({
        data: {
          departmentId: department.id,
          personnelTypeId: personnelType.id,
          prefixName,
          firstName,
          lastName,
          sex,
          email,
          password: hashedPassword,
          phone,
          position,
          hireDate: new Date(hireDate),
          inActive: !!inActive,
          employmentType,
        },
      });

      createdUsers.push(newUser);
    }

    res.json({ message: "Users processed", createdUsers, failedUsers });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
};
