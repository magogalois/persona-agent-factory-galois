import type { DemoAccount, Quest } from "./types";

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    id: "newbie-frontend",
    name: "김신입",
    role: "Frontend Engineer",
    team: "Product",
    emoji: "🧑‍💻",
  },
  {
    id: "newbie-backend",
    name: "이서버",
    role: "Backend Engineer",
    team: "Platform",
    emoji: "🛠️",
  },
  {
    id: "newbie-pm",
    name: "박기획",
    role: "Product Manager",
    team: "Strategy",
    emoji: "📋",
  },
  {
    id: "newbie-sales",
    name: "최영업",
    role: "Sales Manager",
    team: "Growth",
    emoji: "🤝",
  },
];

// 기본 퀘스트 3개를 프론트엔드 코드에 포함합니다. (/api/notion/quests 미사용)
export const QUESTS: Quest[] = [
  {
    id: "quest-company",
    title: "Quest 1. 회사와 서비스 이해하기",
    description:
      "Mago가 어떤 회사이고 어떤 서비스를 제공하는지 이해합니다. 홈페이지(holamago.com)를 참고하세요.",
    badge: "Mago Explorer",
    badgeEmoji: "🧭",
    passingScore: 8,
    questions: [
      {
        id: "q1-1",
        text: "Mago는 어떤 회사인가요? 한 문장으로 소개해 보세요.",
        rubric: "음성/AI 기술 기업이라는 핵심을 이해했는지 평가합니다.",
        keywords: ["음성", "AI", "speech", "voice", "기술"],
        sampleAnswer:
          "Mago는 음성 AI 기술을 제공하는 회사로, Speech-to-Text 등 음성 처리 API를 제공합니다.",
      },
      {
        id: "q1-2",
        text: "Mago의 대표적인 제품이나 서비스는 무엇이라고 생각하나요?",
        rubric: "Speech-to-Text 등 음성 관련 제품을 언급하는지 평가합니다.",
        keywords: ["speech to text", "stt", "음성 인식", "voice", "api"],
        sampleAnswer:
          "Speech-to-Text(음성 인식) API가 대표 제품이며, 음성을 텍스트로 변환하는 서비스를 제공합니다.",
      },
      {
        id: "q1-3",
        text: "Mago 서비스는 주로 어떤 고객이나 상황에서 쓰일 수 있을까요?",
        rubric: "음성 데이터를 텍스트로 다루는 실제 활용 사례를 제시하는지 평가합니다.",
        keywords: ["콜센터", "회의", "자막", "전사", "고객", "녹음"],
        sampleAnswer:
          "콜센터 상담 녹취, 회의록 전사, 미디어 자막 생성 등 음성을 텍스트로 다루는 상황에서 활용됩니다.",
      },
      {
        id: "q1-4",
        text: "음성 AI 기술이 비즈니스에 주는 가치는 무엇이라고 생각하나요?",
        rubric: "효율화/자동화/데이터화 등 가치를 구체적으로 설명하는지 평가합니다.",
        keywords: ["자동화", "효율", "비용", "데이터", "분석", "시간"],
        sampleAnswer:
          "수작업 전사를 자동화해 시간과 비용을 줄이고, 음성 데이터를 분석 가능한 텍스트로 만들어 인사이트를 얻을 수 있습니다.",
      },
      {
        id: "q1-5",
        text: "신규 입사자로서 회사 미션을 이해하기 위해 가장 먼저 확인할 자료는 무엇인가요?",
        rubric: "홈페이지/문서 등 1차 자료를 확인하려는 태도를 평가합니다.",
        keywords: ["홈페이지", "문서", "docs", "노션", "온보딩", "가이드"],
        sampleAnswer:
          "회사 홈페이지(holamago.com)와 공식 문서(docs.magovoice.com), 온보딩 노션 문서를 먼저 확인합니다.",
      },
      {
        id: "q1-6",
        text: "본인의 직무가 Mago의 음성 AI 서비스와 어떻게 연결될 수 있을지 적어보세요.",
        rubric: "본인 직무와 제품을 연결해 사고하는지 평가합니다.",
        keywords: ["직무", "역할", "기여", "제품", "고객", "개선"],
        sampleAnswer:
          "제 직무에서 음성 인식 결과를 활용하거나 제품 품질을 개선해 고객 가치를 높이는 데 기여할 수 있습니다.",
      },
    ],
  },
  {
    id: "quest-voice-docs",
    title: "Quest 2. Voice 문서 탐색하기",
    description:
      "Mago Voice 문서(docs.magovoice.com)를 탐색하며 Speech-to-Text 사용 방법을 이해합니다.",
    badge: "Voice Navigator",
    badgeEmoji: "🎙️",
    passingScore: 8,
    questions: [
      {
        id: "q2-1",
        text: "Speech-to-Text가 입력으로 받는 데이터와 출력으로 주는 결과는 무엇인가요?",
        rubric: "입력=오디오, 출력=텍스트라는 기본 개념을 이해했는지 평가합니다.",
        keywords: ["오디오", "음성", "파일", "텍스트", "변환", "결과"],
        sampleAnswer:
          "오디오(음성) 파일을 입력으로 받아 인식된 텍스트(전사 결과)를 출력으로 반환합니다.",
      },
      {
        id: "q2-2",
        text: "음성 파일을 API로 보낼 때 일반적으로 어떤 방식으로 전송하나요?",
        rubric: "multipart/form-data 또는 파일 업로드 방식을 이해하는지 평가합니다.",
        keywords: ["multipart", "form-data", "파일", "업로드", "file", "http"],
        sampleAnswer:
          "HTTP 요청의 multipart/form-data 형식으로 file 필드에 오디오 파일을 담아 전송합니다.",
      },
      {
        id: "q2-3",
        text: "Mago Speech-to-Text 실행 endpoint의 역할을 설명해 보세요.",
        rubric: "run endpoint가 변환 작업을 실행한다는 점을 이해했는지 평가합니다.",
        keywords: ["run", "endpoint", "실행", "변환", "transcribe", "요청"],
        sampleAnswer:
          "/speech_to_text/v1/run endpoint는 전달된 오디오에 대해 음성 인식을 실행하고 텍스트 결과를 반환합니다.",
      },
      {
        id: "q2-4",
        text: "이 데모에서 브라우저 녹음이 backend를 거쳐 STT로 전달되는 흐름을 설명해 보세요.",
        rubric: "녹음 -> /api/speech/transcribe -> Mago STT 흐름을 이해하는지 평가합니다.",
        keywords: ["mediarecorder", "녹음", "backend", "transcribe", "프록시", "stt"],
        sampleAnswer:
          "브라우저 MediaRecorder로 녹음한 오디오를 POST /api/speech/transcribe로 보내고, backend가 Mago STT로 프록시해 텍스트를 돌려받습니다.",
      },
      {
        id: "q2-5",
        text: "STT 결과를 신뢰하기 어려울 때 어떤 보완 방법을 쓸 수 있을까요?",
        rubric: "재시도/텍스트 입력/검수 등 fallback 사고를 평가합니다.",
        keywords: ["재시도", "텍스트", "수정", "검수", "fallback", "확인"],
        sampleAnswer:
          "결과를 사용자에게 보여주고 직접 수정하게 하거나, 텍스트 입력으로 다시 답변하도록 fallback을 제공합니다.",
      },
      {
        id: "q2-6",
        text: "음성 인식 품질에 영향을 주는 요소를 한 가지 이상 적어보세요.",
        rubric: "잡음/발음/녹음 품질 등 현실적 요인을 제시하는지 평가합니다.",
        keywords: ["잡음", "노이즈", "발음", "마이크", "품질", "환경"],
        sampleAnswer:
          "배경 잡음, 마이크 품질, 발음과 말 속도 등이 인식 정확도에 영향을 줍니다.",
      },
    ],
  },
  {
    id: "quest-api-reference",
    title: "Quest 3. API Reference 확인하기",
    description:
      "Mago Service API Reference를 확인하며 API 연동 방식을 이해합니다.",
    badge: "API Builder",
    badgeEmoji: "🔌",
    passingScore: 8,
    questions: [
      {
        id: "q3-1",
        text: "REST API에서 GET과 POST 요청은 각각 언제 사용하나요?",
        rubric: "조회=GET, 생성/전송=POST라는 기본을 이해하는지 평가합니다.",
        keywords: ["get", "조회", "post", "생성", "전송", "요청"],
        sampleAnswer:
          "GET은 데이터를 조회할 때, POST는 데이터를 생성하거나 서버로 전송(처리)할 때 사용합니다.",
      },
      {
        id: "q3-2",
        text: "이 서비스의 backend가 제공하는 API endpoint를 떠오르는 대로 적어보세요.",
        rubric: "health/evaluate/transcribe/onboarding 중 다수를 기억하는지 평가합니다.",
        keywords: ["health", "evaluate", "transcribe", "onboarding", "api"],
        sampleAnswer:
          "GET /api/health, POST /api/agent/evaluate, POST /api/speech/transcribe, GET /api/notion/onboarding 입니다.",
      },
      {
        id: "q3-3",
        text: "API 응답이 JSON 형식이면 클라이언트에서 어떻게 처리하나요?",
        rubric: "JSON 파싱과 필드 사용을 이해하는지 평가합니다.",
        keywords: ["json", "파싱", "parse", "필드", "응답", "객체"],
        sampleAnswer:
          "응답 본문을 JSON으로 파싱한 뒤 필요한 필드(score, feedback 등)를 읽어 화면에 사용합니다.",
      },
      {
        id: "q3-4",
        text: "GET /api/health endpoint는 어떤 목적으로 사용하나요?",
        rubric: "서버 상태/설정 확인 용도를 이해하는지 평가합니다.",
        keywords: ["상태", "헬스", "확인", "설정", "점검", "모니터링"],
        sampleAnswer:
          "서버가 살아있는지와 OpenAI/STT/Notion 설정 상태를 점검하기 위한 health check 용도입니다.",
      },
      {
        id: "q3-5",
        text: "API 호출이 실패했을 때 사용자가 끊기지 않게 하려면 어떻게 설계해야 할까요?",
        rubric: "에러 처리와 fallback 설계를 이해하는지 평가합니다.",
        keywords: ["에러", "예외", "fallback", "재시도", "처리", "메시지"],
        sampleAnswer:
          "에러를 잡아 사용자에게 안내하고, 로컬 fallback 평가나 텍스트 입력으로 계속 진행하도록 설계합니다.",
      },
      {
        id: "q3-6",
        text: "API key 같은 민감 정보는 코드에서 어떻게 다루어야 하나요?",
        rubric: "환경 변수/.env 사용과 하드코딩 금지를 이해하는지 평가합니다.",
        keywords: ["환경 변수", ".env", "하드코딩", "비밀", "secret", "노출"],
        sampleAnswer:
          "코드에 하드코딩하지 않고 .env 환경 변수로 분리해 관리하며, 저장소에는 .env.example만 둡니다.",
      },
    ],
  },
];
