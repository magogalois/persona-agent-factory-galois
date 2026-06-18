import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEMO_ACCOUNTS, QUESTS } from "./quests";
import type {
  ChatMessage,
  DemoAccount,
  SessionState,
} from "./types";
import { evaluateAnswer, transcribeAudio } from "./api";
import { useRecorder } from "./useRecorder";

const STORAGE_KEY = "mago-onboarding-session-v1";

const TOTAL_QUESTIONS = QUESTS.reduce((sum, q) => sum + q.questions.length, 0);

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function createSession(accountId: string): SessionState {
  const firstQuest = QUESTS[0];
  const firstQuestion = firstQuest.questions[0];
  const progress: SessionState["progress"] = {};
  for (const quest of QUESTS) {
    progress[quest.id] = {
      questId: quest.id,
      scores: {},
      completed: false,
      earnedBadge: false,
    };
  }
  return {
    accountId,
    currentQuestIndex: 0,
    currentQuestionIndex: 0,
    progress,
    finished: false,
    messages: [
      {
        id: uid(),
        role: "system",
        text: `${firstQuest.title} 을 시작합니다. ${firstQuest.description}`,
        createdAt: Date.now(),
      },
      {
        id: uid(),
        role: "agent",
        text: `안녕하세요! Mago 온보딩 코치예요. 첫 번째 질문이에요.\n\n${firstQuestion.text}`,
        createdAt: Date.now(),
      },
    ],
  };
}

function loadSession(): SessionState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionState;
    if (!parsed.accountId || !Array.isArray(parsed.messages)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export default function App() {
  const [session, setSession] = useState<SessionState | null>(() => loadSession());
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const recorder = useRecorder();
  const scrollRef = useRef<HTMLDivElement>(null);
  // 자동 마이크: 어떤 질문에서 이미 자동 시작했는지 추적하고, 마이크 사용 불가 시 중단.
  const autoMicKeyRef = useRef<string | null>(null);
  const autoMicBlockedRef = useRef(false);

  useEffect(() => {
    if (session) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    }
  }, [session]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [session?.messages.length]);

  const account = useMemo<DemoAccount | null>(
    () => DEMO_ACCOUNTS.find((a) => a.id === session?.accountId) ?? null,
    [session?.accountId]
  );

  const currentQuest = session ? QUESTS[session.currentQuestIndex] : null;
  const currentQuestion =
    currentQuest && session
      ? currentQuest.questions[session.currentQuestionIndex]
      : null;

  // 현재 질문 식별자 (질문이 바뀌면 값이 바뀜). 완료/세션없음이면 null.
  const questionKey =
    session && !session.finished
      ? `${session.currentQuestIndex}-${session.currentQuestionIndex}`
      : null;

  // AI 가 새 질문을 제시하면 곧바로 음성 입력을 할 수 있도록 마이크를 자동으로 켭니다.
  useEffect(() => {
    if (!questionKey) return;
    if (autoMicBlockedRef.current) return;
    if (busy || recorder.isRecording) return;
    if (autoMicKeyRef.current === questionKey) return;
    // 마이크 미지원/권한 거부 상태면 자동 시작을 멈춥니다 (수동 버튼은 계속 사용 가능).
    if (recorder.status === "unsupported" || recorder.status === "denied") {
      autoMicBlockedRef.current = true;
      return;
    }
    autoMicKeyRef.current = questionKey;
    setStatusNote("🎙️ 마이크가 켜졌어요. 답변을 말한 뒤 '녹음 중지'를 누르면 자동 제출됩니다.");
    void recorder.start();
  }, [questionKey, busy, recorder.isRecording, recorder.status, recorder.start]);

  const answeredCount = useMemo(() => {
    if (!session) return 0;
    return Object.values(session.progress).reduce(
      (sum, p) => sum + Object.keys(p.scores).length,
      0
    );
  }, [session]);

  const progressPercent = Math.round((answeredCount / TOTAL_QUESTIONS) * 100);

  const earnedBadges = useMemo(() => {
    if (!session) return [];
    return QUESTS.filter((q) => session.progress[q.id]?.earnedBadge);
  }, [session]);

  const selectAccount = useCallback((acc: DemoAccount) => {
    autoMicKeyRef.current = null;
    autoMicBlockedRef.current = false;
    setSession(createSession(acc.id));
    setAnswer("");
    setStatusNote(null);
  }, []);

  const resetDemo = useCallback(() => {
    autoMicKeyRef.current = null;
    autoMicBlockedRef.current = false;
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
    setAnswer("");
    setStatusNote(null);
  }, []);

  const appendMessages = useCallback(
    (prev: SessionState, msgs: ChatMessage[]): ChatMessage[] => [
      ...prev.messages,
      ...msgs,
    ],
    []
  );

  const submitAnswer = useCallback(
    async (text: string, viaVoice: boolean) => {
      if (!session || !account || !currentQuest || !currentQuestion) return;
      const trimmed = text.trim();
      if (!trimmed || busy) return;

      setBusy(true);
      setStatusNote("답변을 평가하고 있어요...");

      const userMsg: ChatMessage = {
        id: uid(),
        role: "user",
        text: trimmed,
        viaVoice,
        createdAt: Date.now(),
      };

      const evaluation = await evaluateAnswer({
        account,
        quest: currentQuest,
        question: currentQuestion,
        answer: trimmed,
        questionIndex: session.currentQuestionIndex,
      });

      setSession((prev) => {
        if (!prev) return prev;
        const quest = QUESTS[prev.currentQuestIndex];
        const question = quest.questions[prev.currentQuestionIndex];

        const questProgress = {
          ...prev.progress[quest.id],
          scores: {
            ...prev.progress[quest.id].scores,
            [question.id]: evaluation.score,
          },
        };

        const feedbackLines: string[] = [
          `평가 점수: ${evaluation.score} / 2 (${
            evaluation.source === "openai" ? "OpenAI" : "로컬 평가"
          })`,
          evaluation.feedback,
        ];
        if (evaluation.strengths.length > 0) {
          feedbackLines.push(`잘한 점: ${evaluation.strengths.join(", ")}`);
        }
        if (evaluation.improvements.length > 0) {
          feedbackLines.push(`보완할 점: ${evaluation.improvements.join(", ")}`);
        }

        const agentFeedback: ChatMessage = {
          id: uid(),
          role: "agent",
          text: feedbackLines.join("\n"),
          evaluation,
          createdAt: Date.now(),
        };

        const isLastQuestion =
          prev.currentQuestionIndex >= quest.questions.length - 1;

        const newProgress = { ...prev.progress, [quest.id]: questProgress };
        const extraMessages: ChatMessage[] = [userMsg, agentFeedback];

        if (!isLastQuestion) {
          const nextQuestion = quest.questions[prev.currentQuestionIndex + 1];
          extraMessages.push({
            id: uid(),
            role: "agent",
            text: `다음 질문이에요 (${prev.currentQuestionIndex + 2}/${
              quest.questions.length
            }).\n\n${nextQuestion.text}`,
            createdAt: Date.now(),
          });
          return {
            ...prev,
            progress: newProgress,
            currentQuestionIndex: prev.currentQuestionIndex + 1,
            messages: appendMessages(prev, extraMessages),
          };
        }

        // 퀘스트의 마지막 질문 처리: 누적 점수로 배지 판정.
        const total = Object.values(questProgress.scores).reduce(
          (s, v) => s + v,
          0
        );
        const passed = total >= quest.passingScore;
        questProgress.completed = true;
        questProgress.earnedBadge = passed;
        newProgress[quest.id] = questProgress;

        extraMessages.push({
          id: uid(),
          role: "system",
          text: passed
            ? `🎉 "${quest.title}" 완료! 누적 ${total}점으로 배지 "${quest.badgeEmoji} ${quest.badge}" 를 획득했어요.`
            : `"${quest.title}" 의 질문을 모두 마쳤어요. 누적 ${total}점 (배지 기준 ${quest.passingScore}점). 배지는 다음 기회에 다시 도전해 보세요!`,
          createdAt: Date.now(),
        });

        const isLastQuest = prev.currentQuestIndex >= QUESTS.length - 1;
        if (isLastQuest) {
          extraMessages.push({
            id: uid(),
            role: "agent",
            text: "모든 퀘스트를 완료했어요! 오른쪽에서 진행률과 획득 배지를 확인하세요. 수고하셨습니다 👏",
            createdAt: Date.now(),
          });
          return {
            ...prev,
            progress: newProgress,
            finished: true,
            messages: appendMessages(prev, extraMessages),
          };
        }

        const nextQuest = QUESTS[prev.currentQuestIndex + 1];
        extraMessages.push({
          id: uid(),
          role: "system",
          text: `${nextQuest.title} 을 시작합니다. ${nextQuest.description}`,
          createdAt: Date.now(),
        });
        extraMessages.push({
          id: uid(),
          role: "agent",
          text: `새 퀘스트의 첫 질문이에요 (1/${nextQuest.questions.length}).\n\n${nextQuest.questions[0].text}`,
          createdAt: Date.now(),
        });

        return {
          ...prev,
          progress: newProgress,
          currentQuestIndex: prev.currentQuestIndex + 1,
          currentQuestionIndex: 0,
          messages: appendMessages(prev, extraMessages),
        };
      });

      setAnswer("");
      setBusy(false);
      setStatusNote(null);
    },
    [session, account, currentQuest, currentQuestion, busy, appendMessages]
  );

  const handleTextSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      void submitAnswer(answer, false);
    },
    [answer, submitAnswer]
  );

  const handleVoiceToggle = useCallback(async () => {
    if (busy) return;
    if (recorder.isRecording) {
      setStatusNote("음성을 텍스트로 변환하고 있어요...");
      const blob = await recorder.stop();
      if (!blob) {
        setStatusNote(null);
        return;
      }
      setBusy(true);
      const result = await transcribeAudio(blob);
      setBusy(false);
      if (result.ok) {
        // 인식이 끝나면 결과를 입력란에 보여주고 곧바로 자동 제출합니다.
        setAnswer(result.text);
        setStatusNote("음성 인식 완료! 자동으로 제출합니다.");
        await submitAnswer(result.text, true);
      } else {
        setStatusNote(
          `음성 인식에 실패했어요 (${result.error ?? "원인 미상"}). 텍스트로 답변해 주세요.`
        );
      }
    } else {
      setStatusNote(null);
      await recorder.start();
    }
  }, [busy, recorder, submitAnswer]);

  const showSample = useCallback(() => {
    if (currentQuestion) {
      setAnswer(currentQuestion.sampleAnswer);
      setStatusNote("예시 답변을 입력란에 채웠어요. 수정해서 제출해도 좋아요.");
    }
  }, [currentQuestion]);

  if (!session || !account) {
    return <AccountPicker onSelect={selectAccount} />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">🎧</span>
          <div>
            <h1>Mago 온보딩 음성 AI Agent</h1>
            <p className="brand-sub">신규 입사자 온보딩 데모</p>
          </div>
        </div>
        <div className="topbar-actions">
          <div className="account-chip">
            <span className="account-emoji">{account.emoji}</span>
            <div>
              <strong>{account.name}</strong>
              <span className="account-role">
                {account.role} · {account.team}
              </span>
            </div>
          </div>
          <button className="ghost-btn" onClick={resetDemo}>
            데모 종료
          </button>
        </div>
      </header>

      <main className="layout">
        <section className="chat-panel">
          <div className="chat-scroll" ref={scrollRef}>
            {session.messages.map((m) => (
              <MessageBubble key={m.id} message={m} accountEmoji={account.emoji} />
            ))}
          </div>

          {statusNote && <div className="status-note">{statusNote}</div>}
          {recorder.error && (
            <div className="status-note warn">{recorder.error}</div>
          )}

          {!session.finished ? (
            <form className="composer" onSubmit={handleTextSubmit}>
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="텍스트로 답변하거나 마이크 버튼으로 음성 답변하세요."
                rows={3}
                disabled={busy}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    handleTextSubmit(e);
                  }
                }}
              />
              <div className="composer-actions">
                <button
                  type="button"
                  className={`mic-btn ${recorder.isRecording ? "recording" : ""}`}
                  onClick={handleVoiceToggle}
                  disabled={busy && !recorder.isRecording}
                  title="음성 녹음"
                >
                  {recorder.isRecording ? "■ 녹음 중지" : "🎙️ 음성"}
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={showSample}
                  disabled={busy}
                >
                  예시 보기
                </button>
                <button
                  type="submit"
                  className="primary-btn"
                  disabled={busy || !answer.trim()}
                >
                  {busy ? "평가 중..." : "답변 제출"}
                </button>
              </div>
            </form>
          ) : (
            <div className="finished-banner">
              <p>🏁 모든 퀘스트를 완료했어요!</p>
              <button className="primary-btn" onClick={resetDemo}>
                새 데모 시작
              </button>
            </div>
          )}
        </section>

        <aside className="side-panel">
          <ProgressCard
            answeredCount={answeredCount}
            progressPercent={progressPercent}
            earnedBadgeCount={earnedBadges.length}
          />

          <div className="card">
            <h2>퀘스트</h2>
            <ol className="quest-list">
              {QUESTS.map((quest, idx) => {
                const p = session.progress[quest.id];
                const total = Object.values(p.scores).reduce((s, v) => s + v, 0);
                const isCurrent = idx === session.currentQuestIndex && !session.finished;
                const state = p.completed
                  ? p.earnedBadge
                    ? "done"
                    : "partial"
                  : isCurrent
                  ? "current"
                  : "locked";
                return (
                  <li key={quest.id} className={`quest-item ${state}`}>
                    <div className="quest-item-head">
                      <span className="quest-emoji">{quest.badgeEmoji}</span>
                      <span className="quest-title">{quest.title}</span>
                    </div>
                    <div className="quest-meta">
                      {p.completed
                        ? `${total} / ${quest.questions.length * 2}점 · ${
                            p.earnedBadge ? "배지 획득" : "배지 미획득"
                          }`
                        : isCurrent
                        ? `진행 중 · 질문 ${session.currentQuestionIndex + 1}/${quest.questions.length}`
                        : "대기 중"}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="card">
            <h2>획득 배지</h2>
            {earnedBadges.length === 0 ? (
              <p className="muted">아직 배지가 없어요. 퀘스트를 완료해 보세요!</p>
            ) : (
              <div className="badge-grid">
                {earnedBadges.map((q) => (
                  <div key={q.id} className="badge">
                    <span className="badge-emoji">{q.badgeEmoji}</span>
                    <span className="badge-name">{q.badge}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}

function AccountPicker({ onSelect }: { onSelect: (acc: DemoAccount) => void }) {
  return (
    <div className="picker">
      <div className="picker-inner">
        <span className="brand-mark big">🎧</span>
        <h1>Mago 온보딩 음성 AI Agent</h1>
        <p className="picker-sub">
          데모 계정을 선택하면 온보딩 퀘스트가 시작됩니다. 텍스트 또는 음성으로
          답변할 수 있어요.
        </p>
        <div className="account-grid">
          {DEMO_ACCOUNTS.map((acc) => (
            <button
              key={acc.id}
              className="account-card"
              onClick={() => onSelect(acc)}
            >
              <span className="account-card-emoji">{acc.emoji}</span>
              <strong>{acc.name}</strong>
              <span className="account-card-role">{acc.role}</span>
              <span className="account-card-team">{acc.team} 팀</span>
            </button>
          ))}
        </div>
        <p className="picker-foot">
          총 {QUESTS.length}개 퀘스트 · {TOTAL_QUESTIONS}개 질문
        </p>
      </div>
    </div>
  );
}

function ProgressCard({
  answeredCount,
  progressPercent,
  earnedBadgeCount,
}: {
  answeredCount: number;
  progressPercent: number;
  earnedBadgeCount: number;
}) {
  return (
    <div className="card progress-card">
      <h2>진행률</h2>
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      <div className="progress-stats">
        <span>{progressPercent}%</span>
        <span>
          {answeredCount}/{TOTAL_QUESTIONS} 질문
        </span>
        <span>배지 {earnedBadgeCount}/{QUESTS.length}</span>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  accountEmoji,
}: {
  message: ChatMessage;
  accountEmoji: string;
}) {
  if (message.role === "system") {
    return <div className="system-msg">{message.text}</div>;
  }
  const isUser = message.role === "user";
  return (
    <div className={`msg-row ${isUser ? "user" : "agent"}`}>
      <div className="msg-avatar">{isUser ? accountEmoji : "🤖"}</div>
      <div className="msg-bubble">
        {message.viaVoice && <span className="voice-tag">🎙️ 음성</span>}
        {message.text.split("\n").map((line, i) => (
          <p key={i}>{line || "\u00A0"}</p>
        ))}
        {message.evaluation && (
          <div className={`score-pill score-${message.evaluation.score}`}>
            {message.evaluation.score} / 2
          </div>
        )}
      </div>
    </div>
  );
}
