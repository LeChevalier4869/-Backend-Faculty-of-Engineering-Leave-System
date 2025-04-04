/*
  Warnings:

  - You are about to drop the column `googleId` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `isGoogleAccount` on the `users` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `approvalsteps` DROP FOREIGN KEY `ApprovalSteps_approverId_fkey`;

-- DropForeignKey
ALTER TABLE `approvalsteps` DROP FOREIGN KEY `ApprovalSteps_leaveRequestId_fkey`;

-- DropForeignKey
ALTER TABLE `attachments` DROP FOREIGN KEY `Attachments_leaveRequestId_fkey`;

-- DropForeignKey
ALTER TABLE `auditlogs` DROP FOREIGN KEY `AuditLogs_leaveRequestId_fkey`;

-- DropForeignKey
ALTER TABLE `auditlogs` DROP FOREIGN KEY `AuditLogs_userId_fkey`;

-- DropForeignKey
ALTER TABLE `daily_role_assignments` DROP FOREIGN KEY `daily_role_assignments_userId_fkey`;

-- DropForeignKey
ALTER TABLE `departments` DROP FOREIGN KEY `departments_isHeadId_fkey`;

-- DropForeignKey
ALTER TABLE `departments` DROP FOREIGN KEY `departments_organizationId_fkey`;

-- DropForeignKey
ALTER TABLE `leavebalances` DROP FOREIGN KEY `LeaveBalances_leaveTypeId_fkey`;

-- DropForeignKey
ALTER TABLE `leavebalances` DROP FOREIGN KEY `LeaveBalances_userId_fkey`;

-- DropForeignKey
ALTER TABLE `leaverequests` DROP FOREIGN KEY `LeaveRequests_leaveTypeId_fkey`;

-- DropForeignKey
ALTER TABLE `leaverequests` DROP FOREIGN KEY `LeaveRequests_receiverId_fkey`;

-- DropForeignKey
ALTER TABLE `leaverequests` DROP FOREIGN KEY `LeaveRequests_userId_fkey`;

-- DropForeignKey
ALTER TABLE `leaverequests` DROP FOREIGN KEY `LeaveRequests_verifierId_fkey`;

-- DropForeignKey
ALTER TABLE `notifications` DROP FOREIGN KEY `Notifications_userId_fkey`;

-- DropForeignKey
ALTER TABLE `signatures` DROP FOREIGN KEY `signatures_userId_fkey`;

-- DropForeignKey
ALTER TABLE `user_role` DROP FOREIGN KEY `User_Role_roleId_fkey`;

-- DropForeignKey
ALTER TABLE `user_role` DROP FOREIGN KEY `User_Role_userId_fkey`;

-- DropForeignKey
ALTER TABLE `users` DROP FOREIGN KEY `users_departmentId_fkey`;

-- DropForeignKey
ALTER TABLE `users` DROP FOREIGN KEY `users_organizationId_fkey`;

-- DropIndex
DROP INDEX `daily_role_assignments_userId_fkey` ON `daily_role_assignments`;

-- DropIndex
DROP INDEX `departments_organizationId_fkey` ON `departments`;

-- DropIndex
DROP INDEX `users_departmentId_fkey` ON `users`;

-- DropIndex
DROP INDEX `users_googleId_key` ON `users`;

-- DropIndex
DROP INDEX `users_organizationId_fkey` ON `users`;

-- AlterTable
ALTER TABLE `users` DROP COLUMN `googleId`,
    DROP COLUMN `isGoogleAccount`;

-- AddForeignKey
ALTER TABLE `approvalsteps` ADD CONSTRAINT `ApprovalSteps_approverId_fkey` FOREIGN KEY (`approverId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `approvalsteps` ADD CONSTRAINT `ApprovalSteps_leaveRequestId_fkey` FOREIGN KEY (`leaveRequestId`) REFERENCES `leaverequests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attachments` ADD CONSTRAINT `Attachments_leaveRequestId_fkey` FOREIGN KEY (`leaveRequestId`) REFERENCES `leaverequests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auditlogs` ADD CONSTRAINT `AuditLogs_leaveRequestId_fkey` FOREIGN KEY (`leaveRequestId`) REFERENCES `leaverequests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auditlogs` ADD CONSTRAINT `AuditLogs_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leavebalances` ADD CONSTRAINT `LeaveBalances_leaveTypeId_fkey` FOREIGN KEY (`leaveTypeId`) REFERENCES `leavetypes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leavebalances` ADD CONSTRAINT `LeaveBalances_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leaverequests` ADD CONSTRAINT `LeaveRequests_leaveTypeId_fkey` FOREIGN KEY (`leaveTypeId`) REFERENCES `leavetypes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leaverequests` ADD CONSTRAINT `LeaveRequests_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leaverequests` ADD CONSTRAINT `LeaveRequests_verifierId_fkey` FOREIGN KEY (`verifierId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leaverequests` ADD CONSTRAINT `LeaveRequests_receiverId_fkey` FOREIGN KEY (`receiverId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `Notifications_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `departments` ADD CONSTRAINT `departments_isHeadId_fkey` FOREIGN KEY (`isHeadId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `departments` ADD CONSTRAINT `departments_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_role` ADD CONSTRAINT `User_Role_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_role` ADD CONSTRAINT `User_Role_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `signatures` ADD CONSTRAINT `signatures_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `daily_role_assignments` ADD CONSTRAINT `daily_role_assignments_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
