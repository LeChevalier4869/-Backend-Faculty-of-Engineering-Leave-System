const prisma = require("../config/prisma");
const createError = require("../utils/createError");
const { isSexAllowedForLeaveType } = require("../utils/leaveGenderPolicy");

const MAX_BULK_USERS = 1000;
const MAX_BALANCE_CHANGES = 5000;

function parsePositiveId(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw createError(400, `${label}ไม่ถูกต้อง`);
  }
  return parsed;
}

function parseDayCount(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw createError(400, `${label}ต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป`);
  }
  return parsed;
}

function rankMatchesUser(rank, user) {
  if (!rank || rank.personnelTypeId !== user.personnelTypeId) return false;
  const hireDate = new Date(user.hireDate);
  if (Number.isNaN(hireDate.getTime())) return false;
  const today = new Date();
  const hireMonths =
    (today.getFullYear() - hireDate.getFullYear()) * 12 +
    today.getMonth() -
    hireDate.getMonth();
  return (
    (rank.minHireMonths == null || hireMonths >= rank.minHireMonths) &&
    (rank.maxHireMonths == null || hireMonths <= rank.maxHireMonths)
  );
}

function getApplicableRank(user, userRanks, leaveTypeId, rankId) {
  const candidates = userRanks
    .map((userRank) => userRank.rank)
    .filter(
      (rank) =>
        rank &&
        rank.leaveTypeId === leaveTypeId &&
        (!rankId || rank.id === rankId) &&
        rankMatchesUser(rank, user) &&
        isSexAllowedForLeaveType(user.sex, rank.leaveType?.name),
    );

  if (!candidates.length) {
    throw createError(
      400,
      `${user.firstName} ${user.lastName} ไม่มี Rank ที่ใช้ได้สำหรับประเภทการลานี้`,
    );
  }
  if (candidates.length > 1) {
    throw createError(
      400,
      `${user.firstName} ${user.lastName} มี Rank ซ้ำซ้อนสำหรับประเภทการลานี้ กรุณาเลือก Rank ให้ชัดเจน`,
    );
  }
  return candidates[0];
}

function isNonDeductible(balance, rank) {
  return (
    balance.leaveType?.isNonDeductible === true ||
    (rank.receiveDays === 0 && rank.isBalance === true)
  );
}

function getRankMaxDays(rank) {
  if (rank.maxDays == null) {
    throw createError(400, "Rank นี้ไม่ได้กำหนดสิทธิ์วันลาสูงสุด");
  }
  const rankLimit = Number(rank.maxDays);
  if (!Number.isSafeInteger(rankLimit) || rankLimit < 0) {
    throw createError(400, "Rank นี้ไม่ได้กำหนดสิทธิ์วันลาสูงสุดที่ถูกต้อง");
  }
  return rankLimit;
}

async function getCarryOverDays(tx, userId, leaveTypeId, year, leaveType) {
  if (
    leaveTypeId !== 4 ||
    leaveType?.resetOnFiscalYear !== true ||
    year <= 0
  ) {
    return 0;
  }

  const previousBalance = await tx.leaveBalance.findFirst({
    where: { userId, leaveTypeId, year: year - 1 },
    select: { remainingDays: true, maxDays: true, usedDays: true },
  });
  if (!previousBalance) return 0;

  return Math.min(
    Math.max(Number(previousBalance.remainingDays) || 0, 0),
    Math.max(
      (Number(previousBalance.maxDays) || 0) -
        (Number(previousBalance.usedDays) || 0),
      0,
    ),
  );
}

async function getRankLimit(tx, balance, rank, rankLimit = getRankMaxDays(rank)) {
  const carryOverDays = await getCarryOverDays(
    tx,
    balance.userId,
    balance.leaveTypeId,
    balance.year,
    balance.leaveType,
  );
  return rankLimit + carryOverDays;
}

async function prepareUpdate(tx, balance, values, rankId) {
  const user = balance.user;
  if (!user) throw createError(404, "ไม่พบผู้ใช้งานของยอดวันลานี้");

  const userRanks = await tx.userRank.findMany({
    where: {
      userId: user.id,
      rank: { leaveTypeId: balance.leaveTypeId },
    },
    include: {
      rank: { include: { leaveType: true } },
    },
  });
  const rank = getApplicableRank(user, userRanks, balance.leaveTypeId, rankId);
  const rankLimit = getRankMaxDays(rank);
  const remainingDays = parseDayCount(values.remainingDays, "ยอดวันลาคงเหลือ");
  const usedDays = parseDayCount(values.usedDays, "ยอดวันที่ใช้ไปแล้ว");

  if (isNonDeductible(balance, rank)) {
    if (remainingDays !== 0) {
      throw createError(
        400,
        `ประเภทการลา "${balance.leaveType?.name || ""}" ไม่หักยอดคงเหลือ ต้องกำหนดยอดคงเหลือเป็น 0`,
      );
    }
  } else {
    const maxAllowed = await getRankLimit(tx, balance, rank, rankLimit);
    const total = remainingDays + usedDays + (Number(balance.pendingDays) || 0);
    if (total > maxAllowed) {
      throw createError(
        400,
        `ยอดคงเหลือ + ใช้ไปแล้ว + รออนุมัติ รวม ${total} วัน เกินสิทธิ์ตาม Rank ${maxAllowed} วัน`,
      );
    }
  }

  return {
    rank,
    data: { remainingDays, usedDays },
    oldData: {
      id: balance.id,
      userId: balance.userId,
      leaveTypeId: balance.leaveTypeId,
      year: balance.year,
      maxDays: balance.maxDays,
      remainingDays: balance.remainingDays,
      usedDays: balance.usedDays,
      pendingDays: balance.pendingDays,
    },
  };
}

async function writeAuditLogs(tx, actor, year, entries) {
  for (const { balance, rank, oldData, newData } of entries) {
    const userName =
      `${balance.user?.prefixName || ""}${balance.user?.firstName || ""} ${balance.user?.lastName || ""}`.trim();
    const entryYear = balance.year ?? year;
    const entityData = {
      balanceId: balance.id,
      userId: balance.userId,
      userName,
      leaveTypeId: balance.leaveTypeId,
      leaveTypeName: balance.leaveType?.name || "",
      rankId: rank.id,
      rankName: rank.rank,
      year: entryYear,
      oldData,
      newData,
    };

    await tx.auditLog.create({
      data: {
        userId: actor.id,
        action: "LEAVE_BALANCE_MANUAL_ADJUST",
        entityType: "LeaveBalance",
        entityId: balance.id,
        details: `ปรับยอดวันลา ${entityData.leaveTypeName} (LeaveType ID ${balance.leaveTypeId}) ของ ${userName} (User ID ${balance.userId}) ปีงบประมาณ ${entryYear}`,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        entityData: JSON.stringify(entityData),
        leaveRequestId: null,
      },
    });
  }
}

class LeaveBalanceManagementService {
  static async getOptions() {
    const [fiscalYearSetting, organizations, departments, ranks] =
      await Promise.all([
        prisma.setting.findUnique({
          where: { key: "fiscalYear" },
          select: { value: true },
        }),
        prisma.organization.findMany({
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
        prisma.department.findMany({
          select: { id: true, name: true, organizationId: true },
          orderBy: { name: "asc" },
        }),
        prisma.rank.findMany({
          where: { maxDays: { not: null } },
          include: {
            leaveType: { select: { id: true, name: true, isNonDeductible: true } },
            personnelType: { select: { id: true, name: true } },
          },
          orderBy: [{ leaveTypeId: "asc" }, { rank: "asc" }],
        }),
      ]);
    const configuredYear = Number.parseInt(fiscalYearSetting?.value, 10);

    return {
      year: Number.isSafeInteger(configuredYear)
        ? configuredYear
        : new Date().getFullYear(),
      organizations,
      departments,
      ranks,
    };
  }

  static async getUsers(filters = {}) {
    const where = {};

    if (filters.organizationId) {
      where.department = {
        organizationId: parsePositiveId(filters.organizationId, "องค์กร"),
      };
    }
    if (filters.departmentId) {
      where.departmentId = parsePositiveId(filters.departmentId, "แผนก");
    }
    if (filters.rankId) {
      where.userRanks = {
        some: { rankId: parsePositiveId(filters.rankId, "Rank") },
      };
    }

    const search = String(filters.search || "").trim().slice(0, 100);
    if (search) {
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { email: { contains: search } },
      ];
    }

    const fiscalYearSetting = await prisma.setting.findUnique({
      where: { key: "fiscalYear" },
      select: { value: true },
    });
    const configuredYear = Number.parseInt(fiscalYearSetting?.value, 10);
    const year = Number.isSafeInteger(configuredYear)
      ? configuredYear
      : new Date().getFullYear();

    const users = await prisma.user.findMany({
      where,
      include: {
        department: {
          select: {
            id: true,
            name: true,
            organization: { select: { id: true, name: true } },
          },
        },
        personnelType: { select: { id: true, name: true } },
        userRanks: {
          include: {
            rank: {
              include: {
                leaveType: {
                  select: { id: true, name: true, isNonDeductible: true },
                },
              },
            },
          },
        },
        leaveBalances: {
          where: { year: { in: year > 0 ? [year, year - 1] : [year] } },
          include: {
            leaveType: {
              select: {
                id: true,
                name: true,
                isNonDeductible: true,
                resetOnFiscalYear: true,
              },
            },
          },
        },
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    });

    return {
      year,
      users: users.map((user) => {
        const previousBalances = new Map(
          user.leaveBalances
            .filter((balance) => balance.year === year - 1)
            .map((balance) => [balance.leaveTypeId, balance]),
        );
        const leaveBalances = user.leaveBalances
          .filter((balance) => balance.year === year)
          .map((balance) => {
            const previousBalance = previousBalances.get(balance.leaveTypeId);
            const carryOverDays =
              balance.leaveTypeId === 4 &&
              balance.leaveType?.resetOnFiscalYear === true &&
              previousBalance
                ? Math.min(
                    Math.max(Number(previousBalance.remainingDays) || 0, 0),
                    Math.max(
                      (Number(previousBalance.maxDays) || 0) -
                        (Number(previousBalance.usedDays) || 0),
                      0,
                    ),
                  )
                : 0;
            return { ...balance, carryOverDays };
          });

        return {
          id: user.id,
          prefixName: user.prefixName,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          sex: user.sex,
          personnelType: user.personnelType,
          department: user.department,
          ranks: user.userRanks
            .map(({ rank }) => rank)
            .filter(
              (rank) =>
                rank &&
                rankMatchesUser(rank, user) &&
                isSexAllowedForLeaveType(user.sex, rank.leaveType?.name),
            ),
          leaveBalances,
        };
      }),
    };
  }

  static async initializeMissingBalances(userIds, actor) {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      throw createError(400, "กรุณาเลือกผู้ใช้งานอย่างน้อย 1 คน");
    }

    const ids = [...new Set(userIds.map((id) => parsePositiveId(id, "รหัสผู้ใช้")))];
    if (ids.length > MAX_BULK_USERS) {
      throw createError(400, `เลือกผู้ใช้งานได้ไม่เกิน ${MAX_BULK_USERS} คนต่อครั้ง`);
    }

    return prisma.$transaction(async (tx) => {
      const fiscalYearSetting = await tx.setting.findUnique({
        where: { key: "fiscalYear" },
        select: { value: true },
      });
      const configuredYear = Number.parseInt(fiscalYearSetting?.value, 10);
      const year = Number.isSafeInteger(configuredYear)
        ? configuredYear
        : new Date().getFullYear();

      const users = await tx.user.findMany({
        where: { id: { in: ids } },
        include: {
          userRanks: {
            include: {
              rank: {
                include: {
                  leaveType: {
                    select: {
                      id: true,
                      name: true,
                      isNonDeductible: true,
                      resetOnFiscalYear: true,
                    },
                  },
                },
              },
            },
          },
          leaveBalances: {
            where: { year: { in: year > 0 ? [year, year - 1] : [year] } },
            include: { leaveType: true },
          },
        },
      });
      if (users.length !== ids.length) {
        throw createError(404, "ไม่พบผู้ใช้งานบางรายที่เลือก");
      }

      const createdBalances = [];
      const skipped = [];
      for (const user of users) {
        const userName =
          `${user.prefixName || ""}${user.firstName || ""} ${user.lastName || ""}`.trim();
        const skip = (reason) =>
          skipped.push({ userId: user.id, userName, reason });

        if (!user.personnelTypeId || !user.hireDate) {
          skip("ข้อมูลประเภทบุคลากรหรือวันที่เริ่มงานไม่ครบ จึงคำนวณ Rank ไม่ได้");
          continue;
        }

        const ranksByLeaveType = new Map();
        user.userRanks
          .map(({ rank }) => rank)
          .filter(
            (rank) =>
              rank &&
              rank.leaveTypeId &&
              rankMatchesUser(rank, user) &&
              isSexAllowedForLeaveType(user.sex, rank.leaveType?.name),
          )
          .forEach((rank) => {
            const ranks = ranksByLeaveType.get(rank.leaveTypeId) || [];
            ranks.push(rank);
            ranksByLeaveType.set(rank.leaveTypeId, ranks);
          });

        if (!ranksByLeaveType.size) {
          skip("ไม่พบ Rank ที่ใช้ได้ตามประเภทบุคลากร อายุงาน และเพศ");
          continue;
        }

        const existingByLeaveType = new Map(
          user.leaveBalances
            .filter((balance) => balance.year === year)
            .map((balance) => [balance.leaveTypeId, balance]),
        );

        for (const [leaveTypeId, ranks] of ranksByLeaveType) {
          if (existingByLeaveType.has(leaveTypeId)) continue;
          const leaveTypeName = ranks[0].leaveType?.name || `Leave Type ${leaveTypeId}`;
          if (ranks.length > 1) {
            skip(`${leaveTypeName}: พบ Rank ที่ใช้ได้มากกว่า 1 รายการ จึงไม่สร้างยอดอัตโนมัติ`);
            continue;
          }

          const rank = ranks[0];
          if (rank.maxDays == null) {
            skip(`${leaveTypeName}: Rank ยังไม่ได้กำหนดสิทธิ์วันลาสูงสุด`);
            continue;
          }

          const rankLimit = getRankMaxDays(rank);
          const leaveType = rank.leaveType;
          const isPermanentLeave =
            leaveType?.isNonDeductible === true &&
            leaveType?.resetOnFiscalYear !== true;
          const isManagedForFiscalYear =
            leaveType?.resetOnFiscalYear === true ||
            Number(leaveTypeId) === 4 ||
            leaveType?.isNonDeductible === true;
          if (!isManagedForFiscalYear) {
            skip(`${leaveTypeName}: ประเภทลานี้ไม่มีการสร้างยอดใหม่ตามรอบปี`);
            continue;
          }

          let balanceData;
          let carryOverDays = 0;
          if (isPermanentLeave) {
            const previousBalance = await tx.leaveBalance.findFirst({
              where: { userId: user.id, leaveTypeId },
              orderBy: { year: "desc" },
              select: {
                maxDays: true,
                usedDays: true,
                pendingDays: true,
                remainingDays: true,
              },
            });
            balanceData = {
              maxDays: previousBalance?.maxDays ?? 0,
              usedDays: previousBalance?.usedDays ?? 0,
              pendingDays: previousBalance?.pendingDays ?? 0,
              remainingDays: previousBalance?.remainingDays ?? 0,
            };
          } else {
            const countOnly = isNonDeductible({ leaveType }, rank);
            const daysToUse =
              Number(rank.receiveDays) > 0
                ? parseDayCount(rank.receiveDays, `สิทธิ์ Rank ของ ${leaveTypeName}`)
                : rankLimit;
            if (!countOnly && daysToUse > rankLimit) {
              skip(
                `${leaveTypeName}: สิทธิ์ตั้งต้น ${daysToUse} วันเกินสิทธิ์ Rank ${rankLimit} วัน`,
              );
              continue;
            }

            if (
              !countOnly &&
              Number(leaveTypeId) === 4 &&
              leaveType?.resetOnFiscalYear === true
            ) {
              carryOverDays = await getCarryOverDays(
                tx,
                user.id,
                leaveTypeId,
                year,
                leaveType,
              );
            }
            const initialRemainingDays = countOnly
              ? 0
              : Number(leaveTypeId) === 4
                ? daysToUse + carryOverDays
                : Math.min(daysToUse, rankLimit);
            balanceData = {
              maxDays: countOnly
                ? 0
                : Number(leaveTypeId) === 4
                  ? daysToUse
                  : rankLimit,
              usedDays: 0,
              pendingDays: 0,
              remainingDays: initialRemainingDays,
            };
          }

          if (createdBalances.length >= MAX_BALANCE_CHANGES) {
            throw createError(
              400,
              `สร้างได้ไม่เกิน ${MAX_BALANCE_CHANGES} ประเภทยอดวันลาต่อครั้ง`,
            );
          }

          const data = {
            userId: user.id,
            leaveTypeId,
            ...balanceData,
            year,
          };
          const created = await tx.leaveBalance.create({
            data,
            include: { leaveType: true },
          });
          const balance = {
            ...created,
            leaveType: created.leaveType || rank.leaveType,
            carryOverDays,
          };
          const entityData = {
            balanceId: balance.id,
            userId: user.id,
            userName,
            leaveTypeId,
            leaveTypeName,
            rankId: rank.id,
            rankName: rank.rank,
            year,
            maxDays: data.maxDays,
            remainingDays: data.remainingDays,
            usedDays: data.usedDays,
            pendingDays: data.pendingDays,
          };

          await tx.auditLog.create({
            data: {
              userId: actor.id,
              action: "LEAVE_BALANCE_INITIALIZE",
              entityType: "LeaveBalance",
              entityId: balance.id,
              details: `สร้าง LeaveBalance (user ${user.id}, leaveType ${leaveTypeId}, rank ${rank.id}, year ${year})`,
              ipAddress: actor.ipAddress,
              userAgent: actor.userAgent,
              entityData: JSON.stringify(entityData),
              leaveRequestId: null,
            },
          });

          createdBalances.push({ userId: user.id, balance });
        }
      }

      return {
        year,
        createdCount: createdBalances.length,
        createdBalances,
        skipped,
      };
    }, {
      maxWait: 10000,
      timeout: 60000,
    });
  }

  static async adjustOne(balanceId, values, rankId, actor) {
    const id = parsePositiveId(balanceId, "รหัสยอดวันลา");
    const rank = rankId ? parsePositiveId(rankId, "Rank") : null;
    const result = await prisma.$transaction(async (tx) => {
      const balance = await tx.leaveBalance.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              prefixName: true,
              firstName: true,
              lastName: true,
              sex: true,
              personnelTypeId: true,
              hireDate: true,
            },
          },
          leaveType: { select: { id: true, name: true, isNonDeductible: true, resetOnFiscalYear: true } },
        },
      });
      if (!balance) throw createError(404, "ไม่พบข้อมูลยอดวันลา");

      const plan = await prepareUpdate(tx, balance, values, rank);
      const updated = await tx.leaveBalance.update({
        where: { id },
        data: plan.data,
      });
      await writeAuditLogs(tx, actor, balance.year, [
        {
          balance,
          rank: plan.rank,
          oldData: plan.oldData,
          newData: { ...plan.oldData, ...plan.data },
        },
      ]);
      return updated;
    });

    return result;
  }

  static async adjustBalances(changes, actor) {
    if (!Array.isArray(changes) || changes.length === 0) {
      throw createError(400, "ไม่มีข้อมูลวันลาที่ต้องบันทึก");
    }
    if (changes.length > MAX_BALANCE_CHANGES) {
      throw createError(
        400,
        `บันทึกได้ไม่เกิน ${MAX_BALANCE_CHANGES} ประเภทยอดวันลาต่อครั้ง`,
      );
    }

    const balanceIds = changes.map((change) =>
      parsePositiveId(change?.balanceId, "รหัสยอดวันลา"),
    );
    if (new Set(balanceIds).size !== balanceIds.length) {
      throw createError(400, "พบข้อมูลยอดวันลาซ้ำในรายการที่ส่งมา");
    }

    return prisma.$transaction(async (tx) => {
      const plans = [];
      const issues = [];

      for (let index = 0; index < changes.length; index += 1) {
        const change = changes[index];
        const balanceId = balanceIds[index];
        try {
          const balance = await tx.leaveBalance.findUnique({
            where: { id: balanceId },
            include: {
              user: {
                select: {
                  id: true,
                  prefixName: true,
                  firstName: true,
                  lastName: true,
                  sex: true,
                  personnelTypeId: true,
                  hireDate: true,
                },
              },
              leaveType: {
                select: {
                  id: true,
                  name: true,
                  isNonDeductible: true,
                  resetOnFiscalYear: true,
                },
              },
            },
          });
          if (!balance) {
            throw createError(404, `ไม่พบยอดวันลา ID ${balanceId}`);
          }

          const rankId = parsePositiveId(change?.rankId, "Rank");
          const plan = await prepareUpdate(
            tx,
            balance,
            change,
            rankId,
          );
          plans.push({ balance, plan });
        } catch (error) {
          issues.push(`ยอดวันลา ID ${balanceId}: ${error.message}`);
        }
      }

      if (issues.length) {
        throw createError(400, `ไม่สามารถบันทึกยอดได้:\n${issues.join("\n")}`);
      }

      const auditEntries = [];
      for (const { balance, plan } of plans) {
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: plan.data,
        });
        auditEntries.push({
          balance,
          rank: plan.rank,
          oldData: plan.oldData,
          newData: { ...plan.oldData, ...plan.data },
        });
      }

      const year = plans[0].balance.year;
      await writeAuditLogs(tx, actor, year, auditEntries);
      return { updatedCount: plans.length, year };
    });
  }

  static async adjustMany(values, actor) {
    if (!Array.isArray(values.userIds) || values.userIds.length === 0) {
      throw createError(400, "กรุณาเลือกผู้ใช้งานอย่างน้อย 1 คน");
    }
    const userIds = [...new Set(values.userIds.map((id) => parsePositiveId(id, "รหัสผู้ใช้")))];
    if (userIds.length > MAX_BULK_USERS) {
      throw createError(400, `เลือกผู้ใช้งานได้ไม่เกิน ${MAX_BULK_USERS} คนต่อครั้ง`);
    }
    const leaveTypeId = parsePositiveId(values.leaveTypeId, "ประเภทการลา");
    const rankId = values.rankId ? parsePositiveId(values.rankId, "Rank") : null;
    const remainingDays = parseDayCount(values.remainingDays, "ยอดวันลาคงเหลือ");
    const usedDays = parseDayCount(values.usedDays, "ยอดวันที่ใช้ไปแล้ว");

    const result = await prisma.$transaction(async (tx) => {
      const fiscalYearSetting = await tx.setting.findUnique({
        where: { key: "fiscalYear" },
        select: { value: true },
      });
      const configuredYear = Number.parseInt(fiscalYearSetting?.value, 10);
      const year = Number.isSafeInteger(configuredYear)
        ? configuredYear
        : new Date().getFullYear();

      const users = await tx.user.findMany({
        where: { id: { in: userIds } },
        include: {
          userRanks: {
            where: { rank: { leaveTypeId } },
            include: { rank: { include: { leaveType: true } } },
          },
          leaveBalances: {
            where: { leaveTypeId, year },
            include: {
              leaveType: {
                select: {
                  id: true,
                  name: true,
                  isNonDeductible: true,
                  resetOnFiscalYear: true,
                },
              },
            },
          },
        },
      });

      if (users.length !== userIds.length) {
        throw createError(404, "ไม่พบผู้ใช้งานบางรายที่เลือก");
      }

      const plans = [];
      const issues = [];
      for (const user of users) {
        const balance = user.leaveBalances[0];
        if (!balance) {
          issues.push(`${user.firstName} ${user.lastName}: ไม่มีข้อมูลยอดวันลาในปี ${year}`);
          continue;
        }
        try {
          const plan = await prepareUpdate(
            tx,
            { ...balance, user },
            { remainingDays, usedDays },
            rankId,
          );
          plans.push({ balance, user, plan });
        } catch (error) {
          issues.push(`${user.firstName} ${user.lastName}: ${error.message}`);
        }
      }
      if (issues.length) {
        throw createError(400, `ไม่สามารถปรับยอดได้:\n${issues.join("\n")}`);
      }

      const entries = [];
      for (const { balance, user, plan } of plans) {
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: plan.data,
        });
        entries.push({
          balance: { ...balance, user },
          rank: plan.rank,
          oldData: plan.oldData,
          newData: { ...plan.oldData, ...plan.data },
        });
      }
      await writeAuditLogs(tx, actor, year, entries);
      return { updatedCount: entries.length, year };
    });

    return result;
  }
}

module.exports = LeaveBalanceManagementService;
