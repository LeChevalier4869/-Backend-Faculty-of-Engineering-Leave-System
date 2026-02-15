const prisma = require("../config/prisma");
const createError = require("../utils/createError");
const UserService = require("./user-service");
const AuditLogService = require("./auditLog-service");

class ProxyApprovalService {
  // ────────────────────────────────
  // 🟢 CREATE
  // ────────────────────────────────

  // สร้างการมอบอำนาจให้ผู้อนุมัติแทน
  static async createProxyApproval({
    originalApproverId,
    proxyApproverId,
    approverLevel,
    startDate,
    endDate,
    reason,
    isDaily = false,
    dailyDate = null,
  }) {
    // validation
    if (!originalApproverId || !proxyApproverId || !approverLevel) {
      throw createError(400, "ข้อมูลไม่ครบถ้วน");
    }

    if (originalApproverId === proxyApproverId) {
      throw createError(400, "ไม่สามารถมอบอำนาจให้ตนเองได้");
    }

    
    if (approverLevel < 1 || approverLevel > 5) {
      throw createError(400, "ระดับผู้อนุมัติต้องอยู่ระหว่าง 1-5");
    }

    // ตรวจสอบข้อมูลสำหรับการมอบอำนาจแบบปกติ
    if (!isDaily) {
      if (!startDate || !endDate) {
        throw createError(400, "กรณีมอบอำนาจแบบช่วงเวลา ต้องระบุวันเริ่มต้นและวันสิ้นสุด");
      }

      const start = new Date(startDate);
      const end = new Date(endDate);

      if (isNaN(start) || isNaN(end)) {
        throw createError(400, "รูปแบบวันที่ไม่ถูกต้อง");
      }

      if (start >= end) {
        throw createError(400, "วันสิ้นสุดต้องมากกว่าวันเริ่มต้น");
      }
    }

    // ตรวจสอบข้อมูลสำหรับการมอบอำนาจรายวัน
    if (isDaily) {
      if (!dailyDate) {
        throw createError(400, "กรณีมอบอำนาจรายวัน ต้องระบุวันที่");
      }

      const date = new Date(dailyDate);
      if (isNaN(date)) {
        throw createError(400, "รูปแบบวันที่ไม่ถูกต้อง");
      }

      // ตรวจสอบว่าวันที่ไม่ใช่วันในอดีต
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      date.setHours(0, 0, 0, 0);

      if (date < today) {
        throw createError(400, "ไม่สามารถมอบอำนาจย้อนหลังได้");
      }
    }

    // ตรวจสอบว่าผู้อนุมัติต้นฉบับมีอยู่จริง
    const originalApprover = await prisma.user.findUnique({
      where: { id: originalApproverId },
    });

    if (!originalApprover) {
      throw createError(404, "ไม่พบข้อมูลผู้อนุมัติต้นฉบับ");
    }

    // ตรวจสอบว่าผู้อนุมัติแทนมีอยู่จริง
    const proxyApprover = await prisma.user.findUnique({
      where: { id: proxyApproverId },
      include: {
        userRoles: {
          include: {
            role: true
          }
        }
      }
    });

    if (!proxyApprover) {
      throw createError(404, "ไม่พบข้อมูลผู้อนุมัติแทน");
    }

    // ตรวจสอบว่า original approver มี role ที่เกี่ยวข้องกับ approverLevel หรือไม่
    const roleMapping = {
      1: 'APPROVER_1',
      2: 'VERIFIER',
      3: 'APPROVER_2',
      4: 'APPROVER_3',
      5: 'APPROVER_4'
    };

    const requiredRole = roleMapping[approverLevel];
    if (!requiredRole) {
      throw createError(400, "ระดับผู้อนุมัติไม่ถูกต้อง");
    }

    // แก้ไข: ตรวจสอบว่า original approver มี role ที่ตรงกับ approverLevel หรือไม่
    // ไม่จำเป็นต้องตรวจสอบ role ของ proxy approver
    const originalApproverWithRoles = await prisma.user.findUnique({
      where: { id: originalApproverId },
      include: {
        userRoles: {
          include: {
            role: true
          }
        }
      }
    });

    if (!originalApproverWithRoles) {
      throw createError(404, "ไม่พบข้อมูลผู้อนุมัติต้นทาง");
    }

    const hasOriginalRequiredRole = originalApproverWithRoles.userRoles.some(userRole =>
      userRole.role.name === requiredRole
    );

    if (!hasOriginalRequiredRole) {
      throw createError(400, `ผู้อนุมัติต้นทางต้องมีสิทธิ์ระดับ ${requiredRole} จึงจะสามารถมอบอำนาได้`);
    }

    // ตรวจสอบว่ามีการมอบอำนาจที่ทับซ้อนกันหรือไม่
    if (isDaily) {
      // ตรวจสอบการทับซ้อนสำหรับรายวัน
      const existingDailyProxy = await prisma.proxyApproval.findFirst({
        where: {
          originalApproverId,
          approverLevel,
          isDaily: true,
          dailyDate: new Date(dailyDate),
          status: "ACTIVE",
        },
      });

      if (existingDailyProxy) {
        throw createError(400, "มีการมอบอำนาจรายวันในวันที่กำหนดอยู่แล้ว");
      }
    } else {
      // ตรวจสอบการทับซ้อนสำหรับช่วงเวลา
      const existingProxy = await prisma.proxyApproval.findFirst({
        where: {
          originalApproverId,
          approverLevel,
          isDaily: false,
          status: "ACTIVE",
          OR: [
            {
              startDate: {
                gte: new Date(startDate),
              },
              endDate: {
                gte: new Date(endDate),
              },
            },
          ],
        },
      });

      if (existingProxy) {
        throw createError(400, "มีการมอบอำนาจในช่วงเวลาที่ทับซ้อนกันอยู่แล้ว");
      }
    }

    try {
      const proxyApprovalData = {
        originalApproverId,
        proxyApproverId,
        approverLevel,
        reason,
        status: "ACTIVE",
        isDaily,
      };

      if (isDaily) {
        proxyApprovalData.dailyDate = new Date(dailyDate);
        // สำหรับรายวัน ให้ startDate และ endDate เป็นวันเดียวกัน
        proxyApprovalData.startDate = new Date(dailyDate);
        proxyApprovalData.endDate = new Date(dailyDate);
      } else {
        proxyApprovalData.startDate = new Date(startDate);
        proxyApprovalData.endDate = new Date(endDate);
        proxyApprovalData.dailyDate = null;
      }

      const proxyApproval = await prisma.proxyApproval.create({
        data: proxyApprovalData,
        include: {
          originalApprover: {
            select: {
              id: true,
              prefixName: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          proxyApprover: {
            select: {
              id: true,
              prefixName: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

      return proxyApproval;
    } catch (error) {
      throw createError(500, "สร้างการมอบอำนาจไม่สำเร็จ");
    }
  }

  // ────────────────────────────────
  // 🔎 READ
  // ────────────────────────────────

  // ดึงข้อมูลการมอบอำนาจทั้งหมด (รวม ACTIVE และ EXPIRED)
  static async getAllProxyApprovals(page = 1, limit = 10, sort = 'createdAt', order = 'desc') {
    const skip = (page - 1) * limit;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [data, totalCount] = await Promise.all([
      prisma.proxyApproval.findMany({
        skip,
        take: limit,
        orderBy: {
          [sort]: order
        },
        include: {
          originalApprover: {
            select: {
              id: true,
              prefixName: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          proxyApprover: {
            select: {
              id: true,
              prefixName: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),
      prisma.proxyApproval.count()
    ]);

    // ตรวจสอบและอัปเดตสถานะสำหรับ proxy ที่หมดอายุ
    const updatedData = data.map(proxy => {
      let status = proxy.status;

      // ตรวจสอบวันที่สำหรับ proxy ที่หมดอายุ
      if (proxy.status === 'ACTIVE') {
        if (proxy.isDaily) {
          // กรณีรายวัน: ตรวจสอบว่าวันที่ผ่านไปแล้ว
          const proxyDate = new Date(proxy.dailyDate);
          proxyDate.setHours(0, 0, 0, 0);
          const nextDay = new Date(proxyDate);
          nextDay.setDate(nextDay.getDate() + 1);

          if (today >= nextDay) {
            status = 'EXPIRED';
            // อัปเดตสถานะในฐานข้อมูล
            prisma.proxyApproval.update({
              where: { id: proxy.id },
              data: { status: 'EXPIRED' }
            }).catch(err => console.error('Error updating expired proxy:', err));
          }
        } else {
          // กรณีช่วงเวลา: ตรวจสอบว่าวันสิ้นสุดผ่านไปแล้ว
          const endDate = new Date(proxy.endDate);
          endDate.setHours(23, 59, 59, 999);

          if (today > endDate) {
            status = 'EXPIRED';
            // อัปเดตสถานะในฐานข้อมูล
            prisma.proxyApproval.update({
              where: { id: proxy.id },
              data: { status: 'EXPIRED' }
            }).catch(err => console.error('Error updating expired proxy:', err));
          }
        }
      }

      return { ...proxy, status };
    });

    const totalPages = Math.ceil(totalCount / limit);

    return {
      data: updatedData,
      currentPage: page,
      totalPages,
      totalCount,
      limit
    };
  }

  // ดึงข้อมูลการมอบอำนาจสำหรับวันนี้ (ปัจจุบัน)
  static async getTodayProxyApprovals(page = 1, limit = 10, sort = 'createdAt', order = 'desc') {
    const skip = (page - 1) * limit;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [data, totalCount] = await Promise.all([
      prisma.proxyApproval.findMany({
        where: {
          OR: [
            { status: 'ACTIVE' },
            {
              AND: [
                // การมอบอำนาจรายวันสำหรับวันนี้
                {
                  isDaily: true,
                  dailyDate: {
                    gte: today
                  }
                },
                // การมอบอำนาจช่วงเวลาที่ครอบคลุมวันนี้
                {
                  isDaily: false,
                  AND: [
                    { startDate: { gte: today } },
                    { endDate: { gte: today } }
                  ]
                }
              ]
            }
          ]
        },
        skip,
        take: limit,
        orderBy: {
          [sort]: order
        },
        include: {
          originalApprover: {
            select: {
              id: true,
              prefixName: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          proxyApprover: {
            select: {
              id: true,
              prefixName: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),
      prisma.proxyApproval.count({
        where: {
          AND: [
            { status: 'ACTIVE' },
            {
              OR: [
                // การมอบอำนาจรายวันสำหรับวันนี้
                {
                  isDaily: true,
                  dailyDate: {
                    gte: today,
                    lt: tomorrow
                  }
                },
                // การมอบอำนาจช่วงเวลาที่ครอบคลุมวันนี้
                {
                  isDaily: false,
                  startDate: {
                    lte: today
                  },
                  endDate: {
                    gte: today
                  }
                }
              ]
            }
          ]
        }
      })
    ]);

    return {
      data,
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit),
      totalCount,
      limit,
      isToday: true,
      date: today.toISOString().split('T')[0]
    };
  }

  // ดึงประวัติการมอบอำนาจทั้งหมด (ยกเว้นวันนี้)
  static async getHistoryProxyApprovals(page = 1, limit = 10, sort = 'createdAt', order = 'desc') {
    const skip = (page - 1) * limit;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [data, totalCount] = await Promise.all([
      prisma.proxyApproval.findMany({
        where: {
          OR: [
            // การมอบอำนาจที่ไม่ใช่วันนี้
            {
              isDaily: true,
              dailyDate: {
                not: {
                  gte: today,
                  lt: tomorrow
                }
              }
            },
            // การมอบอำนาจช่วงเวลาที่ไม่ได้ครอบคลุมวันนี้ (เริ่มแล้ว แต่หมดอายุแล้ว)
            {
              isDaily: false,
              AND: [
                { startDate: { gt: today } },  // เริ่มแล้ว
                { endDate: { lt: today } }       // สิ้นสุดแล้ว
              ]
            },
            // การมอบอำนาจที่ไม่ active (รวม EXPIRED, CANCELLED)
            { status: { not: 'ACTIVE' } }
          ]
        },
        skip,
        take: limit,
        orderBy: {
          [sort]: order
        },
        include: {
          originalApprover: {
            select: {
              id: true,
              prefixName: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          proxyApprover: {
            select: {
              id: true,
              prefixName: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),
      prisma.proxyApproval.count({
        where: {
          OR: [
            // การมอบอำนาจที่ไม่ใช่วันนี้
            {
              isDaily: true,
              dailyDate: {
                not: {
                  gte: today,
                  lt: tomorrow
                }
              }
            },
            // การมอบอำนาจช่วงเวลาที่ไม่ได้ครอบคลุมวันนี้
            {
              isDaily: false,
              OR: [
                { startDate: { gt: today } },
                { endDate: { lt: today } }
              ]
            },
            // การมอบอำนาจที่ไม่ active
            { status: { not: 'ACTIVE' } }
          ]
        }
      })
    ]);

    return {
      data,
      currentPage: page,
      totalPages: Math.ceil(totalCount / limit),
      totalCount,
      limit,
      isHistory: true
    };
  }

  // ดึงข้อมูลการมอบอำนาจตาม ID
  static async getProxyApprovalById(id) {
    const proxyApproval = await prisma.proxyApproval.findUnique({
      where: { id: parseInt(id) },
      include: {
        originalApprover: {
          select: {
            id: true,
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        proxyApprover: {
          select: {
            id: true,
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!proxyApproval) {
      throw createError(404, "ไม่พบข้อมูลการมอบอำนาจ");
    }

    return proxyApproval;
  }

  // ดึงข้อมูลการมอบอำนาจที่ผู้ใช้เป็นผู้อนุมัติต้นฉบับ
  static async getProxyApprovalsByOriginalApprover(originalApproverId) {
    return await prisma.proxyApproval.findMany({
      where: { originalApproverId: parseInt(originalApproverId) },
      include: {
        originalApprover: {
          select: {
            id: true,
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        proxyApprover: {
          select: {
            id: true,
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // ดึงข้อมูลการมอบอำนาจที่ผู้ใช้เป็นผู้อนุมัติแทน
  static async getProxyApprovalsByProxyApprover(proxyApproverId) {
    return await prisma.proxyApproval.findMany({
      where: { proxyApproverId: parseInt(proxyApproverId) },
      include: {
        originalApprover: {
          select: {
            id: true,
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        proxyApprover: {
          select: {
            id: true,
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // ตรวจสอบว่ามีการมอบอำนาจที่ใช้ได้ในปัจจุบันหรือไม่ (สำหรับ original approver)
  static async getActiveProxyApproval(originalApproverId, approverLevel, date = new Date()) {
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);

    // ตรวจสอบการมอบอำนาจรายวันก่อน (priority สูงกว่า)
    const dailyProxy = await prisma.proxyApproval.findFirst({
      where: {
        originalApproverId: parseInt(originalApproverId),
        approverLevel: parseInt(approverLevel),
        isDaily: true,
        dailyDate: checkDate,
        status: "ACTIVE",
      },
      include: {
        originalApprover: {
          select: {
            id: true,
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        proxyApprover: {
          select: {
            id: true,
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (dailyProxy) {
      return dailyProxy;
    }

    // ตรวจสอบการมอบอำนาจแบบช่วงเวลา
    return await prisma.proxyApproval.findFirst({
      where: {
        originalApproverId: parseInt(originalApproverId),
        approverLevel: parseInt(approverLevel),
        isDaily: false,
        status: "ACTIVE",
        startDate: { gte: checkDate },
        endDate: { gte: checkDate },
      },
      include: {
        originalApprover: {
          select: {
            id: true,
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        proxyApprover: {
          select: {
            id: true,
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

  // ตรวจสอบว่าผู้ใช้เป็น proxy approver ที่ active หรือไม่ (สำหรับ proxy approver)
  static async getActiveProxyApprovalForProxyApprover(proxyApproverId, approverLevel, date = new Date()) {
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);

    // ตรวจสอบการมอบอำนาจรายวันก่อน (priority สูงกว่า)
    const dailyProxy = await prisma.proxyApproval.findFirst({
      where: {
        proxyApproverId: parseInt(proxyApproverId),
        approverLevel: parseInt(approverLevel),
        isDaily: true,
        dailyDate: checkDate,
        status: "ACTIVE",
      },
      include: {
        originalApprover: {
          select: {
            id: true,
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        proxyApprover: {
          select: {
            id: true,
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (dailyProxy) {
      return dailyProxy;
    }

    // ตรวจสอบการมอบอำนาจแบบช่วงเวลา
    return await prisma.proxyApproval.findFirst({
      where: {
        proxyApproverId: parseInt(proxyApproverId),
        approverLevel: parseInt(approverLevel),
        isDaily: false,
        status: "ACTIVE",
        startDate: { lte: checkDate },
        endDate: { gte: checkDate },
      },
      include: {
        originalApprover: {
          select: {
            id: true,
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        proxyApprover: {
          select: {
            id: true,
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

  // ตรวจสอบว่าผู้ใช้เป็น proxy approver ที่ active หรือไม่ (สำหรับ proxy approver)
  static async getActiveProxyApprovalForProxyApprover(proxyApproverId, approverLevel, date = new Date()) {
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);

    // ตรวจสอบการมอบอำนาจรายวันก่อน (priority สูงกว่า)
    const dailyProxy = await prisma.proxyApproval.findFirst({
      where: {
        proxyApproverId: parseInt(proxyApproverId),
        approverLevel: parseInt(approverLevel),
        isDaily: true,
        dailyDate: checkDate,
        status: "ACTIVE",
      },
      include: {
        originalApprover: {
          select: {
            id: true,
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        proxyApprover: {
          select: {
            id: true,
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (dailyProxy) {
      return dailyProxy;
    }

    // ตรวจสอบการมอบอำนาจแบบช่วงเวลา
    return await prisma.proxyApproval.findFirst({
      where: {
        proxyApproverId: parseInt(proxyApproverId),
        approverLevel: parseInt(approverLevel),
        isDaily: false,
        status: "ACTIVE",
        startDate: { lte: checkDate },
        endDate: { gte: checkDate },
      },
      include: {
        originalApprover: {
          select: {
            id: true,
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        proxyApprover: {
          select: {
            id: true,
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

  // ────────────────────────────────
  // 🔁 UPDATE
  // ────────────────────────────────

  // อัปเดตข้อมูลการมอบอำนาจ
  static async updateProxyApproval(id, updateData) {
    console.log('🔍 Debug - Service updateProxyApproval:');
    console.log('ID:', id);
    console.log('UpdateData:', updateData);

    const existingProxy = await prisma.proxyApproval.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingProxy) {
      console.log('❌ Proxy not found');
      throw createError(404, "ไม่พบข้อมูลการมอบอำนาจ");
    }

    console.log('✅ Found existing proxy:', existingProxy);

    // ตรวจสอบและจัดการข้อมูลสำหรับ isDaily
    if (updateData.isDaily) {
      // สำหรับรายวัน: ต้องมี dailyDate
      if (!updateData.dailyDate) {
        console.log('❌ Missing dailyDate for isDaily=true');
        throw createError(400, "การมอบอำนาจรายวันต้องระบุวันที่");
      }

      // ตั้ง startDate และ endDate เป็นวันเดียวกัน
      const dailyDate = new Date(updateData.dailyDate);
      dailyDate.setHours(0, 0, 0, 0);

      updateData.startDate = dailyDate;
      updateData.endDate = dailyDate;

      console.log('📅 Processed dailyDate:', dailyDate);

      // ลบฟิลด์ที่ไม่จำเป็นหลังจากจัดการข้อมูลเสร็จแล้ว
      delete updateData.dailyDate;
    } else {
      // สำหรับช่วงเวลา: ต้องมี startDate และ endDate
      if (!updateData.startDate || !updateData.endDate) {
        console.log('❌ Missing startDate or endDate for isDaily=false');
        throw createError(400, "การมอบอำนาจช่วงเวลาต้องระบุวันเริ่มต้นและวันสิ้นสุด");
      }

      // แปลง startDate และ endDate เป็น Date objects
      updateData.startDate = new Date(updateData.startDate);
      updateData.endDate = new Date(updateData.endDate);

      // ลบฟิลด์ที่ไม่จำเป็น
      if (updateData.dailyDate) {
        delete updateData.dailyDate;
      }
    }

    console.log('📋 Final updateData for database:', updateData);

    try {
      const updatedProxy = await prisma.proxyApproval.update({
        where: { id: parseInt(id) },
        data: updateData,
        include: {
          originalApprover: {
            select: {
              id: true,
              prefixName: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          proxyApprover: {
            select: {
              id: true,
              prefixName: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

      console.log('✅ Update successful:', updatedProxy);
      return updatedProxy;
    } catch (error) {
      console.log('❌ Database update error:', error.message);
      throw createError(500, "อัปเดตการมอบอำนาจไม่สำเร็จ");
    }
  }

  // ยกเลิกการมอบอำนาจ
  static async cancelProxyApproval(id, cancelledBy) {
    const existingProxy = await prisma.proxyApproval.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingProxy) {
      throw createError(404, "ไม่พบข้อมูลการมอบอำนาจ");
    }

    if (existingProxy.status !== "ACTIVE") {
      throw createError(400, "สามารถยกเลิกได้เฉพาะการมอบอำนาจที่ยังใช้งานอยู่เท่านั้น");
    }

    try {
      const cancelledProxy = await prisma.proxyApproval.update({
        where: { id: parseInt(id) },
        data: {
          status: "CANCELLED",
          updatedAt: new Date(),
        },
        include: {
          originalApprover: {
            select: {
              id: true,
              prefixName: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          proxyApprover: {
            select: {
              id: true,
              prefixName: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

      // บันทึก log การทำงาน
      await AuditLogService.createLog(
        cancelledBy,
        "DELETE",
        "ProxyApproval",
        parseInt(id),
        `ยกเลิกการมอบอำนาจ ID: ${id}`,
        req.ip,
        req.get("User-Agent")
      );

      return cancelledProxy;
    } catch (error) {
      // ถ้า error เป็น validation error ให้ throw ต่อไป
      if (error.statusCode) {
        throw error;
      }
      // ถ้าเป็น database error ให้ throw generic error
      throw createError(500, "ยกเลิกการมอบอำนาจไม่สำเร็จ");
    }
  }

  // ────────────────────────────────
  // 🔧 UTIL
  // ────────────────────────────────

  // ตรวจสอบและอัปเดตสถานะการมอบอำนาจที่หมดอายุ
  static async expireProxyApprovals() {
    const now = new Date();

    try {
      // อัปเดตสถานะการมอบอำนาจแบบช่วงเวลาที่หมดอายุ
      const expiredProxies = await prisma.proxyApproval.updateMany({
        where: {
          status: "ACTIVE",
          isDaily: false,
          endDate: { lt: now },
        },
        data: {
          status: "EXPIRED",
          updatedAt: now,
        },
      });

      // อัปเดตสถานะการมอบอำนาจรายวันที่ผ่านมาแล้ว
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const expiredDailyProxies = await prisma.proxyApproval.updateMany({
        where: {
          status: "ACTIVE",
          isDaily: true,
          dailyDate: { lt: today },
        },
        data: {
          status: "EXPIRED",
          updatedAt: now,
        },
      });

      return {
        periodProxies: expiredProxies,
        dailyProxies: expiredDailyProxies,
        totalExpired: expiredProxies.count + expiredDailyProxies.count,
      };
    } catch (error) {
      throw createError(500, "อัปเดตสถานะการมอบอำนาจที่หมดอายุไม่สำเร็จ");
    }
  }

  // สร้างการมอบอำนาจรายวัน (function พิเศษสำหรับ admin)
  static async createDailyProxyApproval({
    originalApproverId,
    proxyApproverId,
    approverLevel,
    dailyDate,
    reason,
  }) {
    return await this.createProxyApproval({
      originalApproverId,
      proxyApproverId,
      approverLevel,
      startDate: dailyDate, // จะถูก override ในฟังก์ชันหลัก
      endDate: dailyDate,   // จะถูก override ในฟังก์ชันหลัก
      reason,
      isDaily: true,
      dailyDate,
    });
  }

  // ดึงข้อมูลการมอบอำนาจรายวันสำหรับวันที่กำหนด
  static async getDailyProxyApprovalsByDate(date) {
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);

    return await prisma.proxyApproval.findMany({
      where: {
        isDaily: true,
        dailyDate: checkDate,
        status: "ACTIVE",
      },
      include: {
        originalApprover: {
          select: {
            id: true,
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        proxyApprover: {
          select: {
            id: true,
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // ดึงข้อมูลการมอบอำนาจรายวันทั้งหมดของผู้ใช้
  static async getMyDailyProxyApprovals(userId) {
    return await prisma.proxyApproval.findMany({
      where: {
        OR: [
          { originalApproverId: parseInt(userId) },
          { proxyApproverId: parseInt(userId) },
        ],
        isDaily: true,
      },
      include: {
        originalApprover: {
          select: {
            id: true,
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        proxyApprover: {
          select: {
            id: true,
            prefixName: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { dailyDate: "desc" },
    });
  }

  // ลบข้อมูลการมอบอำนาจรายวันที่หมดอายุ (cleanup function)
  static async cleanupExpiredDailyProxies(daysToKeep = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    cutoffDate.setHours(0, 0, 0, 0);

    try {
      const deletedCount = await prisma.proxyApproval.deleteMany({
        where: {
          isDaily: true,
          status: "EXPIRED",
          dailyDate: { lt: cutoffDate },
        },
      });

      return deletedCount;
    } catch (error) {
      throw createError(500, "ลบข้อมูลการมอบอำนาจรายวันที่หมดอายุไม่สำเร็จ");
    }
  }

  // ตรวจสอบว่าผู้ใช้มีสิทธิ์อนุมัติในระดับที่กำหนดหรือไม่ (รวมถึงการอนุมัติแทน)
  static async canUserApprove(userId, approverLevel, date = new Date()) {
    // ใช้วิธีเดียวกับ controller - ตรวจสอบจาก UserService.getApproversForLevel
    const UserService = require("./user-service");
    const approvers = await UserService.getApproversForLevel(approverLevel, date);
    const approverIds = approvers.map(a => a.id);

    if (!approverIds.includes(userId)) {
      return {
        canApprove: false,
        isProxy: false,
        proxyApproval: null,
        originalApproverId: null,
        isDaily: false,
        proxyType: null,
      };
    }

    // หาว่าเป็น proxy หรือไม่
    const user = approvers.find(a => a.id === userId);
    const isProxy = user && user.isProxy;

    if (isProxy) {
      return {
        canApprove: true,
        isProxy: true,
        proxyApproval: user.proxyInfo,
        originalApproverId: user.proxyInfo ? user.proxyInfo.originalApprover.id : null,
        isDaily: user.proxyInfo ? user.proxyInfo.isDaily : false,
        proxyType: user.proxyInfo ? (user.proxyInfo.isDaily ? 'daily' : 'period') : null,
      };
    }

    return {
      canApprove: true,
      isProxy: false,
      proxyApproval: null,
      originalApproverId: null,
      isDaily: false,
      proxyType: null,
    };
  }

  // ดึงข้อมูลผู้อนุมัติที่เป็นไปได้สำหรับระดับที่กำหนด
  static async getPotentialApprovers(approverLevel, currentUserId = null) {
    let potentialApprovers = [];

    const roleMapping = {
      1: 'APPROVER_1',
      2: 'VERIFIER',
      3: 'APPROVER_2',
      4: 'APPROVER_3',
      5: 'APPROVER_4'
    };

    const requiredRole = roleMapping[approverLevel];
    if (!requiredRole) {
      return [];
    }

    potentialApprovers = await prisma.user.findMany({
      where: {
        userRoles: {
          some: {
            role: { name: requiredRole },
          },
        },
        ...(currentUserId && { id: { not: parseInt(currentUserId) } }),
      },
      select: {
        id: true,
        prefixName: true,
        firstName: true,
        lastName: true,
        email: true,
        department: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return potentialApprovers.map(user => ({
      id: user.id,
      prefixName: user.prefixName,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      department: user.department,
    }));
  }
}

module.exports = ProxyApprovalService;
