-- CreateTable
CREATE TABLE `Notice` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(100) NOT NULL,
    `content` TEXT NOT NULL,
    `category` ENUM('NOTICE', 'UPDATE') NOT NULL DEFAULT 'NOTICE',
    `authorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Notice_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Notice` ADD CONSTRAINT `Notice_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


-- 메인 페이지에 하드코딩돼 있던 공지 (frontend/src/pages/Main.jsx)를 그대로 옮긴다.
-- 날짜는 원래 표시하던 날짜의 KST 0시 (DATETIME은 UTC로 저장 → 전날 15:00)
INSERT INTO `Notice` (`title`, `content`, `category`, `createdAt`, `updatedAt`) VALUES
    ('마랜디위키 업데이트 완료', '마랜디위키에 새로운 섹션이 추가되었습니다. 커뮤니티 가이드 및 자주 묻는 질문 섹션을 확인해보세요.', 'UPDATE', '2026-05-22 15:00:00.000', '2026-05-22 15:00:00.000'),
    ('마인크래프트 서버 점검 예정', '초보자 서버의 업그레이드로 인해 5월 30일 오후 2시부터 4시까지 점검이 예정되어 있습니다. 이용에 불편을 드려 죄송합니다.', 'NOTICE', '2026-05-23 15:00:00.000', '2026-05-23 15:00:00.000'),
    ('마랜디 대시보드 오픈', '마랜디 커뮤니티 통합 관리 대시보드가 새롭게 오픈되었습니다. 앞으로 다양한 서비스를 한곳에서 관리할 수 있습니다.', 'NOTICE', '2026-05-24 15:00:00.000', '2026-05-24 15:00:00.000');
