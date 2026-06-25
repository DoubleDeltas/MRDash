-- AlterTable
ALTER TABLE `User` MODIFY `localPwHash` VARCHAR(191) NULL,
    MODIFY `avatarUrl` VARCHAR(191) NULL,
    MODIFY `isMrdAuthorized` BOOLEAN NOT NULL DEFAULT false;
