/*
  Warnings:

  - You are about to drop the column `verifierId` on the `leave_request` table. All the data in the column will be lost.
  - You are about to drop the column `inActive` on the `user` table. All the data in the column will be lost.
  - You are about to drop the `approver` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `updatedAt` to the `leave_balance` table without a default value. This is not possible if the table is not empty.
  - Added the required column `year` to the `leave_balance` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `file` DROP FOREIGN KEY `file_leaveRequestId_fkey`;

-- DropIndex
DROP INDEX `file_leaveRequestId_fkey` ON `file`;

-- AlterTable
ALTER TABLE `file` MODIFY `leaveRequestId` INTEGER NULL;

-- AlterTable
ALTER TABLE `leave_balance` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL,
    ADD COLUMN `year` INTEGER NOT NULL;

-- AlterTable
ALTER TABLE `leave_request` DROP COLUMN `verifierId`;

-- AlterTable
ALTER TABLE `leave_type` ADD COLUMN `template` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `signature` MODIFY `file` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `user` DROP COLUMN `inActive`;

-- DropTable
DROP TABLE `approver`;

-- AddForeignKey
ALTER TABLE `file` ADD CONSTRAINT `file_leaveRequestId_fkey` FOREIGN KEY (`leaveRequestId`) REFERENCES `leave_request`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
