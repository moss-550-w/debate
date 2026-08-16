# ============================
# CloudBase 云托管 部署 Dockerfile
# ============================

FROM node:18-alpine AS runtime

LABEL maintainer="debate-trainer"
LABEL description="英语辩论能力训练平台后端"

# 工作目录
WORKDIR /app

# 安装依赖（仅 package.json/package-lock.json 先复制，便于层缓存）
COPY backend/package.json ./
RUN npm install --omit=dev --no-audit --no-fund || npm install --production --no-audit --no-fund

# 复制整个后端源码
COPY backend/ ./

# 端口（云托管会映射 80 到这个服务端口的内部网络，这里固定暴露3000）
EXPOSE 3000

# 默认启动命令，兼容 PORT 环境变量
CMD ["node", "src/app.js"]
