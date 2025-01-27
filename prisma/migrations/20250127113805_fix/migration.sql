/*
  Warnings:

  - You are about to alter the column `conditions` on the `leavetypes` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Json`.
  - You are about to drop the column `faculty` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `hireYear` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `users` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[username]` on the table `Users` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `type` to the `AuditLogs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `Notifications` table without a default value. This is not possible if the table is not empty.
  - Added the required column `hireDate` to the `Users` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organizationId` to the `Users` table without a default value. This is not possible if the table is not empty.
  - Added the required column `phone` to the `Users` table without a default value. This is not possible if the table is not empty.
  - Added the required column `username` to the `Users` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `auditlogs` ADD COLUMN `type` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `holidays` ADD COLUMN `recurring` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `leavebalances` ADD COLUMN `remainingDays` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `leaverequests` ADD COLUMN `comment` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `leavetypes` MODIFY `conditions` JSON NOT NULL;

-- AlterTable
ALTER TABLE `notifications` ADD COLUMN `type` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `users` DROP COLUMN `faculty`,
    DROP COLUMN `hireYear`,
    DROP COLUMN `role`,
    ADD COLUMN `hireDate` DATETIME(3) NOT NULL,
    ADD COLUMN `inActive` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `organizationId` INTEGER NOT NULL,
    ADD COLUMN `phone` VARCHAR(191) NOT NULL,
    ADD COLUMN `username` VARCHAR(191) NOT NULL;

-- CreateTable
CREATE TABLE `User_Role` (
    `userId` INTEGER NOT NULL,
    `roleId` INTEGER NOT NULL,

    PRIMARY KEY (`userId`, `roleId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,

    UNIQUE INDEX `Roles_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Organizations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Organization_Department` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `organizationId` INTEGER NOT NULL,
    `departmentId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Users_username_key` ON `Users`(`username`);

-- AddForeignKey
ALTER TABLE `Users` ADD CONSTRAINT `Users_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User_Role` ADD CONSTRAINT `User_Role_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `Users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User_Role` ADD CONSTRAINT `User_Role_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `Roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Organization_Department` ADD CONSTRAINT `Organization_Department_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `Organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Organization_Department` ADD CONSTRAINT `Organization_Department_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
