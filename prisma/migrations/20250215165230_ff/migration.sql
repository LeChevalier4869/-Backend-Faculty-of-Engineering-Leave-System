-- DropForeignKey
ALTER TABLE `departments` DROP FOREIGN KEY `departments_isHeadId_fkey`;

-- AlterTable
ALTER TABLE `departments` MODIFY `isHeadId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `departments` ADD CONSTRAINT `departments_isHeadId_fkey` FOREIGN KEY (`isHeadId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
