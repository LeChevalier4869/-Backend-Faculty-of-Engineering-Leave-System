-- AlterTable
ALTER TABLE `approvalsteps` ADD COLUMN `previousApproved` BOOLEAN NOT NULL DEFAULT false,
    MODIFY `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'WAITING_FOR_VERIFICATION', 'WAITING_FOR_RECEIVER') NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE `leaverequests` ADD COLUMN `receiverId` INTEGER NULL,
    ADD COLUMN `verifierId` INTEGER NULL,
    MODIFY `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'WAITING_FOR_VERIFICATION', 'WAITING_FOR_RECEIVER') NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX `LeaveRequests_verifierId_fkey` ON `leaverequests`(`verifierId`);

-- CreateIndex
CREATE INDEX `LeaveRequests_receiverId_fkey` ON `leaverequests`(`receiverId`);

-- AddForeignKey
ALTER TABLE `leaverequests` ADD CONSTRAINT `LeaveRequests_verifierId_fkey` FOREIGN KEY (`verifierId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leaverequests` ADD CONSTRAINT `LeaveRequests_receiverId_fkey` FOREIGN KEY (`receiverId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
