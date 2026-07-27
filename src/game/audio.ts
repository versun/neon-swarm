/**
 * NEON SWARM — Web Audio 合成音效引擎（design.md §12，无任何音频文件）
 *
 * | 事件     | 合成方式                                          |
 * |---------|---------------------------------------------------|
 * | 射击     | sawtooth 420→120Hz 下滑 + noise burst，90ms        |
 * | 命中     | square 180Hz blip + 快速低通，120ms                |
 * | 爆炸     | filtered noise 500ms + sine 160→45Hz               |
 * | 受击     | distorted triangle 90Hz，150ms                     |
 * | 重生     | sine 220→660Hz 上升 + shimmer delay，700ms         |
 * | 弹药不足 | 两个 1200Hz 短促 blip                              |
 * | UI hover| 2kHz 极短 tick，30ms                               |
 *
 * 防爆音：同类音效并发上限（射击 ≤6 同时发声），总线经主增益 + 轻压限。
 * AudioContext 需用户手势解锁 —— 复用 scaffold 的 audio-unlock 手势模式。
 */
import { unlockAudio } from "@/lib/audio-unlock";

const LS_VOLUME = "ns_volume";
const LS_MUTED = "ns_muted";

/** 同类音效同时发声上限 */
const VOICE_CAPS = {
  shoot: 6,
  hit: 4,
  hitconfirm: 4,
  killconfirm: 2,
  explosion: 3,
  hurt: 2,
  respawn: 2,
  noammo: 2,
  tick: 4,
} as const;

type SfxKind = keyof typeof VOICE_CAPS;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private voices: Record<SfxKind, number> = {
    shoot: 0,
    hit: 0,
    hitconfirm: 0,
    killconfirm: 0,
    explosion: 0,
    hurt: 0,
    respawn: 0,
    noammo: 0,
    tick: 0,
  };
  private lastPlayed: Record<SfxKind, number> = {
    shoot: 0,
    hit: 0,
    hitconfirm: 0,
    killconfirm: 0,
    explosion: 0,
    hurt: 0,
    respawn: 0,
    noammo: 0,
    tick: 0,
  };

  volume: number;
  muted: boolean;
  readonly supported: boolean;

  constructor() {
    this.supported =
      typeof window !== "undefined" &&
      (window.AudioContext !== undefined ||
        (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext !==
          undefined);
    const v = Number(localStorage.getItem(LS_VOLUME));
    this.volume = Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.7;
    this.muted = localStorage.getItem(LS_MUTED) === "1";
  }

  get unlocked(): boolean {
    return this.ctx !== null && this.ctx.state === "running";
  }

  /** 用户手势中调用。同时复用 scaffold 的 unlockAudio 保持 Navbar 音频状态一致。 */
  async unlock(): Promise<boolean> {
    if (!this.supported) return false;
    const ctx = this.ensureContext();
    if (!ctx) return false;
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        return false;
      }
    }
    // 同步 scaffold 的 AudioContext（Navbar / Home 的音效开关共用该状态）
    void unlockAudio();
    return ctx.state === "running";
  }

  setVolume(v: number) {
    this.volume = Math.min(1, Math.max(0, v));
    localStorage.setItem(LS_VOLUME, String(this.volume));
    this.applyMasterGain();
  }

  private setMuted(m: boolean) {
    this.muted = m;
    localStorage.setItem(LS_MUTED, m ? "1" : "0");
    this.applyMasterGain();
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  private applyMasterGain() {
    if (!this.master || !this.ctx) return;
    const target = this.muted ? 0 : this.volume * 0.32; // 音量克制（偏小）
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.03);
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    const master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 20;
    comp.ratio.value = 8;
    master.connect(comp).connect(ctx.destination);
    this.ctx = ctx;
    this.master = master;
    this.applyMasterGain();

    // 预生成 1s 白噪声缓冲（射击/爆炸复用）
    const len = ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
    return ctx;
  }

  /** 并发闸门：同类音效同时发声数 + 最小间隔 */
  private gate(kind: SfxKind, minIntervalMs: number): AudioContext | null {
    if (this.muted) return null;
    const ctx = this.ensureContext();
    if (!ctx || ctx.state !== "running" || !this.master) return null;
    const now = performance.now();
    if (now - this.lastPlayed[kind] < minIntervalMs) return null;
    if (this.voices[kind] >= VOICE_CAPS[kind]) return null;
    this.lastPlayed[kind] = now;
    this.voices[kind] += 1;
    return ctx;
  }

  private release(kind: SfxKind) {
    this.voices[kind] = Math.max(0, this.voices[kind] - 1);
  }

  /** 射击：sawtooth 420→120Hz 下滑 + noise burst，90ms（节流对齐 5 发/秒射速） */
  shoot() {
    const ctx = this.gate("shoot", 170);
    if (!ctx || !this.master || !this.noiseBuffer) return;
    const t = ctx.currentTime;
    const dur = 0.09;

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(420, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + dur);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.16, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(og).connect(this.master);

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1800;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.08, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    noise.connect(hp).connect(ng).connect(this.master);

    osc.start(t);
    osc.stop(t + dur + 0.02);
    noise.start(t);
    noise.stop(t + dur + 0.02);
    osc.onended = () => this.release("shoot");
  }

  /** 命中（旁观者听到的第三方命中）：square blip + noise snap + 低频 thump，更有打击感 */
  hit() {
    const ctx = this.gate("hit", 60);
    if (!ctx || !this.master || !this.noiseBuffer) return;
    const t = ctx.currentTime;
    const dur = 0.12;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = 180;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(2400, t);
    lp.frequency.exponentialRampToValueAtTime(400, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(lp).connect(g).connect(this.master);
    // 高频噪声"脆响"
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 2600;
    bp.Q.value = 0.8;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.12, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    noise.connect(bp).connect(ng).connect(this.master);
    // 低频冲击"咚"
    const thump = ctx.createOscillator();
    thump.type = "sine";
    thump.frequency.setValueAtTime(120, t);
    thump.frequency.exponentialRampToValueAtTime(65, t + 0.09);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.2, t);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    thump.connect(tg).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    noise.start(t);
    noise.stop(t + 0.07);
    thump.start(t);
    thump.stop(t + 0.12);
    osc.onended = () => this.release("hit");
  }

  /** 自己命中敌人：明亮确认的 "ding"（triangle 1240→880Hz + 高频 snap，70ms） */
  hitConfirm() {
    const ctx = this.gate("hitconfirm", 55);
    if (!ctx || !this.master || !this.noiseBuffer) return;
    const t = ctx.currentTime;
    const dur = 0.07;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(1240, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 4200;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.07, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    noise.connect(hp).connect(ng).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    noise.start(t);
    noise.stop(t + 0.05);
    osc.onended = () => this.release("hitconfirm");
  }

  /** 自己完成击杀：上行双音确认（square 520→780Hz，各 70ms） */
  killConfirm() {
    const ctx = this.gate("killconfirm", 250);
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = i === 0 ? 520 : 780;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2200;
      const g = ctx.createGain();
      const start = t + i * 0.08;
      g.gain.setValueAtTime(0.16, start);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.07);
      osc.connect(lp).connect(g).connect(this.master);
      osc.start(start);
      osc.stop(start + 0.09);
      if (i === 1) osc.onended = () => this.release("killconfirm");
    }
  }

  /** 爆炸：filtered noise 500ms + sine drop 160→45Hz */
  explosion() {
    const ctx = this.gate("explosion", 120);
    if (!ctx || !this.master || !this.noiseBuffer) return;
    const t = ctx.currentTime;
    const dur = 0.5;

    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(900, t);
    bp.frequency.exponentialRampToValueAtTime(140, t + dur);
    bp.Q.value = 0.9;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.42, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    noise.connect(bp).connect(ng).connect(this.master);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + dur);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.3, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(og).connect(this.master);

    noise.start(t);
    noise.stop(t + dur + 0.02);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    osc.onended = () => this.release("explosion");
  }

  /** 受击：distorted triangle 90Hz + 低通噪声碎裂声，150ms */
  hurt() {
    const ctx = this.gate("hurt", 150);
    if (!ctx || !this.master || !this.noiseBuffer) return;
    const t = ctx.currentTime;
    const dur = 0.15;

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = 90;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(128);
    for (let i = 0; i < 128; i++) {
      const x = (i / 127) * 2 - 1;
      curve[i] = Math.tanh(x * 4); // 软失真
    }
    shaper.curve = curve;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.34, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(shaper).connect(g).connect(this.master);
    // 碎裂噪声（装甲被撕裂的质感）
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(1400, t);
    lp.frequency.exponentialRampToValueAtTime(240, t + dur);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.2, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    noise.connect(lp).connect(ng).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    noise.start(t);
    noise.stop(t + dur + 0.02);
    osc.onended = () => this.release("hurt");
  }

  /** 重生：sine 220→660Hz 上升 + shimmer delay，700ms */
  respawn() {
    const ctx = this.gate("respawn", 300);
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const dur = 0.7;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(660, t + dur * 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    // shimmer：延迟反馈产生轻微闪烁尾音
    const delay = ctx.createDelay(0.3);
    delay.delayTime.value = 0.12;
    const fb = ctx.createGain();
    fb.gain.value = 0.28;
    const shimmerLp = ctx.createBiquadFilter();
    shimmerLp.type = "highpass";
    shimmerLp.frequency.value = 1200;
    delay.connect(fb).connect(shimmerLp).connect(delay);

    osc.connect(g).connect(this.master);
    g.connect(delay);
    shimmerLp.connect(this.master);

    osc.start(t);
    osc.stop(t + dur + 0.02);
    osc.onended = () => this.release("respawn");
  }

  /** 弹药不足：两个 1200Hz 短促 blip */
  noAmmo() {
    const ctx = this.gate("noammo", 400);
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = 1200;
      const g = ctx.createGain();
      const start = t + i * 0.09;
      g.gain.setValueAtTime(0.1, start);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.05);
      osc.connect(g).connect(this.master);
      osc.start(start);
      osc.stop(start + 0.07);
      if (i === 1) osc.onended = () => this.release("noammo");
    }
  }

  /** UI hover：2kHz 极短 tick，30ms */
  uiTick() {
    const ctx = this.gate("tick", 30);
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = 2000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.04);
    osc.onended = () => this.release("tick");
  }
}
