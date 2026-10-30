import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

// 로컬 개발: 저장소 루트의 .env 하나를 backend/discord-bot이 공유한다.
// 컨테이너에는 이 파일이 없고 docker-compose의 env_file로 주입되므로, 없으면 그냥 무시된다.
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });
