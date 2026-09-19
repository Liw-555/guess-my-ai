# 测测你的AI · 猜猜我是谁？ 🚲🦆🕵️

> 用最火的梗测试你的 AI（鹈鹕骑车、秦始皇骑北极熊…），再看输出猜模型。
> 一个社区驱动的 AI 测试梗题库 + 猜模型游戏。纯静态、零依赖、零成本，Fork 即部署。

## ✨ 功能

- **📋 测试题库**：10 道热门测试题（含出处与「为什么测得准」），一键复制提示词
- **🎲 防背题组合生成器**：小众动物 × 复杂交通工具 × 输出格式，随机生成新考题，专治「模型背题」和「中转站缓存答案」
- **🎮 猜猜我是谁**：看输出四选一猜模型，连对统计存本地，答案揭晓附可溯源出处
- **🖼️ 结果墙**：每个模型的输出档案 + 「本机最难猜的模型」榜单
- **✍️ 投稿**：填表生成标准格式，一键提 GitHub Issue（或直接提 PR 编辑 `data/results.json`）

## 🚀 部署到 GitHub Pages（2 分钟）

1. 把本目录推到一个 GitHub 仓库（默认配置指向 `LiW-555/guess-my-ai`，换成你自己的仓库名后记得同步修改 `js/app.js` 顶部的 `REPO_ISSUE_URL` 和 `index.html` 页脚链接）
2. 仓库 **Settings → Pages → Source** 选择 `Deploy from a branch`，分支选 `main`，目录选 `/ (root)`
3. 等一两分钟，访问 `https://<你的用户名>.github.io/<仓库名>/` 即可

> 建议：给域名套一层 Cloudflare CDN 代理，国内访问会更稳。

本地预览（JSON 需要 http 服务，不能 file:// 直开）：

```bash
cd guess-my-ai
python -m http.server 8000
# 浏览器访问 http://localhost:8000
```

## 📦 数据即代码：如何投稿内容

本站没有后端，所有内容都在 `data/` 目录的 JSON 文件里：

- `data/prompts.json` —— 题库
- `data/results.json` —— 模型输出结果（猜模型游戏的数据源）

**方式一（所有人）**：在网站「投稿」页填表 → 复制内容 → 提 Issue，维护者人工合并。

**方式二（极客）**：按现有格式直接编辑 JSON，提 Pull Request。合并后 GitHub Pages 自动重新部署。

`results.json` 字段说明：

| 字段 | 说明 |
|---|---|
| `modelKey` / `modelName` | 模型标识与展示名（`models` 数组里注册过） |
| `date` | 测试日期（必须真实） |
| `type` | `svg`（展示 `asset` 文件）/ `image` / `text`（展示 `text` 文本） |
| `verified` | `true` = 有公开存档可溯源；`false` = 社区流传转述 |
| `source` / `sourceUrl` | 出处说明与链接（必填，这是公信力的根基） |

**投稿守则（变量控制）**：新开会话、固定思考强度、保留第一次输出、同条件跑 3–5 次、如实填写模型版本。自报数据，诚信是底线。

## 🗂️ 目录结构

```
guess-my-ai/
├── index.html          # 单页应用入口（hash 路由）
├── css/style.css       # 纯手写样式（neubrutalism-lite 游戏化风格）
├── js/app.js           # 全部逻辑，无任何依赖
├── data/
│   ├── prompts.json    # 题库
│   └── results.json    # 结果数据（游戏数据源）
├── assets/
│   ├── pelican/        # 各模型真实输出的鹈鹕 SVG（来自 simonw/pelican-bicycle）
│   └── qinshihuang-polarbear-demo.png  # AI 生成风格示意图（非真实模型输出）
└── README.md
```

## 🙏 Credits & 免责声明

- 鹈鹕测试发起人与 SVG 素材：[simonw/pelican-bicycle](https://github.com/simonw/pelican-bicycle)（Simon Willison），各 SVG 为对应模型生成，版权归各自模型作者/平台所有，此处仅作社区演示与出处标注
- 秦始皇骑北极熊示意图为 AI 生成风格示意，已明确标注，非真实模型输出
- 用户投稿为自报数据，本站仅供娱乐与社区交流，不构成任何模型能力评价依据

## Roadmap

- [ ] 每日挑战（全站同题）与分享卡片
- [ ] 「降智时间线」：同一提示词按日期的输出变化
- [ ] C2PA / SynthID 水印验证、API 指纹检测
- [ ] 增长后迁移 Supabase / Cloudflare，开放网页直传
