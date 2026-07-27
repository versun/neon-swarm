# NEON SWARM / 霓虹蜂群

打开网页、5 秒后自动参战的赛博朋克多人太空射击游戏。无需注册，真人不足时 Bot 自动补位，支持桌面（键鼠）与移动端（触控）。

## 玩法

- **惯性飞行**：推进加速 + 指数阻尼，速度有上限，转向有惯性
- **射击对战**：单发 1 点伤害、15 发击毁；命中敌机可为开火者回复生命
- **弹药管理**：上限 50 发，随时间自动恢复
- **升级系统**：累计命中触发升级（四选一窗口，超时服务器代选）——弹速 / 移速 / 生命 / 双重射击（限选一次）/ 弹药回复 / 生命回复
- **3 秒重生**：锚定存活战机附近重新入场，保持战场节奏
- **动态世界**：初始 4000px 半径，玩家接近边界时世界自动扩展
- **Bot 补位**：战场最少保持 10 个战斗单位，Bot 更慢、更迟钝、瞄不准
- **永久积分榜**：以昵称为唯一键记录最高击杀数，持久化到 MySQL（无数据库时降级为内存模式）
- **中英双语**：界面语言跟随浏览器，可手动切换

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 19 · Vite 7 · TypeScript · Tailwind CSS · shadcn/ui · GSAP / Framer Motion · Lenis |
| 渲染 | Canvas 2D（60fps rAF，快照插值 + 本机客户端预测 + 子弹外推） |
| 音效 | Web Audio 合成音效（无任何音频文件） |
| 服务端 | Hono（Node）· tRPC 11 · ws（WebSocket） |
| 数据 | Drizzle ORM · MySQL（mysql2，PlanetScale 模式） |
| 部署 | Docker 多阶段构建，单进程同时服务静态文件、API 与 WebSocket |

### 网络协议

- WebSocket 路径 `/ws`，消息为紧凑 JSON 数组（契约定义在 `contracts/game.ts`，前后端共享）
- **服务端权威**：20Hz 逻辑模拟，15Hz 快照广播；客户端 60fps 插值渲染
- 客户端输入限流 30Hz；应用层 ping/pong 测 RTT，协议层心跳 30s

## 快速开始

```bash
npm install
npm run dev        # http://localhost:3000（Vite dev server 同时挂载游戏 WebSocket）
```

积分榜持久化需要 MySQL，在项目根目录创建 `.env`：

```bash
DATABASE_URL="mysql://user:password@host:3306/neon_swarm"
```

不配 `DATABASE_URL` 也能玩：开发环境下积分榜自动降级为内存模式，重启即清空。

```bash
npm run db:push    # 将 drizzle schema 推送到数据库（创建 game_scores 表）
```

## 生产部署

```bash
npm run build      # vite build（前端 → dist/public）+ esbuild（api/boot.ts → dist/boot.js）
npm start          # NODE_ENV=production node dist/boot.js，端口由 PORT 注入（默认 3000）
```

或使用 Docker（多阶段构建，单容器运行）：

```bash
docker build -t neon-swarm .
docker run -p 3000:3000 -e DATABASE_URL="mysql://..." neon-swarm
```

生产环境必填环境变量：`DATABASE_URL`；`PORT` 可选（默认 3000）。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动开发服务器（HMR + 游戏 WebSocket） |
| `npm run build` | 构建前端静态文件与服务端 bundle |
| `npm start` | 运行生产构建 |
| `npm run check` | TypeScript 类型检查 |
| `npm run lint` | ESLint |
| `npm run format` | Prettier 格式化 |
| `npm test` | Vitest（暂无测试用例） |
| `npm run db:generate` / `db:migrate` / `db:push` | Drizzle 迁移管理 |

## 目录结构

```
api/            服务端（Hono）
  boot.ts       入口：tRPC 路由、静态文件、生产模式挂载游戏服务器
  game/         游戏服务端：server.ts（WebSocket 层）、sim.ts（权威模拟）、
                bots.ts（Bot AI）、leaderboard.ts（积分榜持久化）
contracts/      前后端共享协议契约（消息格式、常量、升级位打包）
db/             Drizzle schema（game_scores 积分榜表）
src/
  game/         客户端游戏：engine（编排）、renderer（Canvas 2D）、net（网络）、
                interp（插值/预测）、input（键鼠/触控）、audio（合成音效）、hud/
  pages/        Home（营销落地页）与 Game（战场）
  components/   UI 组件（shadcn/ui + 首页 sections）
  i18n/         中英双语文案
public/         logo、keyart 等静态资源
Dockerfile      生产镜像（多阶段构建）
```
