-- เพิ่ม Rank สำหรับประเภทการลาอื่นๆ (non-core leave types)
-- ปรับ personnelTypeId และจำนวนวันตามความเหมาะสมขององค์กร

-- 1. ลาอุปสมบทหรือลาไปประกอบพิธีฮัจย์ (leaveTypeId=5)
-- โดยทั่วไปมักให้ 15 วันต่อปี
INSERT INTO Rank (rank, minHireMonths, maxHireMonths, receiveDays, maxDays, isBalance, personnelTypeId, leaveTypeId) VALUES
('ข้าราชการพลเรือนในสถาบันอุดมศึกษา', 0, 11, 15, 15, true, 1, 5),
('ลูกจ้างประจำ', 12, 23, 15, 15, true, 1, 5),
('พนักงานราชการ', 24, 35, 15, 15, true, 1, 5),
('พนักงานในสถาบันอุดมศึกษา', 36, 47, 15, 15, true, 1, 5),
('ลูกจ้างเงินรายได้', 48, 999, 15, 15, true, 1, 5);

-- 2. ลาเข้ารับการตรวจเลือกเข้ารับการเตรียมพล (leaveTypeId=6)
-- โดยทั่วไปมักให้ 60 วัน (2 เดือน)
INSERT INTO Rank (rank, minHireMonths, maxHireMonths, receiveDays, maxDays, isBalance, personnelTypeId, leaveTypeId) VALUES
('ข้าราชการพลเรือนในสถาบันอุดมศึกษา', 0, 11, 60, 60, true, 1, 6),
('ลูกจ้างประจำ', 12, 23, 60, 60, true, 1, 6),
('พนักงานราชการ', 24, 35, 60, 60, true, 1, 6),
('พนักงานในสถาบันอุดมศึกษา', 36, 47, 60, 60, true, 1, 6),
('ลูกจ้างเงินรายได้', 48, 999, 60, 60, true, 1, 6);

-- 3. ลาไปศึกษา ฝึกอบรม ปฏิบัติการวิจัย หรือดูงาน (leaveTypeId=7)
-- โดยทั่วไปมักให้ 30 วันต่อปี
INSERT INTO Rank (rank, minHireMonths, maxHireMonths, receiveDays, maxDays, isBalance, personnelTypeId, leaveTypeId) VALUES
('ข้าราชการพลเรือนในสถาบันอุดมศึกษา', 0, 11, 30, 30, true, 1, 7),
('ลูกจ้างประจำ', 12, 23, 30, 30, true, 1, 7),
('พนักงานราชการ', 24, 35, 30, 30, true, 1, 7),
('พนักงานในสถาบันอุดมศึกษา', 36, 47, 30, 30, true, 1, 7),
('ลูกจ้างเงินรายได้', 48, 999, 30, 30, true, 1, 7);

-- 4. ลาไปช่วยเหลือภริยาที่คลอดบุตร (leaveTypeId=8)
-- โดยทั่วไปมักให้ 2 วัน
INSERT INTO Rank (rank, minHireMonths, maxHireMonths, receiveDays, maxDays, isBalance, personnelTypeId, leaveTypeId) VALUES
('ข้าราชการพลเรือนในสถาบันอุดมศึกษา', 0, 11, 2, 2, true, 1, 8),
('ลูกจ้างประจำ', 12, 23, 2, 2, true, 1, 8),
('พนักงานราชการ', 24, 35, 2, 2, true, 1, 8),
('พนักงานในสถาบันอุดมศึกษา', 36, 47, 2, 2, true, 1, 8),
('ลูกจ้างเงินรายได้', 48, 999, 2, 2, true, 1, 8);

-- 5. ลาไปฟื้นฟูสมรรถภาพด้านอาชีพ (leaveTypeId=9)
-- โดยทั่วไปมักให้ 30 วันต่อปี
INSERT INTO Rank (rank, minHireMonths, maxHireMonths, receiveDays, maxDays, isBalance, personnelTypeId, leaveTypeId) VALUES
('ข้าราชการพลเรือนในสถาบันอุดมศึกษา', 0, 11, 30, 30, true, 1, 9),
('ลูกจ้างประจำ', 12, 23, 30, 30, true, 1, 9),
('พนักงานราชการ', 24, 35, 30, 30, true, 1, 9),
('พนักงานในสถาบันอุดมศึกษา', 36, 47, 30, 30, true, 1, 9),
('ลูกจ้างเงินรายได้', 48, 999, 30, 30, true, 1, 9);

-- 6. ลาไปถือศีล ปฏิบัติธรรม (สตรี) (leaveTypeId=10)
-- โดยทั่วไปมักให้ 30 วันต่อปี
INSERT INTO Rank (rank, minHireMonths, maxHireMonths, receiveDays, maxDays, isBalance, personnelTypeId, leaveTypeId) VALUES
('ข้าราชการพลเรือนในสถาบันอุดมศึกษา', 0, 11, 30, 30, true, 1, 10),
('ลูกจ้างประจำ', 12, 23, 30, 30, true, 1, 10),
('พนักงานราชการ', 24, 35, 30, 30, true, 1, 10),
('พนักงานในสถาบันอุดมศึกษา', 36, 47, 30, 30, true, 1, 10),
('ลูกจ้างเงินรายได้', 48, 999, 30, 30, true, 1, 10);

-- 7. ลาไปปฏิบัติงานในองค์การระหว่างประเทศ (leaveTypeId=11)
-- โดยทั่วไปมักให้ 30 วันต่อปี
INSERT INTO Rank (rank, minHireMonths, maxHireMonths, receiveDays, maxDays, isBalance, personnelTypeId, leaveTypeId) VALUES
('ข้าราชการพลเรือนในสถาบันอุดมศึกษา', 0, 11, 30, 30, true, 1, 11),
('ลูกจ้างประจำ', 12, 23, 30, 30, true, 1, 11),
('พนักงานราชการ', 24, 35, 30, 30, true, 1, 11),
('พนักงานในสถาบันอุดมศึกษา', 36, 47, 30, 30, true, 1, 11),
('ลูกจ้างเงินรายได้', 48, 999, 30, 30, true, 1, 11);

-- 8. ลาติดตามคู่สมรส (leaveTypeId=12)
-- โดยทั่วไปมักให้ 3 วัน
INSERT INTO Rank (rank, minHireMonths, maxHireMonths, receiveDays, maxDays, isBalance, personnelTypeId, leaveTypeId) VALUES
('ข้าราชการพลเรือนในสถาบันอุดมศึกษา', 0, 11, 3, 3, true, 1, 12),
('ลูกจ้างประจำ', 12, 23, 3, 3, true, 1, 12),
('พนักงานราชการ', 24, 35, 3, 3, true, 1, 12),
('พนักงานในสถาบันอุดมศึกษา', 36, 47, 3, 3, true, 1, 12),
('ลูกจ้างเงินรายได้', 48, 999, 3, 3, true, 1, 12);

-- หมายเหตุ:
-- - personnelTypeId=1 คือประเภทพนักงานทั่วไป ถ้ามีหลายประเภทให้คัดลอกและปรับ personnelTypeId
-- - สามารถปรับจำนวนวัน (receiveDays, maxDays) ตามนโยบายองค์กร
-- - ถ้าไม่ต้องการจำกัดช่วงเวลาทำงาน ให้ตั้ง minHireMonths=0, maxHireMonths=NULL
