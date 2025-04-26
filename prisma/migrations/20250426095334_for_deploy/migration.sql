/*
  Warnings:

  - You are about to drop the `user_Rank` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user_Role` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `user_Rank` DROP FOREIGN KEY `user_Rank_rankId_fkey`;

-- DropForeignKey
ALTER TABLE `user_Rank` DROP FOREIGN KEY `user_Rank_userId_fkey`;

-- DropForeignKey
ALTER TABLE `user_Role` DROP FOREIGN KEY `user_Role_roleId_fkey`;

-- DropForeignKey
ALTER TABLE `user_Role` DROP FOREIGN KEY `user_Role_userId_fkey`;

-- DropTable
DROP TABLE `user_Rank`;

-- DropTable
DROP TABLE `user_Role`;

-- CreateTable
CREATE TABLE `userRole` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `roleId` INTEGER NOT NULL,

    UNIQUE INDEX `userRole_userId_roleId_key`(`userId`, `roleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `userRank` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `rankId` INTEGER NOT NULL,

    UNIQUE INDEX `userRank_userId_rankId_key`(`userId`, `rankId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `userRole` ADD CONSTRAINT `userRole_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `userRole` ADD CONSTRAINT `userRole_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `userRank` ADD CONSTRAINT `userRank_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `userRank` ADD CONSTRAINT `userRank_rankId_fkey` FOREIGN KEY (`rankId`) REFERENCES `rank`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
