# 维护与发布

## 依赖

`scripts/build-runtime.sh` 中的 miniJVM、freej2meOnMinijvm 和 FreeJ2ME Plus 必须固定到完整提交。更新 fork 时，先在 fork 中完成提交、构建和推送，再更新主仓库的固定哈希、README 与 `THIRD_PARTY_NOTICES.md`。

freej2meOnMinijvm 的顶层授权仍需明确；在授权问题解决前，不得删除现有风险说明或把组合产物笼统声明为 MIT。

## 分支与提交

`j2me-web`、`miniJVM`、`freej2meOnMinijvm` 和 `freej2me-plus` 的长期维护分支均为 `main`。一个可独立说明的功能或 bugfix 使用一个提交，不混入无关格式化。

## Retrom PFB 候选

四个仓库的规范地址均为 `https://github.com/retrom-project/<repository>`；迁移保留原有 commit/tag，第三方 upstream 与许可证归属保持原义。`j2me-web` 是本项目原创集成层，长期分支仍为 `main`；PFB 工作分支使用 `feat/*`、`fix/*` 或 `build/*`，从最新远端 `main` 创建。

`retrom-fork.json` 记录其来源和分支，`candidateAssets` 记录解包候选文件。显式入口为 `.github/rpg-runtime/build-candidate.sh <absolute-empty-output>`，由 Host 的 `pfb-core-build CORE=j2me` 调用。构建只发生在本仓库，复用 `.cache/upstream` Git 对象，临时构建目录也位于本仓库 `.cache/`；本地依赖参数应指向同一 PFB 的 `retrom-other/` worktree，并保留固定完整 commit。支持仓库未提交修改不会自动成为固定输入。

候选包含真实 `RETROM_CORE_CANDIDATE_V1` 描述符、源码指纹和逐文件大小/摘要，不创建或伪造 Release tag。它如实声明 `j2me-rms` ABI，不能凭候选构建成功登记 Retrom Provider Target。先运行 `npm run test:instant-checkpoint` 并实现新的执行快照 ABI，再继续 Runtime/Host 产品链准入。原有 RMS 格式必须保留原语义。

## Tag

fork 使用 annotated tag：

```text
j2me-web-{upstream_commit_or_tag}-{revision}
```

同一上游基线递增 revision，切换基线后从 1 开始。tag 说明必须记录完整上游基线和当前 fork 提交。

主仓库使用 annotated 语义化版本 tag：

```text
vX.Y.Z
```

公共 API 或 save ABI 的破坏性变更升级 major。已发布 tag 不移动、覆盖或复用。

## 发布顺序

1. 确认四个仓库工作区干净且均位于 `main`。
2. 按 [TESTING.md](TESTING.md) 完成与本次版本匹配的验证。
3. 推送已修改 fork 的 `main` 和规范 tag；未修改的 fork 不创建新 tag。
4. 使用远程默认地址完整构建主仓库，确认固定提交可达。
5. 更新版本、`runtime-manifest.json`、兼容性、依赖与第三方声明。
6. 运行 `RELEASE_TAG=vX.Y.Z npm run release:build`，核对运行时 ZIP、`.sha256` 和 schema v2 `j2me-runtime-release.json`。
7. 推送主仓库 `main` 和版本 tag。`v*` tag 只发布完整运行时 ZIP、校验和与 metadata；源码归档由 GitHub 根据 tag 自动提供。

Release 失败时修复问题并发布新版本，不覆盖旧 tag 或旧资产。
