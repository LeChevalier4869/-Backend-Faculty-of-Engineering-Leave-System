const prisma = require("../config/prisma");
const createError = require("../utils/createError");

// This is organization and department services.
class OrgAndDeptService {
  // Organization -----------------------------------
  static async getAllOrganizations() {
    return await prisma.organization.findMany();
  }

  static async getOrganizationById(id) {
    return await prisma.organization.findUnique({
      where: { id: parseInt(id) },
    });
  }

  static async createOrganization(name) {
    const clean = String(name || "").trim();
    if (!clean) throw createError(400, "กรุณาระบุชื่อองค์กร");
    const existing = await prisma.organization.findFirst({ where: { name: clean } });
    if (existing) throw createError(409, `มีองค์กรชื่อ "${clean}" อยู่แล้ว`);
    return await prisma.organization.create({ data: { name: clean } });
  }

  static async updateOrganization(id, name) {
    const clean = String(name || "").trim();
    if (!clean) throw createError(400, "กรุณาระบุชื่อองค์กร");
    const dup = await prisma.organization.findFirst({
      where: { name: clean, NOT: { id: parseInt(id) } },
    });
    if (dup) throw createError(409, `มีองค์กรชื่อ "${clean}" อยู่แล้ว`);
    return await prisma.organization.update({
      where: { id: parseInt(id) },
      data: { name: clean },
    });
  }

  static async deleteOrganization(id) {
    return await prisma.organization.delete({
      where: { id: parseInt(id) },
    });
  }

  // Department --------------------------------------
  static async getAllDepartments() {
    return await prisma.department.findMany({
      include: {
        head: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        organization: true, // รวมข้อมูลขององค์กร
      },
    });
  }

  static async getDepartmentById(id) {
    return await prisma.department.findUnique({
      where: { id: parseInt(id) }, // ตรวจสอบให้แน่ใจว่า id เป็น Int
      include: {
        head: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        organization: true,
      },
    });
  }

  static async createDepartment(data) {
    // กันสร้างสาขาชื่อซ้ำในหน่วยงานเดียวกัน (ให้สอดคล้องกับ createOrganization)
    const cleanName = String(data.name || "").trim();
    if (!cleanName) throw createError(400, "กรุณาระบุชื่อแผนก");
    const duplicate = await prisma.department.findFirst({
      where: { name: cleanName, organizationId: data.organizationId },
    });
    if (duplicate) throw createError(409, `มีแผนกชื่อ "${cleanName}" อยู่แล้ว`);

    return await prisma.department.create({
      data: { ...data, name: cleanName },
    });
  }

  static async updateDepartment(id, data) {
    const departmentId = parseInt(id);

    if (data.headId) {
      const headExists = await prisma.user.findUnique({
        where: { id: data.headId },
      });
      if (!headExists) {
        throw createError(400, "ไม่พบผู้ใช้งานที่เป็นหัวหน้าของแผนก");
      }
    }

    // เส้นทางนี้เคยเปลี่ยนหัวหน้าแผนกโดยไม่ sync บทบาท APPROVER_1
    // ทำให้ข้อมูลเพี้ยนเมื่อมีการแก้ผ่าน endpoint นี้แทน /admin/departments/:id
    return await prisma.$transaction(async (tx) => {
      const current = await tx.department.findUnique({
        where: { id: departmentId },
        select: { headId: true },
      });
      if (!current) throw createError(404, "ไม่พบแผนก");

      const updated = await tx.department.update({
        where: { id: departmentId },
        data,
      });

      // sync เฉพาะเมื่อส่ง headId มาจริง และค่าเปลี่ยนไปจากเดิม
      if (data.headId !== undefined && current.headId !== data.headId) {
        const approver1Role = await tx.role.findFirst({
          where: { name: "APPROVER_1" },
        });

        if (approver1Role) {
          // ถอดจากหัวหน้าเดิม ถ้าไม่ได้เป็นหัวหน้าแผนกอื่นอยู่ด้วย
          if (current.headId) {
            const stillHeadElsewhere = await tx.department.count({
              where: { headId: current.headId, id: { not: departmentId } },
            });
            if (stillHeadElsewhere === 0) {
              await tx.userRole.deleteMany({
                where: { userId: current.headId, roleId: approver1Role.id },
              });
            }
          }

          if (data.headId) {
            await tx.userRole.createMany({
              data: [{ userId: data.headId, roleId: approver1Role.id }],
              skipDuplicates: true,
            });
          }
        }
      }

      return updated;
    });
  }

  static async deleteDepartment(id) {
    return await prisma.department.delete({
      where: { id: parseInt(id) }, // ตรวจสอบให้แน่ใจว่า id เป็น Int
    });
  }

  // PersonnelType ------------------------------------
  static async getAllPersonnelTypes() {
    return await prisma.personnelType.findMany();
  }

  static async getPersonnelTypeById(id) {
    return await prisma.personnelType.findUnique({
      where: { id },
    });
  }

  static async createPersonnelType(name) {
    const clean = String(name || "").trim();
    if (!clean) throw createError(400, "กรุณาระบุชื่อประเภทบุคลากร");
    const existing = await prisma.personnelType.findFirst({ where: { name: clean } });
    if (existing) throw createError(409, `มีประเภทบุคลากรชื่อ "${clean}" อยู่แล้ว`);
    return await prisma.personnelType.create({ data: { name: clean } });
  }

  static async updatePersonnelType(id, name) {
    const clean = String(name || "").trim();
    if (!clean) throw createError(400, "กรุณาระบุชื่อประเภทบุคลากร");
    const dup = await prisma.personnelType.findFirst({
      where: { name: clean, NOT: { id: parseInt(id) } },
    });
    if (dup) throw createError(409, `มีประเภทบุคลากรชื่อ "${clean}" อยู่แล้ว`);
    return await prisma.personnelType.update({
      where: { id: parseInt(id) },
      data: { name: clean },
    });
  }

  static async deletePersonnelType(id) {
    return await prisma.personnelType.delete({
      where: { id },
    });
  }

  // ---------- Relation counts ----------

  // นับ relations ของ Organization ก่อนลบ
  static async countOrganizationRelations(organizationId) {
    const [departmentCount, approverPositionCount] = await Promise.all([
      prisma.department.count({ where: { organizationId } }),
      prisma.approverPosition.count({ where: { organizationId } }),
    ]);
    return { departmentCount, approverPositionCount };
  }

  // นับ User ที่สังกัด Department
  static async countUsersByDepartmentId(departmentId) {
    return await prisma.user.count({ where: { departmentId } });
  }

  // นับ relations ของ PersonnelType ก่อนลบ
  static async countPersonnelTypeRelations(personnelTypeId) {
    const [userCount, rankCount] = await Promise.all([
      prisma.user.count({ where: { personnelTypeId } }),
      prisma.rank.count({ where: { personnelTypeId } }),
    ]);
    return { userCount, rankCount };
  }

  // นับ Rank config ของ PersonnelType
  static async countRanksByPersonnelTypeId(personnelTypeId) {
    return await prisma.rank.count({ where: { personnelTypeId } });
  }
}

module.exports = OrgAndDeptService;
