/**
 * NEON SWARM — 输入采集（键盘 / 鼠标 / 移动端触控）
 *
 * - WASD / 方向键 → ax/ay（归一化到 [-1,1]）
 * - 鼠标相对本机屏幕位置 → angle（由引擎每帧传入本机屏幕坐标换算）
 * - 左键 / Space → fire
 * - Tab 按住计分板、M 静音、Esc 菜单（经回调交给 React）
 * - 移动端：TouchControls 组件写入 joystick / touchAim / touchFire，
 *   getState 合并键鼠与触控状态。
 */

export interface InputState {
  ax: number;
  ay: number;
  angle: number;
  fire: 0 | 1;
}

export interface InputCallbacks {
  onScoreboard?: (visible: boolean) => void;
  onToggleMenu?: () => void;
  onToggleMute?: () => void;
  /** 任意首次手势（用于 AudioContext 解锁） */
  onFirstGesture?: () => void;
}

const KEY_MAP: Record<string, "up" | "down" | "left" | "right"> = {
  KeyW: "up",
  ArrowUp: "up",
  KeyS: "down",
  ArrowDown: "down",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
};

export class InputController {
  /** 鼠标屏幕坐标（CSS px，相对 canvas） */
  mouseX = 0;
  mouseY = 0;
  /** 触控摇杆向量（-1..1），由 TouchControls 写入 */
  joyX = 0;
  joyY = 0;
  joyActive = false;
  /** 触控瞄准角（rad），由 TouchControls 写入；null 表示未使用 */
  touchAim: number | null = null;
  touchFire = false;

  private keys = { up: false, down: false, left: false, right: false };
  private mouseFire = false;
  private spaceFire = false;
  private cb: InputCallbacks;
  private gestured = false;
  private attached = false;
  private target: HTMLElement | null = null;

  constructor(cb: InputCallbacks) {
    this.cb = cb;
  }

  attach(el: HTMLElement) {
    if (this.attached) return;
    this.attached = true;
    this.target = el;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    el.addEventListener("pointermove", this.onPointerMove);
    el.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointerup", this.onPointerUp);
    el.addEventListener("contextmenu", this.onContextMenu);
    window.addEventListener("blur", this.onBlur);
  }

  detach() {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.target?.removeEventListener("pointermove", this.onPointerMove);
    this.target?.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointerup", this.onPointerUp);
    this.target?.removeEventListener("contextmenu", this.onContextMenu);
    window.removeEventListener("blur", this.onBlur);
    this.target = null;
  }

  private firstGesture() {
    if (this.gestured) return;
    this.gestured = true;
    this.cb.onFirstGesture?.();
  }

  private onContextMenu = (e: Event) => e.preventDefault();

  private onBlur = () => {
    this.keys.up = this.keys.down = this.keys.left = this.keys.right = false;
    this.mouseFire = false;
    this.spaceFire = false;
  };

  private onKeyDown = (e: KeyboardEvent) => {
    // 输入框聚焦时不劫持按键
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    if (e.code === "Tab") {
      e.preventDefault();
      if (!e.repeat) this.cb.onScoreboard?.(true);
      return;
    }
    if (e.code === "Escape") {
      if (!e.repeat) this.cb.onToggleMenu?.();
      return;
    }
    if (e.code === "KeyM") {
      if (!e.repeat) this.cb.onToggleMute?.();
      return;
    }
    if (e.code === "Space") {
      e.preventDefault();
      this.spaceFire = true;
      this.firstGesture();
      return;
    }
    const dir = KEY_MAP[e.code];
    if (dir) {
      e.preventDefault();
      this.keys[dir] = true;
      this.firstGesture();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code === "Tab") {
      this.cb.onScoreboard?.(false);
      return;
    }
    if (e.code === "Space") {
      this.spaceFire = false;
      return;
    }
    const dir = KEY_MAP[e.code];
    if (dir) this.keys[dir] = false;
  };

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === "touch") return; // 触控由 TouchControls 处理
    const rect = this.target?.getBoundingClientRect();
    if (!rect) return;
    this.mouseX = e.clientX - rect.left;
    this.mouseY = e.clientY - rect.top;
  };

  private onPointerDown = (e: PointerEvent) => {
    this.firstGesture();
    if (e.pointerType === "touch") return;
    if (e.button === 0) this.mouseFire = true;
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    if (e.button === 0) this.mouseFire = false;
  };

  /**
   * 汇总当前帧输入。selfScreenX/Y 为本机屏幕坐标（用于鼠标瞄准角）。
   */
  getState(selfScreenX: number, selfScreenY: number): InputState {
    let ax = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
    let ay = (this.keys.down ? 1 : 0) - (this.keys.up ? 1 : 0);
    if (this.joyActive) {
      ax = this.joyX;
      ay = this.joyY;
    }
    const len = Math.hypot(ax, ay);
    if (len > 1) {
      ax /= len;
      ay /= len;
    }

    let angle: number;
    const joyMag = Math.hypot(this.joyX, this.joyY);
    if (this.joyActive && joyMag > 0.25) {
      // 移动端移动即转向：机头跟随摇杆方向（优先级高于右侧拖动瞄准）
      angle = Math.atan2(this.joyY, this.joyX);
    } else if (this.touchAim !== null) {
      angle = this.touchAim;
    } else {
      angle = Math.atan2(this.mouseY - selfScreenY, this.mouseX - selfScreenX);
    }

    const fire: 0 | 1 = this.mouseFire || this.spaceFire || this.touchFire ? 1 : 0;
    return { ax, ay, angle, fire };
  }
}
