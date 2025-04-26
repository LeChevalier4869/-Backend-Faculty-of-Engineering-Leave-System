/*
  Warnings:

  - You are about to drop the `ApproveStep` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Approver` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AuditLog` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Department` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `File` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Holiday` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `LeaveBalance` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `LeaveRequest` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `LeaveRequestDetail` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `LeaveType` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Notification` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Organization` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PersonnelType` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Rank` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Role` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Setting` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Signature` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UserRank` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `UserRole` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `ApproveStep` DROP FOREIGN KEY `ApproveStep_organizationId_fkey`;

-- DropForeignKey
ALTER TABLE `ApproveStep` DROP FOREIGN KEY `ApproveStep_userId_fkey`;

-- DropForeignKey
ALTER TABLE `AuditLog` DROP FOREIGN KEY `AuditLog_leaveRequestId_fkey`;

-- DropForeignKey
ALTER TABLE `AuditLog` DROP FOREIGN KEY `AuditLog_userId_fkey`;

-- DropForeignKey
ALTER TABLE `Department` DROP FOREIGN KEY `Department_headId_fkey`;

-- DropForeignKey
ALTER TABLE `Department` DROP FOREIGN KEY `Department_organizationId_fkey`;

-- DropForeignKey
ALTER TABLE `File` DROP FOREIGN KEY `File_leaveRequestId_fkey`;

-- DropForeignKey
ALTER TABLE `LeaveBalance` DROP FOREIGN KEY `LeaveBalance_leaveTypeId_fkey`;

-- DropForeignKey
ALTER TABLE `LeaveBalance` DROP FOREIGN KEY `LeaveBalance_userId_fkey`;

-- DropForeignKey
ALTER TABLE `LeaveRequest` DROP FOREIGN KEY `LeaveRequest_leaveTypeId_fkey`;

-- DropForeignKey
ALTER TABLE `LeaveRequest` DROP FOREIGN KEY `LeaveRequest_userId_fkey`;

-- DropForeignKey
ALTER TABLE `LeaveRequestDetail` DROP FOREIGN KEY `LeaveRequestDetail_approverId_fkey`;

-- DropForeignKey
ALTER TABLE `LeaveRequestDetail` DROP FOREIGN KEY `LeaveRequestDetail_leaveRequestId_fkey`;

-- DropForeignKey
ALTER TABLE `Notification` DROP FOREIGN KEY `Notification_userId_fkey`;

-- DropForeignKey
ALTER TABLE `Rank` DROP FOREIGN KEY `Rank_leaveTypeId_fkey`;

-- DropForeignKey
ALTER TABLE `Rank` DROP FOREIGN KEY `Rank_personnelTypeId_fkey`;

-- DropForeignKey
ALTER TABLE `Signature` DROP FOREIGN KEY `Signature_userId_fkey`;

-- DropForeignKey
ALTER TABLE `User` DROP FOREIGN KEY `User_departmentId_fkey`;

-- DropForeignKey
ALTER TABLE `User` DROP FOREIGN KEY `User_personnelTypeId_fkey`;

-- DropForeignKey
ALTER TABLE `UserRank` DROP FOREIGN KEY `UserRank_rankId_fkey`;

-- DropForeignKey
ALTER TABLE `UserRank` DROP FOREIGN KEY `UserRank_userId_fkey`;

-- DropForeignKey
ALTER TABLE `UserRole` DROP FOREIGN KEY `UserRole_roleId_fkey`;

-- DropForeignKey
ALTER TABLE `UserRole` DROP FOREIGN KEY `UserRole_userId_fkey`;

-- DropTable
DROP TABLE `ApproveStep`;

-- DropTable
DROP TABLE `Approver`;

-- DropTable
DROP TABLE `AuditLog`;

-- DropTable
DROP TABLE `Department`;

-- DropTable
DROP TABLE `File`;

-- DropTable
DROP TABLE `Holiday`;

-- DropTable
DROP TABLE `LeaveBalance`;

-- DropTable
DROP TABLE `LeaveRequest`;

-- DropTable
DROP TABLE `LeaveRequestDetail`;

-- DropTable
DROP TABLE `LeaveType`;

-- DropTable
DROP TABLE `Notification`;

-- DropTable
DROP TABLE `Organization`;

-- DropTable
DROP TABLE `PersonnelType`;

-- DropTable
DROP TABLE `Rank`;

-- DropTable
DROP TABLE `Role`;

-- DropTable
DROP TABLE `Setting`;

-- DropTable
DROP TABLE `Signature`;

-- DropTable
DROP TABLE `User`;

-- DropTable
DROP TABLE `UserRank`;

-- DropTable
DROP TABLE `UserRole`;

-- CreateTable
CREATE TABLE `user` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `departmentId` INTEGER NOT NULL,
    `personnelTypeId` INTEGER NOT NULL,
    `prefixName` VARCHAR(191) NULL,
    `firstName` VARCHAR(191) NOT NULL,
    `lastName` VARCHAR(191) NOT NULL,
    `sex` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `position` VARCHAR(191) NULL,
    `hireDate` DATETIME(3) NOT NULL,
    `inActive` BOOLEAN NOT NULL DEFAULT false,
    `employmentType` VARCHAR(191) NULL,
    `profilePicturePath` VARCHAR(191) NULL,

    UNIQUE INDEX `user_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `personnel_type` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `department` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `headId` INTEGER NULL,
    `organizationId` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `appointDate` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `organization` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_log` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `leaveRequestId` INTEGER NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `details` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `message` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `role` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_role` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `roleId` INTEGER NOT NULL,

    UNIQUE INDEX `user_role_userId_roleId_key`(`userId`, `roleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `signature` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `file` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `approve_step` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `approveId` INTEGER NULL,
    `userId` INTEGER NOT NULL,
    `organizationId` INTEGER NOT NULL,
    `level` INTEGER NOT NULL,
    `appointDate` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `approver` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rank` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `rank` VARCHAR(191) NOT NULL,
    `minHireMonths` INTEGER NULL,
    `maxHireMonths` INTEGER NULL,
    `receiveDays` INTEGER NULL,
    `maxDays` INTEGER NULL,
    `isBalance` BOOLEAN NULL,
    `personnelTypeId` INTEGER NOT NULL,
    `leaveTypeId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_rank` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `rankId` INTEGER NOT NULL,

    UNIQUE INDEX `user_rank_userId_rankId_key`(`userId`, `rankId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `leave_balance` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `leaveTypeId` INTEGER NOT NULL,
    `maxDays` INTEGER NOT NULL,
    `usedDays` INTEGER NOT NULL,
    `pendingDays` INTEGER NOT NULL,
    `remainingDays` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `leave_type` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `isAvailable` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `leave_request` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `leaveTypeId` INTEGER NOT NULL,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,
    `leavedDays` INTEGER NOT NULL,
    `thisTimeDays` INTEGER NOT NULL,
    `totalDays` INTEGER NOT NULL,
    `balanceDays` INTEGER NOT NULL,
    `reason` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `documentNumber` VARCHAR(191) NULL,
    `documentIssuedDate` DATETIME(3) NULL,
    `verifierId` INTEGER NULL,
    `receiverId` INTEGER NULL,
    `contact` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `file` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `leaveRequestId` INTEGER NOT NULL,
    `type` ENUM('EVIDENT', 'REPORT', 'PAPER') NOT NULL,
    `filePath` VARCHAR(191) NOT NULL,
    `uploadedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `leave_request_detail` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `approverId` INTEGER NOT NULL,
    `leaveRequestId` INTEGER NOT NULL,
    `stepOrder` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `reviewedAt` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    `remarks` VARCHAR(191) NULL,
    `comment` VARCHAR(191) NULL,

    INDEX `leave_request_detail_approverId_idx`(`approverId`),
    INDEX `leave_request_detail_leaveRequestId_idx`(`leaveRequestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `holiday` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `date` DATETIME(3) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `fiscalYear` INTEGER NOT NULL,
    `isRecurring` BOOLEAN NOT NULL DEFAULT false,
    `holidayType` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `setting` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `value` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user` ADD CONSTRAINT `user_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `department`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user` ADD CONSTRAINT `user_personnelTypeId_fkey` FOREIGN KEY (`personnelTypeId`) REFERENCES `personnel_type`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `department` ADD CONSTRAINT `department_headId_fkey` FOREIGN KEY (`headId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `department` ADD CONSTRAINT `department_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_log` ADD CONSTRAINT `audit_log_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_log` ADD CONSTRAINT `audit_log_leaveRequestId_fkey` FOREIGN KEY (`leaveRequestId`) REFERENCES `leave_request`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification` ADD CONSTRAINT `notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_role` ADD CONSTRAINT `user_role_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_role` ADD CONSTRAINT `user_role_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `signature` ADD CONSTRAINT `signature_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `approve_step` ADD CONSTRAINT `approve_step_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `approve_step` ADD CONSTRAINT `approve_step_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rank` ADD CONSTRAINT `rank_personnelTypeId_fkey` FOREIGN KEY (`personnelTypeId`) REFERENCES `personnel_type`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rank` ADD CONSTRAINT `rank_leaveTypeId_fkey` FOREIGN KEY (`leaveTypeId`) REFERENCES `leave_type`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_rank` ADD CONSTRAINT `user_rank_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_rank` ADD CONSTRAINT `user_rank_rankId_fkey` FOREIGN KEY (`rankId`) REFERENCES `rank`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leave_balance` ADD CONSTRAINT `leave_balance_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leave_balance` ADD CONSTRAINT `leave_balance_leaveTypeId_fkey` FOREIGN KEY (`leaveTypeId`) REFERENCES `leave_type`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leave_request` ADD CONSTRAINT `leave_request_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leave_request` ADD CONSTRAINT `leave_request_leaveTypeId_fkey` FOREIGN KEY (`leaveTypeId`) REFERENCES `leave_type`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `file` ADD CONSTRAINT `file_leaveRequestId_fkey` FOREIGN KEY (`leaveRequestId`) REFERENCES `leave_request`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leave_request_detail` ADD CONSTRAINT `leave_request_detail_approverId_fkey` FOREIGN KEY (`approverId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leave_request_detail` ADD CONSTRAINT `leave_request_detail_leaveRequestId_fkey` FOREIGN KEY (`leaveRequestId`) REFERENCES `leave_request`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
