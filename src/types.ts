export interface DemoAccount {
  id: string;
  name: string;
  role: string;
  team: string;
  emoji: string;
}

export interface QuestQuestion {
  id: string;
  text: string;
  rubric: string;
  keywords: string[];
  sampleAnswer: string;
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  badge: string;
  badgeEmoji: string;
  // 퀘스트 완료에 필요한 누적 점수 (질문 수 * 2 가 만점)
  passingScore: number;
  questions: QuestQuestion[];
}

export type EvaluationSource = "openai" | "local-fallback";

export interface Evaluation {
  score: 0 | 1 | 2;
  feedback: string;
  strengths: string[];
  improvements: string[];
  source: EvaluationSource;
}

export type ChatRole = "agent" | "user" | "system";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  // 답변 메시지에 평가 결과를 첨부할 수 있습니다.
  evaluation?: Evaluation;
  // 음성 답변 여부
  viaVoice?: boolean;
  createdAt: number;
}

export interface QuestProgress {
  questId: string;
  // 질문 id -> 획득 점수
  scores: Record<string, number>;
  completed: boolean;
  earnedBadge: boolean;
}

export interface SessionState {
  accountId: string;
  currentQuestIndex: number;
  currentQuestionIndex: number;
  progress: Record<string, QuestProgress>;
  messages: ChatMessage[];
  finished: boolean;
}
