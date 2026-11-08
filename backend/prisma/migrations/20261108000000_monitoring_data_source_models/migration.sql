-- MinecraftServer의 모니터링 데이터 소스 컬럼들을 MonitoringDataSource / PrometheusDataSource 테이블로 옮긴다.
-- 기존 값을 보존하기 위해 새 테이블을 만들고 → 데이터를 복사하고 → 옛 컬럼을 지운다.

-- CreateTable
CREATE TABLE `MonitoringDataSource` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` ENUM('PROMETHEUS') NOT NULL,
    `serverId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `MonitoringDataSource_serverId_key`(`serverId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PrometheusDataSource` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `dataSourceId` INTEGER NOT NULL,
    `url` VARCHAR(512) NULL,
    `token` TEXT NULL,
    `job` VARCHAR(191) NULL,
    `instance` VARCHAR(191) NULL,
    `exporter` ENUM('MINECRAFT_PROMETHEUS_EXPORTER') NULL,
    UNIQUE INDEX `PrometheusDataSource_dataSourceId_key`(`dataSourceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MonitoringDataSource` ADD CONSTRAINT `MonitoringDataSource_serverId_fkey` FOREIGN KEY (`serverId`) REFERENCES `MinecraftServer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PrometheusDataSource` ADD CONSTRAINT `PrometheusDataSource_dataSourceId_fkey` FOREIGN KEY (`dataSourceId`) REFERENCES `MonitoringDataSource`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- 기존 데이터 복사: 데이터 소스가 연결된 서버마다 MonitoringDataSource 한 행
INSERT INTO `MonitoringDataSource` (`type`, `serverId`, `createdAt`, `updatedAt`)
SELECT `monitoringDataSource`, `id`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `MinecraftServer`
WHERE `monitoringDataSource` IS NOT NULL;

-- 그중 Prometheus인 것은 설정값을 PrometheusDataSource로
INSERT INTO `PrometheusDataSource` (`dataSourceId`, `url`, `token`, `job`, `instance`, `exporter`)
SELECT ds.`id`, s.`prometheusUrl`, s.`prometheusToken`, s.`prometheusJob`, s.`prometheusInstance`, s.`prometheusExporter`
FROM `MonitoringDataSource` ds
JOIN `MinecraftServer` s ON s.`id` = ds.`serverId`
WHERE ds.`type` = 'PROMETHEUS';

-- AlterTable
ALTER TABLE `MinecraftServer` DROP COLUMN `monitoringDataSource`,
    DROP COLUMN `prometheusExporter`,
    DROP COLUMN `prometheusInstance`,
    DROP COLUMN `prometheusJob`,
    DROP COLUMN `prometheusToken`,
    DROP COLUMN `prometheusUrl`;
