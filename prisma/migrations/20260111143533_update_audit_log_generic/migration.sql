-- Drop existing foreign key constraint
ALTER TABLE `audit_log` DROP FOREIGN KEY `audit_log_leaveRequestId_fkey`;

-- AlterTable
ALTER TABLE `audit_log` 
    ADD COLUMN `entityType` VARCHAR(191) NULL,
    ADD COLUMN `entityId` INT NULL,
    ADD COLUMN `ipAddress` VARCHAR(191) NULL,
    ADD COLUMN `userAgent` VARCHAR(191) NULL,
    MODIFY COLUMN `leaveRequestId` INT NULL;

-- CreateIndex
CREATE INDEX `audit_log_action_idx` ON `audit_log`(`action`);

-- CreateIndex
CREATE INDEX `audit_log_createdAt_idx` ON `audit_log`(`createdAt`);

-- CreateIndex
CREATE INDEX `audit_log_entityType_entityId_idx` ON `audit_log`(`entityType`, `entityId`);

-- AddForeignKey
ALTER TABLE `audit_log` ADD CONSTRAINT `audit_log_leaveRequestId_fkey` FOREIGN KEY (`leaveRequestId`) REFERENCES `leave_request`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
