/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `LeaveTypes` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `LeaveTypes_name_key` ON `LeaveTypes`(`name`);
