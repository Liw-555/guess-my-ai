/* ============================================================
   测测你的AI · 猜猜我是谁 — MVP
   纯原生 JS，无任何依赖。数据来自 data/*.json。
   ============================================================ */
"use strict";

/* ---------- 全局数据 ---------- */
let DB = { prompts: [], results: [], models: [] };
const REPO_ISSUE_URL = "https://github.com/LiW-555/guess-my-ai/issues/new";

/* ---------- 本地统计（localStorage） ---------- */
const store = {
  get perModel() { try { return JSON.parse(localStorage.getItem("gma_per_model") || "{}"); } catch { return {}; } },
  set perModel(v) { localStorage.setItem("gma_per_model", JSON.stringify(v)); },
  get global() { try { return JSON.parse(localStorage.getItem("gma_global") || '{"games":0,"correct":0,"streak":0,"best":0}'); } catch { return { games: 0, correct: 0, streak: 0, best: 0 }; } },
  set global(v) { localStorage.setItem("gma_global", JSON.stringify(v)); },
  record(modelKey, isCorrect) {
    const pm = this.perModel;
    pm[modelKey] = pm[modelKey] || { shown: 0, correct: 0 };
    pm[modelKey].shown += 1;
    if (isCorrect) pm[modelKey].correct += 1;
    this.perModel = pm;
    const g = this.global;
    g.games += 1;
    if (isCorrect) { g.correct += 1; g.streak += 1; g.best = Math.max(g.best, g.streak); }
    else { g.streak = 0; }
    this.global = g;
  },
  reset() { localStorage.removeItem("gma_per_model"); localStorage.removeItem("gma_global"); }
};

/* ---------- 工具 ---------- */
const $ = (sel) => document.querySelector(sel);
const app = () => $("#app");

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

let toastTimer = null;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
}

function copyText(text, okMsg) {
  const done = () => toast(okMsg || "已复制 ✔");
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
}
function fallbackCopy(text, done) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed"; ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); done(); } catch { toast("复制失败，请手动选择复制"); }
  document.body.removeChild(ta);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const hotStars = (n) => "🔥".repeat(n);

/* ============================================================
   图片灯箱（原生 <dialog>，零依赖）
   依据的最佳实践：
   - showModal() 自带焦点陷阱 / Esc 关闭 / 背景 inert，关闭后焦点还原触发元素
   - 打开时锁定背景滚动；提供可见的带名称关闭按钮；点击背景可关（非唯一方式）
   - 滚轮/双击/双指 pinch 缩放、拖拽平移、方向键组内导航、位置指示、来源标注
   ============================================================ */
const lbJson = (o) => escapeHtml(JSON.stringify(o));

const LB = {
  zoom: 1, px: 0, py: 0,
  items: [], idx: 0, trigger: null,
  ptrs: new Map(), pinchDist: 0, swipe: null
};
let lbHintTimer = null;
const lbEl = (id) => document.getElementById(id);

function lbApply() {
  lbEl("lb-img").style.transform = `translate(${LB.px}px, ${LB.py}px) scale(${LB.zoom})`;
  lbEl("lb-zoomval").textContent = Math.round(LB.zoom * 100) + "%";
  lbEl("lb-stage").classList.toggle("zoomed", LB.zoom > 1);
}

function lbClampPan() {
  const st = lbEl("lb-stage");
  if (LB.zoom <= 1) { LB.px = 0; LB.py = 0; return; }
  const mx = st.clientWidth * (LB.zoom - 1) / 2;
  const my = st.clientHeight * (LB.zoom - 1) / 2;
  LB.px = Math.max(-mx, Math.min(mx, LB.px));
  LB.py = Math.max(-my, Math.min(my, LB.py));
}

function lbZoomAt(z2, cx, cy) {
  const r = lbEl("lb-stage").getBoundingClientRect();
  const z1 = LB.zoom;
  z2 = Math.min(10, Math.max(1, z2));
  if (z1 === z2) return;
  if (cx != null) { /* 围绕光标/双指中心缩放，保持该点内容不动 */
    LB.px += (cx - (r.left + r.width / 2)) * (z1 - z2);
    LB.py += (cy - (r.top + r.height / 2)) * (z1 - z2);
  }
  LB.zoom = z2;
  lbClampPan();
  lbApply();
}

function lbReset() { LB.zoom = 1; LB.px = 0; LB.py = 0; lbApply(); }

function lbShow(i) {
  LB.idx = (i + LB.items.length) % LB.items.length;
  const it = LB.items[LB.idx];
  const img = lbEl("lb-img");
  img.classList.add("lb-loading");
  img.src = it.src;
  img.alt = it.cap || "模型输出图";
  lbEl("lb-cap").textContent = it.cap || "";
  const multi = LB.items.length > 1;
  lbEl("lb-count").textContent = multi ? `${LB.idx + 1} / ${LB.items.length}` : "";
  lbEl("lb-prev").hidden = !multi;
  lbEl("lb-next").hidden = !multi;
  const raw = lbEl("lb-raw");
  if (it.href) { raw.hidden = false; raw.href = it.href; } else { raw.hidden = true; }
  lbReset();
}

function lbOpen(items, idx, trigger) {
  LB.items = items;
  LB.trigger = trigger || document.activeElement;
  document.body.style.overflow = "hidden"; /* 原生 dialog 不锁背景滚动，手动锁 */
  lbEl("lightbox").showModal();
  lbShow(idx);
  const hint = lbEl("lb-hint");
  hint.classList.remove("bye");
  clearTimeout(lbHintTimer);
  lbHintTimer = setTimeout(() => hint.classList.add("bye"), 5000);
}

function lbClose() { lbEl("lightbox").close(); }

function lbInit() {
  const dlg = lbEl("lightbox");
  const stage = lbEl("lb-stage");
  const img = lbEl("lb-img");
  img.addEventListener("load", () => img.classList.remove("lb-loading"));

  /* 全站事件委托：任何带 data-lb（JSON）的元素都可打开灯箱 */
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-lb]");
    if (!t) return;
    e.preventDefault();
    let data;
    try { data = JSON.parse(t.dataset.lb); } catch { return; }
    let items = [data], idx = 0;
    if (data.group) { /* 同组图片可导航 */
      items = [];
      document.querySelectorAll("[data-lb]").forEach((n) => {
        try {
          const d = JSON.parse(n.dataset.lb);
          if (d.group === data.group) items.push(d);
        } catch {}
      });
      idx = Math.max(0, items.findIndex((d) => d.src === data.src));
    }
    lbOpen(items, idx, t);
  });

  lbEl("lb-close").addEventListener("click", lbClose);
  lbEl("lb-zoomin").addEventListener("click", () => lbZoomAt(LB.zoom * 1.4));
  lbEl("lb-zoomout").addEventListener("click", () => lbZoomAt(LB.zoom / 1.4));
  lbEl("lb-reset").addEventListener("click", lbReset);
  lbEl("lb-prev").addEventListener("click", () => lbShow(LB.idx - 1));
  lbEl("lb-next").addEventListener("click", () => lbShow(LB.idx + 1));

  /* 键盘：+/-/0/方向键（Esc 由原生 dialog 处理） */
  dlg.addEventListener("keydown", (e) => {
    if (e.key === "+" || e.key === "=") { e.preventDefault(); lbZoomAt(LB.zoom * 1.4); }
    else if (e.key === "-" || e.key === "_") { e.preventDefault(); lbZoomAt(LB.zoom / 1.4); }
    else if (e.key === "0") { e.preventDefault(); lbReset(); }
    else if (e.key === "ArrowLeft" && LB.items.length > 1) { e.preventDefault(); lbShow(LB.idx - 1); }
    else if (e.key === "ArrowRight" && LB.items.length > 1) { e.preventDefault(); lbShow(LB.idx + 1); }
  });

  /* 点击深色背景关闭（保留按钮/Esc 等其它关闭方式） */
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });

  /* 关闭后：还原背景滚动与焦点，清空图片停止加载 */
  dlg.addEventListener("close", () => {
    document.body.style.overflow = "";
    lbReset();
    img.src = "";
    if (LB.trigger && document.contains(LB.trigger)) LB.trigger.focus();
  });

  /* 滚轮缩放（围绕光标位置） */
  stage.addEventListener("wheel", (e) => {
    e.preventDefault();
    lbZoomAt(LB.zoom * (e.deltaY < 0 ? 1.18 : 1 / 1.18), e.clientX, e.clientY);
  }, { passive: false });

  /* 双击：1x ↔ 2.5x */
  stage.addEventListener("dblclick", (e) => {
    if (LB.zoom > 1) lbReset();
    else lbZoomAt(2.5, e.clientX, e.clientY);
  });

  /* 指针：拖拽平移 / 双指 pinch 缩放 / 触摸滑动切图 */
  stage.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".lb-nav")) return;
    stage.setPointerCapture(e.pointerId);
    LB.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    LB.swipe = (LB.ptrs.size === 1 && e.pointerType === "touch" && LB.zoom === 1)
      ? { x: e.clientX, y: e.clientY, t: Date.now() } : null;
    if (LB.ptrs.size === 2) {
      const [a, b] = [...LB.ptrs.values()];
      LB.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
    if (LB.zoom > 1) stage.classList.add("panning");
  });
  stage.addEventListener("pointermove", (e) => {
    if (!LB.ptrs.has(e.pointerId)) return;
    const prev = LB.ptrs.get(e.pointerId);
    const cur = { x: e.clientX, y: e.clientY };
    LB.ptrs.set(e.pointerId, cur);
    if (LB.ptrs.size === 2) {
      const [a, b] = [...LB.ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (LB.pinchDist > 0 && d > 0) {
        lbZoomAt(LB.zoom * (d / LB.pinchDist), (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
      LB.pinchDist = d;
    } else if (LB.zoom > 1) {
      LB.px += cur.x - prev.x;
      LB.py += cur.y - prev.y;
      lbClampPan();
      lbApply();
    }
  });
  const lbEndPtr = (e) => {
    if (!LB.ptrs.has(e.pointerId)) return;
    LB.ptrs.delete(e.pointerId);
    if (LB.ptrs.size < 2) LB.pinchDist = 0;
    if (!LB.ptrs.size) stage.classList.remove("panning");
    if (LB.swipe) { /* 触摸：快速左右滑切图 */
      const dx = e.clientX - LB.swipe.x, dy = e.clientY - LB.swipe.y;
      if (LB.items.length > 1 && Math.abs(dx) > 60 && Math.abs(dy) < 50 && Date.now() - LB.swipe.t < 600) {
        lbShow(LB.idx + (dx < 0 ? 1 : -1));
      }
      LB.swipe = null;
    }
  };
  stage.addEventListener("pointerup", lbEndPtr);
  stage.addEventListener("pointercancel", lbEndPtr);
}

/* ---------- 数据加载 ---------- */
async function loadData() {
  const [p, r] = await Promise.all([
    fetch("data/prompts.json").then((x) => x.json()),
    fetch("data/results.json").then((x) => x.json())
  ]);
  DB.prompts = p.prompts;
  DB.results = r.results;
  DB.models = r.models;
}

const promptById = (id) => DB.prompts.find((p) => p.id === id);
const modelByKey = (key) => DB.models.find((m) => m.key === key);

/* 超长提示词折叠显示：≤600 字直接展示，否则截断 + details 展开 */
function promptBlock(p) {
  const full = escapeHtml(p.prompt);
  if (p.prompt.length <= 600) return `<code class="prompt-code">${full}</code>`;
  const short = escapeHtml(p.prompt.slice(0, 600));
  return `<code class="prompt-code">${short}<span class="prompt-ellipsis">……</span></code>
    <details class="prompt-more"><summary>📜 这是 ${p.prompt.length} 字的超长提示词，点开查看全部 ${p.prompt.length} 字</summary><code class="prompt-code">${full}</code></details>`;
}

/* ---------- 路由 ---------- */
const routes = { "": viewHome, prompts: viewPrompts, game: viewGame, gallery: viewGallery, submit: viewSubmit, about: viewAbout };

function router() {
  const hash = location.hash.replace(/^#\/?/, "").split("?")[0];
  const view = routes[hash] || viewHome;
  document.querySelectorAll(".nav a").forEach((a) => {
    a.classList.toggle("active", a.dataset.nav === (hash || "home"));
  });
  view();
  window.scrollTo(0, 0);
}

/* ============================================================
   视图：首页
   ============================================================ */
function viewHome() {
  const featured = DB.results.filter((r) => r.type === "svg" && r.promptId === "pelican-svg");
  const heroArt = featured[Math.floor(Math.random() * featured.length)];
  const heroSrc = heroArt ? heroArt.source.split("（")[0] : "simonw/pelican-bicycle";
  const g = store.global;
  app().innerHTML = `
    <section class="hero">
      <div>
        <span class="badge b-coral">社区开源 MVP</span>
        <h1>这只<br><span class="hl">鹈鹕</span>是哪个<br>AI 画的？</h1>
        <p class="lead">用最火的梗测试你的 AI——鹈鹕骑车、秦始皇骑北极熊、strawberry 数 r……拿题去测，回来「猜猜我是谁」。</p>
        <div class="hero-cta">
          <a class="btn btn-primary" href="#/game">🎮 开始猜模型</a>
          <a class="btn" href="#/prompts">📋 拿题目去测你的 AI</a>
        </div>
      </div>
      <figure class="hero-art">
        <button class="lb-trigger" data-lb='${lbJson({ src: heroArt.asset, cap: `首页大图 · 真实模型输出（来源：${heroSrc}）`, href: heroArt.asset })}' aria-label="放大查看这张鹈鹕图">
          <img src="${heroArt.asset}" alt="某模型生成的鹈鹕骑自行车 SVG" loading="lazy">
        </button>
        <figcaption>↑ 这张真实模型输出出自谁手？<a href="#/game">来猜 →</a>（来源：${escapeHtml(heroSrc)}）· <b>点击图片可放大</b></figcaption>
      </figure>
    </section>

    <section class="stats-row">
      <div class="card stat-card"><div class="num">${DB.prompts.length}</div><div class="lbl">道测试题</div></div>
      <div class="card stat-card"><div class="num">${DB.results.length}</div><div class="lbl">份模型结果</div></div>
      <div class="card stat-card"><div class="num">${DB.models.length}</div><div class="lbl">个候选模型</div></div>
    </section>

    <section class="home-cards">
      <div class="card">
        <h3>🧪 你的 AI 降智了吗？</h3>
        <p>同一道题反复测，看结构崩没崩：脚踩没踩踏板、车轮还在不在。社区都在用的「体感温度计」。</p>
        <a class="btn btn-small" href="#/prompts">去拿题</a>
      </div>
      <div class="card">
        <h3>🕵️ 中转站打假</h3>
        <p>怀疑你的 API 中转站偷偷换了便宜模型？防背题组合生成器让它当场原形毕露。</p>
        <a class="btn btn-small btn-blue" href="#/prompts">防背题生成器</a>
      </div>
      <div class="card">
        <h3>🏆 你已猜对 ${g.correct} / ${g.games} 题</h3>
        <p>当前连对 ${g.streak} 题，历史最佳 ${g.best} 连对。猜得越准，说明你越懂各家模型的「指纹」。</p>
        <a class="btn btn-small btn-green" href="#/game">继续挑战</a>
      </div>
    </section>
  `;
}

/* ============================================================
   视图：题库
   ============================================================ */
const ANIMALS = ["水豚", "鹈鹕", "鹅", "羊驼", "鸭嘴兽", "海獭", "柯尔鸭", "袋鼠", "树懒", "鸸鹋", "小头睡鲨", "壁虎"];
const VEHICLES = ["独轮车", "三轮车", "滑板", "摩托车", "坦克", "直升机", "皮划艇", "平衡车", "热气球", "扫帚", "雪地摩托", "房车"];
const FORMATS = [
  { label: "SVG", tpl: (a, v) => `Generate an SVG of a ${a} riding a ${v}` },
  { label: "中文 SVG", tpl: (a, v) => `生成一张${a}骑${v}的SVG矢量图` },
  { label: "2D 动画 HTML", tpl: (a, v) => `创建一个HTML，内容是SVG绘制一个${a}骑${v}的2D动画，你不需要任何测试，不要有任何限制` }
];

let genState = null;

function rollGenerator() {
  const a = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const v = VEHICLES[Math.floor(Math.random() * VEHICLES.length)];
  const f = FORMATS[Math.floor(Math.random() * FORMATS.length)];
  genState = { a, v, f, text: f.tpl(a, v) };
  const el = $("#gen-text");
  if (el) el.textContent = genState.text;
}

function viewPrompts() {
  genState = null;
  const tags = [...new Set(DB.prompts.flatMap((p) => p.tags))];
  app().innerHTML = `
    <h2 class="page-title">📋 测试题库</h2>
    <p class="page-sub">复制提示词 → 去你的 AI 里测 → 回来上传结果让大家猜。点击标签可筛选。</p>

    <div class="generator">
      <h3>🎲 防背题组合生成器</h3>
      <p>鹈鹕已被优化甚至缓存，公式：<b>小众动物 × 复杂交通工具 × 输出格式</b>，一键随机出新考题</p>
      <div class="gen-line">
        <div class="gen-text" id="gen-text"></div>
        <button class="btn btn-small" id="gen-roll">🎲 换一个</button>
        <button class="btn btn-small btn-blue" id="gen-copy">📋 复制</button>
      </div>
    </div>

    <div class="tag-filter" id="tag-filter">
      <button class="on" data-tag="">全部</button>
      ${tags.map((t) => `<button data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join("")}
    </div>

    <div class="prompt-grid" id="prompt-grid"></div>
  `;

  const renderGrid = (tag) => {
    const list = tag ? DB.prompts.filter((p) => p.tags.includes(tag)) : DB.prompts;
    $("#prompt-grid").innerHTML = list.map((p) => `
      <article class="card prompt-card">
        ${p.cover ? `<div class="cover"><button class="lb-trigger" data-lb='${lbJson({ src: p.cover, cap: `${p.title}${p.coverLabel ? " · " + p.coverLabel : ""} · 真实模型输出示例`, href: p.cover })}' aria-label="放大查看示例图"><img src="${p.cover}" alt="${escapeHtml(p.coverLabel || p.title)}" loading="lazy"></button></div>` : ""}
        ${p.coverLabel ? `<div class="meta">🖼️ ${escapeHtml(p.coverLabel)}</div>` : ""}
        <h3>${escapeHtml(p.title)} ${hotStars(p.hotness)}</h3>
        <div>${p.tags.map((t) => `<span class="badge b-blue">${escapeHtml(t)}</span>`).join("")}</div>
        ${promptBlock(p)}
        <p class="meta"><b>为什么测得准：</b>${escapeHtml(p.why)}</p>
        ${p.note ? `<div class="note">💡 ${escapeHtml(p.note)}</div>` : ""}
        <p class="origin"> 出处：<a href="${p.originUrl}" target="_blank" rel="noopener">${escapeHtml(p.origin)}</a></p>
        <div class="actions">
          <button class="btn btn-small btn-primary" data-copy="${encodeURIComponent(p.prompt)}">📋 复制提示词</button>
          <a class="btn btn-small" href="#/submit">✍️ 上传我的结果</a>
        </div>
      </article>
    `).join("");
  };

  renderGrid("");
  rollGenerator();

  $("#gen-roll").addEventListener("click", rollGenerator);
  $("#gen-copy").addEventListener("click", () => genState && copyText(genState.text, "已复制新考题 ✔"));
  document.querySelectorAll("[data-copy]").forEach((btn) =>
    btn.addEventListener("click", () => copyText(decodeURIComponent(btn.dataset.copy), "提示词已复制，快去测你的 AI ✔"))
  );
  document.querySelectorAll("#tag-filter button").forEach((btn) =>
    btn.addEventListener("click", () => {
      document.querySelectorAll("#tag-filter button").forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
      renderGrid(btn.dataset.tag);
      // 重新绑定复制按钮
      document.querySelectorAll("[data-copy]").forEach((b2) =>
        b2.addEventListener("click", () => copyText(decodeURIComponent(b2.dataset.copy), "提示词已复制，快去测你的 AI ✔"))
      );
    })
  );
}

/* ============================================================
   视图：猜猜我是谁（核心游戏）
   ============================================================ */
let gameState = null;

function pickRound() {
  const result = DB.results[Math.floor(Math.random() * DB.results.length)];
  const correctModel = modelByKey(result.modelKey);
  // 干扰项：70% 概率优先同厂商（更难），其余随机
  const sameVendor = DB.models.filter((m) => m.vendor === correctModel.vendor && m.key !== result.modelKey);
  const others = DB.models.filter((m) => m.key !== result.modelKey && !sameVendor.includes(m));
  const distractors = [];
  const wantSame = Math.min(sameVendor.length, Math.random() < 0.7 ? 2 : 1);
  shuffle(sameVendor).slice(0, wantSame).forEach((m) => distractors.push(m));
  shuffle(others).slice(0, 3 - distractors.length).forEach((m) => distractors.push(m));
  return { result, options: shuffle([correctModel, ...distractors]), answered: false };
}

function renderRound() {
  const s = gameState;
  const p = promptById(s.result.promptId);
  const g = store.global;
  const body = s.result.type === "svg"
    ? `<button class="lb-trigger" data-lb='${lbJson({ src: s.result.asset, cap: "神秘模型输出 · 放大找「画风指纹」：先看连接关系，再看视角，最后看装饰" })}' aria-label="放大查看输出图（不显示来源，防止剧透）"><img src="${s.result.asset}" alt="神秘模型输出"></button>`
    : `<div class="text-output">${escapeHtml(s.result.text)}</div>`;

  $("#game-area").innerHTML = `
    <div class="game-head">
      <span class="pill">🎯 第 ${g.games + 1} 题</span>
      <span class="pill hot">🔥 连对 ${g.streak}</span>
      <span class="pill">正确率 ${g.games ? Math.round((g.correct / g.games) * 100) : 0}%</span>
      <span class="pill">总 ${g.games} 题 · 最佳 ${g.best} 连对</span>
    </div>
    <div class="card game-prompt">
      <div style="font-size:12.5px;color:var(--muted);font-weight:700;margin-bottom:6px;">它收到的提示词：</div>
      ${promptBlock(p)}
      ${s.result.verified ? "" : `<div class="note" style="font-size:12px;background:#FFF3BF;border:1.5px solid var(--ink);border-radius:8px;padding:4px 10px;display:inline-block;">📜 社区流传案例（文字为转述）</div>`}
    </div>
    <div class="game-stage" id="game-stage">${body}</div>
    <div class="options">
      ${s.options.map((m, i) => `
        <button class="option-btn" data-key="${m.key}" data-i="${i}">
          ${escapeHtml(m.name)}<small>${escapeHtml(m.vendor)}</small>
        </button>`).join("")}
    </div>
    <div id="reveal-zone"></div>
  `;

  document.querySelectorAll(".option-btn").forEach((btn) =>
    btn.addEventListener("click", () => answer(btn.dataset.key))
  );
}

function answer(key) {
  const s = gameState;
  if (s.answered) return;
  s.answered = true;
  const isCorrect = key === s.result.modelKey;
  store.record(s.result.modelKey, isCorrect);

  document.querySelectorAll(".option-btn").forEach((b) => {
    b.disabled = true;
    if (b.dataset.key === s.result.modelKey) b.classList.add("right");
    else if (b.dataset.key === key) b.classList.add("wrong");
    else b.classList.add("dim");
  });

  const stage = $("#game-stage");
  stage.classList.add(isCorrect ? "pop" : "shake");

  const g = store.global;
  $("#reveal-zone").innerHTML = `
    <div class="card reveal-panel">
      <div class="verdict">${isCorrect ? "🎉 猜对了！你是懂模型指纹的" : "❌ 猜错了，是 " + escapeHtml(s.result.modelName)}</div>
      <div class="detail">📅 测试时间：${escapeHtml(s.result.date)}　🏷️ 数据可信度：${s.result.verified ? "✅ 可溯源" : "📜 社区流传"}</div>
      <div class="detail">来源：<a href="${s.result.sourceUrl}" target="_blank" rel="noopener">${escapeHtml(s.result.source)}</a></div>
      ${s.result.note ? `<div class="detail">🔍 看点：${escapeHtml(s.result.note)}</div>` : ""}
      <div class="detail">该模型历史被你猜中：${(store.perModel[s.result.modelKey] || {}).correct || 0} / ${(store.perModel[s.result.modelKey] || {}).shown || 0}</div>
    </div>
    <div class="game-next">
      <button class="btn btn-primary" id="next-btn">🔄 下一题</button>
      <a class="btn" href="#/submit">✍️ 我也有结果要投</a>
    </div>
  `;
  $("#next-btn").addEventListener("click", () => {
    gameState = pickRound();
    renderRound();
  });
}

function viewGame() {
  gameState = pickRound();
  app().innerHTML = `
    <div class="game-wrap">
      <h2 class="page-title">🕵️ 猜猜我是谁？</h2>
      <p class="page-sub">看输出猜模型：每家的「画风指纹」都藏在上色习惯、结构逻辑和排版风格里。答案揭晓后可查看来源。</p>
      <div id="game-area"></div>
    </div>
  `;
  renderRound();
}

/* ============================================================
   视图：结果墙 / 模型档案
   ============================================================ */
function viewGallery() {
  const pm = store.perModel;
  const ranked = DB.models
    .map((m) => ({ ...m, stat: pm[m.key] || { shown: 0, correct: 0 } }))
    .filter((m) => m.stat.shown > 0)
    .sort((a, b) => (b.stat.shown - b.stat.correct) - (a.stat.shown - a.stat.correct));

  const leaderBoard = ranked.length ? `
    <div class="card lb-card">
      <h3 style="margin-bottom:10px;">🏆 本机最难猜的模型（按你猜错的次数）</h3>
      ${ranked.slice(0, 5).map((m, i) => `
        <div class="lb-row">
          <span><span class="lb-rank">${["🥇","🥈","🥉","4.","5."][i]}</span>${escapeHtml(m.name)} <small style="color:var(--muted)">${escapeHtml(m.vendor)}</small></span>
          <span>${m.stat.shown - m.stat.correct} 次没猜中</span>
        </div>`).join("")}
      <button class="btn btn-small" id="reset-stats" style="margin-top:12px;">🧹 清空我的统计</button>
    </div>` : "";

  app().innerHTML = `
    <h2 class="page-title">🖼️ 结果墙 · 模型档案</h2>
    <p class="page-sub">每份结果都标注了来源与可信度：✅ 可溯源（有公开存档）/ 📜 社区流传（转述，未必逐字准确）。</p>
    ${leaderBoard}
    <div class="model-grid">
      ${DB.models.map((m) => {
        const outs = DB.results.filter((r) => r.modelKey === m.key);
        if (!outs.length) return "";
        const st = pm[m.key];
        return `
          <article class="card model-card">
            <h3>${escapeHtml(m.name)} ${st && st.shown ? `<span class="badge b-coral">被你猜中 ${Math.round((st.correct / st.shown) * 100)}%</span>` : ""}</h3>
            <div class="vendor">${escapeHtml(m.vendor)} · ${outs.length} 份结果</div>
            <div class="thumbs">
              ${outs.map((r) => r.type === "svg"
                ? `<button class="thumb" data-lb='${lbJson({ src: r.asset, cap: `${m.name} · ${r.date} · ${r.verified ? "✅ 可溯源" : "📜 社区流传"}`, href: r.asset, group: "gallery" })}' title="点击放大" aria-label="放大查看 ${escapeHtml(m.name)} 的输出图"><img src="${r.asset}" alt="${escapeHtml(m.name)} 输出" loading="lazy"></button>`
                : `<a class="thumb txt" href="#/game" title="去游戏里猜">📝</a>`).join("")}
            </div>
            ${outs[0].note ? `<div class="meta" style="font-size:12.5px;color:var(--muted)">🔍 ${escapeHtml(outs[0].note)}</div>` : ""}
          </article>`;
      }).join("")}
    </div>
  `;
  const resetBtn = $("#reset-stats");
  if (resetBtn) resetBtn.addEventListener("click", () => {
    store.reset();
    toast("统计已清空");
    viewGallery();
  });
}

/* ============================================================
   视图：投稿
   ============================================================ */
function viewSubmit() {
  app().innerHTML = `
    <h2 class="page-title">✍️ 上传你的测试结果</h2>
    <p class="page-sub">MVP 采用「GitHub 数据即代码」模式：填表 → 生成标准格式 → 一键提 Issue（或提 PR）。审核合并后全站可见。</p>
    <div class="submit-grid">
      <div class="card">
        <h3 style="margin-bottom:14px;">投稿表单</h3>
        <div class="form-field">
          <label>使用的题目 *</label>
          <select id="f-prompt">
            ${DB.prompts.map((p) => `<option value="${p.id}">${escapeHtml(p.title)}</option>`).join("")}
            <option value="_custom">自定义提示词…</option>
          </select>
        </div>
        <div class="form-field" id="f-custom-wrap" style="display:none;">
          <label>自定义提示词全文 *</label>
          <textarea id="f-custom" placeholder="粘贴你使用的完整提示词"></textarea>
        </div>
        <div class="form-field">
          <label>模型名称 * <small style="color:var(--muted);font-weight:400;">（如 GPT-4o / Claude 3.5 Sonnet / DeepSeek-V3 / 豆包…）</small></label>
          <input id="f-model" placeholder="模型名称">
        </div>
        <div class="form-field">
          <label>模型版本 / 思考强度 <small style="color:var(--muted);font-weight:400;">（如 2024-10-22 / high，越具体越有价值）</small></label>
          <input id="f-version" placeholder="版本或思考强度">
        </div>
        <div class="form-field">
          <label>测试日期 *</label>
          <input id="f-date" type="date">
        </div>
        <div class="form-field">
          <label>结果类型 *</label>
          <select id="f-type">
            <option value="svg">SVG / 代码类（可粘贴文本）</option>
            <option value="image">图片（截图）</option>
            <option value="text">纯文本回答</option>
          </select>
        </div>
        <div class="form-field">
          <label>结果内容 * <small style="color:var(--muted);font-weight:400;">（图片请把图床链接或说明写在这里）</small></label>
          <textarea id="f-output" placeholder="粘贴模型的完整输出，或图片链接"></textarea>
        </div>
        <div class="form-field">
          <label>你的昵称（可选，署名用）</label>
          <input id="f-nick" placeholder="匿名也可以">
        </div>
        <button class="btn btn-primary" id="f-gen">⚙️ 生成投稿内容</button>
        <div id="f-preview" style="margin-top:16px;"></div>
      </div>

      <div>
        <div class="card" style="margin-bottom:20px;">
          <h3 style="margin-bottom:10px;"> ✅ 投稿前请遵守「变量控制」</h3>
          <ul class="checklist">
            <li>🆕 新开空会话测，别在塞满上下文的老会话里测</li>
            <li>📌 固定思考强度，一个字别改提示词</li>
            <li>1️⃣ 保留<b>第一次</b>输出，不拿改了十次的版本</li>
            <li>🔁 同条件跑 3–5 次，挑有代表性的一次投稿</li>
            <li>🏷️ 如实填写模型名与版本——自报数据，诚信是社区的底线</li>
          </ul>
        </div>
        <div class="card">
          <h3 style="margin-bottom:10px;">🛠️ 两种贡献方式</h3>
          <p style="font-size:14px;color:var(--muted);margin-bottom:10px;"><b>方式一 · Issue（推荐给所有人）：</b>填上面的表单 → 生成内容 → 点「去 GitHub 提 Issue」，维护者合并进 data/ 目录。</p>
          <p style="font-size:14px;color:var(--muted);"><b>方式二 · PR（推荐极客）：</b>直接编辑仓库里的 <code>data/results.json</code> 按现有格式追加一条，提交 Pull Request。</p>
        </div>
      </div>
    </div>
  `;

  $("#f-prompt").addEventListener("change", () => {
    $("#f-custom-wrap").style.display = $("#f-prompt").value === "_custom" ? "block" : "none";
  });
  if (!$("#f-date").value) $("#f-date").value = new Date().toISOString().slice(0, 10);

  $("#f-gen").addEventListener("click", () => {
    const pid = $("#f-prompt").value;
    const p = promptById(pid);
    const title = $("#f-model").value.trim();
    const output = $("#f-output").value.trim();
    if (!title || !output) { toast("模型名称和结果内容必填哦"); return; }
    const promptText = pid === "_custom" ? $("#f-custom").value.trim() : p.prompt;
    const body = [
      "## 测试结果投稿", "",
      `- **题目**：${p ? p.title : "自定义"}${pid === "_custom" ? "" : `（${p.id}）`}`,
      `- **提示词**：\n\n> ${promptText}`,
      `- **模型**：${title}`,
      `- **版本/强度**：${$("#f-version").value.trim() || "未填写"}`,
      `- **日期**：${$("#f-date").value}`,
      `- **结果类型**：${$("#f-type").value}`,
      `- **昵称**：${$("#f-nick").value.trim() || "匿名"}`, "",
      "### 输出内容", "", "```", output, "```", "",
      "---",
      "*本投稿为社区自报数据，合并前请维护者按「变量控制」清单抽查。*"
    ].join("\n");

    const issueUrl = REPO_ISSUE_URL + "?title=" + encodeURIComponent("投稿：" + title + " · " + (p ? p.title : "自定义题")) + "&body=" + encodeURIComponent(body);
    $("#f-preview").innerHTML = `
      <div class="gen-output">${escapeHtml(body)}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn btn-small btn-blue" id="f-copymd">📋 复制投稿内容</button>
        <a class="btn btn-small btn-green" href="${issueUrl}" target="_blank" rel="noopener">🚀 去 GitHub 提 Issue</a>
      </div>
    `;
    $("#f-copymd").addEventListener("click", () => copyText(body, "投稿内容已复制 ✔"));
    $("#f-preview").scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

/* ============================================================
   视图：玩法 / 关于
   ============================================================ */
function viewAbout() {
  app().innerHTML = `
    <h2 class="page-title">💡 玩法说明</h2>
    <p class="page-sub">三步上手：拿题 → 去测 → 猜模型。</p>

    <div class="card about-section">
      <h3>🎮 怎么玩</h3>
      <ul>
        <li><b>题库</b>：复制一道测试题（鹈鹕骑车、秦始皇骑北极熊…），发给你自己的 AI。</li>
        <li><b>猜猜我是谁</b>：看别人上传的输出，四选一猜是哪个模型——每家模型都有「画风指纹」：上色习惯、结构逻辑、代码风格。</li>
        <li><b>投稿</b>：把你的测试结果上传，让更多人猜，也让题库滚雪球。</li>
      </ul>
    </div>

    <div class="card about-section">
      <h3>🧪 为什么一道题能看出模型水平</h3>
      <p>以鹈鹕骑车为例，它至少同时考了五件事：鹈鹕像不像鹈鹕（长喙+喉囊）、自行车结构是否成立、「骑」的动作是否成立（脚要落在踏板上）、动画是否联动、能否一次交付完整产物。</p>
      <p style="margin-top:8px;">判断顺序：<b>先看连接关系，再看视角，最后才看装饰</b>——画面再精美，脚悬在半空就是不及格。</p>
    </div>

    <div class="card about-section">
      <h3>📜 数据可信度分级</h3>
      <ul>
        <li>✅ <b>可溯源</b>：有公开存档出处（如 simonw/pelican-bicycle 的模型实测记录）。</li>
        <li>📜 <b>社区流传</b>：广为流传但文字为转述，未必逐字准确。</li>
        <li>⚠️ 所有用户投稿均为<b>自报数据</b>，无法自动验证真伪——把它当社区默契，别当中裁判决。未来计划接入 C2PA / SynthID 水印验证。</li>
      </ul>
    </div>

    <div class="card about-section">
      <h3>🗺️ Roadmap</h3>
      <ul>
        <li>✅ 题库 + 猜模型游戏 + 防背题生成器 + GitHub Issue 投稿（当前 MVP）</li>
        <li>🔜 每日挑战（Wordle 式全站同题）与分享卡片</li>
        <li>🔜 「降智时间线」：同一提示词按日期排列的输出变化</li>
        <li>🔜 结果水印验证 / API 指纹检测（中转站打假升级）</li>
      </ul>
    </div>

    <div class="card about-section">
      <h3>🙏 Credits</h3>
      <ul>
        <li>鹈鹕测试与 SVG 素材：<a href="https://github.com/simonw/pelican-bicycle" target="_blank" rel="noopener">simonw/pelican-bicycle</a>（Simon Willison）</li>
        <li>鹈鹕杯 / 降智检测文化：CodexRadar 社区与中文 AI 社区</li>
        <li>秦始皇骑北极熊示意图：AI 生成风格示意（非真实模型输出）</li>
      </ul>
    </div>
  `;
}

/* ---------- 启动 ---------- */
(async function init() {
  try {
    await loadData();
    lbInit();
    window.addEventListener("hashchange", router);
    router();
  } catch (e) {
    app().innerHTML = `<div class="card" style="text-align:center;"><h3>数据加载失败 😢</h3><p style="margin-top:8px;">如果是用 file:// 直接打开的，请改用本地服务器：<code>python -m http.server</code> 后访问 localhost:8000</p></div>`;
  }
})();
