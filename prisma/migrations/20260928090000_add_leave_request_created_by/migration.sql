-- AlterTable
ALTER TABLE `leave_request` ADD COLUMN `createdById` INTEGER NULL;

-- CreateIndex
CREATE INDEX `leave_request_createdById_fkey` ON `leave_request`(`createdById`);

-- AddForeignKey
ALTER TABLE `leave_request` ADD CONSTRAINT `leave_request_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: ใบลาที่แอดมินบันทึกแทนผู้ใช้ก่อนมีคอลัมน์นี้ (อ้างอิงจาก audit log ของ createRequestByAdmin)
UPDATE `leave_request` lr
JOIN (
  SELECT `entityId`, MIN(`userId`) AS `adminId`
  FROM `audit_log`
  WHERE `entityType` = 'LeaveRequest'
    AND `action` = 'CREATE'
    AND `details` LIKE 'Admin สร้างคำขอลาแทนผู้ใช้%'
    AND `entityId` IS NOT NULL
  GROUP BY `entityId`
) a ON a.`entityId` = lr.`id`
JOIN `user` u ON u.`id` = a.`adminId`
SET lr.`createdById` = a.`adminId`
WHERE lr.`createdById` IS NULL;
