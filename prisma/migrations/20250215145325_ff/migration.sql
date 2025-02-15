/*
  Warnings:

  - You are about to drop the column `empolymentType` on the `users` table. All the data in the column will be lost.
  - Added the required column `employmentType` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `users` DROP COLUMN `empolymentType`,
    ADD COLUMN `employmentType` ENUM('ACADEMIC', 'SUPPORT') NOT NULL;
