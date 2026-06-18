# Coding Guideline — Mago 온보딩 음성 AI Agent

이 문서는 서비스의 목표, 시스템 구성, Agent 정책, 확장 방향을 정리합니다.

## 1. 서비스 목표

- 신규 입사자가 웹에서 데모 계정을 선택해 온보딩을 시작한다.
- AI Agent가 회사 / 제품 / API 문서 이해를 위한 퀘스트를 순서대로 제시한다.
- 사용자는 텍스트 또는 음성으로 답변한다.
- Agent는 퀘스트별 질문으로 이해도와 수행 여부를 평가한다.
- 완료 기준을 충족하면 배지를 지급하고 다음 퀘스트로 이동한다.
- 모든 퀘스트 완료 시 진행률, 획득 배지, 대화 기록을 보여준다.

## 2. 시스템 구성

```
[브라우저: Vite + React]
   │  텍스트 답변
   │  MediaRecorder 녹음 → 16kHz/16-bit/mono WAV 변환(Web Audio API)
   ▼
/api 프록시 (Vite dev server)
   ▼
[Node http backend (server/index.js)]
   ├─ POST /api/agent/evaluate   → OpenAI Chat Completions (+ Notion 컨텍스트)
   ├─ POST /api/speech/transcribe → Mago Speech-to-Text (multipart, no API key)
   ├─ GET  /api/notion/onboarding → Notion REST API → plain text
   └─ GET  /api/health           → 설정 상태
```

오디오 처리 정책:

- 마이크 입력은 **16kHz / 16-bit / mono WAV** 로 정리해 Mago STT 에 전송한다.
- 브라우저 녹음(WebM/Opus 등)을 `decodeAudioData` + `OfflineAudioContext` 로
  16kHz mono 로 리샘플한 뒤 16-bit PCM WAV 로 인코딩한다 (외부 라이브러리 불필요).
- WAV 변환 실패 시 원본 오디오를 그대로 전송하는 fallback 을 둔다.

- **상태 저장**: 데모이므로 서버 DB 없이 `localStorage` 에 세션을 저장한다.
- **퀘스트 정의**: 프론트엔드 `src/quests.ts` 에 하드코딩한다. (`/api/notion/quests` 미사용)
- **Notion 역할**: 퀘스트 생성용이 아니라 **OpenAI 평가 컨텍스트** 로만 사용한다.

## 3. API 정책

- 반드시 사용하는 endpoint: `/api/health`, `/api/agent/evaluate`,
  `/api/speech/transcribe`, `/api/notion/onboarding`.
- **만들지 않는 endpoint**: `/api/notion/quests`.
- 모든 API는 JSON으로 응답하고 CORS / `OPTIONS` 를 처리한다.
- Mago Speech-to-Text 에는 `Authorization` 헤더를 보내지 않는다 (API key 미사용).
- API key 등 민감정보는 코드에 하드코딩하지 않고 `.env` 로 분리한다.

## 4. Agent 정책

### 4.1 평가 점수 기준

- **0점**: 질문과 관련성이 낮거나 핵심 이해가 거의 없음
- **1점**: 방향은 맞지만 구체성이 부족함
- **2점**: 질문 의도에 맞고 구체적인 이해가 드러남

### 4.2 퀘스트 완료 기준

- 퀘스트별 6개 질문, 질문당 0~2점, 만점 12점.
- 누적 점수가 `passingScore`(기본 8점) 이상이면 배지를 지급한다.
- 배지를 못 받아도 다음 퀘스트로 진행해 데모가 끊기지 않게 한다.

### 4.3 Fallback 정책 (데모 연속성 보장)

- **STT 실패** → 사용자가 텍스트 입력으로 계속 답변할 수 있다.
- **OpenAI 평가 실패 / 미설정** → 키워드 기반 로컬 fallback 평가를 사용한다.
- **Notion 미설정 / 실패** → 컨텍스트 없이 평가를 진행한다.

### 4.4 대화 원칙

- 항상 한국어로 답변한다.
- 한 번에 너무 길게 설명하지 않는다.
- 사용자가 해야 할 다음 행동(다음 질문, 문서 확인, 재시도)을 명확히 안내한다.
- 답변이 부족해도 바로 실패 처리하지 않고 보완 포인트를 알려준다.

## 5. 코드 컨벤션

- Frontend: TypeScript strict 모드, 함수형 컴포넌트, 훅 기반 상태 관리.
- Backend: Node 내장 모듈만 사용, 외부 npm 의존성 없음.
- 평가 로직은 frontend(`src/evaluation.ts`)와 backend(`localEvaluate`)에 모두 두어
  어느 쪽이 끊겨도 데모가 계속되도록 한다.
- 사용자 노출 메시지는 한국어로 작성한다.

## 6. 확장 방향

- 실제 사용자/세션을 서버 DB(PostgreSQL 등)에 저장.
- 퀘스트/질문을 CMS 또는 Notion DB에서 동적으로 로드 (단, 평가 컨텍스트 역할은 유지).
- 음성 답변에 대한 발음/말하기 평가 추가.
- 관리자 대시보드로 입사자 진행률과 평가 결과 집계.
- 평가 모델을 OpenAI 외 Claude 등으로 교체 가능하게 추상화.
- 다국어 지원 (현재는 한국어 고정).
