const prisma = require('../config/prisma'); 

async function isHoliday(date) {
  if (date.getDay() === 0 || date.getDay() === 6) {
    return true; // เสาร์-อาทิตย์
  }

  
  const holiday = await prisma.holiday.findFirst({
    where: {
      date: new Date(date),
    },
  });

  return !!holiday;
}

async function calculateWorkingDays(startDate, endDate) {
  let workingDays = 0;
  let currentDate = new Date(startDate);
  const finalDate = new Date(endDate);

  while (currentDate <= finalDate) {
    if (!(await isHoliday(currentDate))) {
      workingDays++;
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return workingDays;
}

module.exports = {
  isHoliday,
  calculateWorkingDays,
};
