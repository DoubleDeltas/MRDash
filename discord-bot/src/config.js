const required = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`환경변수 ${name}가 설정되지 않았습니다.`);
  }
  return value;
};

export const config = {
  botToken: required('DISCORD_BOT_TOKEN'),
  // "마랜디" 디스코드 서버(길드) ID
  guildId: required('MRD_GUILD_ID'),
  // backend 내부 API 주소. 기본값은 운영이면 docker 네트워크의 backend 컨테이너, 로컬이면 localhost
  backendInternalUrl: (
    process.env.BACKEND_INTERNAL_URL
    || (process.env.NODE_ENV === 'production'
      ? 'http://mrdash-backend:3000/internal'
      : `http://localhost:${process.env.PORT || 3000}/internal`)
  ).replace(/\/+$/, ''),
  internalApiSecret: required('INTERNAL_API_SECRET'),
  // 이벤트 누락·프로필 변경을 보정하기 위한 전체 동기화 주기
  memberSyncIntervalMs: Number(process.env.MEMBER_SYNC_INTERVAL_MINUTES || 60) * 60 * 1000,
};
