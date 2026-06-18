import { useCallback, useRef, useState } from "react";

export type RecorderStatus = "idle" | "recording" | "unsupported" | "denied";

interface UseRecorder {
  status: RecorderStatus;
  isRecording: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => Promise<Blob | null>;
}

// 브라우저 MediaRecorder 래퍼. STT 전송용 오디오 Blob을 만듭니다.
export function useRecorder(): UseRecorder {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const supported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined";

  const start = useCallback(async () => {
    setError(null);
    if (!supported) {
      setStatus("unsupported");
      setError("이 브라우저는 음성 녹음을 지원하지 않아요. 텍스트로 답변해 주세요.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start();
      recorderRef.current = recorder;
      setStatus("recording");
    } catch (err) {
      setStatus("denied");
      setError(
        err instanceof Error
          ? `마이크 사용 불가: ${err.message}`
          : "마이크 권한을 사용할 수 없어요."
      );
    }
  }, [supported]);

  const stop = useCallback(async (): Promise<Blob | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      setStatus("idle");
      return null;
    }

    return new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => {
        const type = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setStatus("idle");
        resolve(blob.size > 0 ? blob : null);
      };
      recorder.stop();
    });
  }, []);

  return {
    status,
    isRecording: status === "recording",
    error,
    start,
    stop,
  };
}
