const prisma = require('../config/prisma');

async function isHoliday(date) {
  
  if (date.getDay() === 0 || date.getDay() === 6) {
    return true; 
  }

  
  const holiday = await prisma.holidays.findFirst({
    where: {
      date: date,
    },
  });

  return !!holiday; // boolean
}


async function calculateWorkingDays(startDate, endDate) {
  let workingDays = 0;
  let currentDate = new Date(startDate);

  while (currentDate <= endDate) {
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