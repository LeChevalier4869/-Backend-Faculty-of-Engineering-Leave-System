/*
  Warnings:

  - You are about to drop the `approve_step` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `name` to the `file` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `approve_step` DROP FOREIGN KEY `approve_step_organizationId_fkey`;

-- DropForeignKey
ALTER TABLE `approve_step` DROP FOREIGN KEY `approve_step_userId_fkey`;

-- AlterTable
ALTER TABLE `file` ADD COLUMN `name` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `leave_request` MODIFY `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE `leave_request_detail` ADD COLUMN `proxyApprovalId` INTEGER NULL,
    MODIFY `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE `leave_type` ADD COLUMN `isNonDeductible` BOOLEAN NOT NULL DEFAULT false;

-- DropTable
DROP TABLE `approve_step`;

-- CreateTable
CREATE TABLE `approver_position` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `organizationId` INTEGER NOT NULL,
    `level` INTEGER NOT NULL,
    `appointDate` DATETIME(3) NULL,
    `endDate` DATETIME(3) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    INDEX `approver_position_organizationId_fkey`(`organizationId`),
    INDEX `approver_position_userId_fkey`(`userId`),
    INDEX `approver_position_level_idx`(`level`),
    INDEX `approver_position_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `proxy_approval` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `originalApproverId` INTEGER NOT NULL,
    `proxyApproverId` INTEGER NOT NULL,
    `approverLevel` INTEGER NOT NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,
    `reason` VARCHAR(191) NULL,
    `status` ENUM('ACTIVE', 'EXPIRED', 'CANCELLED') NOT NULL DEFAULT 'ACTIVE',
    `isDaily` BOOLEAN NOT NULL DEFAULT false,
    `dailyDate` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `proxy_approval_originalApproverId_idx`(`originalApproverId`),
    INDEX `proxy_approval_proxyApproverId_idx`(`proxyApproverId`),
    INDEX `proxy_approval_approverLevel_idx`(`approverLevel`),
    INDEX `proxy_approval_status_idx`(`status`),
    INDEX `proxy_approval_dailyDate_idx`(`dailyDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `leave_request_detail_proxyApprovalId_idx` ON `leave_request_detail`(`proxyApprovalId`);

-- AddForeignKey
ALTER TABLE `approver_position` ADD CONSTRAINT `approver_position_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `approver_position` ADD CONSTRAINT `approver_position_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leave_request_detail` ADD CONSTRAINT `leave_request_detail_proxyApprovalId_fkey` FOREIGN KEY (`proxyApprovalId`) REFERENCES `proxy_approval`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `proxy_approval` ADD CONSTRAINT `proxy_approval_originalApproverId_fkey` FOREIGN KEY (`originalApproverId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `proxy_approval` ADD CONSTRAINT `proxy_approval_proxyApproverId_fkey` FOREIGN KEY (`proxyApproverId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER TABLE `audit_log` RENAME INDEX `audit_log_leaveRequestId_fkey` TO `audit_log_leaveRequestId_idx`;

-- RenameIndex
ALTER TABLE `audit_log` RENAME INDEX `audit_log_userId_fkey` TO `audit_log_userId_idx`;
