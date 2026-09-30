# 在线 PWA 支持

本次在响应式 UI 版本上添加应用安装元数据和图标，不改变页面元素、业务逻辑、账号权限、邮件、数据库或设置。

- 应用名称：`Auth Inbox`。
- 稳定应用 ID、启动地址和范围：`/`，独立窗口模式：`standalone`。
- 图标：沿用页面中的 Lucide ShieldCheck 和现有主题色，提供 192px、512px（兼容 maskable 裁切）及 Apple 180px PNG，保留 SVG 源文件与许可证。
- 不注册 Service Worker，不添加 Cache Storage 缓存；邮件继续在线读取，Bark/ntfy 行为不变。

## 验证（2026-09-30）

- Vite 生产构建、TypeScript 检查通过；现有单元测试 22 项通过。
- 经本地 Cloudflare Worker 的实际 `ASSETS` 链路验证：清单返回 HTTP 200 和 `application/manifest+json`，所有 PNG 返回 HTTP 200、`image/png`，像素尺寸与声明一致。
- 512px 图标为不透明背景，标识位于中心半径 40% 的安全圆内。
- Chromium 普通持久化测试配置中，DevTools `Page.getAppManifest` 无解析错误，`Page.getInstallabilityErrors` 返回空数组。
- Chromium/WebKit 手机尺寸登录页无 JavaScript 异常及横向溢出；未发现 Service Worker 注册或 Cache Storage 内容。
- 邮件、API Key、通知及正则规则接口在未登录时仍返回 401。
- 本地检查使用隔离浏览器配置，仅模拟首次建号状态接口；未读取线上数据库、未初始化数据库或发出真实推送。

这是本地安装资格检查，不是 Android 真机安装完成的证明。部署后应在手机 Chrome 普通标签页中打开 HTTPS 地址，刷新并使用安装菜单确认最终结果。

## 部署

沿用现有生产 Worker、D1/KV 绑定及配置；无需数据库迁移、新绑定或新 Secret。构建方式不变。参考 `responsive-ui-validation.md` 中保留现有配置的部署命令：

```sh
pnpm run build:web
pnpm exec wrangler deploy --keep-vars
```

以上命令应使用原有生产配置，不可替换为示例配置。Cloudflare 部署由维护者执行。
