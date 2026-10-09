# Portainer 배포

Portainer에서 LG-Gram (`192.168.50.125`) 환경을 선택합니다. 해당 저장소를 Git Source로 등록한 후 Repository 방식 Stack을 만들고 `refs/heads/main`, `compose.yaml`을 지정합니다. Access control은 Administrators로 유지하고 초기 배포에서는 polling을 사용하지 않습니다.

API 주소는 Compose의 build args로 프론트 빌드 시 주입합니다. 변경 시 이미지 재빌드가 필요합니다. 로컬 환경변수 파일과 개발용 mock 설정은 Docker 이미지에 포함하지 않습니다. GitHub Actions를 사용하지 않으며 Portainer 서버의 `DOCKER_BUILDKIT=0` 설정과 호환됩니다.

Stack 이름은 `career-llm-public`, 접속 주소는 `http://192.168.50.125:3000`입니다. Stack 환경변수 `NEXT_PUBLIC_API_BASE_URL`의 기본값은 `http://192.168.50.125:8080`입니다. 포트는 `PUBLIC_PORT`로 변경할 수 있습니다.

브라우저가 백엔드에 직접 요청하므로 백엔드의 CORS와 세션 쿠키 설정이 해당 HTTP 주소를 허용해야 합니다. 프론트에 OpenAI 키나 관리자 비밀키를 전달하지 않습니다. 도메인은 별도 결정 후 설정합니다.
