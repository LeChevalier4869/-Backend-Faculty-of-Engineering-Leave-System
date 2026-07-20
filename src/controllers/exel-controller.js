const xlsx = require("xlsx");
const prisma = require("../config/prisma");
const UserService = require("../services/user-service");
const createError = require("../utils/createError");
const { sendNotification } = require("../utils/emailService");

// ส่งอีเมลต้อนรับให้ผู้ใช้ที่เพิ่งถูกสร้าง (ทำแบบ background ไม่บล็อกการตอบกลับ)
async function sendWelcomeToCreatedUsers(createdUsers = []) {
  for (const u of createdUsers) {
    if (!u?.email) continue;
    try {
      await sendNotification("WELCOME", {
        to: u.email,
        userName: `${u.prefixName || ""} ${u.firstName || ""} ${u.lastName || ""}`.trim(),
        email: u.email,
        position: u.position,
      });
    } catch {
      // sendEmail กลืน error อยู่แล้ว — ที่นี่กันกรณี throw อื่นๆ
    }
  }
}

exports.uploadUserExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // อ่านไฟล์ Excel
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawUsers = xlsx.utils.sheet_to_json(sheet, { defval: null });

    // กรองข้อมูลที่มีค่าว่างหรือช่องว่างเกินไป
    const users = rawUsers.filter(user => {
      // ตรวจสอบว่ามีอย่างน้อย 1 field ที่จำเป็นที่ไม่ว่าง
      const hasRequiredData = !!(user["คำนำหน้า"] || user["prefixName"]) ||
                            !!(user["ชื่อ"] || user["firstName"]) ||
                            !!(user["นามสกุล"] || user["lastName"]) ||
                            !!(user["อีเมล"] || user["email"]);
      
      // ถ้าไม่มีข้อมูลที่จำเป็นเลย ให้ข้าม
      if (!hasRequiredData) return false;
      
      // สร้าง object ใหม่โดยลบค่าว่างและช่องว่าง
      const cleanedUser = {};
      Object.keys(user).forEach(key => {
        const value = user[key];
        // ตรวจสอบว่าไม่ใช่ null, undefined, หรือช่องว่างเท่านั้น
        if (value !== null && value !== undefined && value !== "" && value !== " ") {
          cleanedUser[key] = value;
        }
      });
      
      // ถ้าหลังกรองแล้วไม่เหลือข้อมูลเลย ให้ข้าม
      return Object.keys(cleanedUser).length > 0;
    }).map(user => {
      // สร้าง object ใหม่ที่กรองค่าว่างแล้ว
      const cleanedUser = {};
      Object.keys(user).forEach(key => {
        const value = user[key];
        if (value !== null && value !== undefined && value !== "" && value !== " ") {
          cleanedUser[key] = value;
        }
      });
      return cleanedUser;
    });

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
      "positionNumber",
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
      "เลขที่ตำแหน่ง",
      "วันที่บรรจุ",
      "สายงาน",
      "แผนก",
      "สาขา",
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
        role,
      } = user;

      // รองรับหัวคอลัมน์ทั้งอังกฤษและไทย
      const departmentNameResolved =
        departmentName || user["สาขา"] || user["แผนก"];
      const positionNumber = user.positionNumber || user["เลขที่ตำแหน่ง"];

      // Handle both English and Thai headers for personnel type
      const personnelTypeName = String(user.personnelTypeName || user["ประเภทบุคคล"] || "").trim();

      const normalizedEmail = (email || user["อีเมล"])?.trim().toLowerCase();
      
      // Override sex based on prefixName if sex is not provided
      let computedSex = sex || user["เพศ"];
      if (!computedSex || computedSex.trim() === '') {
        const finalPrefixName = prefixName || user["คำนำหน้า"];
        if (finalPrefixName === "นาย" || finalPrefixName === "Mr." || finalPrefixName === "Mr") {
          computedSex = "ชาย";
        } else if (finalPrefixName === "นาง" || finalPrefixName === "นางสาว" || finalPrefixName === "Mrs." || finalPrefixName === "Miss" || finalPrefixName === "Ms." || finalPrefixName === "Ms") {
          computedSex = "หญิง";
        }
      }

      const hasRequiredUserFields = !!(prefixName || user["คำนำหน้า"]) &&
        !!(firstName || user["ชื่อ"]) &&
        !!(lastName || user["นามสกุล"]) &&
        !!(normalizedEmail || user["อีเมล"]) &&
        !!(position || user["ตำแหน่งงาน"]) &&
        !!(phone || user["เบอร์ติดต่อ"]) &&
        !!(hireDate || user["วันที่บรรจุ"]) &&
        !!(departmentNameResolved) &&
        !!(personnelTypeName || user["ประเภทบุคคล"])

      if (!hasRequiredUserFields) {
        throw {
          email: normalizedEmail || `Row ${index + 2}`,
          reason: "มี field required ว่างหรือไม่ถูกต้อง",
          rowData: user,
        };
      }

      // เลขที่ตำแหน่งบังคับกรอก
      if (!positionNumber || String(positionNumber).trim() === "") {
        throw {
          email: normalizedEmail || `Row ${index + 2}`,
          reason: "ไม่ได้ระบุเลขที่ตำแหน่ง (เลขที่ตำแหน่ง)",
          rowData: user,
        };
      }

      const mappedEmploymentType = mapEmploymentType(employmentType || user["สายงาน"]);

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

      // จับคู่สาขาแบบยืดหยุ่น (ปลอดภัย): เป๊ะก่อน → ตัดคำนำหน้า/อักษรย่อ → ค่อยลอง contains แบบไม่กำกวม
      const deptNameRaw = String(departmentNameResolved).trim();
      const normalize = (s) => String(s ?? "").trim().toLowerCase();
      // ชื่อสาขาในไฟล์ Excel มักเขียนต่างจากใน DB เล็กน้อย เช่น
      // "สาขาวิศวกรรมอิเล็กทรอนิกส์" vs "วิศวกรรมอิเล็กทรอนิกส์ฯ"
      // จึงตัดคำนำหน้า ช่องว่าง และ "ฯ" ท้ายออกก่อนเทียบ เพื่อให้ตรงกันแบบไม่กำกวม
      const canonical = (s) =>
        normalize(s)
          .replace(/\s+/g, "")
          .replace(/^(สาขาวิชา|สาขา|ภาควิชา|แผนกวิชา|แผนก)/, "")
          .replace(/ฯ+$/, "");
      const deptTarget = normalize(deptNameRaw);
      const deptCanon = canonical(deptNameRaw);

      let department = await tx.department.findFirst({
        where: { name: deptNameRaw },
      });

      if (!department) {
        const allDepts = await tx.department.findMany({
          select: { id: true, name: true },
        });
        // 1) เป๊ะแบบไม่สนตัวพิมพ์/ช่องว่าง
        let matches = allDepts.filter((d) => normalize(d.name) === deptTarget);
        // 2) เทียบหลังตัดคำนำหน้า/ช่องว่าง/ฯ (แม่นกว่า contains จึงลองก่อน)
        if (matches.length === 0 && deptCanon) {
          matches = allDepts.filter((d) => canonical(d.name) === deptCanon);
        }
        // 3) ยังไม่เจอ → contains แบบสองทาง (ชื่อ DB มีคำใน excel หรือกลับกัน)
        if (matches.length === 0) {
          matches = allDepts.filter(
            (d) =>
              normalize(d.name).includes(deptTarget) ||
              deptTarget.includes(normalize(d.name))
          );
        }
        if (matches.length === 1) {
          department = matches[0];
        } else if (matches.length > 1) {
          throw {
            email: normalizedEmail,
            reason: `สาขา "${deptNameRaw}" ตรงกับหลายสาขา (${matches
              .map((m) => m.name)
              .join(", ")}) กรุณาระบุให้ชัดเจน`,
            rowData: user,
          };
        }
      }

      if (!department) {
        throw {
          email: normalizedEmail,
          reason: `สาขา "${deptNameRaw}" ไม่ตรงกับสาขาในระบบ`,
          rowData: user,
        };
      }

      const parsedDate = parseHireDate(hireDate || user["วันที่บรรจุ"], index, normalizedEmail, user);

      const created = await tx.user.create({
        data: {
          prefixName: prefixName || user["คำนำหน้า"],
          firstName: firstName || user["ชื่อ"],
          lastName: lastName || user["นามสกุล"],
          sex: computedSex,
          email: normalizedEmail,
          phone: String(phone || user["เบอร์ติดต่อ"] || ""),
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
      
      // Remove duplicates and normalize case
      roleList = [...new Set(roleList.map(r => r.toUpperCase()))];

      const roles = await tx.role.findMany({
        where: { name: { in: roleList } },
      });
      if (!roles || roles.length !== roleList.length) {
        throw createError(400, "Invalid roles provided");
      }

      await tx.userRole.createMany({
        data: roles.map((r) => ({ userId: created.id, roleId: r.id })),
      });

      // กำหนดเลขที่ตำแหน่ง (รองรับย้ายเลขจากคนเดิม) ในทรานแซกชันเดียวกับการสร้าง user
      await UserService.assignPositionNumberToUser(
        tx,
        created.id,
        positionNumber,
        null
      );

      const currentDate = new Date();
      const hireMonths =
        (currentDate.getFullYear() - parsedDate.getFullYear()) * 12 +
        (currentDate.getMonth() - parsedDate.getMonth());


      const allRanks = await tx.rank.findMany({
        where: { personnelTypeId: parseInt(personnelType.id) },
      });
      
      if (allRanks.length === 0) {
        return created;
      }
      
      let userRanksCreated = 0;
      
      for (const rank of allRanks) {
        const { id: rankId, name: rankName, minHireMonths, maxHireMonths, leaveTypeId } = rank;
        const minPass = minHireMonths === null || hireMonths >= minHireMonths;
        const maxPass = maxHireMonths === null || hireMonths <= maxHireMonths;
        const hasLeaveType = leaveTypeId !== null;
        
        
        if (minPass && maxPass && hasLeaveType) {
          await tx.userRank.create({
            data: {
              userId: created.id,
              rankId,
            },
          });
          userRanksCreated++;
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

      const createdBalances = [];
      const skippedBalances = [];
      
      if (userRanks.length === 0) {
        return created;
      }
      
      for (const ur of userRanks) {
        const { leaveTypeId, maxDays, receiveDays, isBalance } = ur.rank;
        if (!leaveTypeId || maxDays === null) continue;
        const isNonDeductible = ur.rank.leaveType?.isNonDeductible === true;
        
        // Filter balance by sex - gender-specific leaves
        const leaveTypeName = ur.rank.leaveType?.name || "";
        const userSex = computedSex;
        
        // Female-only leaves (only women can take these)
        const isMaternityLeave = (leaveTypeName.toLowerCase().includes("คลอด") && 
                                 !leaveTypeName.toLowerCase().includes("ช่วยเหลือภริยา") &&
                                 !leaveTypeName.toLowerCase().includes("ภริยา")) || 
                               leaveTypeName.toLowerCase().includes("maternity");
        const isFemaleOrdination = leaveTypeName.toLowerCase().includes("ถือศีล") ||
                                  (leaveTypeName.toLowerCase().includes("ปฏิบัติธรรม") &&
                                   !leaveTypeName.toLowerCase().includes("บวช"));
        
        // Skip female-only leaves for male users
        if (userSex === "ชาย" && (isMaternityLeave || isFemaleOrdination)) {
          continue;
        }
        
        // อ่านค่าจาก paper (optional) ของ leave type นี้ — ใช้ได้ทั้ง deductible/non-deductible
        let paperValue = null;
        if (balanceMode) {
          const field = cfg.find((f) =>
            f.keywords.some((kw) =>
              String(leaveTypeName).toLowerCase().includes(kw)
            )
          );

          if (field) {
            const raw = findValueByAliases(user, field.aliases);
            if (raw !== null && raw !== undefined && raw !== "" && isIntValue(raw)) {
              const v = toInt(raw);
              if (v >= 0) paperValue = v;
            }
          }
        }

        // Non-deductible: เก็บแค่ "วันที่ใช้สิทธิ์ไปแล้ว" (usedDays) ไม่หักยอด
        // (ผู้ใช้ใหม่ที่ไม่มีข้อมูลใน paper = 0)
        if (isNonDeductible) {
          const usedDays = paperValue !== null ? paperValue : 0;
          await tx.leaveBalance.create({
            data: {
              userId: created.id,
              leaveTypeId,
              maxDays: 0,
              usedDays,
              pendingDays: 0,
              remainingDays: 0,
              year: yearValue,
            },
          });
          skippedBalances.push(leaveTypeName);
          continue;
        }

        // Deductible: paper = วันคงเหลือ; ถ้าไม่กรอก default = receiveDays (สิทธิ์ปัจจุบัน)
        const defaultRemaining =
          receiveDays !== null && receiveDays !== undefined ? receiveDays : maxDays;
        let remainingDays = defaultRemaining;
        let usedDays = 0;
        if (paperValue !== null && paperValue <= maxDays) {
          remainingDays = paperValue;
          usedDays = maxDays - remainingDays;
        }

        await tx.leaveBalance.create({
          data: {
            userId: created.id,
            leaveTypeId,
            maxDays,
            remainingDays,
            usedDays,
            pendingDays: 0,
            year: yearValue,
          },
        });
        createdBalances.push({ name: leaveTypeName, maxDays, remainingDays, usedDays });
      }
      
      console.log(`[MONITORING] Balance creation completed for user: ${created.email}`);
      console.log(`[MONITORING] Created balances:`, createdBalances);
      console.log(`[MONITORING] Skipped balances:`, skippedBalances);

      // Store balance info for monitoring
      created.createdBalances = createdBalances;
      created.skippedBalances = skippedBalances;

      return created;
    };

    if (balanceMode) {
      for (let index = 0; index < users.length; index++) {
        const user = users[index];
        try {
          const created = await prisma.$transaction(async (tx) =>
            processRowInTransaction(tx, user, index)
          );
          console.log(`✅ Created user: ${created.id} ${created.email}`);
          console.log(`Transaction committed successfully for user: ${created.email}`);
          createdUsers.push(created);
        } catch (err) {
          console.error(`Error processing row ${index + 2}:`, err);
          console.error(`Transaction failed for user, rolling back...`);
          failedUsers.push(err);
          continue;
        }
      }

      console.log(`[MONITORING] Excel import completed - Balance creation mode`);
      console.log(`[MONITORING] Total created balances:`, createdUsers.reduce((acc, user) => acc + (user.createdBalances?.length || 0), 0));
      console.log(`[MONITORING] Total skipped balances:`, createdUsers.reduce((acc, user) => acc + (user.skippedBalances?.length || 0), 0));
      
      sendWelcomeToCreatedUsers(createdUsers); // background, ไม่บล็อก response
      res.json({
        message: "Users processed",
        createdCount: createdUsers.length,
        failedCount: failedUsers.length,
        createdUsers,
        failedUsers,
        balanceCreated: true,
      });
      return;
    }

    for (let index = 0; index < users.length; index++) {
      const user = users[index];
      try {
        const created = await prisma.$transaction(async (tx) =>
          processRowInTransaction(tx, user, index)
        );
        console.log(`✅ Created user: ${created.id} ${created.email}`);
        console.log(`Transaction committed successfully for user: ${created.email}`);
        createdUsers.push(created);
      } catch (err) {
        console.error(`Error processing row ${index + 2}:`, err);
        console.error(`Transaction failed for user, rolling back...`);
        failedUsers.push(err);
        continue;
      }
    }

    console.log(`[MONITORING] Excel import completed - User creation mode`);
    console.log(`[MONITORING] Total users created: ${createdUsers.length}`);

    sendWelcomeToCreatedUsers(createdUsers); // background, ไม่บล็อก response
    res.json({
      message: "Users processed",
      createdCount: createdUsers.length,
      failedCount: failedUsers.length,
      createdUsers,
      failedUsers, // rowData จะช่วย debug Excel ได้ง่ายขึ้น
      balanceCreated: true,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
};
