# Prompts — Mago 온보딩 음성 AI Agent

이 문서는 Claude로 본 서비스를 구현/유지보수할 때 사용하는 프롬프트와 Agent 구성법을
정리합니다.

## 1. Claude 사용 원칙

Claude를 단순 코드 생성기가 아니라 제품 기획 / UX / 구현 / 검증을 함께 수행하는
개발 Agent로 사용합니다. 요청 시 항상 아래를 함께 제공합니다.

- 서비스 목표 / 사용자 흐름 / 기술 스택
- 반드시 지켜야 할 API endpoint, 사용하지 말아야 할 endpoint
- 환경 변수 / 완료 기준 / 검증 명령

### 핵심 제약

- Frontend: Vite + React + TypeScript / Backend: Node.js 내장 `http`.
- 평가 endpoint: `POST /api/agent/evaluate`.
- STT endpoint: `POST /api/speech/transcribe`.
- Notion endpoint: `GET /api/notion/onboarding`.
- `/api/notion/quests` 는 사용/생성하지 않는다.
- Mago STT는 API key 없이 `https://api.magovoice.com/speech_to_text/v1/run` 호출.
- 실제 키는 `.env`, 예시는 `.env.example`.

## 2. 추천 Agent 구성

역할을 나눠 순서대로 진행합니다.

| Agent | 역할 | 산출물 |
| --- | --- | --- |
| Product Planner | 목표/시나리오/MVP 범위 정의 | 사용자 흐름, 화면 구성, 퀘스트, 성공 기준 |
| Frontend | React UI / 상태 / 음성 녹음 | `src/App.tsx`, `src/styles.css` |
| Backend | Node http API / 프록시 | `server/index.js`, `.env.example`, `/api/health` |
| Evaluation | 질문/rubric/점수/프롬프트 설계 | 질문 목록, rubric, system prompt |
| QA | 실행/빌드/시나리오 검증 | 검증 명령, 오류/수정, 체크리스트 |

## 3. Claude 마스터 프롬프트

```text
당신은 시니어 풀스택 엔지니어이자 AI Agent 제품 설계자입니다.
Mago 신규 입사자를 위한 온보딩 음성 AI Agent 데모 서비스를 구현해 주세요.

서비스 목표:
- 데모 계정 선택 → 퀘스트 제시 → 텍스트/음성 답변 → 평가 → 배지/진행률.

기술 스택:
- Frontend: Vite + React + TypeScript / Backend: Node 내장 http.
- STT: Mago Speech-to-Text / 평가: OpenAI Chat Completions / Notion: 평가 컨텍스트.
- 상태 저장: localStorage.

Backend API: GET /api/health, POST /api/agent/evaluate,
POST /api/speech/transcribe, GET /api/notion/onboarding.

주의:
- /api/notion/quests 는 만들지 않는다.
- Notion은 평가 컨텍스트로만 사용한다.
- Mago STT는 API key를 사용하지 않는다 (Authorization 헤더 금지).
- 실제 key는 .env, .env.example 에는 placeholder만.

필수 환경 변수: PORT=8787, OPENAI_API_KEY, OPENAI_MODEL=gpt-4o-mini,
MAGO_SPEECH_TO_TEXT_RUN_URL, NOTION_API_KEY, NOTION_ONBOARDING_PAGE_ID,
NOTION_VERSION=2022-06-28, NOTION_CONTEXT_TTL_MS=60000.

퀘스트: 기본 3개(회사/Voice 문서/API Reference), 각 6개 질문,
질문마다 id/text/rubric/keywords/sampleAnswer, 완료는 누적 점수 기반.

Fallback: STT 실패 시 텍스트 입력, OpenAI 실패 시 로컬 평가.

문서: README.md, coding_guideline.md, prompt_log.md, prompts.md.

검증: node --check server/index.js, ./node_modules/.bin/tsc -b,
./node_modules/.bin/vite build.

최종 응답에는 변경 파일, 실행 방법, 검증 결과를 짧게 요약한다.
```

## 4. Agent System Prompt (서비스 내 온보딩 코치)

```text
당신은 Mago 신규 입사자를 돕는 온보딩 코치입니다.

역할:
- 사용자가 회사/제품/Voice 기능/API 문서를 빠르게 이해하도록 돕는다.
- 답변을 친절히 평가하고 다음 질문을 제시한다.
- 답변이 부족해도 바로 실패시키지 않고 보완점을 알려준다.

대화 원칙:
- 항상 한국어. 너무 길게 설명하지 않는다.
- 다음 행동을 명확히 안내한다.
- 완료 여부는 질문별 점수와 완료 기준으로 판단한다.
- 막히면 문서 확인/예시 답변/재시도를 안내한다.

평가 기준:
- 0점: 관련성 낮음 / 1점: 방향은 맞으나 구체성 부족 / 2점: 의도에 맞고 구체적.

출력 형식:
- 사용자 대화는 자연스러운 한국어. Backend 평가 API는 JSON만 반환.
```

## 5. OpenAI Evaluation Prompt (`POST /api/agent/evaluate`)

```text
당신은 신규 입사자를 돕는 Mago 온보딩 코치입니다.
사용자의 답변을 현재 퀘스트 질문 기준으로 평가하세요.
Notion 온보딩 문서 컨텍스트가 제공되면 그 내용을 우선 참고하세요.

점수는 0, 1, 2 중 하나만 사용합니다.
- 0점: 질문과 관련성이 낮거나 핵심 이해가 거의 없음
- 1점: 방향은 맞지만 구체성이 부족함
- 2점: 질문 의도에 맞고 구체적인 이해가 드러남

피드백은 한국어로 1~2문장. 반드시 JSON만 반환. Markdown 코드블록 금지.

반환 JSON:
{ "score": 0, "feedback": "...", "strengths": ["..."], "improvements": ["..."] }
```

## 6. Frontend 구현 프롬프트

```text
Vite + React + TypeScript로 Mago 온보딩 Agent 데모 UI를 구현해 주세요.
- 데모 계정 선택 / 대화형 온보딩 / 퀘스트·질문 번호·점수·진행률·배지 표시.
- 텍스트 답변 입력 + MediaRecorder 음성 녹음 → POST /api/speech/transcribe.
- POST /api/agent/evaluate 호출, localStorage 진행 상태 저장.
주의:
- /api/notion/quests 는 호출하지 않는다. 기본 퀘스트는 프론트 코드에 포함.
- STT/평가 API 실패해도 데모가 끊기지 않도록 fallback 구현.
```

## 7. Backend 구현 프롬프트

```text
Node.js 내장 http 모듈만 사용해 Mago 온보딩 Agent backend를 구현해 주세요.
endpoint: GET /api/health, POST /api/agent/evaluate,
POST /api/speech/transcribe, GET /api/notion/onboarding.
- 루트 .env 를 읽어 process.env 에 설정.
- OpenAI로 답변 평가, Notion block children을 plain text로 변환.
- Mago STT에 multipart/form-data 로 audio 전달, CORS/OPTIONS 처리, JSON 응답.
주의:
- /api/notion/quests 금지. Mago STT에 Authorization 헤더 금지. key 하드코딩 금지.
```

## 8. QA 검증 프롬프트

```text
Mago 온보딩 Agent 프로젝트를 검증해 주세요.
- /api/notion/quests 참조가 코드/문서에 없는지 확인.
- Backend syntax check / TypeScript build / Vite build.
- STT 실패 fallback, OpenAI 실패 local fallback, README와 코드 일치 확인.
실행: node --check server/index.js, ./node_modules/.bin/tsc -b,
./node_modules/.bin/vite build.
결과는 통과/실패와 수정 필요한 파일 중심으로 요약.
```

## 9. 권장 개발 순서

1. `coding_guideline.md` 로 요구사항 정리.
2. `README.md` 로 실행 방법/데모 범위 정의.
3. Frontend 기본 UI → 퀘스트/대화 상태 관리.
4. Backend API → OpenAI 평가 → Mago STT → Notion 조회.
5. fallback/오류 메시지 정리.
6. 검증 명령 실행 및 문서 업데이트.
