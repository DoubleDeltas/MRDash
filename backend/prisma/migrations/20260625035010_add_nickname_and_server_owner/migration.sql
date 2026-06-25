-- AlterTable
ALTER TABLE `MinecraftServer` ADD COLUMN `ownerId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `nickname` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `MinecraftServer` ADD CONSTRAINT `MinecraftServer_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
