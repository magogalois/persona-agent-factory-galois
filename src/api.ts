import type { DemoAccount, Evaluation, Quest, QuestQuestion } from "./types";
import { localEvaluate } from "./evaluation";
import { isWavConversionSupported, toWav16kMono } from "./wav";

interface EvaluateArgs {
  account: DemoAccount;
  quest: Quest;
  question: QuestQuestion;
  answer: string;
  questionIndex: number;
}

interface EvaluateApiResponse {
  score?: number;
  feedback?: string;
  strengths?: string[];
  improvements?: string[];
}

function clampScore(value: unknown): 0 | 1 | 2 {
  const n = Number(value);
  if (n >= 2) return 2;
  if (n >= 1) return 1;
  return 0;
}

// POST /api/agent/evaluate 호출. 실패하면 로컬 fallback 평가로 대체합니다.
export async function evaluateAnswer(args: EvaluateArgs): Promise<Evaluation> {
  const { account, quest, question, answer, questionIndex } = args;
  try {
    const res = await fetch("/api/agent/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user: { id: account.id, name: account.name, role: account.role },
        quest: { id: quest.id, title: quest.title },
        question: {
          id: question.id,
          text: question.text,
          rubric: question.rubric,
          sampleAnswer: question.sampleAnswer,
        },
        answer,
        session: { questionIndex },
      }),
    });

    if (!res.ok) {
      throw new Error(`evaluate 응답 오류: ${res.status}`);
    }

    const data = (await res.json()) as EvaluateApiResponse;
    return {
      score: clampScore(data.score),
      feedback: data.feedback?.trim() || "평가를 완료했어요.",
      strengths: Array.isArray(data.strengths) ? data.strengths : [],
      improvements: Array.isArray(data.improvements) ? data.improvements : [],
      source: "openai",
    };
  } catch (err) {
    console.warn("OpenAI 평가 실패, local fallback 사용:", err);
    return localEvaluate(question, answer);
  }
}

export interface TranscribeResult {
  ok: boolean;
  text: string;
  error?: string;
}

// 업로드용 오디오를 준비합니다: 16kHz / 16-bit / mono WAV 로 변환, 실패 시 원본 전송.
async function prepareAudioForUpload(
  blob: Blob
): Promise<{ blob: Blob; filename: string }> {
  if (isWavConversionSupported()) {
    try {
      return { blob: await toWav16kMono(blob), filename: "recording.wav" };
    } catch (err) {
      console.warn("WAV 변환 실패, 원본 오디오 전송:", err);
    }
  }
  return { blob, filename: "recording.webm" };
}

// POST /api/speech/transcribe 호출. 실패 시 ok=false 를 반환해 텍스트 입력으로 fallback 합니다.
export async function transcribeAudio(blob: Blob): Promise<TranscribeResult> {
  try {
    // 마이크 녹음(WebM/Opus 등)을 16kHz / 16-bit / mono WAV 로 정리해 전송합니다.
    // 변환이 안 되면 원본을 그대로 보냅니다.
    const { blob: upload, filename } = await prepareAudioForUpload(blob);

    const res = await fetch("/api/speech/transcribe", {
      method: "POST",
      headers: {
        "Content-Type": upload.type || "application/octet-stream",
        "X-Audio-Filename": filename,
      },
      body: upload,
    });

    const data = (await res.json().catch(() => ({}))) as {
      text?: string;
      error?: string;
    };

    if (!res.ok) {
      return { ok: false, text: "", error: data.error || `STT 오류: ${res.status}` };
    }

    const text = (data.text ?? "").trim();
    if (!text) {
      return { ok: false, text: "", error: "인식된 텍스트가 비어 있어요." };
    }
    return { ok: true, text };
  } catch (err) {
    return {
      ok: false,
      text: "",
      error: err instanceof Error ? err.message : "STT 요청 실패",
    };
  }
}
