/*
  Warnings:

  - Added the required column `faculty` to the `Users` table without a default value. This is not possible if the table is not empty.
  - Added the required column `prefixName` to the `Users` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `users` ADD COLUMN `faculty` ENUM('INDUSTRIAL_EDUCATION', 'ENGINEERING', 'BUSINESS_ADMINISTRATION') NOT NULL,
    ADD COLUMN `prefixName` VARCHAR(191) NOT NULL;
