const xlsx = require("xlsx");
const prisma = require("../config/prisma");
const UserService = require("../services/user-service");
const createError = require("../utils/createError");

exports.uploadUserExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // อ่านไฟล์ Excel
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const users = xlsx.utils.sheet_to_json(sheet, { defval: null });

    const headerRows = xlsx.utils.sheet_to_json(sheet, {
      header: 1,
      blankrows: false,
      defval: null,
    });
    const headerRow = Array.isArray(headerRows) && headerRows.length
      ? headerRows[0]
      : [];

    const userHeaderAliases = [
      "prefixName",
      "firstName",
      "lastName",
      "sex",
      "email",
      "phone",
      "position",
      "hireDate",
      "employmentType",
      "departmentName",
      "personnelTypeName",
      "role",
      // Thai headers
      "คำนำหน้า",
      "ชื่อ",
      "นามสกุล",
      "เพศ",
      "อีเมล",
      "เบอร์ติดต่อ",
      "ตำแหน่งงาน",
      "วันที่บรรจุ",
      "สายงาน",
      "แผนก",
      "ประเภทบุคคล",
      "บทบาท",
    ];

    const getBalanceFieldConfig = () => [
      {
        key: "sick",
        aliases: [
          "sickBalance",
          "SickBalance",
          "SICKBALANCE",
          "ลาป่วยคงเหลือ",
          "ป่วยคงเหลือ",
          "ลาป่วย",
        ],
        keywords: ["sick", "ลาป่วย", "ป่วย"],
      },
      {
        key: "personal",
        aliases: [
          "personalBalance",
          "PersonalBalance",
          "PERSONALBALANCE",
          "ลากิจคงเหลือ",
          "กิจคงเหลือ",
          "ลากิจ",
        ],
        keywords: ["personal", "ลากิจส่วนตัว", "ลากิจ", "กิจ"],
      },
      {
        key: "vacation",
        aliases: [
          "vacationBalance",
          "VacationBalance",
          "VACATIONBALANCE",
          "annualBalance",
          "AnnualBalance",
          "ANNUALBALANCE",
          "ลาพักผ่อนคงเหลือ",
          "พักผ่อนคงเหลือ",
          "ลาพักผ่อน",
        ],
        keywords: ["vacation", "annual", "ลาพักผ่อน", "พักผ่อน"],
      },
      {
        key: "maternity",
        aliases: [
          "maternityBalance",
          "MaternityBalance",
          "MATERNITYBALANCE",
          "ลาคลอดคงเหลือ",
          "คลอดคงเหลือ",
          "ลาคลอด",
          "ลาคลอดบุตร",
        ],
        keywords: ["maternity", "ลาคลอดบุตร", "ลาคลอด", "คลอด"],
      },
      {
        key: "ordination",
        aliases: [
          "ordinationBalance",
          "OrdinationBalance",
          "ORDINATIONBALANCE",
          "ลาบวชคงเหลือ",
          "บวชคงเหลือ",
          "ลาบวช",
        ],
        keywords: ["ordination", "ลาอุปสมบท", "อุปสมบท", "ลาบวช", "บวช"],
      },
      {
        key: "military",
        aliases: [
          "militaryBalance",
          "MilitaryBalance",
          "MILITARYBALANCE",
          "ลารับราชการทหารคงเหลือ",
          "ทหารคงเหลือ",
          "ลาทหาร",
        ],
        keywords: [
          "military",
          "ลาเข้ารับการตรวจเลือกเข้ารับการเตรียมพล",
          "ตรวจเลือก",
          "เตรียมพล",
          "ทหาร",
        ],
      },
      {
        key: "research",
        aliases: [
          "researchBalance",
          "ResearchBalance",
          "RESEARCHBALANCE",
          "ลาวิจัยคงเหลือ",
          "วิจัยคงเหลือ",
          "ลาวิจัย",
        ],
        keywords: [
          "research",
          "ลาไปศึกษา ฝึกอบรม ปฏิบัติการวิจัย หรือดูงาน",
          "ศึกษา",
          "ฝึกอบรม",
          "วิจัย",
          "ดูงาน",
        ],
      },
      {
        key: "study",
        aliases: [
          "studyBalance",
          "StudyBalance",
          "STUDYBALANCE",
          "ลาไปศึกษา",
          "ศึกษา",
          "ฝึกอบรม",
          "ดูงาน",
        ],
        keywords: ["study", "ลาไปศึกษา", "ฝึกอบรม", "ดูงาน"],
      },
      {
        key: "assistWife",
        aliases: [
          "assistWifeBalance",
          "AssistWifeBalance",
          "ASSISTWIFEBALANCE",
          "ลาไปช่วยภริยา",
          "ช่วยภริยา",
          "ช่วยภริยาคลอด",
        ],
        keywords: ["assist", "ลาไปช่วยภริยา", "ช่วยภริยา", "ภริยา"],
      },
      {
        key: "rehab",
        aliases: [
          "rehabBalance",
          "RehabBalance",
          "REHABBALANCE",
          "ลาไปฟื้นฟู",
          "ฟื้นฟู",
          "ฟื้นฟูสมรรถภาพ",
          "ลาฟื้นฟูคงเหลือ",
        ],
        keywords: ["rehab", "ลาไปฟื้นฟู", "ฟื้นฟู"],
      },
      {
        key: "ordainFemale",
        aliases: [
          "ordainFemaleBalance",
          "OrdainFemaleBalance",
          "ORDAINFEMALEBALANCE",
          "ลาไปถือศีล",
          "ถือศีล",
          "ปฏิบัติธรรม",
        ],
        keywords: ["ordain", "ลาไปถือศีล", "ถือศีล", "ปฏิบัติธรรม"],
      },
      {
        key: "internationalOrg",
        aliases: [
          "internationalOrgBalance",
          "InternationalOrgBalance",
          "INTERNATIONALORGBALANCE",
          "ลาไปปฏิบัติงานองค์การระหว่างประเทศ",
          "องค์การระหว่างประเทศ",
        ],
        keywords: ["international", "ลาไปปฏิบัติงานองค์การระหว่างประเทศ", "องค์การระหว่างประเทศ"],
      },
      {
        key: "accompany",
        aliases: [
          "accompanyBalance",
          "AccompanyBalance",
          "ACCOMPANYBALANCE",
          "ลาติดตามคู่สมรส",
          "คู่สมรส",
          "ติดตามคู่สมรส",
          "ลาติดตามคงเหลือ",
        ],
        keywords: ["accompany", "ลาติดตามคู่สมรส", "คู่สมรส", "ติดตาม"],
      },
      {
        key: "performHaji",
        aliases: [
          "performHajiBalance",
          "PerformHajiBalance",
          "PERFORMHAJIBALANCE",
          "ลาประกอบพิธีฮัจย์คงเหลือ",
          "ฮัจย์คงเหลือ",
          "ฮัจย์",
        ],
        keywords: ["haji", "ลาไปประกอบพิธีฮัจย์", "พิธีฮัจย์", "ฮัจย์"],
      },
    ];

    const isIntValue = (value) => {
      if (value === null || value === undefined || value === "") return false;
      if (typeof value === "number") return Number.isInteger(value);
      if (typeof value === "string") return /^\d+$/.test(value.trim());
      return false;
    };

    const toInt = (value) => {
      if (typeof value === "number") return value;
      return parseInt(String(value).trim(), 10);
    };

    const findValueByAliases = (row, aliases) => {
      for (const a of aliases) {
        if (Object.prototype.hasOwnProperty.call(row, a)) return row[a];
      }
      return undefined;
    };

    const hasAnyBalanceDataInRow = (row) => {
      const cfg = getBalanceFieldConfig();
      for (const f of cfg) {
        const v = findValueByAliases(row, f.aliases);
        if (v !== null && v !== undefined && v !== "") return true;
      }
      return false;
    };

    const hasAnyBalanceColumnInFile = () => {
      if (!users.length) return false;
      const keys = Object.keys(users[0] || {});
      const cfg = getBalanceFieldConfig();
      for (const f of cfg) {
        if (f.aliases.some((a) => keys.includes(a))) return true;
      }
      return cfg.some((f) =>
        keys.some((k) => f.keywords.some((kw) => String(k).toLowerCase().includes(kw)))
      );
    };

    const hasAnyBalanceDataInFile = () => {
      for (const row of users) {
        if (hasAnyBalanceDataInRow(row)) return true;
      }
      return false;
    };

    const validateHeaderOrder = () => {
      if (!headerRow || !headerRow.length) return;
      const headerIndex = new Map();
      headerRow.forEach((h, idx) => {
        if (h === null || h === undefined) return;
        headerIndex.set(String(h).trim(), idx);
      });

      const userIndices = userHeaderAliases
        .map((k) => headerIndex.get(k))
        .filter((v) => typeof v === "number");
      const maxUserIndex = userIndices.length ? Math.max(...userIndices) : -1;

      const cfg = getBalanceFieldConfig();
      const balanceIndices = cfg
        .flatMap((f) => f.aliases)
        .map((a) => headerIndex.get(a))
        .filter((v) => typeof v === "number");

      if (!balanceIndices.length) return;

      const minBalanceIndex = Math.min(...balanceIndices);
      if (maxUserIndex !== -1 && minBalanceIndex <= maxUserIndex) {
        throw createError(
          400,
          "รูปแบบ Excel ไม่ถูกต้อง: คอลัมน์ balance ต้องอยู่หลังคอลัมน์ข้อมูล user"
        );
      }
    };

    const mapEmploymentType = (employmentType) => {
      if (employmentType === "สายสนับสนุน" || employmentType === "SUPPORT") {
        return "SUPPORT";
      }
      if (employmentType === "สายวิชาการ" || employmentType === "ACADEMIC") {
        return "ACADEMIC";
      }
      return null;
    };

    const parseHireDate = (hireDate, index, normalizedEmail, rowData) => {
      let parsedDate = null;

      if (typeof hireDate === "string") {
        const parts = hireDate.includes("/")
          ? hireDate.split("/").map(Number)
          : hireDate.split("-").map(Number);

        if (parts.length === 3) {
          if (hireDate.includes("/")) {
            parsedDate = new Date(parts[2], parts[1] - 1, parts[0]);
          } else {
            parsedDate = new Date(parts[0], parts[1] - 1, parts[2]);
          }
        }
      } else if (hireDate instanceof Date) {
        parsedDate = hireDate;
      } else if (typeof hireDate === "number") {
        parsedDate = new Date((hireDate - 25569) * 86400 * 1000);
      }

      if (!parsedDate || isNaN(parsedDate.getTime())) {
        console.log(`Row ${index + 2} invalid hireDate:`, hireDate);
        throw {
          email: normalizedEmail,
          reason: "hireDate ไม่ถูกต้อง",
          rowData,
        };
      }

      return parsedDate;
    };

    const createdUsers = [];
    const failedUsers = [];

    const balanceMode = hasAnyBalanceColumnInFile() && hasAnyBalanceDataInFile();

    // Temporarily disable header order validation
    // if (balanceMode) {
    //   validateHeaderOrder();
    // }

    const processRowInTransaction = async (tx, user, index) => {
      const {
        prefixName,
        firstName,
        lastName,
        sex,
        email,
        phone,
        position,
        hireDate,
        employmentType,
        departmentName,
        personnelTypeName,
        role,
      } = user;

      const normalizedEmail = (email || user["อีเมล"])?.trim().toLowerCase();

      const hasRequiredUserFields = !!(prefixName || user["คำนำหน้า"]) &&
        !!(firstName || user["ชื่อ"]) &&
        !!(lastName || user["นามสกุล"]) &&
        !!(sex || user["เพศ"]) &&
        !!(normalizedEmail || user["อีเมล"]) &&
        !!(position || user["ตำแหน่งงาน"]) &&
        !!(phone || user["เบอร์ติดต่อ"]) &&
        !!(hireDate || user["วันที่บรรจุ"]) &&
        !!(departmentName || user["สายงาน"]) &&
        !!(personnelTypeName || user["สาขา"]);

      // Debug logging to identify missing fields
      console.log(`[DEBUG] Row ${index + 2} field validation:`, {
        prefixName: prefixName || user["คำนำหน้า"],
        firstName: firstName || user["ชื่อ"],
        lastName: lastName || user["นามสกุล"],
        sex: sex || user["เพศ"],
        email: normalizedEmail || user["อีเมล"],
        position: position || user["ตำแหน่งงาน"],
        phone: phone || user["เบอร์ติดต่อ"],
        hireDate: hireDate || user["วันที่บรรจุ"],
        departmentName: departmentName || user["สายงาน"],
        personnelTypeName: personnelTypeName || user["สาขา"],
        hasRequiredUserFields
      });

      if (!hasRequiredUserFields) {
        throw {
          email: normalizedEmail || `Row ${index + 2}`,
          reason: "มี field required ว่างหรือไม่ถูกต้อง",
          rowData: user,
        };
      }

      const mappedEmploymentType = mapEmploymentType(employmentType || user["ประเภทบุคคล"]);

      if (!/@(rmuti\.ac\.th|gmail\.com)$/.test(normalizedEmail)) {
        throw {
          email: normalizedEmail,
          reason: "โดเมนอีเมลล์ไม่ถูกต้อง",
          rowData: user,
        };
      }

      const existingUser = await tx.user.findUnique({
        where: { email: normalizedEmail },
      });
      if (existingUser) {
        throw {
          email: normalizedEmail,
          reason: "มีอีเมลล์นี้อยู่ในระบบแล้ว",
          rowData: user,
        };
      }

      const personnelType = await tx.personnelType.findFirst({
        where: { name: personnelTypeName },
      });
      if (!personnelType) {
        throw {
          email: normalizedEmail,
          reason: "ประเภทบุคคลไม่ถูกต้อง",
          rowData: user,
        };
      }

      const department = await tx.department.findFirst({
        where: { name: departmentName },
      });
      if (!department) {
        throw {
          email: normalizedEmail,
          reason: "สาขาไม่ถูกต้อง",
          rowData: user,
        };
      }

      const parsedDate = parseHireDate(hireDate || user["วันที่บรรจุ"], index, normalizedEmail, user);

      const created = await tx.user.create({
        data: {
          prefixName: prefixName || user["คำนำหน้า"],
          firstName: firstName || user["ชื่อ"],
          lastName: lastName || user["นามสกุล"],
          sex: sex || user["เพศ"],
          email: normalizedEmail,
          phone: phone || user["เบอร์ติดต่อ"],
          position: position || user["ตำแหน่งงาน"],
          hireDate: parsedDate,
          employmentType: mappedEmploymentType,
          departmentId: department.id,
          personnelTypeId: personnelType.id,
        },
      });

      let roleList = ["USER"];
      const roleField = role || user["บทบาท"];
      if (roleField) {
        if (Array.isArray(roleField)) {
          roleList = [...roleList, ...roleField];
        } else {
          roleList.push(roleField);
        }
      }
      // Remove duplicate 'user' if 'USER' already exists
      roleList = [...new Set(roleList)].filter(r => !(r === "USER" && roleList.includes("user")));
      roleList = [...new Set(roleList)];

      const roles = await tx.role.findMany({
        where: { name: { in: roleList.map(r => r.toUpperCase()) } },
      });
      if (!roles || roles.length !== roleList.length) {
        console.log("Debug roles: ", roleList);
        console.log("Found roles: ", roles.map(r => r.name));
        throw createError(400, "Invalid roles provided");
      }

      await tx.userRole.createMany({
        data: roles.map((r) => ({ userId: created.id, roleId: r.id })),
      });

      const currentDate = new Date();
      const hireMonths =
        (currentDate.getFullYear() - parsedDate.getFullYear()) * 12 +
        (currentDate.getMonth() - parsedDate.getMonth());

      const allRanks = await tx.rank.findMany({
        where: { personnelTypeId: parseInt(personnelType.id) },
      });

      for (const rank of allRanks) {
        const { id: rankId, minHireMonths, maxHireMonths, leaveTypeId } = rank;
        const minPass = minHireMonths === null || hireMonths >= minHireMonths;
        const maxPass = maxHireMonths === null || hireMonths <= maxHireMonths;
        if (minPass && maxPass && leaveTypeId !== null) {
          await tx.userRank.create({
            data: {
              userId: created.id,
              rankId,
            },
          });
        }
      }

      const fiscalYearSetting = await tx.setting.findUnique({
        where: { key: "fiscalYear" },
      });
      const yearValue = fiscalYearSetting
        ? parseInt(fiscalYearSetting.value, 10)
        : new Date().getFullYear();

      const userRanks = await tx.userRank.findMany({
        where: { userId: created.id },
        include: {
          rank: { include: { leaveType: true } },
        },
      });

      const cfg = getBalanceFieldConfig();
      const shouldValidateBalanceFields = balanceMode;

      if (!shouldValidateBalanceFields) {
        for (const ur of userRanks) {
          const { leaveTypeId, maxDays, receiveDays, isBalance } = ur.rank;
          if (!leaveTypeId || maxDays === null) continue;
          const balanceData = {
            userId: created.id,
            leaveTypeId,
            maxDays: receiveDays === 0 && (isBalance === 1 || isBalance === true) ? 0 : maxDays,
            usedDays: receiveDays === 0 && (isBalance === 1 || isBalance === true) ? 0 : 0,
            pendingDays: receiveDays === 0 && (isBalance === 1 || isBalance === true) ? 0 : 0,
            remainingDays: receiveDays === 0 && (isBalance === 1 || isBalance === true) ? 0 : receiveDays,
            year: yearValue,
          };
          await tx.leaveBalance.create({ data: balanceData });
        }
        return created;
      }

      for (const ur of userRanks) {
        const { leaveTypeId, maxDays, isBalance } = ur.rank;
        if (!leaveTypeId || maxDays === null) continue;
        const isNonDeductible = ur.rank.leaveType?.isNonDeductible === true;
        if (
          isNonDeductible ||
          maxDays === 0 ||
          isBalance === 1 ||
          isBalance === true
        ) {
          console.log(`[DEBUG] Skip non-deductible/balance type: ${ur.rank.leaveType?.name}`);
          await tx.leaveBalance.create({
            data: {
              userId: created.id,
              leaveTypeId,
              maxDays: 0,
              usedDays: 0,
              pendingDays: 0,
              remainingDays: 0,
              year: yearValue,
            },
          });
          continue;
        }

        const leaveTypeName = ur.rank.leaveType?.name || "";
        console.log(`[DEBUG] Processing leave type: ${leaveTypeName}`);
        const field = cfg.find((f) =>
          f.keywords.some((kw) =>
            String(leaveTypeName).toLowerCase().includes(kw)
          )
        );
        console.log(`[DEBUG] Mapped field: ${field?.key}, aliases: ${field?.aliases}`);

        if (!field) {
          throw {
            email: normalizedEmail,
            reason: "ไม่สามารถ map balance field กับประเภทการลาได้",
            rowData: user,
          };
        }

        const rawRemaining = findValueByAliases(user, field.aliases);
        console.log(`[DEBUG] Raw remaining value for ${leaveTypeName}:`, rawRemaining);
        if (rawRemaining === null || rawRemaining === undefined || rawRemaining === "") {
          throw {
            email: normalizedEmail,
            reason: "กรอก balance ไม่ครบทุก field",
            rowData: user,
          };
        }
        if (!isIntValue(rawRemaining)) {
          throw {
            email: normalizedEmail,
            reason: "balance ต้องเป็นตัวเลขจำนวนเต็มเท่านั้น",
            rowData: user,
          };
        }

        const remainingDays = toInt(rawRemaining);
        if (remainingDays < 0 || remainingDays > maxDays) {
          throw {
            email: normalizedEmail,
            reason: "balance เกินสิทธิ์หรือมีค่าน้อยกว่า 0",
            rowData: user,
          };
        }

        await tx.leaveBalance.create({
          data: {
            userId: created.id,
            leaveTypeId,
            maxDays,
            remainingDays,
            usedDays: maxDays - remainingDays,
            pendingDays: 0,
            year: yearValue,
          },
        });
      }

      return created;
    };

    if (balanceMode) {
      try {
        const createdUsersTx = await prisma.$transaction(async (tx) => {
          const createdInTx = [];
          for (let index = 0; index < users.length; index++) {
            const created = await processRowInTransaction(tx, users[index], index);
            createdInTx.push(created);
          }
          return createdInTx;
        });

        res.json({
          message: "Users processed",
          createdCount: createdUsersTx.length,
          failedCount: 0,
          createdUsers: createdUsersTx,
          failedUsers: [],
        });
        return;
      } catch (err) {
        console.error("Error processing excel with balanceMode:", err);
        return res.status(400).json({
          error: "Import failed",
          detail: err,
        });
      }
    }

    for (let index = 0; index < users.length; index++) {
      const user = users[index];
      try {
        const created = await prisma.$transaction(async (tx) =>
          processRowInTransaction(tx, user, index)
        );
        console.log(`✅ Created user: ${created.id} ${created.email}`);
        createdUsers.push(created);
      } catch (err) {
        console.error(`Error processing row ${index + 2}:`, err);
        failedUsers.push(err);
        continue;
      }
    }

    res.json({
      message: "Users processed",
      createdCount: createdUsers.length,
      failedCount: failedUsers.length,
      createdUsers,
      failedUsers, // rowData จะช่วย debug Excel ได้ง่ายขึ้น
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
};
