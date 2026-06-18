// 브라우저 녹음을 16kHz mono PCM(Float32) 으로 디코드/리샘플하는 공용 유틸.
// WAV 인코더가 사용합니다.

export const TARGET_SAMPLE_RATE = 16000;

type AudioCtxCtor = typeof AudioContext;

function getAudioContextCtor(): AudioCtxCtor | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: AudioCtxCtor }).webkitAudioContext ||
    null
  );
}

export function isAudioDecodeSupported(): boolean {
  return getAudioContextCtor() !== null && typeof OfflineAudioContext !== "undefined";
}

// 녹음 Blob -> 16kHz mono Float32 샘플.
export async function decodeToMono16k(blob: Blob): Promise<Float32Array> {
  const Ctor = getAudioContextCtor();
  if (!Ctor) throw new Error("AudioContext 미지원");

  const arrayBuf = await blob.arrayBuffer();
  const ctx = new Ctor();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
  } finally {
    void ctx.close();
  }

  const frameCount = Math.max(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, frameCount, TARGET_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}
