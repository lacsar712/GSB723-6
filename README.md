# 代理平台

## 🛠 技术栈
- Frontend: React + Ant Design + Vite（Nginx 部署）
- Backend: Node.js 20 + Express.js + Sequelize ORM
- Database: MySQL 8.0
- Agent PHP: PHP 8.3 + Apache（agent.php）

## 🚀 启动指南 (How to Run)
1. 确保 Docker Desktop 已启动。
2. 在根目录执行：`docker compose up --build`
3. 等待容器启动完成...

## 🔗 服务地址 (Services)
- Frontend: http://localhost:3006
- Backend API: http://localhost:8006/api
- Agent PHP: http://localhost:8306/agent.php
- Database: localhost:5006 (user: root / pass: root123 / db: agent_platform_db)

## 🧪 测试账号
- Admin: admin / 123456
- Agent: agent-a / 123456

## ✅ Verification
1. 打开 Frontend（http://localhost:3006），点击“进入代理界面”。
2. 使用 `admin / 123456` 登录后，进入“代理管理”创建一个下级代理（填写卡密额度、优先级、可选绑定应用）。
3. 点击“查看上下级”，确认能看到上级链路 + 当前账号的树状下级结构。
4. 进入“卡密管理”，选择应用并生成卡密，确认弹窗展示卡密列表且额度扣减。
5. 打开 Agent PHP（http://localhost:8306/agent.php），登录后生成卡密并查看上级链路。

---

## 🐳 Docker 镜像源配置 (Docker Registry Configuration)

### 推荐配置（基于实际项目验证）

#### 1. Docker 镜像源
**使用官方 Docker Hub 镜像**（已验证稳定可用）

```yaml
# docker-compose.yml 示例
services:
  db:
    image: mysql:8.0

  backend:
    build: ./backend

  frontend:
    build: ./frontend
```

#### 2. npm 依赖源
**使用淘宝镜像**（国内访问快）

在 `Dockerfile` 中添加：
```dockerfile
RUN npm config set registry https://registry.npmmirror.com
```

#### 3. 前端构建加速规范 (Fast Build with npm ci)

为了极致的构建速度和依赖一致性，**必须**遵循以下流程：

1.  **本地预处理**: 在提交代码前，**必须**在本地运行一次 `npm install`（或 `yarn install`），确保 `package-lock.json`（或 `yarn.lock`）文件存在且是最新的。
2.  **锁文件提交**: **绝对严禁**在 `.gitignore` 中忽略锁文件。必须将锁文件提交至仓库，这是容器内高效构建的前提。
3.  **容器内安装**: 在 `Dockerfile` 中，必须使用 `npm ci` 代替 `npm install`。
    -   **优势**: `npm ci` 比 `npm install` 快 2-3 倍，且会根据锁文件进行 100% 确定性的安装，避免“本地能跑，容器报错”的灵异问题。
    -   **注意**: `npm ci` 要求工作目录必须存在 `package-lock.json`，否则会报错。

---

### 常用镜像推荐

| 技术栈 | 推荐镜像 | 说明 |
| :--- | :--- | :--- |
| MySQL | `mysql:8.0` | 数据库 |
| Node.js | `node:20-slim` | 前端/后端构建 |
| Nginx | `nginx:alpine` | 前端生产环境 |
| PHP | `php:8.3-apache` | agent.php 后台 |

### 配置示例

#### Node.js 项目 Dockerfile
```dockerfile
# 构建阶段
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm config set registry https://registry.npmmirror.com
RUN npm ci
COPY . .
RUN npm run build

# 生产阶段
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### 使用建议

1. ✅ **优先使用官方镜像**：稳定可靠，无需配置镜像代理
2. ✅ **使用 Alpine 版本**：镜像体积小，构建速度快
3. ✅ **配置 npm 淘宝源**：加速国内依赖下载
4. ✅ **多阶段构建**：减小最终镜像体积

### 常见问题

**Q: Docker 镜像拉取失败？**
A: 检查网络连接，确保 Docker Desktop 正常运行

**Q: npm install 很慢？**
A: 确保已配置淘宝镜像源：`npm config set registry https://registry.npmmirror.com`

**Q: 是否需要配置 Docker Hub 镜像加速器？**
A: 通常不需要，官方镜像可以直接拉取。如遇到问题再考虑配置

**Q: Docker端口冲突问题？**
A: 根据项目文件夹的名称进行设置，比如 `label-2006`：前端端口 `3006`，后端端口 `8006`
