# 이력서 기반 대화형 포트폴리오

이훈재 개인의 이력서와 함께 제공하는 LLM 기반 대화형 포트폴리오입니다. 면접관이 이력서에 첨부된 초대 링크로 접속하여 프로젝트 경험, 기술 선택의 이유, 문제 해결 과정에 대해 질문하는 용도입니다.

화면에는 별도의 서비스명이나 서비스 로고를 표시하지 않습니다. 첫 화면은 지원자 이름과 직무를 강조하고, 이력서에 담긴 경험을 자세히 설명한다는 안내와 입력창을 제공합니다. 추천 질문은 표시하지 않습니다.

초대 코드 발급과 사용 가능 여부 판단은 백엔드에서 담당합니다.

## 실행

루트의 `.env.example`을 `.env.local`로 복사하고, 별도 백엔드 서버의 기본 URL을 설정합니다.

```dotenv
NEXT_PUBLIC_API_BASE_URL=https://실제-백엔드-도메인
```

```bash
npm install
npm run dev
```

접속 예시: `http://localhost:3000/?token=A1B2C3`

신규 초대 코드는 대문자 영문과 숫자를 포함한 6자리입니다. 기존 긴 코드와 공유 링크도 지원하므로 프론트에서 길이·형식을 제한하지 않습니다. 내부에서는 `code`로 다루지만 공개 URL의 `token` 파라미터와 API 본문의 `token` 필드는 호환을 위해 유지합니다. CSRF `token`과 LLM 토큰은 별개의 용어입니다.

`localhost:3000`은 프론트엔드 화면 주소입니다. API 요청은 브라우저에서 `NEXT_PUBLIC_API_BASE_URL`의 백엔드 서버로 직접 전송합니다. 주소 미설정 시 프론트엔드 주소로 대체하지 않고 오류로 처리합니다.

환경변수 변경 후 개발 서버를 재시작해야 합니다. 운영 환경에서는 `NEXT_PUBLIC_` 값이 빌드 시 브라우저 코드에 포함되므로 배포 빌드 전에 설정해야 합니다.

개발 중 `http://192.168.50.6:3000`으로 접속할 때는 `next.config.ts`의 `allowedDevOrigins`에 해당 IP를 허용합니다. 개발 모드에서 백엔드 주소가 `localhost` 또는 루프백이면 브라우저의 접속 호스트로 바꾸고 백엔드 포트·경로를 유지합니다. 따라서 localhost 접속은 localhost:8080, IP 접속은 같은 IP:8080으로 요청하여 세션·CSRF 쿠키를 사용할 수 있습니다. 운영 빌드와 별도 백엔드 도메인 설정은 그대로 사용합니다.

## 대화 준비 흐름

1. URL의 `token` 파라미터로 `GET /invite?token=...`를 호출합니다.
2. 응답의 `canStartConversation`이 `true`인 경우에만 진행합니다. `firstUsedAt`이나 `expiresAt`으로 프론트엔드가 별도 판단하지 않습니다.
3. `GET /api/csrf`를 호출해 `headerName`과 `token`을 받습니다.
4. 발급받은 CSRF 헤더와 `{ "token": "초대 코드" }` 본문으로 `POST /api/invitations/accept`를 호출해 방문자 세션을 만듭니다.
5. 입장 시 세션 ID와 CSRF가 교체되므로 `GET /api/csrf`를 다시 호출합니다.
6. 입장이 완료되면 지원 직무(`position`)와 지원자 이름(이훈재)을 표시하고 메시지 전송을 활성화합니다.

모든 백엔드 요청에는 `API-Version: 0.1.0` 헤더를 포함합니다. 버전 값은 `src/lib/api.ts`의 `API_VERSION` 상수에서 관리하며, 같은 파일에서 공통 요청 헤더를 설정합니다.

모든 요청은 브라우저에서 `NEXT_PUBLIC_API_BASE_URL`의 별도 백엔드로 직접 전송합니다. 초대 코드는 URL 인코딩하고 요청은 `cache: "no-store"`로 전송합니다. `credentials: "include"`를 사용하여 백엔드 세션 쿠키를 브라우저가 관리하도록 합니다.

`localhost:3000`과 `localhost:8080`은 포트가 달라 서로 다른 출처입니다. 브라우저에서 직접 호출하려면 백엔드가 CORS로 프론트엔드 출처를 허용해야 합니다.

- 개발 환경에서는 `http://localhost:3000`, 운영 환경에서는 실제 프론트엔드 출처를 허용합니다.
- `API-Version`은 사용자 정의 헤더이므로 브라우저가 실제 요청 전에 `OPTIONS` 사전 요청으로 사용 가능 여부를 확인합니다. 백엔드의 허용 헤더에 `API-Version`과 CSRF 헤더와 JSON 본문의 `Content-Type`를 포함합니다.
- 사전 요청은 쿠키를 보내지 않으므로 인증 전에 CORS 처리를 해야 합니다. 실제 API의 인증·초대 검증은 그대로 수행합니다.
- 현재 클라이언트는 `credentials: "include"`를 사용하므로 백엔드에 `Access-Control-Allow-Credentials: true`가 필요하고, 허용 출처에 `*`를 사용할 수 없습니다. 쿠키 전송은 백엔드가 쿠키 기반 세션 또는 CSRF를 사용하는 경우에 필요합니다.

서로 다른 사이트 간 쿠키가 필요한 배포라면 백엔드 쿠키 설정과 브라우저의 서드파티 쿠키 제한도 고려해야 합니다.

### 초대 응답

```json
{
  "inviteId": "01a10741-afe5-7b88-9717-d97ff8604838",
  "companyName": "예시회사",
  "position": "백엔드 개발자",
  "firstUsedAt": null,
  "expiresAt": "2027-01-02T14:11:47.840658Z",
  "canStartConversation": true
}
```

`canStartConversation: false` 또는 400·401·403·404·409·410 응답은 접근 불가 안내를 표시합니다. 초대 코드 누락·빈 값·중복 파라미터는 백엔드 요청 없이 차단합니다.

### CSRF 응답

```json
{
  "headerName": "X-CSRF-TOKEN",
  "token": "BACKEND_ISSUED_CSRF_TOKEN"
}
```

CSRF 정보는 현재 채팅 세션의 메모리에 보관합니다. 초대 수락·메시지 전송 요청에 응답의 `headerName`을 그대로 헤더 이름으로 사용하고 `token`을 값으로 넣습니다. 입장 후 갱신된 CSRF를 채팅 요청에 사용합니다.

입장 요청의 설정 누락·네트워크 오류·10초 초과·잘못된 응답 형식·CSRF 발급 실패는 오류 안내와 재시도 버튼을 표시합니다. URL의 초대 코드가 바뀌면 이전 검증 결과와 초안을 초기화합니다.

## 메시지 전송과 SSE

`POST /api/chat/messages/stream`에 다음 설정으로 요청합니다.

- 본문: `{ "message": "질문", "clientMessageId": "UUID" }` (질문은 공백을 제외한 1~1,000자)
- 헤더: `API-Version: 0.1.0`, `Content-Type: application/json`, `Accept: text/event-stream`, 발급된 CSRF 헤더
- 세션 쿠키: `credentials: "include"`
- 클라이언트 전체 요청 제한: 130초 (백엔드 기본 제한 120초보다 길게 설정)

| SSE 이벤트 | 화면 동작 |
| --- | --- |
| `searching`, `generating`, `validating` | 검색·생성·검증 진행 상태 표시 |
| `delta` | 답변 조각을 임시 답변에 이어 붙임 |
| `completed` | 임시 내용을 최종 `answer`로 교체하고 확정 (출처는 화면에 표시하지 않음) |
| `failed` | 임시 답변 제거, 오류 표시, 질문을 입력창에 복원 |
| `heartbeat` | 화면 표시 없이 연결 유지용으로 처리 |

완료 이벤트 없이 연결이 끊어지거나 생성을 중지해도 임시 답변을 제거합니다. 유료 생성 요청은 자동 재전송하지 않습니다. 실패·중지된 질문은 `다시 시도` 버튼으로 같은 질문 행에서 수동 재시도할 수 있습니다. 일반 JSON API도 백엔드에 있으나 이 화면은 SSE API를 사용합니다.

- Enter로 전송, Shift+Enter로 줄바꿈, 한글 조합 중 Enter는 전송하지 않음
- 질문과 답변을 드래그해 직접 선택·복사 가능, 드래그 시작부터 텍스트 선택 중 자동 스크롤 보류
- 중복 전송 방지, 생성 중지, 스크롤을 올려 이전 대화를 읽는 동안 자동 스크롤 보류
- `새 대화`는 다시 초대를 수락해 새로운 방문자 세션을 만들고 화면 기록을 초기화
- 초대 코드 재발급·폐기·만료로 `INVITATION_UNAVAILABLE`이 반환되면 이용 종료 화면으로 전환하고 메시지 전송·재입장을 중단
- 세션 만료·CSRF 오류는 `다시 입장` 버튼으로 처리하며 메시지를 자동 재전송하지 않음
- 화면 기록은 메모리에만 보관: 백엔드는 기록 조회 API를 제공하지 않으며 내부 문맥용으로 최근 3쌍을 유지

API 규격은 CareerLLM의 `docs/security.md`, `docs/chat.md`, `examples/chat-stream.mjs`와 실제 컨트롤러를 기준으로 연결했습니다.

## 질문 중복 처리 방지

새 질문을 전송할 때 `crypto.randomUUID()`로 `clientMessageId`를 생성하여 해당 질문에 보관합니다. SSE 요청 본문에도 이 ID를 포함합니다.

- 실패·취소·연결 종료 후 같은 질문을 재시도하면 기존 ID를 유지합니다. 복원된 입력창의 질문을 수정하지 않고 다시 보내도 동일하게 처리합니다.
- 질문 내용을 바꿔 전송하면 새 ID를 생성합니다. 정상 완료된 질문과 같은 문장을 다시 입력해도 새 질문으로 처리합니다.
- 재시도는 기존 질문 행을 갱신하며 화면에 중복 질문을 추가하지 않습니다.
- 완료된 ID의 재전송은 백엔드가 저장된 답변을 `completed`로 반환합니다. 실패·취소된 ID의 재시도는 모델 비용이 다시 발생할 수 있습니다.
- `CHAT_REQUEST_IN_PROGRESS`는 잠시 후 수동 재시도를 안내합니다. `CHAT_MESSAGE_ID_CONFLICT`는 오류를 표시하고 새 대화를 안내합니다.
- ID와 질문은 현재 대화의 메모리에 보관합니다. 새 대화·재입장으로 새 방문자 세션을 만들면 이전 ID도 이어서 사용하지 않습니다.

## 검증

```bash
npm test
npm run lint
npm run build
```

테스트는 HTTP/SSE 응답을 대체하여 입장·CSRF 교체, 한글 UTF-8 분할 수신, 최종 답변 교체, 실패·연결 종료·취소를 검증합니다. 실제 OpenAI 생성 요청은 실행하지 않습니다.

Turbopack의 내부 로컬 포트 사용이 제한된 환경에서는 `npm run build -- --webpack`으로 빌드를 검증할 수 있습니다.
