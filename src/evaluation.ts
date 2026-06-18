import type { Evaluation, QuestQuestion } from "./types";

// 키워드 기반 로컬 fallback 평가.
// OpenAI 평가가 실패하거나 backend를 쓸 수 없을 때 데모가 끊기지 않도록 사용합니다.
export function localEvaluate(question: QuestQuestion, answer: string): Evaluation {
  const normalized = answer.trim().toLowerCase();
  const length = normalized.length;

  if (length === 0) {
    return {
      score: 0,
      feedback: "답변이 비어 있어요. 질문 의도에 맞게 한두 문장으로 작성해 보세요.",
      strengths: [],
      improvements: ["질문과 관련된 핵심 내용을 포함해 답변해 주세요."],
      source: "local-fallback",
    };
  }

  const matched = question.keywords.filter((kw) =>
    normalized.includes(kw.toLowerCase())
  );
  const matchRatio = matched.length / Math.max(1, question.keywords.length);

  let score: 0 | 1 | 2 = 0;
  if (matched.length >= 2 || (matched.length >= 1 && length >= 40)) {
    score = 2;
  } else if (matched.length >= 1 || length >= 25) {
    score = 1;
  }

  // 키워드는 없지만 충분히 길고 성의 있는 답변은 최소 1점 보장.
  if (score === 0 && length >= 30) {
    score = 1;
  }

  const strengths: string[] = [];
  const improvements: string[] = [];

  if (matched.length > 0) {
    strengths.push(`핵심 키워드(${matched.slice(0, 3).join(", ")})를 잘 짚었어요.`);
  }
  if (length >= 40) {
    strengths.push("구체적으로 설명하려는 노력이 보여요.");
  }

  if (score < 2) {
    improvements.push(
      `다음 관점을 더 담아보세요: ${question.rubric}`
    );
  }
  if (matchRatio < 0.5) {
    improvements.push(
      `예시 답변을 참고해 보세요: ${question.sampleAnswer}`
    );
  }

  const feedbackByScore: Record<0 | 1 | 2, string> = {
    0: "질문 의도와 조금 멀어요. 예시 답변을 참고해 다시 시도해 보세요.",
    1: "방향은 맞아요. 조금 더 구체적으로 설명하면 좋겠어요.",
    2: "질문 의도에 잘 맞고 구체적이에요. 좋습니다!",
  };

  return {
    score,
    feedback: feedbackByScore[score],
    strengths,
    improvements,
    source: "local-fallback",
  };
}
