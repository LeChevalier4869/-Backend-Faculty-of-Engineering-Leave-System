module.exports = {
    user: {
      findMany: jest.fn(),
    },
    leaveRequest: {
      create: jest.fn(),
    },
    holiday: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  