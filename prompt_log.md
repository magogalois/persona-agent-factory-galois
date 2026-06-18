# Prompt Log

사용자의 주요 요청을 기록합니다.

## 2026-06-18 — 초기 구현 요청

사용자가 "Mago Onboarding Voice AI Agent Prompt Guide" 문서를 전달하며 전체 서비스
구현을 요청했습니다. 핵심 요구사항:

- 신규 입사자용 온보딩 음성 AI Agent 데모 서비스 구현.
- 데모 계정 선택 → 퀘스트 제시 → 텍스트/음성 답변 → 평가 → 배지/진행률.
- **기술 스택 제약**
  - Frontend: Vite + React + TypeScript
  - Backend: Node.js 내장 `http` 서버
  - 평가: OpenAI Chat Completions
  - STT: Mago Speech-to-Text (API key 불필요)
  - Notion: 평가 컨텍스트 전용
- **API 제약**
  - 사용: `GET /api/health`, `POST /api/agent/evaluate`,
    `POST /api/speech/transcribe`, `GET /api/notion/onboarding`
  - 미사용/미생성: `/api/notion/quests`
- **환경 변수**: `PORT`, `OPENAI_API_KEY`, `OPENAI_MODEL`,
  `MAGO_SPEECH_TO_TEXT_RUN_URL`, `NOTION_API_KEY`, `NOTION_ONBOARDING_PAGE_ID`,
  `NOTION_VERSION`, `NOTION_CONTEXT_TTL_MS`
- **퀘스트**: 기본 3개(회사/Voice 문서/API Reference), 각 6개 질문,
  질문마다 `id / text / rubric / keywords / sampleAnswer`.
- **Fallback**: STT 실패 시 텍스트 입력, OpenAI 실패 시 로컬 평가.
- **문서**: `README.md`, `coding_guideline.md`, `prompt_log.md`, `prompts.md`.
- **검증**: `node --check server/index.js`, `tsc -b`, `vite build`.

### 구현 결과 요약

- Vite + React + TS 프론트엔드 (`src/`) — 계정 선택, 대화 UI, 진행률, 배지,
  MediaRecorder 음성 녹음, localStorage 저장, STT/OpenAI fallback.
- Node 내장 http 백엔드 (`server/index.js`) — `.env` loader, 4개 endpoint,
  CORS/OPTIONS, OpenAI 평가 + 로컬 fallback, Mago STT multipart 프록시,
  Notion plain text 변환(TTL 캐시).
- 문서 4종 작성, `.env.example` 작성.
- 검증 통과: `node --check`, `tsc -b`, `vite build`, backend 스모크 테스트
  (health / evaluate fallback / notion / 404 for quests).

## 2026-06-18 — 후속 요청 기록

아래는 초기 구현 이후 사용자의 요청을 시간순으로 정리한 것입니다.
인용부호(") 안은 사용자가 보낸 프롬프트 원문입니다.

### 1. 음성 인식 엔진 확인 (질문)

> "음성인식 엔진을 무엇을 사용하고 있나요?"

- 답변: 음성 인식은 **Mago Speech-to-Text API** 사용.
  브라우저 `MediaRecorder` → `POST /api/speech/transcribe` → backend 가 multipart
  로 Mago STT(`/speech_to_text/v1/run`)에 프록시. API key 미사용. OpenAI 는 음성
  인식이 아니라 답변 *평가* 에만 사용.

### 2. Mago STT 실제 호출 형식 제공

> "음성인식을 사용하는 방법은 다음과 같습니다.
> curl -X 'POST' 'https://api.magovoice.com/speech_to_text/v1/run'
> -H 'accept: application/json' -H 'Content-Type: multipart/form-data'
> -F 'file=@sample_5s.flac;type=audio/flac' -F 'content_id=' -F 'with_words=false'"

- 조치: backend `magoTranscribe` 를 위 형식에 맞춤.
  `accept: application/json` 헤더 추가, multipart 에 `content_id`(빈 값),
  `with_words=false` 폼 필드 추가. OpenAPI 스키마(`SpeechToTextResponse`)를 조회해
  응답 파싱 로직 작성, `code === 700` 을 성공으로 판정.

### 3. 빈 텍스트 실패 검증 요청

> "음성 인식에 실패했어요 (인식된 텍스트가 비어 있습니다.). 텍스트로 답변해 주세요.
> 계속 이런 답변을 주세요. 코드를 검증해 주세요."

- 조치: 실제 endpoint 에 16kHz WAV 를 보내 검증 → 유효 오디오는 `code 700`,
  무음/짧은 오디오는 빈 텍스트(혹은 `code 501`) 반환을 확인. multipart/파싱은
  정상이며, 브라우저의 WebM/Opus 녹음이 디코드되지 않아 빈 결과가 나오는 것이
  원인으로 파악. 빈 텍스트/오류 메시지를 더 명확하게 개선.

### 4. STT 응답에서 text 값만 추출

> "{...content.result.utterances[].\"<file>\"[].text...} 결과는 위와 같습니다.
> 그 중에서 \"text\": \"자 이이 한 번 해보실까요\" 에서 value만 추출해 주시면 됩니다."

- 조치: 실제 응답 구조가 문서 예시와 달라(`utterances` 중첩), `content.result`
  내부를 재귀 순회하며 모든 `text` 값을 수집해 이어붙이도록 `extractTranscript`
  재작성. 실제 응답/문서 예시 두 형식 모두 정상 추출 확인.

### 5. 마이크 입력을 16kHz/16bit/mono FLAC 으로

> "마이크로 입력된 음성은 16 kHz, 16 bit , mono flac 포맷으로 정리해 주세요."

- 조치: `libflacjs`(libFLAC) 도입, Web Audio API 로 16kHz mono 리샘플 후 FLAC 인코딩
  (`src/flac.ts`). 로컬에서 16kHz/16bit/mono FLAC 생성 및 라운드트립 디코드 검증.

### 6. 빈 화면 버그

> "화면에 아무것도 뜨시 않습니다."

- 원인: 헤드리스 브라우저로 콘솔 캡처 →
  `Dynamic require of "./utils/data-utils" is not supported`.
  `libflacjs/lib/*.js` 가 UMD(CommonJS) 모듈이라 Vite dev 최적화기가 내부
  `require()` 를 변환하지 못해 시작 경로에서 예외 → React 렌더 전체 실패.

### 7. FLAC 대신 16kHz/16bit/mono WAV 로 전환

> "답답하군요. 그럼 마이크 입력을 받게 되면 16 kHz, 16 bits , mono wav 파일로
> 저장해서 API call을 할 수 있도록 해주세요."

- 조치: `libflacjs` 의존성/`src/flac.ts`/optimizeDeps 제거. 마이크 입력을 외부
  라이브러리 없이 Web Audio API 로 **16kHz/16bit/mono WAV** 변환해 전송
  (`src/audio.ts`, `src/wav.ts`). 헤드리스 렌더 확인으로 빈 화면 해결 검증.
  번들 521KB → 161KB 로 감소.

### 8. 음성 인식 후 즉시 제출

> "음성 녹음이 끝나고 결과가 나오면 바로 제출할 수 있도록 해 주세요."

- 조치: `handleVoiceToggle` 에서 STT 성공 시 결과를 입력란에 표시하고 곧바로
  `submitAnswer(text, true)` 로 자동 제출.

### 9. AI 질문 시 마이크 자동 시작

> "AI 질문을 하면 바로 음성인식을 할 수 있도록 마이크를 동작시켜 주세요."

- 조치: 질문 식별자(`퀘스트-질문`)가 바뀌면 마이크를 자동으로 켜는 effect 추가
  (`autoMicKeyRef` 중복 방지, `autoMicBlockedRef` 권한 거부/미지원 시 중단,
  `busy`/녹음 중에는 미동작). 새 질문마다 자동 녹음 → 중지 시 자동 제출 흐름 완성.

### 10. 프롬프트 로그 저장

> "이 때가지의 prompt를 prompt_log.md에 저장해 주세요."

- 조치: 본 문서에 후속 요청을 시간순으로 정리해 기록.
