import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ---------------------------------------------------------------------------
// 간단한 .env loader: 프로젝트 루트의 .env 를 읽어 process.env 에 채웁니다.
// (이미 설정된 환경 변수는 덮어쓰지 않습니다.)
// ---------------------------------------------------------------------------
function loadEnv() {
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env) || process.env[key] === "") {
      process.env[key] = value;
    }
  }
}

loadEnv();

const config = {
  port: Number(process.env.PORT) || 8787,
  openaiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
  magoSttUrl:
    process.env.MAGO_SPEECH_TO_TEXT_RUN_URL ||
    "https://api.magovoice.com/speech_to_text/v1/run",
  notionKey: process.env.NOTION_API_KEY || "",
  notionPageId: process.env.NOTION_ONBOARDING_PAGE_ID || "",
  notionVersion: process.env.NOTION_VERSION || "2022-06-28",
  notionTtlMs: Number(process.env.NOTION_CONTEXT_TTL_MS) || 60000,
};

// ---------------------------------------------------------------------------
// HTTP 유틸
// ---------------------------------------------------------------------------
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Audio-Filename",
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...CORS_HEADERS,
  });
  res.end(payload);
}

function readRawBody(req, limitBytes = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error("요청 본문이 너무 큽니다."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJsonBody(req) {
  const buf = await readRawBody(req);
  if (buf.length === 0) return {};
  try {
    return JSON.parse(buf.toString("utf8"));
  } catch {
    throw new Error("JSON 파싱 실패");
  }
}

// ---------------------------------------------------------------------------
// 로컬 fallback 평가 (OpenAI 미설정/실패 시 사용)
// ---------------------------------------------------------------------------
function localEvaluate(question, answer) {
  const text = String(answer || "").trim();
  const lower = text.toLowerCase();
  if (!text) {
    return {
      score: 0,
      feedback: "답변이 비어 있어요. 질문 의도에 맞게 작성해 주세요.",
      strengths: [],
      improvements: ["질문과 관련된 핵심 내용을 포함해 답변해 주세요."],
    };
  }
  const keywords = Array.isArray(question?.keywords) ? question.keywords : [];
  const matched = keywords.filter((k) => lower.includes(String(k).toLowerCase()));
  let score = 0;
  if (matched.length >= 2 || (matched.length >= 1 && text.length >= 40)) score = 2;
  else if (matched.length >= 1 || text.length >= 25) score = 1;
  if (score === 0 && text.length >= 30) score = 1;

  const feedback =
    score === 2
      ? "질문 의도에 잘 맞고 구체적이에요."
      : score === 1
      ? "방향은 맞아요. 조금 더 구체적으로 설명해 보세요."
      : "질문 의도와 조금 멀어요. 예시 답변을 참고해 다시 시도해 보세요.";

  return {
    score,
    feedback,
    strengths: matched.length ? [`핵심 키워드를 짚었어요: ${matched.join(", ")}`] : [],
    improvements: score < 2 && question?.rubric ? [question.rubric] : [],
  };
}

function clampScore(value) {
  const n = Number(value);
  if (n >= 2) return 2;
  if (n >= 1) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Notion 온보딩 문서 -> plain text (TTL 캐시)
// ---------------------------------------------------------------------------
let notionCache = { text: "", at: 0 };

function richTextToPlain(richText) {
  if (!Array.isArray(richText)) return "";
  return richText.map((rt) => rt?.plain_text ?? "").join("");
}

function blockToText(block) {
  const type = block?.type;
  if (!type) return "";
  const data = block[type];
  if (!data) return "";
  if (Array.isArray(data.rich_text)) {
    const text = richTextToPlain(data.rich_text);
    if (!text) return "";
    if (type === "to_do") {
      return `- [${data.checked ? "x" : " "}] ${text}`;
    }
    if (type.startsWith("heading")) return `# ${text}`;
    if (type === "bulleted_list_item" || type === "numbered_list_item") {
      return `- ${text}`;
    }
    return text;
  }
  return "";
}

async function fetchNotionOnboarding() {
  if (!config.notionKey || !config.notionPageId) {
    throw new Error("Notion 설정이 없습니다 (NOTION_API_KEY / NOTION_ONBOARDING_PAGE_ID).");
  }

  const now = Date.now();
  if (notionCache.text && now - notionCache.at < config.notionTtlMs) {
    return { text: notionCache.text, cached: true };
  }

  const lines = [];
  let cursor = undefined;
  let guard = 0;
  do {
    const url = new URL(
      `https://api.notion.com/v1/blocks/${config.notionPageId}/children`
    );
    url.searchParams.set("page_size", "100");
    if (cursor) url.searchParams.set("start_cursor", cursor);

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.notionKey}`,
        "Notion-Version": config.notionVersion,
      },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Notion API 오류: ${res.status} ${detail.slice(0, 200)}`);
    }
    const data = await res.json();
    for (const block of data.results || []) {
      const line = blockToText(block);
      if (line) lines.push(line);
    }
    cursor = data.has_more ? data.next_cursor : undefined;
    guard += 1;
  } while (cursor && guard < 10);

  const text = lines.join("\n").trim();
  notionCache = { text, at: now };
  return { text, cached: false };
}

// ---------------------------------------------------------------------------
// OpenAI 평가
// ---------------------------------------------------------------------------
const EVAL_SYSTEM_PROMPT = `당신은 신규 입사자를 돕는 Mago 온보딩 코치입니다.
사용자의 답변을 현재 퀘스트 질문 기준으로 평가하세요.
Notion 온보딩 문서 컨텍스트가 제공되면 그 내용을 우선 참고하세요.

점수는 0, 1, 2 중 하나만 사용합니다.
- 0점: 질문과 관련성이 낮거나 핵심 이해가 거의 없음
- 1점: 방향은 맞지만 구체성이 부족함
- 2점: 질문 의도에 맞고 구체적인 이해가 드러남

피드백은 한국어로 1~2문장 작성하세요.
반드시 JSON만 반환하세요.
Markdown 코드블록은 사용하지 마세요.

반환 JSON:
{
  "score": 0,
  "feedback": "짧은 한국어 피드백",
  "strengths": ["잘한 점"],
  "improvements": ["보완할 점"]
}`;

async function openaiEvaluate({ user, quest, question, answer, notionContext }) {
  const contextBlock = notionContext
    ? `\n\n[Notion 온보딩 문서 컨텍스트]\n${notionContext.slice(0, 4000)}`
    : "";

  const userContent = `평가 대상 정보:
- 입사자: ${user?.name ?? "알 수 없음"} (${user?.role ?? "역할 미상"})
- 퀘스트: ${quest?.title ?? ""}
- 질문: ${question?.text ?? ""}
- 평가 기준(rubric): ${question?.rubric ?? ""}
- 예시 답변: ${question?.sampleAnswer ?? ""}

사용자 답변:
"""
${String(answer ?? "").slice(0, 2000)}
"""${contextBlock}

위 기준으로 평가해 JSON만 반환하세요.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openaiKey}`,
    },
    body: JSON.stringify({
      model: config.openaiModel,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: EVAL_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI 오류: ${res.status} ${detail.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content);
  return {
    score: clampScore(parsed.score),
    feedback: String(parsed.feedback ?? "평가를 완료했어요.").trim(),
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
    improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
  };
}

// ---------------------------------------------------------------------------
// Mago Speech-to-Text 프록시 (multipart/form-data, Authorization 없음)
// ---------------------------------------------------------------------------
// Mago STT multipart/form-data 본문을 만듭니다.
//   - file        : 오디오 파일 (Content-Type 포함)
//   - 그 외 fields : 일반 텍스트 필드 (content_id, with_words 등)
function buildMultipart(fileBuffer, filename, contentType, fields = {}) {
  const boundary =
    "----MagoBoundary" + Math.random().toString(16).slice(2) + Date.now().toString(16);
  const parts = [];

  parts.push(
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: ${contentType}\r\n\r\n`,
      "utf8"
    )
  );
  parts.push(fileBuffer);
  parts.push(Buffer.from("\r\n", "utf8"));

  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="${name}"\r\n\r\n` +
          `${value}\r\n`,
        "utf8"
      )
    );
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`, "utf8"));
  return { body: Buffer.concat(parts), boundary };
}

async function magoTranscribe(req) {
  const audio = await readRawBody(req);
  if (audio.length === 0) {
    throw new Error("오디오 데이터가 비어 있습니다.");
  }
  const filename = req.headers["x-audio-filename"] || "recording.webm";
  const contentType = req.headers["content-type"] || "audio/webm";

  // Mago STT 실행 endpoint가 요구하는 폼 필드:
  //   content_id (빈 값 허용), with_words (false 기본)
  const { body, boundary } = buildMultipart(audio, filename, contentType, {
    content_id: "",
    with_words: "false",
  });

  // Mago Speech-to-Text 는 API key 를 사용하지 않으므로 Authorization 헤더를 보내지 않습니다.
  const res = await fetch(config.magoSttUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  const rawText = await res.text();
  if (!res.ok) {
    throw new Error(`Mago STT 오류: ${res.status} ${rawText.slice(0, 200)}`);
  }

  let data;
  try {
    data = JSON.parse(rawText);
  } catch {
    // JSON 이 아니면 원문을 그대로 반환 (예외적 케이스).
    return rawText.trim();
  }

  // SATURN 응답 코드 700 이 성공입니다.
  if (typeof data.code === "number" && data.code !== 700) {
    const hint =
      data.code === 501
        ? " (오디오가 너무 짧거나 무음이거나 지원하지 않는 형식일 수 있어요.)"
        : "";
    throw new Error(`Mago STT 실패: code=${data.code} ${data.message ?? ""}${hint}`);
  }

  return extractTranscript(data).trim();
}

// SpeechToTextResponse 에서 전사 텍스트(text 값)를 추출합니다.
// 응답 구조가 버전/옵션에 따라 다를 수 있어, content.result 안의 모든 세그먼트에서
// text 값을 순서대로 수집해 이어붙입니다.
//   content.result.utterances[i]["<file>"][j].text  형태를 포함합니다.
function extractTranscript(data) {
  const result = data?.content?.result;
  const segments = [];

  const collect = (node) => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const item of node) collect(item);
      return;
    }
    if (typeof node === "object") {
      if (typeof node.text === "string" && node.text.trim()) {
        segments.push(node.text.trim());
      }
      for (const value of Object.values(node)) {
        if (value && typeof value === "object") collect(value);
      }
    }
  };

  collect(result);
  if (segments.length > 0) return segments.join(" ");

  // 알려진 단일 필드 fallback.
  const fallback =
    data.text ?? data.transcript ?? data?.content?.text ?? "";
  return typeof fallback === "string" ? fallback : JSON.stringify(fallback);
}

// ---------------------------------------------------------------------------
// 라우팅
// ---------------------------------------------------------------------------
async function handleHealth(_req, res) {
  let notionOk = false;
  if (config.notionKey && config.notionPageId) {
    notionOk = true;
  }
  sendJson(res, 200, {
    ok: true,
    service: "mago-onboarding-voice-agent",
    time: new Date().toISOString(),
    config: {
      openai: {
        configured: Boolean(config.openaiKey),
        model: config.openaiModel,
      },
      speechToText: {
        configured: Boolean(config.magoSttUrl),
        url: config.magoSttUrl,
        requiresApiKey: false,
      },
      notion: {
        configured: notionOk,
        pageId: config.notionPageId || null,
        version: config.notionVersion,
      },
    },
  });
}

async function handleEvaluate(req, res) {
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (err) {
    sendJson(res, 400, { error: err.message });
    return;
  }

  const { user, quest, question, answer } = payload;

  // 평가 컨텍스트로 Notion 온보딩 문서를 시도 (실패해도 평가는 계속).
  let notionContext = "";
  if (config.notionKey && config.notionPageId) {
    try {
      const { text } = await fetchNotionOnboarding();
      notionContext = text;
    } catch (err) {
      console.warn("[evaluate] Notion 컨텍스트 로드 실패:", err.message);
    }
  }

  if (config.openaiKey) {
    try {
      const result = await openaiEvaluate({
        user,
        quest,
        question,
        answer,
        notionContext,
      });
      sendJson(res, 200, { ...result, source: "openai" });
      return;
    } catch (err) {
      console.warn("[evaluate] OpenAI 실패, local fallback 사용:", err.message);
    }
  }

  const fallback = localEvaluate(question, answer);
  sendJson(res, 200, { ...fallback, source: "local-fallback" });
}

async function handleTranscribe(req, res) {
  try {
    const text = await magoTranscribe(req);
    if (!text) {
      sendJson(res, 502, {
        error: "음성에서 텍스트를 인식하지 못했어요 (무음이거나 너무 짧을 수 있어요).",
        text: "",
      });
      return;
    }
    sendJson(res, 200, { text });
  } catch (err) {
    sendJson(res, 502, { error: err.message, text: "" });
  }
}

async function handleNotionOnboarding(_req, res) {
  if (!config.notionKey || !config.notionPageId) {
    sendJson(res, 200, {
      ok: false,
      configured: false,
      text: "",
      message:
        "Notion 설정이 없습니다. .env 의 NOTION_API_KEY / NOTION_ONBOARDING_PAGE_ID 를 설정하세요.",
    });
    return;
  }
  try {
    const { text, cached } = await fetchNotionOnboarding();
    sendJson(res, 200, { ok: true, configured: true, cached, length: text.length, text });
  } catch (err) {
    sendJson(res, 502, { ok: false, configured: true, text: "", error: err.message });
  }
}

const server = http.createServer(async (req, res) => {
  const { method } = req;
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  if (method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  try {
    if (method === "GET" && path === "/api/health") {
      return await handleHealth(req, res);
    }
    if (method === "POST" && path === "/api/agent/evaluate") {
      return await handleEvaluate(req, res);
    }
    if (method === "POST" && path === "/api/speech/transcribe") {
      return await handleTranscribe(req, res);
    }
    if (method === "GET" && path === "/api/notion/onboarding") {
      return await handleNotionOnboarding(req, res);
    }
    sendJson(res, 404, { error: `Not found: ${method} ${path}` });
  } catch (err) {
    console.error("[server] 처리 중 오류:", err);
    sendJson(res, 500, { error: "서버 내부 오류", detail: err.message });
  }
});

server.listen(config.port, () => {
  console.log(`Mago 온보딩 Agent backend 실행: http://localhost:${config.port}`);
  console.log(`  health   : http://localhost:${config.port}/api/health`);
  console.log(`  OpenAI   : ${config.openaiKey ? "설정됨" : "미설정 (local fallback)"}`);
  console.log(`  STT URL  : ${config.magoSttUrl}`);
  console.log(
    `  Notion   : ${
      config.notionKey && config.notionPageId ? "설정됨" : "미설정"
    }`
  );
});
