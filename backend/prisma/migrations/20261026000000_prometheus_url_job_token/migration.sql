-- AlterTable: Host/Port를 URL로 합치고 job/instance/인증 토큰 컬럼 추가
ALTER TABLE `MinecraftServer` ADD COLUMN `prometheusInstance` VARCHAR(191) NULL,
    ADD COLUMN `prometheusJob` VARCHAR(191) NULL,
    ADD COLUMN `prometheusToken` TEXT NULL,
    ADD COLUMN `prometheusUrl` VARCHAR(512) NULL;

-- 기존 외부 Prometheus 설정(Host/Port)은 http URL로 옮긴다
UPDATE `MinecraftServer`
SET `prometheusUrl` = CONCAT('http://', `prometheusHost`, ':', COALESCE(`prometheusPort`, 9090))
WHERE `prometheusHost` IS NOT NULL;

ALTER TABLE `MinecraftServer` DROP COLUMN `prometheusHost`,
    DROP COLUMN `prometheusPort`;
