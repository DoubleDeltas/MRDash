FROM gradle:8.8-jdk17-alpine AS builder
WORKDIR /app
COPY . .
RUN gradle shadowJar --no-daemon -q

FROM eclipse-temurin:17-jre-alpine
RUN apk add --no-cache docker-cli

WORKDIR /app
COPY --from=builder /app/build/libs/mrd-bridge.jar /app/mrd-bridge.jar

# mrd-bridge.dat을 이 경로에 마운트하세요:
#   -v /host/path/mrd-bridge.dat:/app/mrd-bridge.dat:ro
# dat 파일이 없으면 빈 설정으로 시작해 서버 없음 오류가 발생합니다.

ENTRYPOINT ["java", "-Dfile.encoding=UTF-8", "-jar", "/app/mrd-bridge.jar"]
CMD ["run"]
