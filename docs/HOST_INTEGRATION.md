# 宿主集成

## 基本配置

```js
import { createRuntime } from "./j2me-runtime.js";

const source = {
  kind: "J2ME_JAR_V1",
  name: "game.jar",
  url: "https://content.example/game.jar",
  sizeBytes: 123456,
  sha256: "<64-hex sha256>"
};

const runtime = createRuntime({
  sessionId: crypto.randomUUID(),
  contentDigest: source.sha256,
  source,
  adapter: {
    adapterKind: "J2ME_MINIJVM_WEB",
    adapterId: "j2me-minijvm-web",
    runtimeBaseUrl: "https://assets.example/j2me/v0.3.3/",
    storage: "HOST",
    viewport: { width: 240, height: 320 },
    scalingMode: "SHARP_FIT"
  }
}, {
  frameWindow,
  restorePayload,
  signal,
  onDiagnostic
});

runtime.subscribe(onRuntimeEvent);
await runtime.mount(container);
```

`contentDigest` 与 `source.sha256` 必须相同。宿主应为每次启动创建独立 frame/window，并在实例退出后丢弃该 frame，以释放 Emscripten 侦听器与 pthread worker。

API 可以在父页面导入；`container` 必须属于 `frameWindow.document`。运行时通过旁置的 `runtime-loader.js` 在目标 frame 内加载核心，不使用 `eval`、内联模块或父页面的 `window.Module`。使用 CSP 时，应允许目标 frame 加载运行时目录中的外部模块、Wasm 和 worker。

开发版通过 `runtimeAdapter.automaticViewport` 声明可省略 `adapter.viewport`；默认使用 240×320。
分辨率、机型、输入、音频与 3D 参数只接受标准显式配置，不按游戏名、哈希、包名或类名选择行为。loader 通过外部普通脚本元素的
data 属性标识实例，再在目标 frame 内动态导入核心；不改变不可变资产 URL，缓存命中和连续启动均执行独立回调。

完整 JAR 经大小和 SHA-256 验证后进入 Cache Storage，按内容摘要跨实例复用；缓存命中仍校验内容。
HTTP 和本地 Blob 来源均受支持，存储不可用时回退下载。此缓存只保存游戏资源，不参与 `HOST` 模式的存档恢复。

## 事件

宿主可在 `mount()` 之前订阅：

- `LOAD_PROGRESS`
- `STARTUP_INTERACTION`（`interaction: {id, title, choices: [{id, label}]} | null`）
- `READY`
- `STATE_CHANGED`
- `CHECKPOINT_AVAILABILITY_CHANGED`
- `FATAL_ERROR`
- `EXIT_REQUESTED`

## 公共操作

运行时提供 `mount`、`pause`、`resume`、`checkpoint`、`acknowledgeCheckpoint`、`screenshot`、`exit`、`setInput`、`getScalingMode`、`setScalingMode`、Canvas/帧计数/状态查询和事件订阅。`getValidationProbe()` 为调试与自动化提供输入、GC、媒体与 3D 观测数据，不应作为游戏业务状态。

`setInput(action, pressed)` 只接受 `runtime-manifest.json` 声明的逻辑动作。宿主的虚拟键、键盘或手柄层应统一转成这些动作。

`pause()` 在释放输入并停止呈现后，等待 JVM 线程到达安全点；Promise 完成后 Java 执行停止推进。暂停期间忽略新的逻辑按键和音频解锁，`resume()` 等待核心恢复后再开放输入。暂停不修改游戏使用的墙上时钟，恢复后游戏仍可能根据经过的真实时间更新自己的计时器。

`screenshot()` 返回逻辑 viewport 尺寸的 PNG，显示缩放和 Demo 的模拟器视图不改变截图尺寸。`getFrameCount()` 统计核心完成的画面提交次数，不代表 MIDlet 的业务循环次数。

加载中的 `exit()` / AbortSignal 会取消下载和启动，并清理已经创建的资源；退出 Promise 完成后不会启动迟到的模块。Wasm abort、宿主桥接故障及运行帧内未捕获的异常/Promise 拒绝，在加载和运行阶段都会立即触发 `FATAL_ERROR` 并进入 `FAILED`；保留首个原始原因，退出时移除监听。宿主订阅者或诊断回调抛错不会打断运行时清理。

## 存储模式

- `HOST`：运行时只读取显式 `restorePayload`，宿主通过 `checkpoint()` 取得数据并自行保存。
- `BROWSER`：使用当前页面的 IDBFS 持久化，适合单机 Demo，不应被多用户宿主默认共享。

Checkpoint 的边界和限制见 [CHECKPOINTS.md](CHECKPOINTS.md)。

Retrom Provider 必须将 `j2me-rms-bundle-v1` 明确声明为 `GAME_SAVE`：游戏内保存产生变化后，宿主按可用性 revision 自动同步，上传成功后确认对应 checkpoint；
新 Launch 在启动 JVM 前导入完整 RMS 包，随后通过游戏菜单读档。不得宣称恢复任意执行瞬间。

## 发布资产

`vX.Y.Z` Release 提供 `j2me-web-vX.Y.Z-runtime.zip`、对应 SHA-256 文件和 `j2me-runtime-release.json`。解压目录中的 `j2me-runtime.js` 是唯一公共 ESM 入口；Wasm、pthread worker、预加载数据和音频转码器作为运行时旁置资产保留。metadata schema v2 记录压缩包与解压后运行资产的大小和 SHA-256。

宿主必须提供 COOP/COEP 以启用 cross-origin isolation，并保证运行时资产可以被 worker 和 Wasm 从同一隔离上下文加载。

原生数据同步覆盖完整 RMS，不要求宿主或运行时逐游戏识别进度。宿主可将新游戏会话绑定到一个可更新数据槽，恢复会话继续更新所选槽；创建时间保持不变。手动即时存档应禁用，失败重试同步使用独立入口。

## 启动任务与入口选择

每次运行的构造与 `startApp` 均在 AMS 线程上执行；不返回的 `startApp` 不阻塞浏览器主循环。默认单入口自动启动，多入口等待宿主通过公共事件展示选择，并调用 `runtime.respondToStartupInteraction(id, choiceId)`。宿主应支持方向、确认和取消（`exit()`）；显示等待选择时仍为 LOADING。只有选定 MIDlet 实际呈现且输入队列可消费才发出 READY，选择界面不能算作游戏截图或运行验收。

`adapter.compatibilityProfile.launch.midletNumber` 可显式指定 manifest 中从 1 开始的编号；未指定为 `null`，没有默认猜测第一项的路径。不存在的编号立即失败。等待用户选择不占执行截止时间，选择完成后重新开始 60 秒执行预算；宿主可设置自己的外部截止时间。启动中的退出会拒绝待回答的选择并销毁模块、音频和线程。

不可恢复的构造、启动错误立即发出 FATAL_ERROR。事件 `code` 为稳定代码，可选 `reason` 保留阶段与原始原因，供宿主有界脱敏记录。不能把普通 error 级日志一律当作致命异常。RMS 增量提交期间存在 `.txn`/`.tmp` 时禁止导出 checkpoint；正常提交后的文件和 RMS ABI 不变。
