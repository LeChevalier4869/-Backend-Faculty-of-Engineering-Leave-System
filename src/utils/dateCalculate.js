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
  const start = new Date(startDate);
  const end   = new Date(endDate);

  // ดึงวันหยุดในช่วงเดียวครั้งเดียว
  const holidays = await prisma.holiday.findMany({
    where: { date: { gte: start, lte: end } },
    select: { date: true },
  });

  // ทำเป็น Set ของ YYYY-MM-DD เพื่อเทียบเร็ว
  const holidaySet = new Set(
    holidays.map((h) => h.date.toISOString().slice(0, 10))
  );

  let workingDays = 0;
  let cur = new Date(start);

  while (cur <= end) {
    const isWeekend = cur.getDay() === 0 || cur.getDay() === 6;
    const isHol     = holidaySet.has(cur.toISOString().slice(0, 10));

    if (!isWeekend && !isHol) workingDays++;

    cur.setDate(cur.getDate() + 1);
  }

  return workingDays;      
}

module.exports = {
  isHoliday,
  calculateWorkingDays,
};
