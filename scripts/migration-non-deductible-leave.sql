-- Migration script for non-deductible leave types
-- สำหรับประเภทการลาที่ไม่ต้องหักวัน (receiveDays = 0 && isBalance = 1)
-- leaveTypeId: 5, 6, 10, 11, 13

-- 1. อัปเดต Rank table ให้มี receiveDays = 0 และ isBalance = 1 สำหรับประเภทที่ไม่ต้องหักวัน
UPDATE Rank 
SET 
    receiveDays = 0,
    isBalance = 1 
WHERE leaveTypeId IN (5, 6, 10, 11, 13);

-- 2. อัปเดต LeaveBalance ที่มีอยู่แล้วให้มีค่าเป็น 0
UPDATE LeaveBalance 
SET 
    maxDays = 0,
    usedDays = 0,
    pendingDays = 0,
    remainingDays = 0
WHERE leaveTypeId IN (5, 6, 10, 11, 13);

-- 3. สร้าง LeaveBalance ใหม่สำหรับผู้ใช้ที่ยังไม่มี (ถ้าต้องการ)
-- สำหรับผู้ใช้ที่มี Rank แต่ยังไม่มี LeaveBalance
INSERT INTO LeaveBalance (userId, leaveTypeId, maxDays, usedDays, pendingDays, remainingDays, year)
SELECT DISTINCT 
    ur.userId, 
    r.leaveTypeId, 
    0, -- maxDays
    0, -- usedDays  
    0, -- pendingDays
    0, -- remainingDays
    (SELECT value FROM Setting WHERE key = 'fiscalYear')::INTEGER as year
FROM UserRank ur
JOIN Rank r ON ur.rankId = r.id
WHERE r.leaveTypeId IN (5, 6, 10, 11, 13)
AND NOT EXISTS (
    SELECT 1 FROM LeaveBalance lb 
    WHERE lb.userId = ur.userId 
    AND lb.leaveTypeId = r.leaveTypeId 
    AND lb.year = (SELECT value FROM Setting WHERE key = 'fiscalYear')::INTEGER
);

-- 4. ตรวจสอบผลลัพธ์
SELECT 
    lt.id as leaveTypeId,
    lt.name as leaveTypeName,
    r.receiveDays,
    r.isBalance,
    COUNT(ur.id) as userRankCount,
    COUNT(lb.id) as leaveBalanceCount
FROM LeaveType lt
LEFT JOIN Rank r ON lt.id = r.leaveTypeId
LEFT JOIN UserRank ur ON r.id = ur.rankId
LEFT JOIN LeaveBalance lb ON ur.userId = lb.userId AND lt.id = lb.leaveTypeId AND lb.year = (SELECT value FROM Setting WHERE key = 'fiscalYear')::INTEGER
WHERE lt.id IN (5, 6, 10, 11, 13)
GROUP BY lt.id, lt.name, r.receiveDays, r.isBalance
ORDER BY lt.id;
