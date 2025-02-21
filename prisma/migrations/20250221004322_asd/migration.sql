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
ALTER TABLE `user_role` DROP FOREIGN KEY `User_Role_roleId_fkey`;

-- DropForeignKey
ALTER TABLE `user_role` DROP FOREIGN KEY `User_Role_userId_fkey`;

-- DropForeignKey
ALTER TABLE `users` DROP FOREIGN KEY `Users_personnelTypeId_fkey`;

-- AddForeignKey
ALTER TABLE `approvalsteps` ADD CONSTRAINT `approvalsteps_approverId_fkey` FOREIGN KEY (`approverId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `approvalsteps` ADD CONSTRAINT `approvalsteps_leaveRequestId_fkey` FOREIGN KEY (`leaveRequestId`) REFERENCES `leaverequests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attachments` ADD CONSTRAINT `attachments_leaveRequestId_fkey` FOREIGN KEY (`leaveRequestId`) REFERENCES `leaverequests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auditlogs` ADD CONSTRAINT `auditlogs_leaveRequestId_fkey` FOREIGN KEY (`leaveRequestId`) REFERENCES `leaverequests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auditlogs` ADD CONSTRAINT `auditlogs_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leavebalances` ADD CONSTRAINT `leavebalances_leaveTypeId_fkey` FOREIGN KEY (`leaveTypeId`) REFERENCES `leavetypes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leavebalances` ADD CONSTRAINT `leavebalances_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leaverequests` ADD CONSTRAINT `leaverequests_leaveTypeId_fkey` FOREIGN KEY (`leaveTypeId`) REFERENCES `leavetypes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leaverequests` ADD CONSTRAINT `leaverequests_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leaverequests` ADD CONSTRAINT `leaverequests_verifierId_fkey` FOREIGN KEY (`verifierId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leaverequests` ADD CONSTRAINT `leaverequests_receiverId_fkey` FOREIGN KEY (`receiverId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_role` ADD CONSTRAINT `user_role_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_role` ADD CONSTRAINT `user_role_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_personnelTypeId_fkey` FOREIGN KEY (`personnelTypeId`) REFERENCES `personneltypes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER TABLE `approvalsteps` RENAME INDEX `ApprovalSteps_approverId_fkey` TO `approvalsteps_approverId_idx`;

-- RenameIndex
ALTER TABLE `approvalsteps` RENAME INDEX `ApprovalSteps_leaveRequestId_fkey` TO `approvalsteps_leaveRequestId_idx`;

-- RenameIndex
ALTER TABLE `attachments` RENAME INDEX `Attachments_leaveRequestId_fkey` TO `attachments_leaveRequestId_idx`;

-- RenameIndex
ALTER TABLE `auditlogs` RENAME INDEX `AuditLogs_leaveRequestId_fkey` TO `auditlogs_leaveRequestId_idx`;

-- RenameIndex
ALTER TABLE `auditlogs` RENAME INDEX `AuditLogs_userId_fkey` TO `auditlogs_userId_idx`;

-- RenameIndex
ALTER TABLE `leavebalances` RENAME INDEX `LeaveBalances_leaveTypeId_fkey` TO `leavebalances_leaveTypeId_idx`;

-- RenameIndex
ALTER TABLE `leavebalances` RENAME INDEX `LeaveBalances_userId_fkey` TO `leavebalances_userId_idx`;

-- RenameIndex
ALTER TABLE `leaverequests` RENAME INDEX `LeaveRequests_leaveTypeId_fkey` TO `leaverequests_leaveTypeId_idx`;

-- RenameIndex
ALTER TABLE `leaverequests` RENAME INDEX `LeaveRequests_receiverId_fkey` TO `leaverequests_receiverId_idx`;

-- RenameIndex
ALTER TABLE `leaverequests` RENAME INDEX `LeaveRequests_userId_fkey` TO `leaverequests_userId_idx`;

-- RenameIndex
ALTER TABLE `leaverequests` RENAME INDEX `LeaveRequests_verifierId_fkey` TO `leaverequests_verifierId_idx`;

-- RenameIndex
ALTER TABLE `notifications` RENAME INDEX `Notifications_userId_fkey` TO `notifications_userId_idx`;

-- RenameIndex
ALTER TABLE `signatures` RENAME INDEX `Signatures_userId_fkey` TO `signatures_userId_idx`;

-- RenameIndex
ALTER TABLE `user_role` RENAME INDEX `User_Role_roleId_fkey` TO `user_role_roleId_idx`;

-- RenameIndex
ALTER TABLE `users` RENAME INDEX `Users_personnelTypeId_fkey` TO `users_personnelTypeId_idx`;
