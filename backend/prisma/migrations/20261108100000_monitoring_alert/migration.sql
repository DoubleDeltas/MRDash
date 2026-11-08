-- CreateTable
CREATE TABLE `MonitoringAlert` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `serverId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MonitoringAlert_serverId_key`(`serverId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MonitoringAlertRule` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `alertId` INTEGER NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `op` ENUM('GT', 'LT', 'GTE', 'LTE', 'NEQ', 'EQ') NOT NULL,
    `threshold` DOUBLE NOT NULL,

    INDEX `MonitoringAlertRule_alertId_idx`(`alertId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MonitoringAlertChannel` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `alertId` INTEGER NOT NULL,
    `channelId` VARCHAR(32) NOT NULL,

    UNIQUE INDEX `MonitoringAlertChannel_alertId_channelId_key`(`alertId`, `channelId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MonitoringAlertWebhook` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `alertId` INTEGER NOT NULL,
    `url` VARCHAR(512) NOT NULL,

    UNIQUE INDEX `MonitoringAlertWebhook_alertId_url_key`(`alertId`, `url`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MonitoringAlert` ADD CONSTRAINT `MonitoringAlert_serverId_fkey` FOREIGN KEY (`serverId`) REFERENCES `MinecraftServer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MonitoringAlertRule` ADD CONSTRAINT `MonitoringAlertRule_alertId_fkey` FOREIGN KEY (`alertId`) REFERENCES `MonitoringAlert`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MonitoringAlertChannel` ADD CONSTRAINT `MonitoringAlertChannel_alertId_fkey` FOREIGN KEY (`alertId`) REFERENCES `MonitoringAlert`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MonitoringAlertWebhook` ADD CONSTRAINT `MonitoringAlertWebhook_alertId_fkey` FOREIGN KEY (`alertId`) REFERENCES `MonitoringAlert`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

