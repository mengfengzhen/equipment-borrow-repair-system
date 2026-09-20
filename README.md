# 设备借用与维修管理系统

一个面向全栈工程师面试演示的设备资产、借用审批、领取归还、维修处理和统计分析系统。

## 技术栈

- 前端：React、TypeScript、Vite、Ant Design
- 后端：NestJS、TypeScript、Prisma
- 数据库：SQLite，本地演示无需安装数据库服务

## 本地启动

```bash
npm install
npm run setup
npm run dev
```

访问地址：

- 前端：http://localhost:5173
- 后端：http://localhost:3000/api
- Swagger：http://localhost:3000/docs

## 单链接生产演示

构建后，后端会托管前端打包产物。此时只需要打开后端地址即可访问完整系统。

```bash
npm run build
npm start
```

访问地址：

- 系统页面：http://localhost:3000
- API 前缀：http://localhost:3000/api
- Swagger：http://localhost:3000/docs

前端路由和后端接口已经分离：页面路由使用 `/devices`、`/borrows` 等路径，接口统一使用 `/api/*`，便于后续部署成一个线上链接。

## 演示账号

| 账号 | 密码 | 角色 |
| --- | --- | --- |
| admin | admin123 | 管理员 |
| manager | manager123 | 部门负责人 |
| user | user123 | 普通用户 |
| user2 | user123 | 普通用户 |
| repair | repair123 | 维修人员 |
| repair2 | repair123 | 维修人员 |

## 推荐演示流程

1. 管理员新增设备。
2. 普通用户申请借用设备。
3. 部门负责人审批通过。
4. 管理员确认领取。
5. 管理员登记异常归还。
6. 系统自动生成维修任务。
7. 维修人员完成维修。
8. 查看设备状态、历史记录、统计和操作日志。

## Railway 线上部署

当前项目已经按单服务部署整理：构建前端后，NestJS 后端会同时提供页面和 API。适合直接部署到 Railway Free Trial，给面试官临时查看 2-3 天。

### Railway 设置

1. 在 Railway 新建项目，选择从 GitHub 仓库部署。
2. 添加 Volume，挂载路径填写 `/data`。
3. 在 Variables 中配置：

| 变量 | 推荐值 |
| --- | --- |
| `DATABASE_URL` | `file:/data/dev.db` |
| `UPLOAD_DIR` | `/data/uploads` |
| `JWT_SECRET` | 一串长随机字符串 |

Railway 会自动提供 `PORT`，不用手动填写。

### 启动行为

- Build Command：`npm run build`
- Start Command：`npm start`
- 首次启动会自动创建 SQLite 表结构。
- 如果数据库是空的，会自动写入一套干净演示数据。
- 如果数据库已经有用户，不会重复清空或覆盖数据。

### 演示数据

首次启动后可直接使用这些账号：

| 账号 | 密码 | 角色 |
| --- | --- | --- |
| admin | admin123 | 管理员 |
| manager | manager123 | 部门负责人 |
| user | user123 | 普通用户 |
| user2 | user123 | 普通用户 |
| repair | repair123 | 维修人员 |
| repair2 | repair123 | 维修人员 |

SQLite 数据库和上传文件都在 `/data` 这个 Volume 下。只要 Railway 项目和 Volume 不删，数据会保留。
