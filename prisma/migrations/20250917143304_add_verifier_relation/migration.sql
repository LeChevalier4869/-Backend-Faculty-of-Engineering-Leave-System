-- AddForeignKey
ALTER TABLE `leave_request` ADD CONSTRAINT `leave_request_verifierId_fkey` FOREIGN KEY (`verifierId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
