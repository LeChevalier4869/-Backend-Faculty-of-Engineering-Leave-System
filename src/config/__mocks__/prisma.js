const prisma = {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    leaveType: {
      findUnique: jest.fn(),
    },
    leaveBalance: {
      findFirst: jest.fn(),
    },
    leaveRequest: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    leaveRequestDetail: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    file: {
      createMany: jest.fn(),
    },
    holiday: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    setting: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

module.exports = prisma;