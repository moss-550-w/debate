# ============================
# CloudBase 云托管 部署 Dockerfile
# ============================

FROM node:18-slim AS runtime

LABEL maintainer="debate-trainer"
LABEL description="英语辩论能力训练平台后端"

# 工作目录
WORKDIR /app

# 先复制依赖清单，确保每次云端构建使用同一依赖树
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# 复制整个后端源码
COPY backend/ ./

# 端口（云托管会映射 80 到这个服务端口的内部网络，这里固定暴露3000）
EXPOSE 3000

# 默认启动命令，兼容 PORT 环境变量
CMD ["node", "src/app.js"]
