# Telegram Mini App 使用与部署指南

本项目在保留原有 Web 管理后台的基础上，新增了一个运行在 Telegram WebView 内的 Mini App。

- Web 管理后台：`https://你的域名/`
- Telegram Mini App：`https://你的域名/miniapp/`
- Web API：`/api/*`
- Mini App API：`/api/miniapp/*`

两端共享业务数据和 Bot 设置，但使用互相隔离的登录会话。

## 功能与角色

Mini App 使用 Telegram 提供的用户身份免密登录。服务端验证 Telegram `initData` 签名后，根据当前用户 ID 是否在 `ADMIN_IDS` 中判断角色。

| 功能 | 普通用户 | 管理员 |
| --- | :---: | :---: |
| 查看自己的验证、封禁和白名单状态 | ✅ | ✅ |
| 查看自己的对话记录 | ✅ | ✅ |
| 在允许时提交解封申诉 | ✅ | ✅ |
| 查看系统统计 | ❌ | ✅ |
| 查看和搜索用户 | ❌ | ✅ |
| 封禁、解封用户 | ❌ | ✅ |
| 添加、移除白名单 | ❌ | ✅ |
| 查看任意用户的对话记录 | ❌ | ✅ |
| 修改 Mini App 允许的常规设置 | ❌ | ✅ |
| 修改 Bot Token、管理员列表或 Webhook | ❌ | ❌，请使用 Web 后台 |
| SQL 导入导出、切换数据库、清空数据 | ❌ | ❌，请使用 Web 后台 |

> 管理员身份在每次 API 请求时重新读取 `ADMIN_IDS` 判断。将某个 ID 从 `ADMIN_IDS` 移除后，其现有 Mini App 会话会立即失去管理员权限。

## 架构与安全机制

### 登录流程

1. Telegram 打开 `/miniapp/` 并注入 `window.Telegram.WebApp`。
2. 前端把原始 `WebApp.initData` 发送到 `POST /api/miniapp/auth/login`。
3. 服务端使用当前 `BOT_TOKEN` 按 Telegram 官方算法执行两层 HMAC-SHA256 验签。
4. 服务端校验 `auth_date`：数据不能超过 1 小时，也拒绝明显的未来时间。
5. 验签通过后签发随机 Bearer token，前端保存在当前 WebView 的 `sessionStorage` 中。
6. 后续请求使用 `Authorization: Bearer <token>`，不依赖 WebView Cookie。

### 会话隔离

- Web 后台会话使用 `sess:*` KV 前缀。
- Mini App 会话使用 `miniapp_sess:*` KV 前缀。
- 两种会话不能互相冒用，任一端注销不会删除另一端会话。
- Mini App 会话时长复用 `LOGIN_SESSION_TTL`，默认 86400 秒，最短 300 秒。

### 权限与数据隔离

普通用户接口只使用已验签会话中的 Telegram 用户 ID，不接受客户端传入的 `userId`。即使请求附带其他用户 ID，也不能查询他人的状态或对话。

Mini App 设置页只允许修改以下 17 个非敏感字段：

- `VERIFICATION_ENABLED`
- `VERIFICATION_TIMEOUT`
- `MAX_VERIFICATION_ATTEMPTS`
- `AUTO_UNBLOCK_ENABLED`
- `MAX_MESSAGES_PER_MINUTE`
- `INLINE_KB_MSG_DELETE_ENABLED`
- `INLINE_KB_MSG_DELETE_SECONDS`
- `USER_MSG_DELETE_SECONDS`
- `CAPTCHA_TYPE`
- `WELCOME_ENABLED`
- `WELCOME_MESSAGE`
- `BOT_COMMAND_FILTER`
- `WHITELIST_ENABLED`
- `ADMIN_NOTIFY_ENABLED`
- `BOT_LOCALE`
- `ZALGO_FILTER_ENABLED`
- `MESSAGE_FILTER_RULES`

`BOT_TOKEN`、`ADMIN_IDS`、`FORUM_GROUP_ID`、Webhook、验证码密钥、登录安全配置和存储配置均不能通过 Mini App 修改。

## 部署前配置

先在原有 Web 管理后台完成以下设置：

| 设置 | 说明 |
| --- | --- |
| `BOT_TOKEN` | 从 [@BotFather](https://t.me/BotFather) 获取，Mini App 验签必须使用它 |
| `ADMIN_IDS` | 管理员 Telegram ID，逗号分隔；决定 Mini App 管理员角色 |
| `FORUM_GROUP_ID` | 已开启话题功能的超级群组 ID |
| `WEBHOOK_URL` | `https://你的域名/webhook` |

要求：

- Mini App URL 必须是公网 HTTPS 地址。
- 不要把 `BOT_TOKEN` 写入前端代码、URL、文档实例或浏览器日志。
- Mini App 和 Webhook 建议使用同一域名，便于部署和排障。

## 构建

### 安装依赖

```bash
npm install
cd server && npm install && cd ..
```

### 只构建 Mini App

```bash
npm run build:miniapp
```

产物位于：

```text
dist/miniapp/
```

此命令不会清空已有的 `dist/` Web 产物。

### 同时构建 Web 与 Mini App

生产部署推荐使用：

```bash
npm run build:all
```

构建完成后应同时存在：

```text
dist/index.html
dist/miniapp/index.html
```

### 本地预览

```bash
npm run preview
```

访问：

- Web 后台：`http://localhost:3000/`
- Mini App 静态页面：`http://localhost:3000/miniapp/`

普通浏览器没有 Telegram 注入的 `initData`，Mini App 显示“请在 Telegram 内打开”属于正常降级行为。完整登录与角色验证必须在 Telegram 真机或桌面客户端中测试。

## Cloudflare Pages 部署

Pages 项目建议使用：

| 配置项 | 值 |
| --- | --- |
| 框架预设 | Vue |
| 构建命令 | `npm run build:all` |
| 输出目录 | `dist` |

继续保留项目原有绑定：

| 变量名 | 绑定类型 | 必需 |
| --- | --- | :---: |
| `KV` | KV namespace | ✅ |
| `D1` | D1 database | 可选 |
| `HYPERDRIVE` | Hyperdrive | 可选 |

Cloudflare Pages 会按函数文件结构把 `/api/miniapp/*` 路由到独立 Mini App handler；原有 `/api/*` Web 接口不受影响。

部署后先检查：

```text
https://你的域名/miniapp/
https://你的域名/api/miniapp/auth/login
```

直接访问登录接口或使用错误方法不应成功登录；关键是确认请求已到达 Mini App handler，而不是返回 Web HTML。

## Docker / Node 部署

使用 Docker 或 Node 服务时，先构建双端产物：

```bash
npm run build:all
npm run preview
```

`server/index.js` 会：

- 托管 `dist/`，因此 `/miniapp/` 可直接访问；
- 把 `/api/miniapp/*` 交给 Mini App handler；
- 把其他 `/api/*` 交给原有 Web handler；
- 继续处理 `/webhook`。

Telegram Mini App 不能使用公网 HTTP。Docker 部署必须通过 Cloudflare Tunnel、Nginx、Caddy 等反向代理提供 HTTPS。

示例 Nginx 代理与现有 Web 部署相同，确认以下路径都转发到 Node 服务：

```text
/
/miniapp/
/api/miniapp/
/webhook
```

## 在 BotFather 配置菜单按钮

部署成功并确认 `/miniapp/` 可通过 HTTPS 打开后：

1. 打开 [@BotFather](https://t.me/BotFather)。
2. 发送 `/mybots` 并选择目标 Bot。
3. 进入 **Bot Settings**。
4. 选择 **Menu Button**，然后配置菜单按钮；也可以直接使用 `/setmenubutton`。
5. 选择目标 Bot。
6. 输入 Mini App URL：

   ```text
   https://你的域名/miniapp/
   ```

7. 设置按钮文字，例如“打开面板”或“Mini App”。
8. 回到 Bot 私聊，重新打开会话并点击输入框旁的菜单按钮。

当前代码不会自动替你修改 BotFather 菜单按钮；这是部署后的外部配置步骤。

### 可选：调用 Bot API 设置菜单按钮

也可以在受信任的服务器终端调用 Telegram Bot API。不要在浏览器前端执行，也不要把 token 提交到 Git。

```bash
curl -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setChatMenuButton" \
  -H "Content-Type: application/json" \
  -d '{
    "menu_button": {
      "type": "web_app",
      "text": "打开面板",
      "web_app": { "url": "https://你的域名/miniapp/" }
    }
  }'
```

如果只希望为某个会话设置按钮，可按 Telegram Bot API 的 `setChatMenuButton` 文档增加 `chat_id`。

## Mini App API 摘要

所有受保护接口均使用：

```http
Authorization: Bearer <miniapp-token>
```

### 公开接口

| Method | Path | 说明 |
| --- | --- | --- |
| `POST` | `/api/miniapp/auth/login` | 验证 Telegram `initData` 并签发会话 |
| `POST` | `/api/miniapp/auth/logout` | 删除当前 Mini App 会话 |

### 当前用户接口

| Method | Path | 说明 |
| --- | --- | --- |
| `GET` | `/api/miniapp/me` | 用户资料、角色、验证/封禁/白名单状态 |
| `GET` | `/api/miniapp/my/conversations` | 当前用户自己的对话记录 |
| `GET` | `/api/miniapp/my/status` | 当前用户的详细状态和是否可申诉 |
| `POST` | `/api/miniapp/my/appeal` | 提交解封申诉；同一用户 15 分钟内不能重复提交 |

### 管理员接口

| Method | Path | 说明 |
| --- | --- | --- |
| `GET` | `/api/miniapp/admin/stats` | 系统统计 |
| `GET` | `/api/miniapp/admin/users` | 用户列表、搜索和状态筛选 |
| `PUT` | `/api/miniapp/admin/users/:id/block` | 封禁用户，不能封禁 `ADMIN_IDS` 中的管理员 |
| `PUT` | `/api/miniapp/admin/users/:id/unblock` | 解封用户 |
| `GET` | `/api/miniapp/admin/whitelist` | 白名单列表 |
| `POST` | `/api/miniapp/admin/whitelist/:id` | 添加白名单 |
| `DELETE` | `/api/miniapp/admin/whitelist/:id` | 移除白名单 |
| `GET` | `/api/miniapp/admin/conversations` | 最近对话列表 |
| `GET` | `/api/miniapp/admin/conversations/:id` | 查看指定用户对话 |
| `GET` | `/api/miniapp/admin/settings` | 获取脱敏后的设置 |
| `PUT` | `/api/miniapp/admin/settings` | 修改允许的 17 个非敏感字段 |

## 发布后验收

以下项目需要在部署后的 Telegram iOS、Android 或桌面客户端中验证：

- 菜单按钮能打开 `/miniapp/`；
- Telegram 亮色/暗色主题能正确同步；
- 普通用户只能看到自己的状态和对话；
- 普通用户访问管理员页面时会回到首页，直接调用管理员 API 返回 403；
- `ADMIN_IDS` 中的用户能进入管理员面板；
- MainButton 在申诉和设置页面能提交，成功后状态正确；
- BackButton 在子页面能返回对应角色首页；
- 键盘弹出、切后台恢复和网络重连不会造成白屏；
- 管理员被移出 `ADMIN_IDS` 后，下一次管理员 API 请求立即返回 403。

## 故障排查

### 提示“请在 Telegram 内打开”

- 确认页面确实由 Bot 菜单按钮或 Web App 按钮打开；
- 普通浏览器直接访问没有 `initData`，不能完成登录；
- 检查 `miniapp/index.html` 是否加载了 `https://telegram.org/js/telegram-web-app.js`。

### 登录返回 401

- 检查 Web 后台中的 `BOT_TOKEN` 是否与打开 Mini App 的 Bot 完全一致；
- 确认客户端时间基本准确；
- 关闭并重新打开 Mini App，获取新的 `initData`；
- 检查反向代理是否完整转发 JSON body 和 `Authorization` 头。

### 管理员接口返回 403

- 检查当前 Telegram ID 是否在 `ADMIN_IDS` 中；
- `ADMIN_IDS` 应为逗号分隔的数字 ID；
- 修改后重新请求即可生效，不依赖重新登录。

### `/miniapp/` 返回 404

- 执行 `npm run build:all`；
- 确认 `dist/miniapp/index.html` 存在；
- Cloudflare Pages 输出目录必须是 `dist`；
- Node/Docker 反向代理必须转发 `/miniapp/`，不能只代理 `/api`。

### `/api/miniapp/*` 返回 Web HTML

- Cloudflare Pages：确认 `functions/api/miniapp/[[path]].js` 已随项目部署；
- Node/Docker：确认运行的是包含 Mini App 路由挂载的新版本 `server/index.js`；
- 不要使用只提供静态文件的 `npm run preview:static` 联调 API。

### 主题颜色异常

- 确认通过 Telegram 客户端打开，而不是普通浏览器；
- 更新 Telegram 客户端后重试；
- 检查页面是否覆盖了 `--tg-theme-*` CSS 变量。

## 参考

- [Telegram Mini Apps 文档](https://core.telegram.org/bots/webapps)
- [验证 Mini App 数据](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)
- [Bot API：setChatMenuButton](https://core.telegram.org/bots/api#setchatmenubutton)
