-- CreateTable
CREATE TABLE `Users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `prefixName` VARCHAR(191) NOT NULL,
    `firstName` VARCHAR(191) NOT NULL,
    `lastName` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `role` ENUM('USER', 'APPROVER', 'ADMIN') NOT NULL,
    `position` VARCHAR(191) NOT NULL,
    `faculty` ENUM('INDUSTRIAL_EDUCATION', 'ENGINEERING', 'BUSINESS_ADMINISTRATION') NOT NULL,
    `profilePicturePath` VARCHAR(191) NULL,
    `hireYear` INTEGER NOT NULL,
    `levelId` INTEGER NOT NULL,
    `personnelTypeId` INTEGER NOT NULL,
    `departmentId` INTEGER NOT NULL,

    UNIQUE INDEX `Users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Levels` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `level` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Departments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PersonnelTypes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeaveTypes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `maxDays` INTEGER NOT NULL,
    `conditions` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `LeaveTypes_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeaveRequests` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,
    `reason` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `isEmergency` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `userId` INTEGER NOT NULL,
    `leaveTypeId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LeaveBalances` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `year` INTEGER NOT NULL,
    `totalDays` INTEGER NOT NULL,
    `usedDays` INTEGER NOT NULL DEFAULT 0,
    `userId` INTEGER NOT NULL,
    `leaveTypeId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notifications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `message` VARCHAR(191) NOT NULL,
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `userId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApprovalSteps` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `stepOrder` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `reviewedAt` DATETIME(3) NULL,
    `remarks` VARCHAR(191) NULL,
    `approverId` INTEGER NOT NULL,
    `reviewedBy` INTEGER NULL,
    `leaveRequestId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Attachments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fileName` VARCHAR(191) NOT NULL,
    `filePath` VARCHAR(191) NOT NULL,
    `uploadedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `leaveRequestId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLogs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `action` VARCHAR(191) NOT NULL,
    `details` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `userId` INTEGER NOT NULL,
    `leaveRequestId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Holidays` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `description` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Users` ADD CONSTRAINT `Users_levelId_fkey` FOREIGN KEY (`levelId`) REFERENCES `Levels`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Users` ADD CONSTRAINT `Users_personnelTypeId_fkey` FOREIGN KEY (`personnelTypeId`) REFERENCES `PersonnelTypes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Users` ADD CONSTRAINT `Users_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveRequests` ADD CONSTRAINT `LeaveRequests_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `Users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveRequests` ADD CONSTRAINT `LeaveRequests_leaveTypeId_fkey` FOREIGN KEY (`leaveTypeId`) REFERENCES `LeaveTypes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveBalances` ADD CONSTRAINT `LeaveBalances_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `Users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LeaveBalances` ADD CONSTRAINT `LeaveBalances_leaveTypeId_fkey` FOREIGN KEY (`leaveTypeId`) REFERENCES `LeaveTypes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notifications` ADD CONSTRAINT `Notifications_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `Users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApprovalSteps` ADD CONSTRAINT `ApprovalSteps_approverId_fkey` FOREIGN KEY (`approverId`) REFERENCES `Users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApprovalSteps` ADD CONSTRAINT `ApprovalSteps_reviewedBy_fkey` FOREIGN KEY (`reviewedBy`) REFERENCES `Users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ApprovalSteps` ADD CONSTRAINT `ApprovalSteps_leaveRequestId_fkey` FOREIGN KEY (`leaveRequestId`) REFERENCES `LeaveRequests`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Attachments` ADD CONSTRAINT `Attachments_leaveRequestId_fkey` FOREIGN KEY (`leaveRequestId`) REFERENCES `LeaveRequests`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLogs` ADD CONSTRAINT `AuditLogs_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `Users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLogs` ADD CONSTRAINT `AuditLogs_leaveRequestId_fkey` FOREIGN KEY (`leaveRequestId`) REFERENCES `LeaveRequests`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
