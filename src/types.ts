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

// 퀘스트 종료 시 보여주는 최종 평가 리포트.
export interface QuestReport {
  questTitle: string;
  badge: string;
  badgeEmoji: string;
  earnedBadge: boolean;
  totalScore: number;
  maxScore: number;
  strengths: string[];
  improvements: string[];
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  // 답변 메시지에 평가 결과를 첨부할 수 있습니다.
  evaluation?: Evaluation;
  // 음성 답변 여부
  viaVoice?: boolean;
  // 퀘스트 최종 평가 리포트 메시지일 경우.
  report?: QuestReport;
  createdAt: number;
}

export interface QuestProgress {
  questId: string;
  // 질문 id -> 획득 점수
  scores: Record<string, number>;
  // 퀘스트 진행 중 누적된 잘한 점 / 보완할 점 (최종 리포트용)
  strengths: string[];
  improvements: string[];
  completed: boolean;
  earnedBadge: boolean;
}

export interface SessionState {
  accountId: string;
  currentQuestIndex: number;
  currentQuestionIndex: number;
  // 현재 퀘스트가 시작되어 대화가 진행 중인지 여부.
  // false 이면 "시작 / 다음 퀘스트" 버튼을 눌러야 진행됩니다.
  questStarted: boolean;
  progress: Record<string, QuestProgress>;
  messages: ChatMessage[];
  finished: boolean;
}
