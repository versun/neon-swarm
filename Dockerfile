# NEON SWARM — 生产镜像（多阶段构建）
#
# 产物布局：
#   dist/public/  前端静态文件（vite build，含 index.html）
#   dist/boot.js  服务端 bundle（esbuild 打包 api/boot.ts，含全部依赖）
# 运行：NODE_ENV=production node dist/boot.js（端口由平台注入 PORT，默认 3000）

# ── 构建阶段：完整依赖（vite/esbuild 在 devDependencies） ──
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── 运行阶段：仅生产依赖 + 构建产物 ──
FROM node:20-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
# boot.js 虽已 bundle，但保留生产依赖以覆盖动态 require（如 mysql2 可选组件）
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/boot.js"]
