-- AlterTable
ALTER TABLE `MinecraftServer` ADD COLUMN `prometheusExporter` ENUM('MINECRAFT_PROMETHEUS_EXPORTER') NULL,
    ADD COLUMN `prometheusHost` VARCHAR(191) NULL,
    ADD COLUMN `prometheusPort` INTEGER NULL;

