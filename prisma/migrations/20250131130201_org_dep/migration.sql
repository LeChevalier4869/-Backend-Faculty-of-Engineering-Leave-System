/*
  Warnings:

  - The primary key for the `organization_department` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `organization_department` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `organization_department` DROP PRIMARY KEY,
    DROP COLUMN `id`,
    ADD PRIMARY KEY (`organizationId`, `departmentId`);
