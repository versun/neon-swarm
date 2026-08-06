/**
 * 轻量 i18n — 中 / 英双语。
 * useI18n() → { lang, setLang, t }；t(key, vars) 支持 {var} 插值。
 * 选择持久化到 localStorage（neon-swarm:lang），默认跟随浏览器语言。
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Lang = "zh" | "en";

const LANG_STORAGE_KEY = "neon-swarm:lang";

const zh = {
  // ── 导航 ──────────────────────────────
  "nav.lobby": "入口",
  "nav.combat": "战场",
  "nav.enter": "立即进入战场",
  "nav.brand": "霓虹蜂群",

  // ── 首页 Hero ─────────────────────────
  "hero.kicker": "多人联机 · 实时对战 · 同一战场",
  "hero.callsign": "呼号",
  "hero.stats": "生命 15 · 弹药 50 · 重生 3 秒 · 机器人 ×10",
  "hero.title1": "报上呼号。",
  "hero.title2": "即刻开战",
  "hero.sub": "同一片深空，所有人实时混战。",
  "hero.namePlaceholder": "你的昵称",
  "hero.join": "加入战斗",
  "hero.hint": "留空自动分配呼号 · {stats}",
  "hero.audioOn": "音效已开启",
  "hero.audioOff": "启用音效",
  "rules.r1.title": "随机涂装",
  "rules.r1.body": "入场随机分配霓虹色，一瞥辨敌我。",
  "rules.r2.title": "弹药有限",
  "rules.r2.body": "50 发弹药，每秒恢复 1 发，命中回血。",
  "rules.r3.title": "三秒重生",
  "rules.r3.body": "被击毁 3 秒后自动重返战场。",
  "rules.r4.title": "连续4发锁定",
  "rules.r4.body": "对同一敌机连续命中 4 发锁定目标 3 秒，子弹自动巡航追踪，锁定到期自动释放。",

  // ── 首页操作说明 ──────────────────────
  "controls.label": "操作方式",
  "controls.titleA": "操作只有三件事：",
  "controls.titleB": "移动、瞄准、开火",
  "controls.desktop": "桌面端 / 键鼠",
  "controls.mobile": "移动端 / 触控",
  "controls.k.arrows": "/ 方向键",
  "controls.k.mouse": "鼠标移动",
  "controls.k.lmb": "左键",
  "controls.k.space": "空格",
  "controls.k.stick": "左侧摇杆",
  "controls.k.drag": "右侧拖动",
  "controls.k.firebtn": "右下按钮",
  "controls.k.nozoom": "双指暂不支持缩放",
  "controls.a.move": "推进与平移",
  "controls.a.aimNose": "调整机首方向",
  "controls.a.fire": "发射子弹",
  "controls.a.score": "查看计分板",
  "controls.a.mute": "静音",
  "controls.a.menu": "打开战斗菜单",
  "controls.m.move": "移动",
  "controls.m.aim": "瞄准",
  "controls.m.fire": "射击",
  "controls.m.stable": "保持相机稳定",

  // ── 首页战机蓝图 ──────────────────────
  "bp.label": "战机系统",
  "bp.activePart": "当前部件",
  "bp.title": "战机系统蓝图",
  "bp.tab.hull": "机体",
  "bp.tab.weapon": "武器",
  "bp.tab.regen": "回复",
  "bp.tab.ident": "识别",
  "bp.hull.text":
    "简易三角战机，极速 300 px/s，推进带惯性滑行。没有复杂升级，没有装备差异；所有玩家使用同一套基础机体。",
  "bp.weapon.text":
    "子弹速度约 900 px/s，单发伤害 1，命中 15 发击毁。射速上限 5 发/秒，命中还能回血。",
  "bp.regen.text":
    "弹药上限 50，每秒恢复 1 发。每次命中敌机恢复 1 点 HP，重生后回到 15。",
  "bp.ident.text":
    "每名玩家分配随机霓虹色；本机有白色外发光，Bot 有 BOT 标签，战机下方显示红心血条与黄色弹药条。",
  "bp.hull.p1": "极速 300 像素/秒",
  "bp.hull.p2": "生命 15",
  "bp.hull.p3": "紧凑碰撞体",
  "bp.weapon.p1": "弹速 900 像素/秒",
  "bp.weapon.p2": "伤害 1",
  "bp.weapon.p3": "射速 ≤5 发/秒",
  "bp.regen.p1": "弹药 +1/秒",
  "bp.regen.p2": "弹药上限 50",
  "bp.regen.p3": "命中 +1 生命",
  "bp.ident.p1": "随机配色",
  "bp.ident.p2": "本机描边",
  "bp.ident.p3": "机器人标签",
  "bp.alt": "战机拆解蓝图",
  "bp.copy": "点击复制该条规则",
  "bp.aria": "战机系统",

  // ── 首页动态世界 ──────────────────────
  "world.label": "动态世界",
  "world.stage1": "初始半径 4000 像素",
  "world.stage2": "玩家接近边界 <800 像素",
  "world.stage3": "扩展 +2000 像素",
  "world.titleA": "同一片太空，",
  "world.titleB": "会随你向外生长",
  "world.lead":
    "世界从中心 (0,0) 开始，初始半径约 4000px。当玩家接近边界时，战场会沿对应方向扩展约 2000px。你不会被传送，也不会进入房间列表；所有战斗仍然发生在同一坐标系里。",
  "world.s1": "世界从中心 (0,0) 开始，初始半径约 4000px，足够十几架战机缠斗。",
  "world.s2": "任意玩家距离边界小于 800px 时，服务器检测到扩张触发。",
  "world.s3": "边界沿对应方向扩展约 2000px，霓虹网格线即新边界，没有实体墙。",
  "world.alt": "动态世界示意：中心初始世界圆环、扩展箭头与玩家航迹",

  // ── 战场：加入 / 连接 ──────────────────
  "game.joinTip": "输入昵称加入战场，留空则由系统分配呼号。",
  "game.namePlaceholder": "你的昵称（≤10 字符）",
  "game.join": "加入战斗",
  "game.stats": "15 HP · 50 AMMO · 命中 15 发击毁",
  "game.connecting": "正在接入共享深空战场",
  "game.failedTip": "无法接入战场，请检查网络后重试。",
  "game.reconnect": "重新连接",
  "game.home": "返回首页",
  "game.resync": "正在恢复战场同步",
  "game.online": "在线",
  "game.canvasFail": "当前浏览器无法启动战斗渲染，请更换现代浏览器。",

  // ── 战斗菜单 ──────────────────────────
  "menu.tab.controls": "控制",
  "menu.tab.display": "显示",
  "menu.tab.sound": "声音",
  "menu.tab.network": "网络",
  "menu.arrows": "WASD / 方向键",
  "menu.mouse": "鼠标",
  "menu.lmbSpace": "左键 / 空格",
  "menu.move": "移动",
  "menu.aim": "瞄准",
  "menu.fire": "射击",
  "menu.score": "计分板",
  "menu.mute": "静音",
  "menu.menu": "菜单",
  "menu.lowParticles": "降低粒子",
  "menu.shake": "屏幕震动",
  "menu.highContrast": "高对比 HUD",
  "menu.muteM": "静音（M）",
  "menu.volume": "主音量",
  "menu.serverTick": "服务器 TICK",
  "menu.snapshot": "快照频率",
  "menu.entities": "实体数",
  "menu.netNote": "网络参数为只读，由服务器统一调度。",
  "menu.resume": "继续战斗",
  "menu.language": "语言 LANGUAGE",

  // ── 战机升级 ──────────────────────────
  "up.title": "战机升级",
  "up.sub": "选择一项强化（超时随机选择）",
  "up.opt.bullet": "子弹速度 +5%",
  "up.opt.move": "移动速度 +5%",
  "up.opt.hp": "生命值 +5%",
  "up.opt.dual": "双枪",
  "up.opt.dual.desc": "每次齐射两发子弹，限选一次",
  "up.opt.ammoRegen": "子弹恢复 +1/秒",
  "up.opt.hpRegen": "生命恢复 +1/秒",
  "up.opt.lock": "锁定时间 +1秒",
  "up.taken": "已装备",
  "up.key": "按 {k} 选择",
  "hud.upg.bullet": "弹速+{n}%",
  "hud.upg.move": "移速+{n}%",
  "hud.upg.hp": "生命+{n}%",
  "hud.upg.dual": "双枪",
  "hud.upg.ammoRegen": "回弹+{n}/s",
  "hud.upg.hpRegen": "回血+{n}/s",
  "hud.upg.lock": "锁定+{n}s",
  "hud.upg.none": "未升级",
  "hud.hitsNext": "命中 {a}/{b}",
  "hud.kills": "击杀",

  // ── 积分榜 ────────────────────────────
  "sb.title": "蜂群积分榜",
  "sb.pilot": "飞行员",
  "sb.best": "最高击杀",
  "sb.status": "状态",
  "sb.online": "在线",
  "sb.empty": "还没有纪录——击杀敌机即可实时上榜",

  // ── 重生 / 播报 ────────────────────────
  "respawn.tip": "TIP: 拉开距离，等待弹药恢复",
  "ann.respawn": "战机已击毁，{s} 秒后重生",
  "ann.live": "HP {hp}，弹药 {ammo}",
  "ann.lowAmmo": "，弹药不足",
  "ann.join": "等待输入昵称并点击加入战斗",
  "ann.reconnecting": "连接中断，正在重连",
  "ann.failed": "连接失败",
  "ann.connecting": "正在接入战场",

  // ── 无障碍标签 ─────────────────────────
  "aria.name": "飞行员昵称",
  "aria.home": "NEON SWARM 首页",
  "aria.scoreboard": "打开计分板（按住 Tab）",
  "aria.scoreboardShort": "计分板",
  "aria.canvas": "实时太空战场画布",
  "aria.battleMenu": "战斗菜单",
  "aria.closeMenu": "关闭菜单",
  "aria.combatNav": "战斗导航",
  "aria.openCombatNav": "打开战斗导航",
  "aria.mute": "静音",
  "aria.unmute": "取消静音",
  "aria.respawn": "战机被击毁，{s} 秒后重生",
  "aria.online": "在线玩家 {p} 人，Bot {b} 个",
  "aria.ammo": "弹药 {a} / {max}",
  "aria.lowAmmo": "，弹药不足",
  "aria.ammoToggle": "点击切换 整数/百分比",
  "aria.radar": "雷达，当前范围 {r} 像素，点击切换",
  "aria.radarToggle": "点击切换雷达范围 NEAR / FAR",
  "aria.latency": "延迟 {rtt} 毫秒，实体 {n} 个",
  "aria.destroyed": "击毁",
  "aria.killfeed": "击杀流",
  "aria.killfeedExpand": "展开击杀流",
  "aria.killfeedCollapse": "折叠击杀流",
  "audio.mutedTitle": "MUTED（按 M 取消）",
  "audio.onlineTitle": "AUDIO ONLINE（按 M 静音）",
} as const;

export type I18nKey = keyof typeof zh;

const en: Record<I18nKey, string> = {
  "nav.lobby": "Lobby",
  "nav.combat": "Combat",
  "nav.enter": "ENTER COMBAT",
  "nav.brand": "NEON SWARM",

  "hero.kicker": "MULTIPLAYER · REALTIME · ONE BATTLEFIELD",
  "hero.callsign": "CALLSIGN",
  "hero.stats": "HP 15 · AMMO 50 · RESPAWN 3S · BOT ×10",
  "hero.title1": "State your callsign.",
  "hero.title2": "Fight now",
  "hero.sub": "One shared deep space. Everyone fights in real time.",
  "hero.namePlaceholder": "Your callsign",
  "hero.join": "JOIN BATTLE",
  "hero.hint": "Blank = auto callsign · {stats}",
  "hero.audioOn": "Sound on",
  "hero.audioOff": "Enable sound",
  "rules.r1.title": "Random Paint",
  "rules.r1.body": "A random neon color on entry — friend or foe at a glance.",
  "rules.r2.title": "Limited Ammo",
  "rules.r2.body": "50 rounds, +1 per second. Hits restore HP.",
  "rules.r3.title": "3s Respawn",
  "rules.r3.body": "Destroyed? You auto-respawn in 3 seconds.",
  "rules.r4.title": "4-Hit Lock-On",
  "rules.r4.body": "Land 4 consecutive hits on the same enemy to lock on for 3s — bullets home in until the lock expires.",

  "controls.label": "CONTROLS",
  "controls.titleA": "Only three things to learn: ",
  "controls.titleB": "move, aim, fire",
  "controls.desktop": "DESKTOP / Keyboard & Mouse",
  "controls.mobile": "MOBILE / Touch",
  "controls.k.arrows": "/ Arrow keys",
  "controls.k.mouse": "Mouse",
  "controls.k.lmb": "LMB",
  "controls.k.space": "SPACE",
  "controls.k.stick": "Left stick",
  "controls.k.drag": "Drag right side",
  "controls.k.firebtn": "Bottom-right button",
  "controls.k.nozoom": "No pinch zoom",
  "controls.a.move": "Thrust & move",
  "controls.a.aimNose": "Aim the nose",
  "controls.a.fire": "Fire bullets",
  "controls.a.score": "Scoreboard",
  "controls.a.mute": "Mute",
  "controls.a.menu": "Battle menu",
  "controls.m.move": "Move",
  "controls.m.aim": "Aim",
  "controls.m.fire": "Fire",
  "controls.m.stable": "Camera stays stable",

  "bp.label": "FIGHTER SYSTEMS",
  "bp.activePart": "ACTIVE PART",
  "bp.title": "Fighter Systems",
  "bp.tab.hull": "HULL",
  "bp.tab.weapon": "WEAPON",
  "bp.tab.regen": "REGEN",
  "bp.tab.ident": "IDENT",
  "bp.hull.text":
    "A simple delta fighter, top speed 300 px/s, with inertial drift. No upgrades, no loadouts — every pilot flies the same airframe.",
  "bp.weapon.text":
    "Bullets fly at ~900 px/s and deal 1 damage — 15 hits to kill. Fire rate caps at 5/s, and every hit heals you.",
  "bp.regen.text":
    "Ammo caps at 50 and regens +1 per second. Each hit on an enemy restores 1 HP; you respawn at full 15.",
  "bp.ident.text":
    "Every pilot gets a random neon color. Your ship glows white, bots carry a BOT tag, and each fighter shows a red HP bar and a yellow ammo bar below it.",
  "bp.hull.p1": "SPEED 300 PX/S",
  "bp.hull.p2": "HP 15",
  "bp.hull.p3": "COLLISION COMPACT",
  "bp.weapon.p1": "BULLET SPEED 900 PX/S",
  "bp.weapon.p2": "DAMAGE 1",
  "bp.weapon.p3": "RATE ≤5/S",
  "bp.regen.p1": "AMMO +1 / S",
  "bp.regen.p2": "MAX 50",
  "bp.regen.p3": "HIT +1 HP",
  "bp.ident.p1": "RANDOM COLOR",
  "bp.ident.p2": "SELF OUTLINE",
  "bp.ident.p3": "BOT TAG",
  "bp.alt": "Fighter anatomy blueprint",
  "bp.copy": "Click to copy",
  "bp.aria": "Fighter systems",

  "world.label": "DYNAMIC WORLD",
  "world.stage1": "INITIAL RADIUS 4000PX",
  "world.stage2": "PLAYER NEAR EDGE <800PX",
  "world.stage3": "EXPAND +2000PX",
  "world.titleA": "One shared space, ",
  "world.titleB": "growing as you push outward",
  "world.lead":
    "The world starts at the center (0,0) with a ~4000px radius. When a pilot nears the edge, the battlefield expands ~2000px in that direction. No teleporting, no room lists — every fight still happens in the same coordinate system.",
  "world.s1":
    "The world starts at the center (0,0) with a ~4000px radius — room for a dozen fighters to brawl.",
  "world.s2":
    "When any pilot gets within 800px of the edge, the server triggers an expansion.",
  "world.s3":
    "The border extends ~2000px in that direction. The neon grid is the new edge — no hard walls.",
  "world.alt":
    "Dynamic world diagram: initial world ring at center, expansion arrows and pilot trails",

  "game.joinTip": "Enter a callsign to join — leave blank for an auto-assigned one.",
  "game.namePlaceholder": "Your callsign (≤10 chars)",
  "game.join": "JOIN BATTLE",
  "game.stats": "15 HP · 50 AMMO · 15 HITS TO KILL",
  "game.connecting": "Connecting to the shared battlefield",
  "game.failedTip": "Can't reach the battlefield. Check your connection and retry.",
  "game.reconnect": "RECONNECT",
  "game.home": "BACK TO HOME",
  "game.resync": "Restoring battlefield sync",
  "game.online": "ONLINE",
  "game.canvasFail":
    "This browser can't start combat rendering. Please switch to a modern browser.",

  "menu.tab.controls": "CONTROLS",
  "menu.tab.display": "DISPLAY",
  "menu.tab.sound": "SOUND",
  "menu.tab.network": "NETWORK",
  "menu.arrows": "WASD / Arrows",
  "menu.mouse": "Mouse",
  "menu.lmbSpace": "LMB / SPACE",
  "menu.move": "Move",
  "menu.aim": "Aim",
  "menu.fire": "Fire",
  "menu.score": "Scoreboard",
  "menu.mute": "Mute",
  "menu.menu": "Menu",
  "menu.lowParticles": "Reduced particles",
  "menu.shake": "Screen shake",
  "menu.highContrast": "High-contrast HUD",
  "menu.muteM": "Mute (M)",
  "menu.volume": "Master volume",
  "menu.serverTick": "SERVER TICK",
  "menu.snapshot": "SNAPSHOT RATE",
  "menu.entities": "ENTITIES",
  "menu.netNote": "Read-only — managed by the server.",
  "menu.resume": "RESUME",
  "menu.language": "LANGUAGE 语言",

  "up.title": "FIGHTER UPGRADE",
  "up.sub": "Pick one boost (timeout = random)",
  "up.opt.bullet": "BULLET SPEED +5%",
  "up.opt.move": "MOVE SPEED +5%",
  "up.opt.hp": "MAX HP +5%",
  "up.opt.dual": "DUAL GUNS",
  "up.opt.dual.desc": "Fire two bullets per volley, one-time only",
  "up.opt.ammoRegen": "AMMO REGEN +1/S",
  "up.opt.hpRegen": "HP REGEN +1/S",
  "up.opt.lock": "LOCK DURATION +1S",
  "up.taken": "EQUIPPED",
  "up.key": "Press {k}",
  "hud.upg.bullet": "SPD+{n}%",
  "hud.upg.move": "MOV+{n}%",
  "hud.upg.hp": "HP+{n}%",
  "hud.upg.dual": "DUAL",
  "hud.upg.ammoRegen": "AMMO+{n}/S",
  "hud.upg.hpRegen": "REGEN+{n}/S",
  "hud.upg.lock": "LOCK+{n}S",
  "hud.upg.none": "STOCK",
  "hud.hitsNext": "HITS {a}/{b}",
  "hud.kills": "KILLS",

  "sb.title": "SWARM SCOREBOARD",
  "sb.pilot": "PILOT",
  "sb.best": "BEST KILLS",
  "sb.status": "STATUS",
  "sb.online": "ONLINE",
  "sb.empty": "No records yet — score a kill to post instantly",

  "respawn.tip": "TIP: Keep your distance while ammo regens",
  "ann.respawn": "Fighter destroyed, respawn in {s}s",
  "ann.live": "HP {hp}, ammo {ammo}",
  "ann.lowAmmo": ", low ammo",
  "ann.join": "Waiting for a callsign and join",
  "ann.reconnecting": "Connection lost, reconnecting",
  "ann.failed": "Connection failed",
  "ann.connecting": "Connecting to the battlefield",

  "aria.name": "Pilot callsign",
  "aria.home": "NEON SWARM home",
  "aria.scoreboard": "Open scoreboard (hold Tab)",
  "aria.scoreboardShort": "Scoreboard",
  "aria.canvas": "Realtime space battlefield canvas",
  "aria.battleMenu": "Battle menu",
  "aria.closeMenu": "Close menu",
  "aria.combatNav": "Combat navigation",
  "aria.openCombatNav": "Open combat navigation",
  "aria.mute": "Mute",
  "aria.unmute": "Unmute",
  "aria.respawn": "Fighter destroyed, respawn in {s} seconds",
  "aria.online": "{p} pilots online, {b} bots",
  "aria.ammo": "Ammo {a} / {max}",
  "aria.lowAmmo": ", low ammo",
  "aria.ammoToggle": "Click to toggle integer / percent",
  "aria.radar": "Radar, current range {r}px, click to switch",
  "aria.radarToggle": "Click to switch radar range NEAR / FAR",
  "aria.latency": "Latency {rtt}ms, {n} entities",
  "aria.destroyed": "destroyed",
  "aria.killfeed": "Kill feed",
  "aria.killfeedExpand": "Expand kill feed",
  "aria.killfeedCollapse": "Collapse kill feed",
  "audio.mutedTitle": "MUTED (press M to unmute)",
  "audio.onlineTitle": "AUDIO ONLINE (press M to mute)",
};

const DICT: Record<Lang, Record<I18nKey, string>> = { zh, en };

type I18nCtx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: I18nKey, vars?: Record<string, string | number>) => string;
};

const Ctx = createContext<I18nCtx | null>(null);

function detectInitialLang(): Lang {
  const saved = localStorage.getItem(LANG_STORAGE_KEY);
  if (saved === "zh" || saved === "en") return saved;
  return navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectInitialLang);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem(LANG_STORAGE_KEY, l);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);

  const t = useCallback(
    (key: I18nKey, vars?: Record<string, string | number>) => {
      let s: string = DICT[lang][key] ?? DICT.zh[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          s = s.replaceAll(`{${k}}`, String(v));
        }
      }
      return s;
    },
    [lang],
  );

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
