/**
 * Minimal browser-audio unlock helper for the landing page.
 *
 * Browsers require a user gesture before an AudioContext can start.
 * The full synthesized SFX engine (design.md §12) is owned by the game
 * agents — this module ONLY handles the unlock gesture + a tiny UI tick
 * used by the Navbar / Home "启用音效" controls.
 */

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

/** Call from a user gesture. Returns true when audio is running. */
export async function unlockAudio(): Promise<boolean> {
  const ac = getContext();
  if (!ac) return false;
  if (ac.state === "suspended") {
    try {
      await ac.resume();
    } catch {
      return false;
    }
  }
  return ac.state === "running";
}

export function isAudioUnlocked(): boolean {
  return ctx !== null && ctx.state === "running";
}

/** 30ms 2kHz terminal tick — UI hover/confirm feedback (design.md §12). */
export function playUiTick(frequency = 2000, durationMs = 30): void {
  const ac = getContext();
  if (!ac || ac.state !== "running") return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "square";
  osc.frequency.value = frequency;
  const t = ac.currentTime;
  const dur = durationMs / 1000;
  gain.gain.setValueAtTime(0.08, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.01);
}

/** Short two-tone confirmation after enabling audio. */
export function playConfirm(): void {
  playUiTick(1320, 60);
  window.setTimeout(() => playUiTick(1980, 90), 90);
}

// ── 首页深空氛围低鸣（极小音量，勿喧宾夺主） ──
let ambient: { stop: () => void } | null = null;

/** 双失谐低音 + 高泛音微光 + 12s 滤波呼吸，2.5s 淡入到 ~0.045 */
export function startAmbient(): void {
  const ac = getContext();
  if (!ac || ac.state !== "running" || ambient) return;
  const t = ac.currentTime;
  const master = ac.createGain();
  master.gain.setValueAtTime(0, t);
  master.gain.linearRampToValueAtTime(0.045, t + 2.5);
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 320;
  const lfo = ac.createOscillator();
  lfo.frequency.value = 1 / 12;
  const lfoGain = ac.createGain();
  lfoGain.gain.value = 100;
  lfo.connect(lfoGain).connect(lp.frequency);
  const oscA = ac.createOscillator();
  oscA.type = "sine";
  oscA.frequency.value = 55; // A1 基频
  const oscB = ac.createOscillator();
  oscB.type = "sine";
  oscB.frequency.value = 82.6; // E2 五度
  const oscC = ac.createOscillator();
  oscC.type = "triangle";
  oscC.frequency.value = 220.2; // 微弱高泛音
  const gC = ac.createGain();
  gC.gain.value = 0.12;
  oscC.connect(gC).connect(lp);
  oscA.connect(lp);
  oscB.connect(lp);
  lp.connect(master).connect(ac.destination);
  lfo.start(t);
  oscA.start(t);
  oscB.start(t);
  oscC.start(t);
  ambient = {
    stop: () => {
      const tt = ac.currentTime;
      master.gain.setTargetAtTime(0, tt, 0.3);
      window.setTimeout(() => {
        [oscA, oscB, oscC, lfo].forEach((o) => o.stop());
      }, 1200);
      ambient = null;
    },
  };
}

export function stopAmbient(): void {
  ambient?.stop();
}
