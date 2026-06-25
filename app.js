function openPremium() {
  window.location.hash = "#/premium";
}

window.openPremium = openPremium;

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function savedStoryIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem("resonaSavedStories") || "[]"));
  } catch (error) {
    return new Set();
  }
}

function toggleSavedStory(storyKey) {
  const saved = savedStoryIds();
  if (saved.has(storyKey)) {
    saved.delete(storyKey);
  } else {
    saved.add(storyKey);
  }
  localStorage.setItem("resonaSavedStories", JSON.stringify([...saved]));
  archivePage();
}

window.toggleSavedStory = toggleSavedStory;

function adminToken() {
  try {
    return localStorage.getItem("resonaAdminToken") || "";
  } catch (error) {
    return "";
  }
}

function saveStudioToken() {
  const input = document.querySelector("#studio-token");
  const token = input?.value.trim() || "";
  try {
    if (token) {
      localStorage.setItem("resonaAdminToken", token);
      studioState("Admin token saved for this browser.", "ok");
    } else {
      localStorage.removeItem("resonaAdminToken");
      studioState("Admin token cleared.", "warn");
    }
  } catch (error) {
    studioState(error.message, "warn");
  }
  loadStudioDrafts();
}

async function apiFetch(path, options = {}) {
  const token = adminToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  const response = await fetch(path, {
    ...options,
    headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `API request failed: ${response.status}`);
  }
  return payload;
}

function studioState(message, kind = "muted") {
  const node = document.querySelector("#studio-state");
  if (!node) return;
  node.className = `studio-state ${kind}`;
  node.textContent = message;
}

async function loadStudioSignals(themeId = "us-china-ai-chip-controls") {
  const signalNode = document.querySelector("#studio-signals");
  if (!signalNode) return;
  signalNode.innerHTML = `<p class="muted-line">Listening for signals...</p>`;
  try {
    const payload = await apiFetch(`/api/signals?themeId=${encodeURIComponent(themeId)}`);
    signalNode.innerHTML = payload.signals
      .map(
        (signal) => `
          <article>
            <span>${signal.source || "signal"} / ${signal.region || "Global"} / ${signal.relevanceScore || "--"}</span>
            <h3>${signal.title}</h3>
            <p>${signal.summary || signal.url || "No summary available."}</p>
            ${signal.url ? `<a class="text-link" href="${signal.url}" target="_blank" rel="noreferrer">Source</a>` : ""}
          </article>
        `,
      )
      .join("");
    studioState(`Signal feed loaded. Source: ${payload.mode}. Cache: ${payload.cache}. Saved signals: ${payload.savedCount}.`, "ok");
  } catch (error) {
    signalNode.innerHTML = `<p class="muted-line">The API server is not running yet. Start it with Node to enable live signals.</p>`;
    studioState(error.message, "warn");
  }
  loadStudioDrafts();
}

async function generateStudioDraft(themeId = "us-china-ai-chip-controls") {
  const output = document.querySelector("#studio-draft");
  if (!output) return;
  output.innerHTML = `<p class="muted-line">Generating a pending story draft...</p>`;
  studioState("Generating draft...", "muted");
  try {
    const payload = await apiFetch("/api/stories/draft", {
      method: "POST",
      body: JSON.stringify({ themeId }),
    });
    const story = payload.story;
    const english = story.english || story;
    const japanese = story.japanese || {};
    output.innerHTML = `
      <article class="scenario-fiction-card studio-draft-card">
        <span class="fiction-label">${story.id} / ${story.status}</span>
        <h2>${english.title}</h2>
        <div class="glimpse-meta">
          <strong>${english.year}</strong>
          <b>${english.city} / ${english.country} / ${english.viewpoint}</b>
        </div>
        <div class="fiction-body">
          ${(Array.isArray(english.text) ? english.text : [english.text]).map((paragraph) => `<p>${paragraph}</p>`).join("")}
        </div>
        ${
          japanese.textJa?.length
            ? `<details class="translation-preview"><summary>Japanese translation</summary>${japanese.textJa.map((paragraph) => `<p>${paragraph}</p>`).join("")}</details>`
            : `<p class="muted-line">Japanese translation is pending or unavailable without OpenAI.</p>`
        }
        <footer>Saved to ${payload.path}</footer>
      </article>
    `;
    studioState(`Draft saved as pending. Provider: ${payload.provider}.`, "ok");
    loadStudioDrafts();
  } catch (error) {
    output.innerHTML = `<p class="muted-line">Draft generation requires the local API server.</p>`;
    studioState(error.message, "warn");
  }
}

async function analyzeStudioSignals(themeId = "us-china-ai-chip-controls") {
  const seedNode = document.querySelector("#studio-seed");
  if (!seedNode) return;
  seedNode.innerHTML = `<p class="muted-line">Analyzing signals into a story seed...</p>`;
  try {
    const payload = await apiFetch("/api/story-seeds", {
      method: "POST",
      body: JSON.stringify({ themeId, theme: themeId }),
    });
    const seed = payload.seed.seed;
    seedNode.innerHTML = `
      <article class="info-panel wide">
        <span class="eyebrow">${seed.id}</span>
        <h2>${seed.premise || "Story Seed"}</h2>
        <p>${seed.atmosphere || "No atmosphere returned."}</p>
        <div class="tags">
          ${(seed.possibleRegions || []).map((item) => `<span>${item}</span>`).join("")}
          ${(seed.protagonistOptions || []).map((item) => `<span>${item}</span>`).join("")}
          ${(seed.tensions || []).map((item) => `<span>${item}</span>`).join("")}
        </div>
      </article>
    `;
    studioState(`Story seed saved to ${payload.seed.path}.`, "ok");
  } catch (error) {
    seedNode.innerHTML = `<p class="muted-line">Signal analysis requires the local API server.</p>`;
    studioState(error.message, "warn");
  }
}

async function loadStudioDrafts() {
  const node = document.querySelector("#studio-review");
  if (!node) return;
  try {
    const payload = await apiFetch("/api/admin/drafts");
    if (!payload.stories.length) {
      node.innerHTML = `<p class="muted-line">No draft stories are waiting for review.</p>`;
      return;
    }
    node.innerHTML = payload.stories
      .slice(0, 8)
      .map((story) => {
        const english = story.english || story;
        return `
          <article class="studio-review-card">
            <span>${story.status} / ${story.theme}</span>
            <h3>${english.title || story.id}</h3>
            <p>${english.year || ""} / ${english.city || ""} / ${english.country || ""} / ${english.viewpoint || ""}</p>
            <button class="text-link button-link" type="button" onclick="publishStudioDraft('${story.file}')">Publish</button>
          </article>
        `;
      })
      .join("");
  } catch (error) {
    node.innerHTML = `<p class="muted-line">${error.message}</p>`;
  }
}

async function publishStudioDraft(file) {
  studioState("Publishing selected draft...", "muted");
  try {
    const payload = await apiFetch("/api/admin/publish", {
      method: "POST",
      body: JSON.stringify({ file }),
    });
    studioState(`Published to ${payload.path}.`, "ok");
    loadStudioDrafts();
  } catch (error) {
    studioState(error.message, "warn");
  }
}

async function loadPublishedApiStories() {
  const node = document.querySelector("#published-api-stories");
  if (!node) return;
  node.innerHTML = `<p class="muted-line">Reading published records...</p>`;
  try {
    const payload = await apiFetch("/api/stories/published?limit=12");
    if (!payload.stories?.length) {
      node.innerHTML = `<p class="muted-line">No API-published stories have entered the archive yet.</p>`;
      return;
    }
    node.innerHTML = payload.stories
      .map((story) => {
        const english = story.english || story;
        const text = Array.isArray(english.text) ? english.text : [english.text || ""];
        const firstSignals = (story.sourceSignals || []).slice(0, 3);
        return `
          <article class="api-story-card motion-reveal">
            <span>${escapeHtml(story.id || "published-story")}</span>
            <h3>${escapeHtml(english.title || "Untitled Record")}</h3>
            <p class="api-story-meta">${escapeHtml([english.year, english.city, english.country, english.viewpoint].filter(Boolean).join(" / "))}</p>
            <p>${escapeHtml(excerpt(text[0] || "", 180))}</p>
            <div class="tags">
              <span>${escapeHtml(story.theme || "theme")}</span>
              ${firstSignals.map((signal) => `<span>${escapeHtml(signal.title || signal)}</span>`).join("")}
            </div>
          </article>
        `;
      })
      .join("");
    initPageMotionSoon();
  } catch (error) {
    node.innerHTML = `<p class="muted-line">Start the API server to load published records. ${escapeHtml(error.message)}</p>`;
  }
}

window.loadStudioSignals = loadStudioSignals;
window.generateStudioDraft = generateStudioDraft;
window.analyzeStudioSignals = analyzeStudioSignals;
window.loadStudioDrafts = loadStudioDrafts;
window.publishStudioDraft = publishStudioDraft;
window.saveStudioToken = saveStudioToken;

const categories = [
  "Geopolitics",
  "Politics",
  "Technology",
  "Cyber Security",
  "Energy",
  "Semiconductor",
  "AI",
  "Capital Flows",
  "Society",
  "Climate",
  "Food",
  "Market Impact",
];

const categoryLabels = {
  Geopolitics: "Geopolitics",
  Politics: "Politics",
  Technology: "Technology",
  "Cyber Security": "Cyber Security",
  Energy: "Energy",
  Semiconductor: "Semiconductor",
  AI: "Artificial Intelligence",
  "Capital Flows": "Capital Flows",
  Society: "Society",
  Climate: "Climate",
  Food: "Food Systems",
  "Market Impact": "Markets",
};

function categoryLabel(category) {
  return categoryLabels[category] || category;
}

const themeCopy = {
  "us-china-ai-chip-controls": {
    title: "The Silicon Divide",
    slug: "silicon-divide",
    tagline: "Compute becomes a border.",
    summary: "Export controls, chip scarcity and sovereign AI programs turn computation into a political geography.",
  },
  "taiwan-contingency-risk": {
    title: "The Strait of Machines",
    slug: "strait-of-machines",
    tagline: "A quiet sea changes the price of everything.",
    summary: "Taiwan, semiconductors, shipping insurance and household electronics become part of the same fragile corridor.",
  },
  "middle-east-oil": {
    title: "The Bending Route",
    slug: "bending-route",
    tagline: "Energy arrives as distance.",
    summary: "Fuel, aviation, shipping and inflation bend around the politics of narrow waters.",
  },
  "russia-ukraine-energy": {
    title: "Winter Ledger",
    slug: "winter-ledger",
    tagline: "A war becomes a utility bill.",
    summary: "Energy networks, public budgets and ordinary rooms remember a war long after headlines move on.",
  },
  "generative-ai-regulation": {
    title: "The Memory License",
    slug: "memory-license",
    tagline: "Who is allowed to keep a voice?",
    summary: "AI regulation turns images, voices, consent and identity into the raw material of future memory.",
  },
  "state-backed-cyber": {
    title: "The City That Checks Yesterday",
    slug: "city-that-checks-yesterday",
    tagline: "Infrastructure begins to doubt itself.",
    summary: "State-backed attacks make water, health, money and public records feel slightly less certain.",
  },
  "supply-chain-fragmentation": {
    title: "The Season of Inventory",
    slug: "season-of-inventory",
    tagline: "Every shelf becomes a map.",
    summary: "Sanctions, export controls and logistics shocks turn supply chains into a domestic weather system.",
  },
  "billionaire-capital-ai-space": {
    title: "Private Moons",
    slug: "private-moons",
    tagline: "Private capital pulls public futures.",
    summary: "AI compute, satellites, media systems and sovereign money redraw power beyond elected institutions.",
  },
  "climate-migration-water-stress": {
    title: "The Water Address",
    slug: "water-address",
    tagline: "Cities grow where rivers disappear.",
    summary: "Heat, drought and migration reshape housing, care, work and the idea of home.",
  },
  "information-trust-fracture": {
    title: "The Proof of Morning",
    slug: "proof-of-morning",
    tagline: "Reality begins to require signatures.",
    summary: "Synthetic media, authentication and fractured feeds make shared reality a daily practice.",
  },
};

function themeTitle(theme) {
  return themeCopy[theme.id]?.title || theme.dashboardTitle || theme.title;
}

function themeSummary(theme) {
  return themeCopy[theme.id]?.summary || theme.summary;
}

function themeSlug(theme) {
  return themeCopy[theme.id]?.slug || theme.id;
}

function themeHref(theme) {
  return `#/theme/${themeSlug(theme)}`;
}

function themeFromSlug(slug) {
  return themes.find((theme) => theme.id === slug || themeSlug(theme) === slug);
}

const themes = [
  {
    id: "us-china-ai-chip-controls",
    title: "米中AI半導体規制",
    dashboardTitle: "米中テック摩擦",
    category: "Semiconductor",
    summary:
      "米国のAI半導体輸出規制が、中国AI産業、NVIDIA、TSMC、クラウド投資、半導体サプライチェーンへ波及する構造を追跡する。",
    countries: ["米国", "中国", "台湾", "日本", "オランダ"],
    companies: ["NVIDIA", "AMD", "TSMC", "ASML", "SMIC", "Huawei"],
    technologies: ["AIアクセラレータ", "EUV露光", "HBM", "EDA", "クラウドGPU"],
    score: 86,
    impact: ["半導体供給網", "AI企業の設備投資", "クラウド価格", "米中資本フロー"],
    scenarios: [
      "米国が先端GPUの対中規制を強化し、中国AI企業の調達コストが上昇する。",
      "中国は国産GPUと独自AIスタックの開発を加速し、技術圏の分断が進む。",
      "台湾依存が再評価され、日米欧の補助金競争と製造拠点分散が強まる。",
    ],
    nodes: [
      "米国のAI半導体輸出規制",
      "NVIDIA・中国AI企業・TSMCに影響",
      "中国の国産GPU開発加速",
      "米中テック分断が進行",
      "半導体サプライチェーンリスク上昇",
    ],
  },
  {
    id: "taiwan-contingency-risk",
    title: "台湾海峡と半導体の未来",
    dashboardTitle: "台湾海峡と半導体",
    category: "Geopolitics",
    summary:
      "台湾海峡の軍事圧力が、半導体供給、海上輸送、保険料、同盟国の防衛支出、市場ボラティリティに連鎖するリスクを可視化する。",
    countries: ["台湾", "中国", "米国", "日本", "フィリピン"],
    companies: ["TSMC", "UMC", "Apple", "Sony", "Toyota"],
    technologies: ["先端ロジック半導体", "海底ケーブル", "衛星監視", "防空システム"],
    score: 92,
    impact: ["半導体生産", "海運", "防衛関連銘柄", "円・ドル", "電子機器価格"],
    scenarios: [
      "軍事演習の常態化により台湾周辺の航路リスクが恒常化する。",
      "半導体在庫の積み増しが起こり、短期需要と長期過剰在庫が同時に発生する。",
      "日本、米国、欧州がサプライチェーン安全保障をさらに制度化する。",
    ],
    nodes: ["台湾海峡の緊張", "海運・保険コスト上昇", "TSMC供給不安", "電子機器メーカーの調達再設計", "市場ボラティリティ上昇"],
  },
  {
    id: "middle-east-oil",
    title: "中東情勢と原油価格",
    dashboardTitle: "中東とエネルギーの変化",
    category: "Energy",
    summary:
      "中東の軍事・外交イベントが、原油価格、LNG、インフレ期待、中央銀行政策、航空・物流コストへ伝播する経路を分析する。",
    countries: ["イラン", "イスラエル", "サウジアラビア", "米国", "カタール"],
    companies: ["Saudi Aramco", "ExxonMobil", "Shell", "JERA", "航空各社"],
    technologies: ["LNG設備", "タンカー運航", "ミサイル防衛", "エネルギートレーディング"],
    score: 78,
    impact: ["原油価格", "インフレ率", "航空燃料", "新興国通貨", "中央銀行政策"],
    scenarios: [
      "ホルムズ海峡リスクが再燃し、エネルギー価格に地政学プレミアムが乗る。",
      "産油国の増産余地が市場心理を抑えるが、物流保険料は高止まりする。",
      "インフレ期待の再上昇が利下げ時期を後退させる。",
    ],
    nodes: ["中東緊張の上昇", "ホルムズ海峡リスク", "原油・LNG価格上昇", "インフレ期待再燃", "株式市場のリスクオフ"],
  },
  {
    id: "russia-ukraine-energy",
    title: "ロシア・ウクライナ戦争とエネルギー",
    dashboardTitle: "欧州エネルギーの転換",
    category: "Energy",
    summary:
      "長期化する戦争が、欧州ガス需給、制裁、軍需産業、穀物、財政支出に与える複合的な影響を整理する。",
    countries: ["ロシア", "ウクライナ", "EU", "米国", "トルコ"],
    companies: ["Gazprom", "Rheinmetall", "Equinor", "穀物メジャー"],
    technologies: ["LNG", "ドローン", "防空", "送電網防護"],
    score: 74,
    impact: ["欧州電力価格", "防衛支出", "穀物価格", "制裁リスク", "財政赤字"],
    scenarios: [
      "制裁と迂回貿易の攻防が続き、エネルギー取引の透明性が低下する。",
      "ドローン攻撃がエネルギー施設に波及し、供給不安が季節的に再燃する。",
      "欧州の防衛・エネルギー投資が構造的に増える。",
    ],
    nodes: ["戦争長期化", "エネルギー施設への攻撃リスク", "欧州ガス価格の不安定化", "防衛・エネルギー投資増加", "財政と市場金利に圧力"],
  },
  {
    id: "generative-ai-regulation",
    title: "生成AI規制",
    dashboardTitle: "AI覇権競争",
    category: "AI",
    summary:
      "生成AI規制、著作権、モデル安全性、データ主権が、AI企業の競争力と国家間の技術標準争いへ接続する構造を見る。",
    countries: ["米国", "EU", "中国", "日本", "英国"],
    companies: ["OpenAI", "Google", "Microsoft", "Meta", "Anthropic"],
    technologies: ["LLM", "AI Safety", "RAG", "データガバナンス", "透かし技術"],
    score: 67,
    impact: ["AIサービス", "広告市場", "クラウド需要", "著作権訴訟", "規制対応コスト"],
    scenarios: [
      "EU型の包括規制と米国型の業界主導が並走し、地域別対応コストが増える。",
      "安全性評価が調達要件になり、法人向けAI市場で寡占が進む。",
      "データ主権の強化により、国別クラウドとローカルモデル需要が増える。",
    ],
    nodes: ["生成AIの社会実装拡大", "安全性・著作権規制強化", "地域別コンプライアンスコスト増", "大手クラウド優位が拡大", "AI市場の寡占と標準争い"],
  },
  {
    id: "state-backed-cyber",
    title: "国家支援型サイバー攻撃",
    dashboardTitle: "見えない都市の攻撃",
    category: "Cyber Security",
    summary:
      "国家支援型攻撃が重要インフラ、金融、サプライチェーン、選挙、企業価値に及ぼす影響をリスクボード化する。",
    countries: ["米国", "中国", "ロシア", "北朝鮮", "イラン"],
    companies: ["Microsoft", "CrowdStrike", "Palo Alto Networks", "金融機関", "通信事業者"],
    technologies: ["APT", "ゼロデイ", "EDR", "SIEM", "OTセキュリティ"],
    score: 84,
    impact: ["重要インフラ", "金融システム", "通信網", "選挙制度", "企業信用"],
    scenarios: [
      "地政学イベントの前後で、通信・金融・政府機関への攻撃が増える。",
      "ソフトウェア供給網を狙う攻撃により、単一企業の侵害が広域障害へ拡大する。",
      "サイバー保険料と監査要求が上がり、企業の運用保守需要が増える。",
    ],
    nodes: ["地政学的緊張", "国家支援APT活動増加", "重要インフラ・金融へ侵入", "業務停止と信用毀損", "サイバー投資・監査需要増"],
  },
  {
    id: "supply-chain-fragmentation",
    title: "サプライチェーン分断",
    dashboardTitle: "金融市場への影響",
    category: "Market Impact",
    summary:
      "デカップリング、フレンドショアリング、輸出規制、制裁が企業収益、設備投資、為替、インフレにどう伝播するかを捉える。",
    countries: ["米国", "中国", "日本", "インド", "メキシコ", "EU"],
    companies: ["Apple", "Toyota", "Samsung", "Foxconn", "商社"],
    technologies: ["製造自動化", "サプライチェーン管理", "半導体製造", "物流DX"],
    score: 71,
    impact: ["企業利益率", "設備投資", "消費者物価", "為替", "新興国FDI"],
    scenarios: [
      "企業は調達先を分散し、短期的にコスト高、長期的に地域ブロック化が進む。",
      "インド、メキシコ、東南アジアへの投資が増え、勝ち地域と負け地域が分かれる。",
      "供給網の余剰化が利益率を圧迫する一方、地政学耐性は高まる。",
    ],
    nodes: ["輸出規制・制裁の拡大", "調達先の再配置", "設備投資と物流コスト増", "企業利益率に圧力", "市場は地域分散企業を再評価"],
  },
  {
    id: "us-political-fragmentation",
    title: "米国政治分断と制度の揺らぎ",
    dashboardTitle: "米国政治と制度の揺らぎ",
    category: "Politics",
    summary:
      "選挙、議会対立、移民、対中政策、司法判断が、テック規制、防衛支出、金融市場、同盟国の政策判断へ波及する構造を見る。",
    countries: ["米国", "中国", "メキシコ", "EU", "日本"],
    companies: ["Meta", "Google", "Tesla", "防衛関連企業", "金融機関"],
    technologies: ["選挙セキュリティ", "SNS", "AI規制", "国境監視", "防衛技術"],
    score: 82,
    impact: ["ドル金利", "対中規制", "移民政策", "SNS規制", "同盟国の防衛計画"],
    scenarios: [
      "選挙サイクルごとに対中強硬策と産業政策が再編され、企業の規制対応が長期化する。",
      "SNSと生成AIをめぐる情報空間の不信が、選挙制度と広告市場に圧力をかける。",
      "移民、財政、防衛支出をめぐる対立が、米国債・ドル・同盟国の政策判断へ波及する。",
    ],
    nodes: ["米国内政治分断", "対中政策・移民政策の振れ幅拡大", "テック規制と防衛支出に波及", "市場は政策プレミアムを織り込む", "同盟国の安全保障判断が前倒しされる"],
  },
  {
    id: "europe-populism-migration",
    title: "欧州ポピュリズムと移民政治",
    dashboardTitle: "欧州政治と移民の変化",
    category: "Politics",
    summary:
      "移民、エネルギー価格、財政負担、右派政党の伸長が、EU統合、国境管理、防衛費、気候政策の持続性へ接続する。",
    countries: ["EU", "フランス", "ドイツ", "イタリア", "ポーランド"],
    companies: ["欧州電力会社", "自動車メーカー", "防衛関連企業", "金融機関"],
    technologies: ["国境管理", "再エネ", "防衛システム", "公共データ基盤"],
    score: 73,
    impact: ["EU規制", "移民政策", "防衛費", "気候政策", "欧州株式市場"],
    scenarios: [
      "生活費と移民問題が結びつき、EU各国で政策の内向き化が進む。",
      "気候政策と産業保護の両立が難しくなり、自動車・エネルギー産業に調整圧力がかかる。",
      "防衛費と社会保障費の競合が、財政と市場金利を揺らす。",
    ],
    nodes: ["生活費と移民不安", "右派・ポピュリズム伸長", "EU政策の合意形成が遅延", "防衛・気候・産業政策が再調整", "欧州市場の政治リスク上昇"],
  },
  {
    id: "billionaire-capital-ai-space",
    title: "世界富豪とAI・宇宙資本の移動",
    dashboardTitle: "富豪・巨大資本の動き",
    category: "Capital Flows",
    summary:
      "テック創業者、AIインフラ投資、宇宙・防衛企業、財団資本、ソブリンマネーが、国家政策と市場の方向をどう押し動かすかを見る。",
    countries: ["米国", "UAE", "サウジアラビア", "フランス", "シンガポール"],
    companies: ["SpaceX", "Amazon", "Meta", "OpenAI周辺企業", "AIデータセンター事業者"],
    technologies: ["AIデータセンター", "衛星通信", "ロボティクス", "核融合", "防衛テック"],
    score: 76,
    impact: ["AI電力需要", "宇宙インフラ", "防衛産業", "メディア影響力", "都市・不動産投資"],
    scenarios: [
      "巨大テック資本がAI計算資源と電力インフラへ集中し、国家の産業政策と重なっていく。",
      "宇宙通信、防衛テック、衛星データが、民間企業と国家安全保障の境界を曖昧にする。",
      "富豪・財団・ソブリンマネーの移動が、都市、不動産、研究機関、メディアの力学を変える。",
    ],
    nodes: ["富豪資本がAI・宇宙へ集中", "計算資源と電力需要が急拡大", "国家政策と民間インフラが接近", "防衛・通信・メディア影響力が増す", "市場は個人資本の地政学化を織り込む"],
  },
  {
    id: "climate-migration-water-stress",
    title: "気候移民と水ストレス",
    dashboardTitle: "気候移民と水の時代",
    category: "Climate",
    summary: "熱波、水不足、農地の劣化、都市流入が、国境、住宅、食料、医療へ静かに広がっていく。",
    countries: ["インド", "エジプト", "ナイジェリア", "EU", "米国"],
    companies: ["水道事業者", "農業企業", "保険会社", "建設会社"],
    technologies: ["淡水化", "水再利用", "気候予測", "都市冷却", "灌漑"],
    score: 69,
    impact: ["都市インフラ", "住宅", "食料価格", "医療", "国境管理"],
    scenarios: [
      "熱波と水不足で農村から都市への移動が増える。",
      "都市は住宅、医療、水道、学校の受け入れ能力を試される。",
      "国境政策より先に、生活圏そのものが再配置される。",
    ],
    nodes: ["熱波と渇水", "農地と雇用の喪失", "都市への移動", "住宅と水道への負荷", "新しい生活圏"],
  },
  {
    id: "aging-society-care-labor",
    title: "高齢化とケア労働",
    dashboardTitle: "高齢化とケアの未来",
    category: "Society",
    summary: "高齢化、労働力不足、介護、移民、ロボティクスが、家族と都市の時間を組み替えていく。",
    countries: ["日本", "韓国", "イタリア", "ドイツ", "中国"],
    companies: ["医療機関", "介護事業者", "ロボット企業", "保険会社"],
    technologies: ["介護ロボット", "遠隔医療", "見守りAI", "認知症ケア", "在宅医療"],
    score: 63,
    impact: ["家族", "医療制度", "労働市場", "移民政策", "地方都市"],
    scenarios: [
      "働く世代が減り、ケアの時間が社会全体の予定表を変える。",
      "在宅医療と見守りAIが、家庭の中へ入ってくる。",
      "移民とロボットが、誰が誰を支えるのかという問いを日常化する。",
    ],
    nodes: ["高齢化", "ケア人材不足", "在宅医療の拡大", "家庭の時間が変化", "都市の優先順位が変わる"],
  },
  {
    id: "housing-affordability-generation",
    title: "住宅危機と世代格差",
    dashboardTitle: "住めない都市",
    category: "Society",
    summary: "住宅価格、家賃、金利、都市集中、若年層の所得が、未来の家族像と移動の自由を変えていく。",
    countries: ["米国", "英国", "カナダ", "オーストラリア", "日本"],
    companies: ["不動産会社", "住宅ローン会社", "建設会社", "投資ファンド"],
    technologies: ["住宅データ", "建設自動化", "スマートシティ", "リモートワーク"],
    score: 66,
    impact: ["若年世代", "家族形成", "都市通勤", "教育", "地方移住"],
    scenarios: [
      "都市に仕事は集まるが、住む場所は遠ざかる。",
      "若い世代は家を所有するより、移動可能な生活を選び始める。",
      "住宅は資産である前に、未来を始める権利として語られる。",
    ],
    nodes: ["住宅価格上昇", "家賃負担の増加", "若年層の選択肢縮小", "都市外への移動", "家族像の変化"],
  },
  {
    id: "food-security-price-shock",
    title: "食料安全保障と価格ショック",
    dashboardTitle: "食料と気候の揺らぎ",
    category: "Food",
    summary: "戦争、気候、肥料、海運、穀物輸出が、食卓の値段と学校給食の献立に届いていく。",
    countries: ["ウクライナ", "ロシア", "インド", "ブラジル", "エジプト"],
    companies: ["穀物メジャー", "食品メーカー", "肥料会社", "小売企業"],
    technologies: ["精密農業", "代替タンパク", "作物予測", "冷蔵物流"],
    score: 70,
    impact: ["食卓", "学校給食", "新興国財政", "農業投資", "物流"],
    scenarios: [
      "穀物と肥料の価格が、献立と家計を変える。",
      "気候不順で収穫予測が揺れ、輸出規制が増える。",
      "食料は安い商品ではなく、国家の安心そのものとして扱われる。",
    ],
    nodes: ["気候不順と戦争", "穀物と肥料の揺らぎ", "輸出規制", "食卓価格の変化", "食料政策の再編"],
  },
  {
    id: "information-trust-fracture",
    title: "情報空間の分断と信頼の低下",
    dashboardTitle: "信じる力のゆらぎ",
    category: "Society",
    summary: "SNS、生成AI、偽情報、選挙、教育、メディアが、人々が同じ現実を共有する力を弱めていく。",
    countries: ["米国", "EU", "インド", "ブラジル", "日本"],
    companies: ["Meta", "X", "Google", "TikTok", "報道機関"],
    technologies: ["生成AI", "推薦アルゴリズム", "本人確認", "透かし技術", "ファクトチェック"],
    score: 75,
    impact: ["選挙", "教育", "家族会話", "メディア", "公共政策"],
    scenarios: [
      "本物らしい映像と声が、誰でも作れるようになる。",
      "人々はニュースより先に、自分のタイムラインの温度で世界を知る。",
      "同じ都市に暮らしていても、別々の現実を見ている感覚が強くなる。",
    ],
    nodes: ["生成AIとSNS", "偽情報の増加", "信頼の低下", "選挙と教育への影響", "現実感の分裂"],
  },
];

const app = document.querySelector("#app");

const riskEvents = [
  {
    id: "us-china-ai-chip-controls",
    themeId: "us-china-ai-chip-controls",
    label: "米中AI半導体規制",
    region: "ワシントン / 北京 / 台北",
    x: 74,
    y: 41,
    score: 86,
    category: "Semiconductor",
    note: "AI半導体輸出規制が、中国AI企業、NVIDIA、TSMC、クラウドGPU価格へ波及。",
  },
  {
    id: "taiwan-contingency-risk",
    themeId: "taiwan-contingency-risk",
    label: "台湾海峡と半導体",
    region: "台湾海峡",
    x: 78,
    y: 49,
    score: 92,
    category: "Geopolitics",
    note: "台湾海峡の緊張が半導体供給、海上輸送、保険料、市場ボラティリティに接続。",
  },
  {
    id: "middle-east-oil",
    themeId: "middle-east-oil",
    label: "中東とエネルギーの変化",
    region: "中東 / ホルムズ海峡",
    x: 56,
    y: 47,
    score: 78,
    category: "Energy",
    note: "ホルムズ海峡と産油国情勢が原油、LNG、航空燃料、インフレ期待に波及。",
  },
  {
    id: "russia-ukraine-energy",
    themeId: "russia-ukraine-energy",
    label: "ロシア・ウクライナ戦争",
    region: "東欧",
    x: 55,
    y: 31,
    score: 74,
    category: "Energy",
    note: "戦争長期化が欧州ガス価格、防衛支出、制裁、財政と市場金利に圧力をかける。",
  },
  {
    id: "generative-ai-regulation",
    themeId: "generative-ai-regulation",
    label: "生成AI規制",
    region: "EU / 米国 / 日本",
    x: 48,
    y: 35,
    score: 67,
    category: "AI",
    note: "安全性、著作権、データ主権がAIサービス、クラウド需要、規制対応コストを変える。",
  },
  {
    id: "state-backed-cyber",
    themeId: "state-backed-cyber",
    label: "国家支援型サイバー攻撃",
    region: "世界のサイバー空間",
    x: 39,
    y: 39,
    score: 84,
    category: "Cyber Security",
    note: "国家支援APTが重要インフラ、金融、通信、選挙制度へ低強度で圧力をかける。",
  },
  {
    id: "supply-chain-fragmentation",
    themeId: "supply-chain-fragmentation",
    label: "サプライチェーン分断",
    region: "米国 / 中国 / インド / メキシコ",
    x: 70,
    y: 56,
    score: 71,
    category: "Market Impact",
    note: "輸出規制と制裁が調達先再配置、設備投資、企業利益率、インフレに波及。",
  },
  {
    id: "south-china-sea",
    themeId: "taiwan-contingency-risk",
    label: "南シナ海航行の変化",
    region: "南シナ海",
    x: 75,
    y: 58,
    score: 76,
    category: "Geopolitics",
    note: "海上交通路の緊張が半導体、消費財、海運保険、ASEAN投資判断へ波及。",
  },
  {
    id: "korean-peninsula",
    themeId: "state-backed-cyber",
    label: "朝鮮半島ミサイル・サイバー",
    region: "朝鮮半島",
    x: 80,
    y: 43,
    score: 73,
    category: "Cyber Security",
    note: "ミサイル実験とサイバー活動が防衛関連、暗号資産、金融システム監視を揺らす。",
  },
  {
    id: "india-china-border",
    themeId: "supply-chain-fragmentation",
    label: "印中国境・製造移転",
    region: "ヒマラヤ / インド",
    x: 68,
    y: 49,
    score: 61,
    category: "Geopolitics",
    note: "国境摩擦と製造移転がインド投資、スマートフォン製造、物流再編に影響。",
  },
  {
    id: "red-sea-shipping",
    themeId: "middle-east-oil",
    label: "紅海・スエズ航路",
    region: "紅海 / スエズ",
    x: 53,
    y: 50,
    score: 81,
    category: "Energy",
    note: "紅海の航行リスクが欧州向け輸送、エネルギー、船腹需給、納期へ波及。",
  },
  {
    id: "arctic-route",
    themeId: "russia-ukraine-energy",
    label: "北極海航路・資源競争",
    region: "北極圏",
    x: 54,
    y: 16,
    score: 58,
    category: "Energy",
    note: "北極圏の航路と資源権益がロシア、中国、欧州、海運会社の長期戦略を変える。",
  },
  {
    id: "eu-ai-act",
    themeId: "generative-ai-regulation",
    label: "EU AI規制",
    region: "ブリュッセル / EU",
    x: 49,
    y: 36,
    score: 64,
    category: "AI",
    note: "EU型AI規制がモデル評価、データ管理、組織導入、クラウド利用へ波及。",
  },
  {
    id: "us-election-cyber",
    themeId: "state-backed-cyber",
    label: "選挙干渉・情報工作",
    region: "米国",
    x: 21,
    y: 42,
    score: 77,
    category: "Cyber Security",
    note: "選挙期の偽情報、侵入、リークが政策予測、市場心理、SNS規制に影響。",
  },
  {
    id: "global-ransomware",
    themeId: "state-backed-cyber",
    label: "ランサムウェア産業化",
    region: "世界",
    x: 43,
    y: 46,
    score: 82,
    category: "Cyber Security",
    note: "医療、自治体、物流を狙う攻撃が保険料、監査、業務継続計画を押し上げる。",
  },
  {
    id: "rare-earth-controls",
    themeId: "supply-chain-fragmentation",
    label: "レアアース輸出規制",
    region: "中国 / 世界供給網",
    x: 73,
    y: 45,
    score: 79,
    category: "Technology",
    note: "レアアースと重要鉱物の輸出規制がEV、風力、半導体、防衛産業へ波及。",
  },
  {
    id: "lithium-triangle",
    themeId: "supply-chain-fragmentation",
    label: "リチウム資源ナショナリズム",
    region: "チリ / アルゼンチン / ボリビア",
    x: 29,
    y: 75,
    score: 57,
    category: "Energy",
    note: "電池資源の国家管理がEV価格、蓄電池投資、鉱山権益競争に影響。",
  },
  {
    id: "panama-canal-drought",
    themeId: "supply-chain-fragmentation",
    label: "パナマ運河・水不足",
    region: "パナマ運河",
    x: 27,
    y: 56,
    score: 62,
    category: "Market Impact",
    note: "渇水による通航制限が米州物流、穀物、エネルギー輸送、在庫戦略を変える。",
  },
  {
    id: "black-sea-food",
    themeId: "russia-ukraine-energy",
    label: "黒海穀物輸送",
    region: "黒海",
    x: 55,
    y: 39,
    score: 69,
    category: "Market Impact",
    note: "黒海の輸送不安が穀物価格、新興国インフレ、食品メーカーの調達に波及。",
  },
  {
    id: "space-asat",
    themeId: "state-backed-cyber",
    label: "衛星・宇宙インフラ攻撃",
    region: "低軌道",
    x: 62,
    y: 22,
    score: 66,
    category: "Technology",
    note: "衛星通信、測位、観測網への攻撃リスクが軍事、金融、物流、災害対応に接続。",
  },
  {
    id: "quantum-encryption",
    themeId: "generative-ai-regulation",
    label: "量子暗号移行",
    region: "米国 / EU / 日本",
    x: 61,
    y: 33,
    score: 52,
    category: "Technology",
    note: "耐量子暗号への移行が金融、政府調達、クラウド、長期秘密情報の管理を変える。",
  },
  {
    id: "dollar-liquidity",
    themeId: "supply-chain-fragmentation",
    label: "ドル流動性ショック",
    region: "ニューヨーク / 世界市場",
    x: 25,
    y: 39,
    score: 72,
    category: "Market Impact",
    note: "米金利とドル調達環境が新興国通貨、企業債務、資源価格を同時に揺らす。",
  },
  {
    id: "climate-migration",
    themeId: "middle-east-oil",
    label: "気候移民・水ストレス",
    region: "サヘル / 中東",
    x: 50,
    y: 58,
    score: 65,
    category: "Geopolitics",
    note: "水不足と熱波が移民、食料、都市インフラ、政治不安定化へ連鎖する。",
  },
  {
    id: "copper-grid-shortage",
    themeId: "supply-chain-fragmentation",
    label: "銅・送電網ボトルネック",
    region: "チリ / ペルー / 世界の送電網",
    x: 31,
    y: 69,
    score: 59,
    category: "Energy",
    note: "銅需給と送電網投資の遅れがAIデータセンター、EV、再エネ接続、電力価格に波及。",
  },
  {
    id: "us-political-fragmentation",
    themeId: "us-political-fragmentation",
    label: "米国政治分断",
    region: "ワシントン / サンベルト",
    x: 22,
    y: 42,
    score: 82,
    category: "Politics",
    note: "選挙、議会対立、対中政策、移民がドル、テック規制、防衛支出へ波及。",
  },
  {
    id: "europe-populism-migration",
    themeId: "europe-populism-migration",
    label: "欧州ポピュリズム・移民政治",
    region: "EU中核国 / 地中海",
    x: 49,
    y: 36,
    score: 73,
    category: "Politics",
    note: "移民、生活費、エネルギー、防衛費がEU統合と市場心理に圧力をかける。",
  },
  {
    id: "billionaire-capital-ai-space",
    themeId: "billionaire-capital-ai-space",
    label: "富豪・AI宇宙資本",
    region: "米国 / 湾岸 / 世界資本",
    x: 24,
    y: 43,
    score: 76,
    category: "Capital Flows",
    note: "AI、宇宙、防衛、電力、メディアへ個人資本と巨大資本が集中する。",
  },
  {
    id: "climate-migration-water-stress",
    themeId: "climate-migration-water-stress",
    label: "気候移民と水ストレス",
    region: "デリー / カイロ / サヘル",
    x: 58,
    y: 60,
    score: 69,
    category: "Climate",
    note: "熱波、水不足、都市流入が住宅、医療、食料、国境管理に現れる。",
  },
  {
    id: "aging-society-care-labor",
    themeId: "aging-society-care-labor",
    label: "高齢化とケア労働",
    region: "東京 / ソウル / ローマ",
    x: 82,
    y: 42,
    score: 63,
    category: "Society",
    note: "高齢化と人手不足が、家族、医療、移民、都市の時間を変える。",
  },
  {
    id: "housing-affordability-generation",
    themeId: "housing-affordability-generation",
    label: "住宅危機と世代格差",
    region: "ロンドン / トロント / シドニー",
    x: 45,
    y: 38,
    score: 66,
    category: "Society",
    note: "家賃、金利、都市集中が、若い世代の移動と家族形成を変える。",
  },
  {
    id: "food-security-price-shock",
    themeId: "food-security-price-shock",
    label: "食料安全保障",
    region: "キーウ / カイロ / ニューデリー",
    x: 57,
    y: 45,
    score: 70,
    category: "Food",
    note: "穀物、肥料、気候、海運が食卓と学校給食に届く。",
  },
  {
    id: "information-trust-fracture",
    themeId: "information-trust-fracture",
    label: "情報空間の分断",
    region: "ワシントン / ブリュッセル / 東京",
    x: 34,
    y: 36,
    score: 75,
    category: "Society",
    note: "生成AI、SNS、偽情報が、人々が同じ現実を共有する力を弱める。",
  },
];

const eventCoordinates = {
  "us-china-ai-chip-controls": [35.7, 116.4],
  "taiwan-contingency-risk": [23.7, 121.0],
  "middle-east-oil": [26.6, 52.0],
  "russia-ukraine-energy": [49.0, 32.0],
  "generative-ai-regulation": [50.9, 4.4],
  "state-backed-cyber": [39.0, -77.0],
  "supply-chain-fragmentation": [22.3, 114.2],
  "south-china-sea": [12.0, 114.0],
  "korean-peninsula": [38.5, 127.5],
  "india-china-border": [31.0, 80.0],
  "red-sea-shipping": [18.8, 39.5],
  "arctic-route": [72.0, 70.0],
  "eu-ai-act": [50.85, 4.35],
  "us-election-cyber": [38.9, -77.0],
  "global-ransomware": [52.5, 13.4],
  "rare-earth-controls": [36.0, 104.0],
  "lithium-triangle": [-23.5, -67.0],
  "panama-canal-drought": [9.1, -79.7],
  "black-sea-food": [45.3, 34.0],
  "space-asat": [28.5, -80.6],
  "quantum-encryption": [35.7, 139.7],
  "dollar-liquidity": [40.7, -74.0],
  "climate-migration": [15.0, 20.0],
  "copper-grid-shortage": [-20.2, -70.1],
  "us-political-fragmentation": [38.9, -77.0],
  "europe-populism-migration": [48.8, 2.3],
  "billionaire-capital-ai-space": [37.4, -122.1],
  "climate-migration-water-stress": [28.6, 77.2],
  "aging-society-care-labor": [35.7, 139.7],
  "housing-affordability-generation": [51.5, -0.1],
  "food-security-price-shock": [50.45, 30.52],
  "information-trust-fracture": [38.9, -77.0],
};

const capitalMoves = [
  {
    title: "The Engines Gather",
    actor: "Founders beneath the cloud",
    vector: "Under desert light, power and capital assemble for artificial minds.",
    region: "US West Coast / Gulf Capital",
    intensity: 86,
  },
  {
    title: "Private Orbit",
    actor: "Owners of the low sky",
    vector: "Private satellites pass above public borders.",
    region: "US / Europe / Low Earth Orbit",
    intensity: 78,
  },
  {
    title: "Mirrors of Power",
    actor: "Old money, new screens",
    vector: "Foundations, towers, media systems and silence begin to align.",
    region: "US / Europe / Asia",
    intensity: 69,
  },
  {
    title: "The Quiet Treasury",
    actor: "Desert funds, island vaults",
    vector: "Money moves through stadiums, ports, chips and towers.",
    region: "Gulf / Singapore / Global Markets",
    intensity: 74,
  },
];

function riskLevel(score) {
  if (score <= 30) return { label: "Faint", className: "low" };
  if (score <= 60) return { label: "Awake", className: "mid" };
  if (score <= 80) return { label: "Bright", className: "high" };
  return { label: "Red", className: "critical" };
}

function riskGauge(score) {
  const level = riskLevel(score);
  return `
    <div class="risk-gauge ${level.className}" aria-label="Signal ${score}">
      <div class="gauge-ring" style="--score:${score}"><span>${score}</span></div>
      <div>
        <strong>${level.label}</strong>
        <small>Signal</small>
      </div>
    </div>
  `;
}

function tags(items) {
  return `<div class="tags">${items.map((item) => `<span>${item}</span>`).join("")}</div>`;
}

function causalMap(nodes) {
  return `
    <ol class="causal-map">
      ${nodes
        .map(
          (node, index) => `
            <li>
              <span class="node-index">${String(index + 1).padStart(2, "0")}</span>
              <p>${node}</p>
            </li>
          `,
        )
        .join("")}
    </ol>
  `;
}

const updatePolicy = {
  refreshWindowDays: [7, 30],
  worldShiftThreshold: 72,
  publishMode: "pending-review",
  storyPathPattern: "themes/{themeId}/stories",
  sourceTypes: ["news", "policy", "market", "technology", "social"],
};

const externalTopicFeeds = [
  { id: "world-news", type: "news", status: "planned", description: "国際ニュース、政策発表、紛争、選挙、社会変化を取得する想定。" },
  { id: "technology-policy", type: "technology", status: "planned", description: "AI、半導体、サイバー、宇宙、重要技術の変化を取得する想定。" },
  { id: "human-impact", type: "social", status: "planned", description: "生活、移民、住宅、食料、医療、教育への影響を取得する想定。" },
];

const pendingThemeCandidates = [
  {
    id: "candidate-arctic-cities",
    status: "pending",
    detectedAt: "2026-06-16",
    sourceSignals: ["北極航路", "資源開発", "軍事拠点", "先住民コミュニティ"],
    title: "北極都市と新しい航路",
    suggestedCategory: "Climate",
    reason: "気候変化、資源、物流、軍事、生活圏が同時に動いているため。",
  },
  {
    id: "candidate-biosecurity-everyday-life",
    status: "pending",
    detectedAt: "2026-06-16",
    sourceSignals: ["感染症監視", "下水疫学", "空港検疫", "バイオテック"],
    title: "バイオセキュリティと日常生活",
    suggestedCategory: "Society",
    reason: "医療と都市監視が生活のインフラへ入り始めているため。",
  },
];

const sourceSignalSeeds = {
  "taiwan-contingency-risk": ["半導体投資の東南アジア移転", "台湾海峡周辺の航路変更", "日本企業の調達再設計"],
  "russia-ukraine-energy": ["欧州LNG調達の長期化", "防衛投資の拡大", "ノルウェーと供給国の役割変化"],
  "us-china-ai-chip-controls": ["AI半導体輸出規制", "インド半導体投資", "クラウドGPU供給制約"],
  "information-trust-fracture": ["生成AI映像の増加", "選挙時の偽情報対策", "本人確認技術の普及"],
};

const scenarioStoryArchives = {
  "taiwan-contingency-risk": [
    {
      id: "Scenario Fiction #001",
      status: "published",
      generatedAt: "2026-06-01",
      sourceSignals: ["台湾海峡周辺の緊張", "東南アジアへの生産移転", "半導体在庫の再設計"],
      worldShiftIndex: 84,
      title: "七日後の保険料",
      year: "2037",
      city: "台北",
      country: "台湾",
      viewpoint: "家電量販店の販売員",
      text: [
        "2037年、台湾の台北で、家電量販店の販売員として働く玲奈は、海峡の天気予報に波の高さだけでなく保険料指数が表示される朝を迎えていた。台北へ向かう貨物便、東京へ送られるコンテナ、店の奥に積まれた電子部品。すべてが同じ数字を見ていた。",
        "玲奈は売り場の値札を毎朝貼り替える。新製品の価格ではない。『納期保証なし』『代替チップ版』『地域別仕様』という小さな札だ。",
        "閉店後、玲奈は展示用スマートフォンの画面をすべて暗くした。怖かったのは砲声ではなかった。明日も店は開き、人々は普通に買い物に来る。その普通さの下で、世界が少しずつ在庫になっていくことだった。",
      ],
    },
    {
      id: "Scenario Fiction #002",
      status: "published",
      generatedAt: "2026-06-15",
      sourceSignals: ["タイ東部工業地帯の投資増", "日本企業の移転計画", "半導体人材需要"],
      worldShiftIndex: 79,
      title: "新しい看板の通り",
      year: "2034",
      city: "バンコク",
      country: "タイ",
      viewpoint: "タイの工場経営者",
      text: [
        "2034年、タイのバンコク郊外で、タイの工場経営者ナリンは、日本語とタイ語の看板が並ぶ高速道路を毎朝通っていた。半導体関連の新工場、技術者向けの住宅、夜間だけ開く日本語教室。海の向こうの緊張は、この街では雇用通知として届いていた。",
        "ナリンは、台湾から来た技術者とベトナムから来た若い作業員の勤務表を見比べる。誰も未来を予言できない。ただ、どこかで部品の流れが変わるたび、ここには新しい面接希望者が現れる。",
        "夕方、ナリンは新しいラインの照明を落とした。彼にとって台湾海峡は恐怖だけではなかった。人生の場所が移動する音でもあった。",
      ],
    },
    {
      id: "Scenario Fiction #003",
      status: "pending",
      generatedAt: "2026-06-16",
      sourceSignals: ["ベトナム半導体教育", "工場移転", "若年技術者の増加"],
      worldShiftIndex: 81,
      title: "引き継がれた仕事",
      year: "2035",
      city: "ホーチミン市",
      country: "ベトナム",
      viewpoint: "若い半導体技術者",
      text: [
        "2035年、ベトナムのホーチミン市で、若い半導体技術者たちは古い深圳の工程表を教材として読んでいた。かつて別の都市で行われていた仕事を、少し違う言語と手順で引き継いでいる。",
        "彼らは台湾海峡のニュースを毎日見るわけではない。それでも新しい求人票、英語の安全講習、日本企業の制服を通して、世界の変化が自分たちの机まで来たことを知っていた。",
      ],
    },
  ],
  "russia-ukraine-energy": [
    {
      id: "Scenario Fiction #001",
      status: "published",
      generatedAt: "2026-06-01",
      sourceSignals: ["欧州ガス価格の変化", "LNG長期契約", "防衛投資"],
      worldShiftIndex: 76,
      title: "遅延する世界",
      year: "2038",
      city: "ベルリン",
      country: "ドイツ",
      viewpoint: "エネルギー監査官",
      text: [
        "2038年の冬、ドイツのベルリンで、エネルギー監査官のユリアは集合住宅の暖房予約に優先順位をつけていた。高齢者、乳児、在宅医療、夜勤明けの労働者。ガス価格の変動は、誰の部屋から先に暖まるかを決める制度だった。",
        "ユリアは各家庭の使用履歴を見ながら、送電網の状態を確認する。彼女は軍事専門家ではない。だが、攻撃された変電所の名前を見るたび、翌週の学校給食メニューが変わることを知っている。",
      ],
    },
    {
      id: "Scenario Fiction #002",
      status: "published",
      generatedAt: "2026-06-12",
      sourceSignals: ["ノルウェーLNG供給", "欧州長期契約", "港湾投資"],
      worldShiftIndex: 73,
      title: "北の港の灯り",
      year: "2032",
      city: "オスロ",
      country: "ノルウェー",
      viewpoint: "港湾労働者",
      text: [
        "2032年、ノルウェーのオスロで、港湾労働者のエイリクはLNG船の入港予定を学校の天気予報のように聞いていた。欧州の不安は、ここでは雇用と税収と新しい住宅地になっている。",
        "エイリクは、遠い戦争をニュースではなく勤務表で知る。危機は場所によって別の名前を持つ。彼の街では、それは夜勤手当と新しい保育園の建設予定だった。",
      ],
    },
  ],
  "information-trust-fracture": [
    {
      id: "Scenario Fiction #001",
      status: "published",
      generatedAt: "2026-06-14",
      sourceSignals: ["生成AI映像", "選挙認証", "SNS上の信頼低下"],
      worldShiftIndex: 77,
      title: "本物の朝",
      year: "2032",
      city: "ワシントンD.C.",
      country: "米国",
      viewpoint: "高校教師",
      text: [
        "2032年、米国のワシントンD.C.で、高校教師のマリアは認証済みの映像から一日を始めるようになった。ニュース番組の隅には、撮影者、生成履歴、編集履歴を示す小さな印が光っている。",
        "マリアは、生徒たちに演説動画を二つ見せる。片方は本物で、片方は生成されたものだ。教室はすぐに答えを出せなかった。",
        "放課後、マリアは母から送られてきた動画を開く。認証印はない。削除するには優しすぎ、信じるには危うすぎた。彼女は返信欄に『あとで一緒に確かめよう』と書いた。",
      ],
    },
  ],
};

const cityCountryMap = {
  "バンコク": "タイ",
  "ホーチミン市": "ベトナム",
  "台北": "台湾",
  "ベルリン": "ドイツ",
  "オスロ": "ノルウェー",
  "ワルシャワ": "ポーランド",
  "ニューデリー": "インド",
  "東京": "日本",
  "北京": "中国",
  "ドーハ": "カタール",
  "マニラ": "フィリピン",
  "カイロ": "エジプト",
  "ワシントンD.C.": "米国",
  "ロンドン": "英国",
  "ブリュッセル": "ベルギー",
  "ローマ": "イタリア",
  "ソウル": "韓国",
};

const countryCapitalMap = {
  "米国": "ワシントンD.C.",
  "中国": "北京",
  "日本": "東京",
  "台湾": "台北",
  "EU": "ブリュッセル",
  "ドイツ": "ベルリン",
  "英国": "ロンドン",
  "フランス": "パリ",
  "オランダ": "アムステルダム",
  "インド": "ニューデリー",
  "タイ": "バンコク",
  "ベトナム": "ハノイ",
  "マレーシア": "クアラルンプール",
  "フィリピン": "マニラ",
  "ノルウェー": "オスロ",
  "ポーランド": "ワルシャワ",
  "カタール": "ドーハ",
  "エジプト": "カイロ",
  "韓国": "ソウル",
};

function inferCountryFromCity(city, theme) {
  return cityCountryMap[city] || theme.countries.find((country) => city?.includes(country)) || theme.countries[0] || "不明";
}

function cityFromCountry(country) {
  return countryCapitalMap[country] || country || "東京";
}

function firstParagraphEstablishes(record) {
  const first = Array.isArray(record.text) ? record.text[0] || "" : String(record.text || record.body || "");
  const year = String(record.year || record.date || "");
  return Boolean(
    first.includes(year) &&
      first.includes(record.city) &&
      first.includes(record.country) &&
      first.includes(record.viewpoint),
  );
}

function normalizedOpening(record) {
  return `${record.year}年、${record.country}の${record.city}。${record.viewpoint}の視点から見れば、この変化は遠いニュースではなく、その日の予定を少し変える出来事だった。`;
}

function normalizeStoryRecord(story, theme) {
  const year = String(story.year || story.date || "2032").replace(/年.*$/, "");
  const rawCity = story.city || story.place || cityFromCountry(story.country || theme.countries[0]);
  const city = countryCapitalMap[rawCity] || rawCity;
  const country = story.country || inferCountryFromCity(city, theme);
  const viewpoint = story.viewpoint || "生活者";
  const text = Array.isArray(story.text) ? story.text : String(story.text || story.body || "").split("。").filter(Boolean).map((line) => `${line}。`);
  const normalized = {
    ...story,
    year,
    date: year,
    city,
    place: city,
    country,
    viewpoint,
    text: text.length ? text : [normalizedOpening({ year, city, country, viewpoint })],
  };
  if (!firstParagraphEstablishes(normalized)) {
    normalized.text = [normalizedOpening(normalized), ...normalized.text];
  }
  normalized.body = normalized.text.join("");
  normalized.validation = {
    metadataAligned: firstParagraphEstablishes(normalized),
    rule: "year/city/country/viewpoint must define the main setting",
  };
  return normalized;
}

function normalizeMemoryRecord(memory, theme, index = 0) {
  const normalized = normalizeStoryRecord(
    {
      id: memory.id || `Memory #${String(index + 1).padStart(3, "0")}`,
      title: memory.title || "未来の断片",
      status: memory.status || "published",
      year: memory.year || memory.date,
      city: memory.city || memory.place,
      country: memory.country,
      viewpoint: memory.viewpoint,
      text: memory.text || memory.body,
    },
    theme,
  );
  return {
    ...memory,
    ...normalized,
    date: normalized.year,
    place: normalized.city,
    body: normalized.text.join(""),
  };
}

const storyDomains = [
  "食事", "通勤", "学校", "買い物", "親子", "老後", "教育", "AI", "半導体", "ロボット",
  "物流", "物価", "保険", "船員", "港湾", "漁業", "水不足", "穀物", "気候変化", "医療AI",
  "介護", "新しい産業", "新しい仕事", "静かな衰退", "再開発", "人口移動", "電力", "送電網", "衛星", "観測網",
  "住宅", "税金", "海底ケーブル", "認証", "翻訳", "決済", "農地", "図書館", "駅", "市場",
];

const storySituations = [
  "朝の準備", "夜勤明け", "契約更新", "在庫確認", "授業の前", "港の待機", "診察室の沈黙", "家族会議", "雨季の到着", "古い端末の修理",
  "移転先の下見", "配達の遅延", "停電訓練", "採用面接", "国境を越えた送金", "展示室の説明", "音声ログの確認", "船舶日誌の記入", "卒業作文", "退職の日",
  "価格改定", "避暑地への移住", "農業用水の割当", "衛星画像の解析", "古い写真の復元",
];

const storyPatternLibrary = storyDomains.flatMap((domain, domainIndex) =>
  storySituations.map((situation, situationIndex) => ({
    id: `pattern-${String(domainIndex + 1).padStart(2, "0")}-${String(situationIndex + 1).padStart(2, "0")}`,
    domain,
    situation,
  })),
);

const viewpointLibrary = [
  "高校生", "起業家", "教師", "医師", "農家", "船員", "エンジニア", "AI研究者", "工場長", "年金生活者",
  "物流会社社員", "漁師", "行政職員", "ロボット整備士", "港湾労働者", "送電技師", "看護師", "介護職員", "翻訳者", "保険査定員",
  "都市計画担当者", "小学校の校長", "市場の店主", "半導体検査員", "データセンター技師", "衛星管制官", "気象予報士", "水道局職員", "税務職員", "鉄道運転士",
  "配送ドライバー", "倉庫管理者", "船舶通信士", "漁協職員", "大学院生", "奨学金担当者", "移民支援員", "住宅仲介業者", "食品メーカー社員", "給食調理員",
  "新聞記者", "博物館学芸員", "図書館司書", "音声アーカイブ管理者", "サイバー監査官", "暗号鍵管理者", "選挙管理職員", "映像鑑定士", "家庭教師", "薬剤師",
  "救急救命士", "遠隔診療オペレーター", "義肢技師", "小型衛星整備士", "宇宙保険担当者", "海底ケーブル技師", "港の税関職員", "航空管制官", "燃料調達担当者", "LNG船機関士",
  "風力発電保守員", "太陽光パネル清掃員", "鉱山労働者", "電池リサイクル技師", "EV整備士", "古物商", "修理店店主", "中古端末査定員", "小売店員", "家計相談員",
  "銀行員", "為替ディーラー", "地方議員", "外交官補佐", "通訳者", "難民申請担当者", "農業ドローン操縦士", "灌漑管理者", "種苗会社研究員", "パン職人",
  "漁港の食堂店主", "ホテル支配人", "観光ガイド", "バス運転士", "配車アプリ運用者", "学校カウンセラー", "保育士", "大学事務職員", "研究倫理審査員", "クラウド料金担当者",
  "AI教材編集者", "モデル監査員", "公共放送編集者", "SNSモデレーター", "デジタル遺品整理士", "家族写真修復士", "軍需工場の事務員", "平和教育の講師", "避難計画担当者", "都市農園管理者",
  "水質検査員", "消防通信員", "公共交通の清掃員", "町工場の経理担当", "輸出入書類作成者", "国際学生", "留学斡旋担当者", "民泊管理者", "配電指令員", "古いラジオ局員",
];

const narrativeForms = [
  "エッセイ", "日記", "手紙", "会話", "回想録", "新聞記事", "博物館の展示説明", "音声ログ", "船舶記録", "AIの観測記録", "学校の作文", "行政メモ",
  "修理記録", "授業ノート", "家計簿の余白", "港湾記録", "診療前問診", "市場の掲示", "研究倫理メモ", "避難訓練の反省文",
  "インタビュー記録", "裁判記録", "Wikipedia風記事", "宇宙船ログ", "調査報告書", "音声文字起こし", "メール", "SNS投稿", "学術論文の抜粋",
];

const futureYearPool = ["2030", "2032", "2034", "2037", "2041", "2046", "2055", "2063", "2072", "2088", "2204", "2319", "2601", "3007"];

const emotionalTones = ["希望", "悲劇", "ブラックユーモア", "恐怖", "郷愁", "感動", "不条理", "静かな余韻"];

const characterNames = [
  "玲奈", "ナリン", "マリア", "ユリア", "エイリク", "アミタ", "西野", "相沢", "景子", "夏帆",
  "リン", "真島", "ノラ", "サミル", "ミナ", "テオ", "アイシャ", "レオ", "カミラ", "悠斗",
  "ソフィア", "ダニエル", "ハナ", "ラファエル", "メイ", "アレックス", "リナ", "オマル", "サラ", "健",
];

const personalWounds = [
  "古い家を手放すか迷っている", "子どもの進路を決められずにいる", "親の介護と仕事の間で揺れている", "故郷へ戻る理由を失っている",
  "転職の通知をまだ開けずにいる", "亡くなった人の声を保存した端末を捨てられない", "結婚式の日程を何度も延期している", "家族に本当の仕事を説明できずにいる",
  "移住先の言葉を覚え始めたばかりである", "十年前の自分が信じていた未来を疑い始めている",
];

const endings = [
  "最後に残ったのは、大きな結論ではなく、返事のない短い通知音だった。",
  "その夜、誰も未来の話をしなかった。けれど食卓の席順だけが、昨日と少し違っていた。",
  "記録はそこで終わっている。余白には、誰かが鉛筆で小さく「まだ続く」と書いていた。",
  "朝になると、街はいつも通り動き出した。だからこそ、その変化はもう戻らないのだと分かった。",
  "彼女は笑った。救われたからではない。まだ笑えることを、誰かに確認したかったからだ。",
  "数百年後、その一文だけが展示ケースに残った。説明札には、作者不詳とあった。",
  "端末は最後に、あり得た未来を保存しました、とだけ表示した。",
  "誰も拍手しなかった。けれど部屋の空気は、ほんの少しだけ明るくなった。",
];

function stableNumber(seed) {
  return Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function storyEngineContext(theme, index = 0) {
  const seed = stableNumber(`${theme.id}-${index}-${theme.title}`);
  const pattern = {
    id: `pattern-${String((index % storyDomains.length) + 1).padStart(2, "0")}-${String((index % storySituations.length) + 1).padStart(2, "0")}`,
    domain: storyDomains[(seed + index * 11) % storyDomains.length],
    situation: storySituations[(seed + index * 7) % storySituations.length],
  };
  const viewpoint = viewpointLibrary[(seed + index * 17) % viewpointLibrary.length];
  const form = narrativeForms[(seed + index * 7) % narrativeForms.length];
  const country = theme.countries[index % theme.countries.length] || "日本";
  const city = cityFromCountry(country);
  const year = futureYearPool[(seed + index * 3) % futureYearPool.length];
  return { pattern, viewpoint, form, country, city, year };
}

function storyTitleFromContext(theme, context) {
  const titleSeeds = ["余白", "記録", "窓", "順番", "手紙", "航路", "在庫", "灯り", "水位", "古い端末", "新しい仕事", "沈黙", "待合室", "白い棚", "小さな税"];
  return `${context.pattern.domain}の${titleSeeds[(stableNumber(theme.id + context.form) + context.year) % titleSeeds.length]}`;
}

function storyOpening(theme, record, context, signal) {
  const formOpenings = {
    "エッセイ": `${record.country}、${record.city}。${record.year}年の${context.pattern.situation}について書こうとすると、${record.viewpoint}はまず${context.pattern.domain}の匂いを思い出す。${signal}は見出しではなく、生活の手触りとして残っていた。`,
    "日記": `${record.year}年、${record.city}。${record.country}で暮らす${record.viewpoint}の日記には、${context.pattern.situation}の横に小さく「${context.pattern.domain}」と書かれている。`,
    "手紙": `${record.country}の${record.city}から、${record.viewpoint}が出した${record.year}年の手紙は、${context.pattern.situation}の話から始まる。${context.pattern.domain}が変わったことを、大げさには書いていない。`,
    "会話": `「${context.pattern.domain}まで変わるのか」。${record.year}年、${record.country}の${record.city}で、${record.viewpoint}は${context.pattern.situation}の途中にそう聞かれた。`,
    "回想録": `${record.viewpoint}が${record.country}の${record.city}を思い出すとき、最初に浮かぶのは${record.year}年の大きなニュースではなく、${context.pattern.situation}で止まった${context.pattern.domain}の記憶だった。`,
    "新聞記事": `${record.year}年、${record.country}の${record.city}では、${record.viewpoint}の周囲で${context.pattern.domain}をめぐる小さな変化が続いている。きっかけの一つは${signal}だった。`,
    "博物館の展示説明": `展示番号${record.year}-${record.city}。${record.country}の${record.viewpoint}が残した${context.pattern.domain}の品は、${context.pattern.situation}の最中に使われていた。`,
    "音声ログ": `音声ログ、${record.year}年、${record.country}、${record.city}。録音者は${record.viewpoint}。背景には${context.pattern.situation}の音と、${context.pattern.domain}が変わる前の短い沈黙が入っている。`,
    "船舶記録": `${record.year}年、${record.country}の${record.city}に寄港した記録には、${record.viewpoint}の署名と、${context.pattern.situation}に関する短い注記が残る。${context.pattern.domain}の変化は航路欄の端に書かれていた。`,
    "AIの観測記録": `観測記録:${record.year}/${record.country}/${record.city}。対象は${record.viewpoint}。関連項目は${context.pattern.domain}、発生場面は${context.pattern.situation}。結論はまだ出されていない。`,
    "学校の作文": `${record.year}年、${record.country}の${record.city}で書かれた作文の一行目に、${record.viewpoint}は${context.pattern.situation}と${context.pattern.domain}のことを書いた。`,
    "行政メモ": `${record.country}の${record.city}で作成された${record.year}年の行政メモには、${record.viewpoint}から聞き取った${context.pattern.situation}の変化が記録されている。`,
    "修理記録": `修理受付票、${record.year}年、${record.city}。${record.country}の${record.viewpoint}は、故障内容の欄に${context.pattern.domain}ではなく${context.pattern.situation}とだけ書いた。`,
    "授業ノート": `${record.year}年、${record.country}の${record.city}。${record.viewpoint}の授業ノートには、${signal}の説明より先に、${context.pattern.domain}が生活に現れた例が書かれていた。`,
    "家計簿の余白": `${record.country}、${record.city}、${record.year}年。${record.viewpoint}の家計簿の余白には、${context.pattern.situation}で気づいた${context.pattern.domain}の変化が短く残っている。`,
    "港湾記録": `${record.year}年、${record.country}の${record.city}に残る港湾記録で、${record.viewpoint}は${context.pattern.situation}と${context.pattern.domain}を同じ行に書き込んだ。`,
    "診療前問診": `${record.year}年、${record.country}の${record.city}。診療前問診の欄に、${record.viewpoint}は体調ではなく${context.pattern.situation}と${context.pattern.domain}の変化を書きかけた。`,
    "市場の掲示": `${record.city}の市場に貼られた${record.year}年の掲示には、${record.country}で働く${record.viewpoint}の名前と、${context.pattern.domain}に関する短い注意書きがあった。`,
    "研究倫理メモ": `${record.year}年、${record.country}の${record.city}。${record.viewpoint}が提出した研究倫理メモは、${context.pattern.domain}よりも、${context.pattern.situation}にいた人々の同意を気にしていた。`,
    "避難訓練の反省文": `${record.year}年、${record.country}の${record.city}で行われた訓練のあと、${record.viewpoint}は反省文に${context.pattern.situation}と${context.pattern.domain}のことを書いた。`,
  };
  return formOpenings[context.form] || `${record.year}年、${record.country}の${record.city}で、${record.viewpoint}は${context.pattern.situation}の中に${context.pattern.domain}の変化を見た。`;
}

function storyCharacter(theme, record, context) {
  const seed = stableNumber(`${theme.id}-${record.year}-${record.city}-${record.viewpoint}`);
  return {
    name: characterNames[seed % characterNames.length],
    age: 17 + (seed % 57),
    wound: personalWounds[(seed + 5) % personalWounds.length],
    tone: emotionalTones[(seed + 11) % emotionalTones.length],
    ending: endings[(seed + 19) % endings.length],
  };
}

function formFrame(form, character, record, context) {
  const frames = {
    "インタビュー記録": `記録者の質問に、${character.name}は何度か沈黙した。文字起こしには、その沈黙も括弧付きで残されている。`,
    "裁判記録": `証言台で問われたのは、誰が正しかったかではない。${character.name}が、その日に何を見て、何を見なかったことにしたのかだった。`,
    "Wikipedia風記事": `後年の百科事典では、この出来事は数行で説明される。しかし脚注の奥には、${character.name}の名が一度だけ現れる。`,
    "宇宙船ログ": `船内時刻では朝だった。地球から届いた圧縮ニュースの中で、${record.city}の名前だけが妙に鮮明に残った。`,
    "調査報告書": `報告書の第七節には、統計から外れた一人の証言として${character.name}の記録が添付されている。`,
    "メール": `件名は空白だった。${character.name}は何度も書き直し、結局、本文の最初に${record.city}の天気だけを書いた。`,
    "SNS投稿": `投稿は二分で削除された。だがスクリーンショットは残り、そこには${character.name}の冗談と、本気の不安が同じ行に並んでいた。`,
    "学術論文の抜粋": `論文本文では個人名は匿名化されている。ただし補遺には、${character.name}が残した一枚のメモが引用されていた。`,
  };
  return frames[form] || `${character.name}、${character.age}歳。${record.viewpoint}として暮らすその人は、${character.wound}。`;
}

function scenarioTextFromMetadata(theme, record) {
  const context = record.engine || storyEngineContext(theme, Number(record.sequence || 0));
  const signal = (sourceSignalSeeds[theme.id] || theme.scenarios || [theme.title])[(Number(record.sequence || 0)) % (sourceSignalSeeds[theme.id] || theme.scenarios || [theme.title]).length];
  const impact = theme.impact[0] || "生活";
  const technology = theme.technologies[0] || "見えない技術";
  const opening = storyOpening(theme, record, context, signal);
  const character = storyCharacter(theme, record, context);
  const regionAngle = Number(record.year) >= 2200
    ? "数世紀を隔てると、同じ出来事は歴史ではなく民話のように扱われる。けれど、その民話の中にも、価格、移動、仕事、家族の癖だけは奇妙に残っていた。"
    : `${record.country}では、その変化は恐怖だけではなかった。別の地域で失われた仕事が、ここでは新しい訓練、移住、商店街の看板、夜間学校の時間割として現れた。`;
  return [
    opening,
    formFrame(context.form, character, record, context),
    `${character.name}は${record.city}で、${context.pattern.domain}に関わる小さな仕事をしていた。肩書きは${record.viewpoint}。年齢は${character.age}歳。履歴書には書かれないが、${character.wound}。その悩みは、${theme.title}という大きすぎる言葉よりもずっと具体的だった。`,
    `${signal}が最初に届いたのは、速報ではなかった。配達時間の変更、学校からの短い連絡、部品番号の末尾に付いた見慣れない記号、あるいは古い契約書の更新通知だった。${technology}は未来の象徴ではなく、誰かの昼食時間や家賃、親への電話の回数を変えるものになっていた。`,
    `街の反応は一つではない。ある人は悲劇として語り、ある人は商機として受け取った。${record.city}の隣町では新しい倉庫が建ち、古い市場では値札の貼り替えが増えた。${context.pattern.situation}の最中、${character.name}はそれを「時代」とは呼ばなかった。ただ、昨日まで自然だった順番が、少しだけ入れ替わったと思った。`,
    `${regionAngle} 東南アジアでは雇用になり、ヨーロッパでは制度になり、アフリカの一部では通信と教育の飛び級になり、南米では資源と水の交渉になった。同じ出来事が、同じ未来を配ることはなかった。`,
    `${context.form}として残されたこの記録には、奇妙な明るさもある。${character.tone}に近い明るさだ。${character.name}は笑うべきでない場面で笑い、泣くべき場面で買い物リストを書いた。人間は世界史の中では小さすぎるが、予定表の中では驚くほどしぶとい。`,
    `途中で、${character.name}は一度だけ別の土地の話を聞いた。そこでは同じ${signal}が、災難ではなく祝日みたいに語られていた。新しい工場、新しい奨学金、新しい港の仕事。世界は不公平なほど複雑で、同じ波が誰かの家を濡らし、別の誰かの船を押し出す。`,
    `だからこの記録には、勝者も敗者もきれいには出てこない。${record.viewpoint}である${character.name}は、誰かの利益を責めきれず、誰かの痛みにも慣れきれなかった。ただ、${record.city}の空の色が変わらないことだけが、少し残酷に思えた。`,
    `夕方、${character.name}は${impact}についての通知を閉じた。通知の下には、昔保存した写真があった。まだ何も起きていなかった頃の写真ではない。すでに何かが起きていたのに、誰もそれに名前を付けていなかった頃の写真だった。`,
    `この物語は未来を予言しない。${record.year}年の${record.city}に、こういう記憶が生まれたかもしれない、というだけの記録である。別の場所では、同じ出来事からまったく違う歌や商売や祈りが生まれただろう。`,
    character.ending,
  ];
  /*
  const variants = {
    "日記": [
      opening,
      `今日は${signal}の話を三度聞いた。誰も未来を断定しない。ただ、${technology}と${impact}の距離が、昨日より少し近くなった気がした。`,
      `夜、${record.viewpoint}は予定表の端に「こういう未来もあり得た」とだけ書いた。`,
    ],
    "手紙": [
      opening,
      `あなたの街ではまだ変化は小さいかもしれない。こちらでは${signal}が、${context.pattern.domain}と${context.pattern.situation}の形で届いている。`,
      `これは予言ではない。ただ、${record.city}で暮らす一人が、世界の向きが少し変わった日を覚えておくための手紙だ。`,
    ],
    "会話": [
      opening,
      `「いつから変わったんだろう」と誰かが言った。${record.viewpoint}は答えず、${technology}に関する通知を閉じた。`,
      `会話はそこで途切れた。けれど${impact}の変化だけは、次の日の買い物や仕事の時間に残った。`,
    ],
    "新聞記事": [
      opening,
      `${record.city}では、${signal}を背景に${context.pattern.domain}をめぐる小さな変化が広がっている。専門家は断定を避け、市民は予定を少しずつ組み替えている。`,
      `この出来事が未来を決めるわけではない。ただ、複数の未来のうち一つが、生活の表面に触れ始めた。`,
    ],
    "博物館の展示説明": [
      opening,
      `展示ケースには、${context.pattern.domain}に関する古い道具と、${technology}の説明札が並んでいる。来館者は${theme.title}を大事件としてではなく、生活用品の変化として見る。`,
      `説明文の最後にはこうある。これは未来ではなく、未来になり得た記憶の一つである。`,
    ],
    "音声ログ": [
      opening,
      `録音には、遠くの警報ではなく、空調、足音、端末の通知音だけが残っている。${signal}はその背後で、${impact}の順番を静かに変えていた。`,
      `ログの最後で${record.viewpoint}は言う。「まだ何も終わっていない。だから記録しておく」。`,
    ],
    "船舶記録": [
      opening,
      `航路欄には天候だけでなく、${signal}に関する短い注記が加えられた。${technology}は遠い陸地のものではなく、積荷と燃料と到着時刻の問題になっていた。`,
      `記録は淡々としている。だが、その淡々とした行間に、別の未来へ曲がる海が残っている。`,
    ],
    "AIの観測記録": [
      opening,
      `観測対象は${context.pattern.domain}。変化要因は${signal}。関連技術は${technology}。ただし、${record.viewpoint}の沈黙だけは数値化されなかった。`,
      `AIは結論を出さない。この記録は、あり得たかもしれない生活の輪郭として保存される。`,
    ],
    "学校の作文": [
      opening,
      `作文の題名は「未来の${context.pattern.domain}」だった。${record.viewpoint}は、${signal}を難しい言葉ではなく、家や学校で変わった小さな決まりとして書いた。`,
      `先生は赤ペンで「断定しないところがよい」とだけ記した。`,
    ],
  };
  return variants[context.form] || [
    opening,
    `${signal}は、${technology}や${impact}を通じて、${record.city}の${context.pattern.domain}に静かに入り込んでいた。誰かには不安で、別の誰かには新しい仕事の始まりでもあった。`,
    `${record.viewpoint}は、その変化を結論としてではなく、${context.pattern.situation}の記憶として保存した。未来は一つではない。`,
  ];
  */
}

const englishStoryDomains = [
  "food", "commuting", "school", "shopping", "parenthood", "aging", "education", "artificial intelligence", "semiconductors", "robotics",
  "logistics", "prices", "insurance", "seafaring", "ports", "fishing", "water scarcity", "grain", "climate", "medical AI",
  "care work", "new industries", "new jobs", "quiet decline", "redevelopment", "migration", "electricity", "power grids", "satellites", "observation networks",
  "housing", "taxes", "subsea cables", "authentication", "translation", "payments", "farmland", "libraries", "rail stations", "markets",
];

const englishSituations = [
  "a morning inventory", "the end of a night shift", "a contract renewal", "a school assembly", "a port delay", "a clinic waiting room",
  "a family argument", "the first rain of the season", "a repair counter", "an apartment viewing", "a delayed delivery", "a blackout drill",
  "a hiring interview", "a cross-border transfer", "a museum label", "a ship log", "a graduation essay", "a retirement party",
  "a price change", "a migration office", "an irrigation vote", "a satellite image", "an old photograph",
];

const englishViewpoints = [
  "high school student", "founder", "teacher", "doctor", "farmer", "sailor", "engineer", "AI researcher", "factory manager", "retiree",
  "logistics clerk", "fisher", "civil servant", "robotics technician", "dockworker", "grid engineer", "nurse", "care worker", "translator", "insurance adjuster",
  "urban planner", "school principal", "market vendor", "chip inspector", "data-center technician", "satellite controller", "weather analyst", "water inspector", "tax officer", "train driver",
  "delivery driver", "warehouse manager", "ship radio operator", "graduate student", "housing broker", "food-company buyer", "museum curator", "librarian", "cyber auditor", "election official",
  "paramedic", "prosthetics technician", "wind farm mechanic", "battery recycler", "repair-shop owner", "bank clerk", "currency trader", "junior diplomat", "drone farmer", "baker",
  "hotel manager", "tour guide", "bus driver", "school counselor", "AI curriculum editor", "model auditor", "public broadcaster", "social media moderator", "digital estate cleaner", "fire dispatcher",
];

const englishForms = [
  "diary", "interview", "conversation", "news article", "email", "letter", "court record", "AI monologue", "scientific report", "encyclopedia article",
  "social media posts", "audio transcript", "captain's log", "memoir", "museum label", "field report", "school essay", "research abstract",
];

const englishYears = ["2032", "2039", "2055", "2084", "2206", "2319", "2601", "3007", "4180"];
const englishTones = ["hope", "tragedy", "melancholy", "fear", "wonder", "nostalgia", "black humor", "absurdity", "mystery"];
const englishNames = ["Mara", "Noor", "Ilya", "Sofia", "Kenji", "Amina", "Rafael", "Lina", "Omar", "Eleni", "Theo", "Camila", "Samir", "Mina", "Jonas", "Hana"];
const englishWounds = [
  "is trying not to sell their childhood home",
  "has not told their family the real reason they changed jobs",
  "is caring for a parent who remembers the old prices too clearly",
  "keeps a dead sibling's voice archived on an obsolete device",
  "has postponed a wedding three times",
  "is learning a language they never expected to need",
  "is afraid their child will inherit a smaller world",
  "secretly believes the crisis gave them a life they did not deserve",
];
const englishEndings = [
  "The device blinked once, then saved the silence as if it were a file.",
  "No one called it history. They only noticed that the table had one empty chair.",
  "Centuries later, the museum kept the receipt and lost the name.",
  "The last message arrived without a sender: keep the light on.",
  "For the first time all week, Mara laughed, and no one asked why.",
  "Outside, the city continued exactly as before, which was the frightening part.",
  "The archive lists the ending as unknown. The handwriting says otherwise.",
  "When morning came, the sea was calm enough to make everyone nervous.",
];

const englishCountryCity = {
  "United States": "Washington",
  China: "Beijing",
  Taiwan: "Taipei",
  Japan: "Tokyo",
  Netherlands: "Amsterdam",
  Germany: "Berlin",
  Norway: "Oslo",
  India: "New Delhi",
  Thailand: "Bangkok",
  Vietnam: "Ho Chi Minh City",
  Qatar: "Doha",
  Egypt: "Cairo",
};

const countryEnglish = {
  "米国": "United States",
  "中国": "China",
  "台湾": "Taiwan",
  "日本": "Japan",
  "オランダ": "Netherlands",
  "ドイツ": "Germany",
  "ノルウェー": "Norway",
  "インド": "India",
  "タイ": "Thailand",
  "ベトナム": "Vietnam",
  "カタール": "Qatar",
  "エジプト": "Egypt",
};

function storyEngineContext(theme, index = 0) {
  const seed = stableNumber(`${theme.id}-${index}-${themeTitle(theme)}`);
  const countrySeed = theme.countries[index % theme.countries.length];
  const country = countryEnglish[countrySeed] || countrySeed || "United States";
  return {
    pattern: {
      domain: englishStoryDomains[(seed + index * 11) % englishStoryDomains.length],
      situation: englishSituations[(seed + index * 7) % englishSituations.length],
    },
    viewpoint: englishViewpoints[(seed + index * 17) % englishViewpoints.length],
    form: englishForms[(seed + index * 5) % englishForms.length],
    country,
    city: englishCountryCity[country] || country,
    year: englishYears[(seed + index * 3) % englishYears.length],
    tone: englishTones[(seed + index * 13) % englishTones.length],
  };
}

function storyTitleFromContext(theme, context) {
  const nouns = ["Market", "Reactor", "Harbor", "Receipt", "Orbit", "Garden", "Witness", "Archive", "Weather", "Signal", "House", "Debt"];
  const adjectives = ["Last", "Quiet", "Unlicensed", "Borrowed", "Blue", "Second", "Paper", "Hollow", "Merciful", "False", "Distant", "Private"];
  const seed = stableNumber(`${theme.id}-${context.form}-${context.pattern.domain}`);
  return `The ${adjectives[seed % adjectives.length]} ${nouns[(seed + 5) % nouns.length]}`;
}

function scenarioTextFromMetadata(theme, record) {
  const context = record.engine || storyEngineContext(theme, Number(record.sequence || 0));
  const seed = stableNumber(`${theme.id}-${record.year}-${context.form}-${context.viewpoint}`);
  const name = englishNames[seed % englishNames.length];
  const age = 18 + (seed % 62);
  const wound = englishWounds[(seed + 3) % englishWounds.length];
  const ending = englishEndings[(seed + 9) % englishEndings.length];
  const signals = sourceSignalSeeds[theme.id] || theme.scenarios || [themeTitle(theme)];
  const signal = signals[Number(record.sequence || 0) % signals.length];
  const title = themeTitle(theme);
  const place = `${context.city}, ${context.country}`;
  return [
    `${context.form.toUpperCase()} / ${place} / ${context.year}. The first surviving line is not dramatic. ${name}, ${age}, a ${context.viewpoint}, wrote that the elevators smelled faintly of rain and overheated plastic.`,
    `${name} ${wound}. That private fact mattered more than the public vocabulary around ${title}. People said supply chain, deterrence, regulation, liquidity, alignment. ${name} said lunch break, rent, medicine, school shoes, the last train home.`,
    `The signal arrived indirectly: ${signal}. It did not announce itself as history. It appeared as a changed delivery estimate, a revised insurance clause, a missing component, a new form at the clinic, a line in a municipal email that nobody had time to read twice.`,
    `At first, ${name} tried to behave as if the change belonged to other people. The city helped with that illusion. ${context.city} still opened its bakeries before sunrise, still swept last night's dust toward the curb, still let commuters stare at their reflections in train windows as if the future were something printed behind the glass. Even the archive terminals in the library looked harmless. They glowed softly, asking visitors whether they wanted to search by year, by region, by technology, by witness. No one searched by fear. Fear was too large a category.`,
    `The document that later carried this memory was misfiled twice. A clerk first placed it under ${context.pattern.domain}, then under ${context.pattern.situation}. Both were accurate and insufficient. The page contained the price of a battery, the name of a closed supplier, a joke about weather, and one crossed-out sentence: I think we are living inside someone else's transition. The archivist who restored the scan left the crossed-out line visible. In the margin, a second hand had written: keep this.`,
    `In ${place}, the same event did not mean what it meant elsewhere. In one port it became overtime. In one inland town it became a scholarship program. In parts of Africa it skipped old infrastructure and made new networks feel normal. In South America it became an argument over water, lithium, grain, and who had the right to call extraction a future.`,
    `${name} noticed the unfairness of that. A bad decade for one family could become a founding myth for another. A factory closing in one country could turn into a night school in another. The archive refuses to smooth that contradiction into a lesson.`,
    `A cousin sent photographs from a different continent. They showed cranes over a new industrial district, cafeteria trays stamped with company logos, children in uniforms rehearsing words from three languages before breakfast. The message beneath the photographs was cheerful, almost apologetic: work is coming here now. ${name} looked at the pictures for a long time. Nothing in them was false. Nothing in them made the local closures easier to explain.`,
    `By summer, small rituals changed. Families kept older devices for parts. Restaurants shortened menus because replacement filters came late. Schools taught children to ask whether a tool needed a network, a license, a foreign component, a satellite, a chip made under a sky they would never see. The questions were practical, but they sounded philosophical when spoken by twelve-year-olds. What does this depend on? Who can turn it off? Where does the answer live?`,
    `The story form matters. In a ${context.form}, facts do not behave the way they do in a dashboard. They hesitate. They contradict each other. They acquire fingerprints. The ${context.pattern.domain} at the center of this memory is not a symbol; it is the thing that made ${name} leave home early and return after dark.`,
    `There was a person ${name} loved who refused to discuss world events. This person would listen patiently to descriptions of factories, satellites, embargoes, blackouts, regulations, capital flows, rare earths, insurance clauses, orbital networks, and the quiet rearrangement of routes across the sea. Then they would ask whether the rice cooker could still be repaired. ${name} used to find this narrow. Later, it seemed like wisdom. The future always enters through an object small enough to hold.`,
    `One afternoon, the power failed for eleven minutes. Not a disaster, not even a true outage by the standards of other decades. The train screens blinked. The clinic doors opened manually. Someone laughed in the dark and used a phone as a lantern. In those eleven minutes, ${name} understood why older people saved candles long after electric light became reliable. Preparedness was not a belief in collapse. It was a tenderness toward uncertainty.`,
    `By the third week, people had developed jokes. Bad jokes, mostly. ${context.tone} had become a local weather system. Someone taped a cartoon to the break-room refrigerator. Someone else cried in the stairwell and blamed allergies. Both reactions were true.`,
    `The officials spoke carefully. The analysts spoke even more carefully. They avoided saying that the world had split, because it had not. They avoided saying that the world was whole, because that was no longer persuasive. What existed instead were overlapping permissions: one for machines, one for money, one for ships, one for language, one for memory. Ordinary people learned the permissions by failing to do ordinary things.`,
    `A child in ${context.city} began collecting obsolete adapters. At first the collection was a game. Then neighbors brought more: charging plugs, medical connectors, school tablets, interface cards from machines nobody manufactured anymore. The child arranged them by shape, not function, and called the display an alphabet. Years later, a curator would borrow the collection for an exhibition about this period. The label would say that civilizations leave behind ports before they leave behind monuments.`,
    `${name} did not think of themselves as brave. Most days were consumed by errands. There was laundry. There were forms. There were bills with smaller fonts every year. There was a recurring dream in which every door in the city required a different password. But once, when a younger colleague asked whether all of this meant the future was ruined, ${name} answered too quickly: no. The speed of the answer surprised them. It came from somewhere older than optimism.`,
    `Hope, in this record, is not clean. It is mixed with resentment, fatigue, envy, and the embarrassing relief of being useful. ${name} saw new work arrive in places that had waited decades for investment. They also saw old neighborhoods become unaffordable when the new work came too fast. A scholarship could be a miracle for one student and a price signal for a landlord. The same announcement could make a mayor smile and a grandmother pack boxes.`,
    `This is why the archive keeps multiple versions. A single theme can produce a tragedy in one language, a comedy in another, an inventory sheet in a third, and a love letter in a fourth. The archive does not decide which one is the truth. It preserves the friction between them. It lets readers return later and discover that a side character from one century became the ancestor of a rumor in another.`,
    `In a later century, students would ask why people of this era did not see the pattern sooner. Their teachers would assign them these fragments instead of answering. The students would read about broken schedules, improvised repairs, new ports, missing medicines, family jokes, water rights, classroom access codes, and silent elevators. Some would still judge the past harshly. Others would recognize the posture of people carrying groceries while history rearranged the street behind them.`,
    `Decades later, another story in this same world would mention ${name} only in passing. A child would find the name in a footnote attached to a collection called ${storyTitleFromContext(theme, context)}. The child would mispronounce it, then remember it for reasons no historian could explain.`,
    `This is not a prediction. It is one possible memory born from a change already moving through the world. Another city would have made another genre from it: comedy, lawsuit, hymn, scam, lullaby, black-market manual, children's game. Another protagonist would have forgiven more easily. Another would have become rich. Another would have left no record at all.`,
    `Near midnight, ${name} walked home past a storefront that had once sold luxury watches and now repaired household machines. In the window, a sign promised that nothing was too old to ask for one more season. The phrase was meant for customers, but it sounded like a national policy, or a prayer, or a joke told by someone trying very hard not to be afraid.`,
    `At home, ${name} opened the saved message again. The room was small. The city outside kept its own counsel. Somewhere far away, ships changed lanes, models lost access, ministries revised language, private money crossed borders before flags could explain it, and children learned new names for things their grandparents had assumed were permanent.`,
    `Before sleeping, ${name} deleted three messages and saved one. The saved message contained no secret. It said: If the future asks, tell it we were ordinary.`,
    ending,
  ];
}

function generatedScenarioArchiveStories(theme, startIndex = 0, count = 12) {
  return Array.from({ length: count }, (_, offset) => {
    const sequence = startIndex + offset + 1;
    const engine = storyEngineContext(theme, sequence);
    const record = {
      id: `Story #${String(sequence).padStart(3, "0")}`,
      status: "published",
      generatedAt: `2026-06-${String(10 + (sequence % 18)).padStart(2, "0")}`,
      sourceSignals: (sourceSignalSeeds[theme.id] || theme.scenarios || [themeTitle(theme)]).slice(0, 3),
      worldShiftIndex: worldShiftIndex(theme),
      title: storyTitleFromContext(theme, engine),
      year: engine.year,
      city: engine.city,
      country: engine.country,
      viewpoint: engine.viewpoint,
      sequence,
      engine,
    };
    return normalizeStoryRecord({ ...record, text: scenarioTextFromMetadata(theme, record) }, theme);
  });
}

function scenarioStories(theme) {
  return generatedScenarioArchiveStories(theme, 0, 12);
}

function publishedScenarioStories(theme) {
  return scenarioStories(theme).filter((story) => story.status === "published");
}

function pendingScenarioStories(theme) {
  return [];
}

function latestScenarioStory(theme) {
  return publishedScenarioStories(theme)[0];
}

function worldShiftIndex(theme) {
  const signals = sourceSignalSeeds[theme.id] || theme.scenarios || [];
  const recency = Math.min(24, signals.join("").length % 25);
  const breadth = Math.min(32, (theme.countries.length + theme.companies.length + theme.technologies.length) * 2);
  const lifeImpact = Math.min(28, theme.impact.length * 6);
  const archiveItems = scenarioStoryArchives[theme.id] || [];
  const archivePulse = Math.min(16, archiveItems.filter((story) => story.status === "published").length * 4 + archiveItems.filter((story) => story.status === "pending").length * 6);
  return Math.min(100, recency + breadth + lifeImpact + archivePulse);
}

function shouldGenerateNewStory(theme) {
  return worldShiftIndex(theme) >= updatePolicy.worldShiftThreshold || publishedScenarioStories(theme).length === 0;
}

function generatedScenarioArchiveStories(theme, startIndex = 0, count = 8) {
  return Array.from({ length: count }, (_, offset) => {
    const sequence = startIndex + offset + 1;
    const engine = storyEngineContext(theme, sequence);
    const record = {
      id: `Scenario Fiction #${String(sequence).padStart(3, "0")}`,
      status: "published",
      generatedAt: `2026-06-${String(10 + (sequence % 18)).padStart(2, "0")}`,
      sourceSignals: (sourceSignalSeeds[theme.id] || theme.scenarios || [theme.title]).slice(0, 3),
      worldShiftIndex: worldShiftIndex(theme),
      title: storyTitleFromContext(theme, engine),
      year: engine.year,
      city: engine.city,
      country: engine.country,
      viewpoint: engine.viewpoint,
      sequence,
      engine,
    };
    return normalizeStoryRecord(
      {
        ...record,
        text: scenarioTextFromMetadata(theme, record),
      },
      theme,
    );
  });
}

function scenarioStories(theme) {
  const archived = scenarioStoryArchives[theme.id];
  if (archived?.length) {
    const normalizedArchived = archived.map((story) => normalizeStoryRecord(story, theme));
    return [...normalizedArchived, ...generatedScenarioArchiveStories(theme, normalizedArchived.length, 5)];
  }
  const fallback = scenarioFiction(theme);
  const glimpse = futureGlimpse(theme);
  const fallbackRecord = {
    year: glimpse.date,
    city: glimpse.city,
    country: glimpse.country,
    viewpoint: glimpse.viewpoint,
  };
  return [
    normalizeStoryRecord({
      id: "Scenario Fiction #001",
      status: "published",
      generatedAt: "2026-06-16",
      sourceSignals: sourceSignalSeeds[theme.id] || theme.scenarios.slice(0, 3),
      worldShiftIndex: worldShiftIndex(theme),
      title: fallback.title,
      ...fallbackRecord,
      text: scenarioTextFromMetadata(theme, fallbackRecord),
    }, theme),
    ...generatedScenarioArchiveStories(theme, 1, 7),
  ];
}

function publishedScenarioStories(theme) {
  return scenarioStories(theme).filter((story) => story.status === "published");
}

function pendingScenarioStories(theme) {
  return scenarioStories(theme).filter((story) => story.status === "pending");
}

function latestScenarioStory(theme) {
  return publishedScenarioStories(theme).at(-1) || scenarioStories(theme)[0];
}

function generatedScenarioArchiveStoriesEnglish(theme, startIndex = 0, count = 12) {
  return Array.from({ length: count }, (_, offset) => {
    const sequence = startIndex + offset + 1;
    const engine = storyEngineContext(theme, sequence);
    const record = {
      id: `Story #${String(sequence).padStart(3, "0")}`,
      status: "published",
      generatedAt: `2026-06-${String(10 + (sequence % 18)).padStart(2, "0")}`,
      sourceSignals: (sourceSignalSeeds[theme.id] || [themeTitle(theme)]).slice(0, 3),
      worldShiftIndex: worldShiftIndex(theme),
      title: storyTitleFromContext(theme, engine),
      year: engine.year,
      city: engine.city,
      country: engine.country,
      viewpoint: engine.viewpoint,
      sequence,
      engine,
    };
    return normalizeStoryRecord({ ...record, text: scenarioTextFromMetadata(theme, record) }, theme);
  });
}

scenarioStories = function scenarioStoriesEnglish(theme) {
  return generatedScenarioArchiveStoriesEnglish(theme, 0, 12);
};

publishedScenarioStories = function publishedScenarioStoriesEnglish(theme) {
  return scenarioStories(theme).filter((story) => story.status === "published");
};

pendingScenarioStories = function pendingScenarioStoriesEnglish() {
  return [];
};

latestScenarioStory = function latestScenarioStoryEnglish(theme) {
  return publishedScenarioStories(theme)[0];
};

const archiveDepthByTheme = {
  "taiwan-contingency-risk": 330,
  "russia-ukraine-energy": 149,
  "us-china-ai-chip-controls": 216,
  "middle-east-oil": 121,
  "information-trust-fracture": 88,
};

function storyStoragePath(theme, story) {
  const slug = theme.id.replace(/-risk$/, "").replace(/-fragmentation$/, "");
  const number = story.id.match(/#(\d+)/)?.[1] || "001";
  return `themes/${slug}/stories/${number}.json`;
}

function archiveDepth(theme) {
  return archiveDepthByTheme[theme.id] || Math.max(48, scenarioStories(theme).length * 37);
}

function excerpt(text, maxLength = 92) {
  const clean = Array.isArray(text) ? text.join("") : String(text);
  return clean.length > maxLength ? `${clean.slice(0, maxLength)}...` : clean;
}

function scenarioFiction(theme) {
  const archived = scenarioStoryArchives[theme.id]?.filter((story) => story.status === "published").at(-1);
  if (archived) {
    const normalized = normalizeStoryRecord(archived, theme);
    return {
      ...normalized,
      body: normalized.text,
    };
  }
  const stories = {
    "us-china-ai-chip-controls": {
      title: "シリコンの潮位",
      body: [
        "2041年、東京の小学校では、入学時に二種類のAI教材を選ぶことになっていた。片方は米国圏のクラウドで動き、もう片方は国内で圧縮された小さなモデルで動く。保護者説明会では、教育委員会の担当者が性能差ではなく、輸出規制と推論コストの話をした。誰も驚かなかった。子どもたちは、鉛筆の濃さを選ぶように、AI経済圏を選ぶ時代に生まれていた。",
        "半導体商社で働く真島は、NVIDIAの代替リストを毎朝更新する。TSMCの生産枠、HBMの割当、クラウドGPUの予約価格。表の数字は市場データに見えるが、真島には潮位のように見えた。上がれば船は港を変え、下がれば企業は研究計画を戻す。世界の境界線は地図ではなく、部品表の注釈に移っていた。",
        "ある日、娘の教材AIが作文を途中で止めた。理由は障害ではない。学校が利用している推論基盤が、海外モデルとの互換辞書を更新できなくなったからだった。娘は画面を見つめて言った。「同じ言葉なのに、向こうのAIには届かないんだね」。真島は返事を探したが、職場で見ているすべてのグラフが、その短い一文に負けている気がした。",
        "夜、真島は社内レポートに書く。リスクは単に中国AI企業の調達難ではない。人々が同じ問いを投げても、違う文明の答えを受け取ることだ、と。送信後、彼は娘の未完成の作文を開いた。題名は「未来の友だち」。本文は三行で止まっていた。続きは、どちらのAIにも書けなかった。",
      ],
    },
    "taiwan-contingency-risk": {
      title: "七日後の保険料",
      body: [
        "2037年、海峡の天気予報には波の高さだけでなく、保険料指数が表示されるようになった。台北行きの貨物便、東京へ向かうコンテナ、東京の電子部品倉庫。すべてが同じ数字を見ていた。指数が赤に変わると、スマートフォンの修理予約は一週間遅れ、病院の検査装置は交換部品の到着予定を再計算した。",
        "東京の家電量販店で働く玲奈は、売り場の値札を毎朝貼り替える。新製品の価格ではない。『納期保証なし』『代替チップ版』『地域別仕様』という小さな札だ。客は戦争の話をしない。ただ、子どもの入学までに端末が届くか、祖父の補聴器に使う部品が確保できるかを聞く。台湾海峡は、遠い海ではなく、家庭内のカレンダーになっていた。",
        "ある夕方、玲奈の端末に本社から通知が来る。TSMC由来の部品を含む商品は、保険料変動分を価格に反映せよ。彼女は値札プリンタの前で手を止めた。価格を上げれば売れない。上げなければ、次の入荷が読めない。市場は数字で決断するが、売り場では人の顔が決断を遅らせる。",
        "閉店後、玲奈は展示用スマートフォンの画面をすべて暗くした。黒いガラスの列に、天井灯だけが細く映る。ニュースでは艦船の映像が流れている。だが彼女が怖かったのは砲声ではなかった。明日も店は開き、人々は普通に買い物に来る。その普通さの下で、世界が少しずつ在庫になっていくことだった。",
      ],
    },
    "middle-east-oil": {
      title: "静かな航路",
      body: [
        "2036年、航空券の価格は座席の広さではなく、通過する空の政治で決まるようになった。中東の緊張が高まるたび、迂回ルートは長くなり、燃料費は静かに上がった。空港の出発ロビーでは、誰もホルムズ海峡の名前を口にしない。それでも電光掲示板の遅延表示だけが、遠い海の形を正確に映していた。",
        "東京の運航管理室で、航路設計士の相沢は夜勤をしている。彼の仕事は飛行機を危険から遠ざけることではなく、危険が価格と時間に変わる曲線を引くことだった。原油、LNG、保険、為替、中央銀行の発言。画面に並ぶ数字は燃料の匂いを持たないが、相沢にはどれも金属のように重かった。",
        "その夜、カタールからのLNG船が予定より十二時間遅れる。国内の電力市場は即座に反応し、翌朝の工場稼働計画が書き換わる。相沢の妻が勤める保育園では、冷房設定を一度だけ上げる通知が出た。遠い海は、子どもたちの昼寝の温度にまで届いていた。",
        "午前三時、相沢は新しい航路を承認する。飛行機は少し遠回りし、乗客は二十分遅れて到着するだろう。彼はその二十分が、戦争を避けるために都市が支払う最小の税金のように思えた。窓の外に夜明けはまだない。だが地図上の航路だけが、静かに曲がっていた。",
      ],
    },
    "russia-ukraine-energy": {
      title: "遅延する世界",
      body: [
        "2038年の冬、ベルリンの集合住宅では、暖房予約に優先順位がついた。高齢者、乳児、在宅医療、夜勤明けの労働者。ガス価格の変動は、もはや市場欄の数字ではなく、誰の部屋から先に暖まるかを決める制度だった。戦争は遠くで長く続き、その長さだけが都市の時間を遅らせていた。",
        "エネルギー監査官のユリアは、各家庭の使用履歴を見ながら、送電網への攻撃リスクを評価する。画面にはロシア、ウクライナ、LNG基地、風力発電、軍需工場が一つのグラフに並ぶ。彼女は軍事専門家ではない。だが、攻撃された変電所の名前を見るたび、翌週の学校給食メニューが変わることを知っている。",
        "ある朝、ユリアの母から古い毛布が届く。荷物には短いメモが入っていた。『昔は停電に備えていた。今は価格に備えるのね』。ユリアは笑えなかった。都市は停電を避けるほど賢くなったが、暖房をためらうほど不安になっていた。安定とは、止まらないことではなく、止まる可能性を誰かに先送りすることだった。",
        "夜、彼女は報告書に『遅延』という言葉を使う。電力の遅延、投資の遅延、和平の遅延、生活の遅延。どれも爆発しない。だが、すべてが少しずつ人の判断を細くする。窓の外で雪が降り始める。都市は明日も動く。ただ、暖まる順番だけが、昨日とは違っていた。",
      ],
    },
    "generative-ai-regulation": {
      title: "記憶のライセンス",
      body: [
        "2034年、欧州で生まれた子どもには、出生届と同時にAI記憶許諾書が発行された。写真、声、学校の作文、診療記録。どのデータを将来の学習に使ってよいか、親はチェックボックスで選ぶ。東京の行政窓口でも同じ制度が試験導入され、受付の横には『あなたの記憶は地域外へ移転されません』という案内が置かれていた。",
        "区役所で働く夏帆は、毎日、生成AIに関する同意設定の相談を受ける。高齢者は死後に声を残すか迷い、若い親は子どもの画像を教育モデルから除外したがる。OpenAI、Google、Microsoft、国内クラウド。企業名は選択肢として表示されるが、市民にとってそれは技術ではなく、未来の自分を誰に預けるかという問題だった。",
        "ある日、夏帆の父が古い音声データの削除を求めた。亡くなった母の声を、家族用AIがまだ再現していたからだ。規約上は削除できる。だが削除すれば、父が毎晩話しかけていた相手はいなくなる。安全性評価、著作権、データ主権。会議資料で見慣れた言葉が、突然、食卓の沈黙に変わった。",
        "夏帆は申請書を保留にしたまま帰宅する。端末には『記憶利用の更新期限まで三日』と表示されている。都市は賢くなった。法律も追いつきつつある。それでも誰も教えてくれない。守るべきなのは個人情報なのか、忘れられる権利なのか、それとも、もう一度だけ聞きたい声なのか。",
      ],
    },
    "state-backed-cyber": {
      title: "ログのない朝",
      body: [
        "2040年、ワシントンD.C.の水道局では、毎朝六時に『昨日が正しかったか』を確認する会議が開かれる。水圧、料金、浄水場の薬品投入量、職員の入退室記録。すべてのログは揃っている。だが揃っていることと、正しいことは別だった。国家支援型の攻撃が増えてから、都市は過去を信じるために人間の署名を必要とするようになった。",
        "監査担当の景子は、紙の台帳を嫌っていた。遅く、重く、検索できない。だが今では、それが最後の基準線だった。EDRもSIEMも正常を示しているのに、夜間の配水ルートだけがわずかに違う。異常は漏水ではない。誰かが、都市の記憶をほんの少しだけ書き換えた可能性だった。",
        "午前九時、学校から通知が届く。給食センターの水質確認が遅れ、昼食時間を三十分ずらすという。市民はサイバー攻撃を映像で見ない。見えるのは、遅れる給食、止まるATM、なぜか通らない保険証、昨日と違う請求額だ。攻撃者は都市を破壊しない。都市が自分自身を疑うようにする。",
        "景子は最後に紙の台帳へ押印する。インクが乾くまで数秒待つ。その数秒が、どの暗号化署名よりも確かなものに思えた。窓の外では、いつも通り水が流れている。だからこそ怖かった。都市は止まっていない。ただ、自分が正しく動いていると証明する方法を、少しずつ失っていた。",
      ],
    },
    "supply-chain-fragmentation": {
      title: "在庫の季節",
      body: [
        "2035年、日本の家庭には季節ごとの備蓄リストが配信されるようになった。台風でも地震でもない。輸出規制、制裁、港湾混雑、為替、半導体の割当。春には浄水器のフィルター、夏には冷房部品、秋には子どもの学習端末。サプライチェーンは見えない季節になり、人々は天気予報を見るように在庫予報を見た。",
        "東京の中堅メーカーで調達を担当する西野は、部品を買うより先に国を選ぶ。中国、インド、メキシコ、EU、日本。どこから買うかは価格ではなく、次にどの規制が来るかで決まる。彼の画面にはApple、Toyota、Samsung、Foxconnのニュースが流れるが、実際に彼が守っているのは、町工場の週三日の稼働だった。",
        "ある日、娘の自転車の変速機が壊れる。修理店は部品を取り寄せられるが、二つの選択肢を提示した。安いが入荷時期不明の部品。高いが同盟国経由で保証される部品。西野は笑いそうになった。会社で毎日見ている地政学が、娘の通学路にまで降りてきたのだ。",
        "夜、彼は家計アプリに新しい項目を作る。食費、光熱費、教育費、そして『供給余白』。妻は変な名前だと言った。西野もそう思う。だが未来には、欲しいものを買うお金だけでは足りない。届くまで待てる時間と、代替品を受け入れる心の余白が必要になる。翌朝、在庫予報は曇りだった。",
      ],
    },
    "climate-migration-water-stress": {
      title: "水のある住所",
      body: [
        "2039年、ニューデリーの不動産広告には、駅からの距離より先に一日の給水時間が書かれていた。三時間、五時間、夜間のみ。日陰指数という新しい項目もあり、街路樹の本数と舗装温度が部屋の価値を決めていた。",
        "市役所で働くアミタは、転入届の列を毎朝見ている。多くは国境を越えた人ではない。乾いた州から来た家族、井戸を失った村の教師、農地を売った祖父母。彼らは難民と呼ばれず、ただ新しい住所を必要としていた。",
        "夕方、彼女は給水車の到着通知を確認する。子どもたちは水の列に並びながら宿題をしている。未来は宇宙船ではなく、透明なタンクの残量として光っていた。",
      ],
    },
    "aging-society-care-labor": {
      title: "長い午後の機械",
      body: [
        "2042年、東京の集合住宅では、午後三時になると見守りAIが一斉に声を出す。薬の時間、換気の時間、散歩の時間。声はやさしいが、誰もそれを家族の声とは間違えなかった。",
        "介護士の真帆は、十二人分の部屋を巡回する前に、ロボットのバッテリー残量を確認する。機械は疲れない。けれど、誰かの昔話を最後まで聞くことはまだ苦手だった。",
        "帰り道、真帆は母からの着信に気づく。画面には『異常なし』と表示されている。それでも彼女は電話をかけ直す。未来のケアは、自動化されても、誰かが気にかける時間だけは残していた。",
      ],
    },
    "housing-affordability-generation": {
      title: "小さな部屋の都市",
      body: [
        "2035年、ロンドンでは二十平方メートルの部屋が『家族向けスターター住宅』として売り出された。壁は可動式で、昼は仕事部屋、夜は寝室、週末だけ食卓になる。",
        "エマとルイスは内見のあと、近くの公園で黙って座った。二人とも仕事はある。貯金もある。けれど都市は、彼らが始めたい生活より少しだけ高く、少しだけ狭かった。",
        "帰りの地下鉄で、エマは郊外の地図を開く。通勤時間は九十二分。家賃は半分。未来は夢ではなく、乗換案内の中で比較されていた。",
      ],
    },
    "food-security-price-shock": {
      title: "給食の天気",
      body: [
        "2036年、カイロの学校では、給食表の横に世界の降雨マップが掲示されるようになった。子どもたちは雨の少ない地域を見つけると、翌月のパンが小さくなることを知っていた。",
        "栄養士のナディアは、豆、米、小麦、代替タンパクの在庫を見ながら献立を組む。戦争のニュースも、港の混雑も、肥料価格も、最後には一枚の皿に集まってくる。",
        "昼休み、子どもが小さなパンを半分残した。家に持って帰るのだと言う。ナディアは止めなかった。食料安全保障という大きな言葉は、その小さな包み紙の中で初めて重さを持った。",
      ],
    },
    "information-trust-fracture": {
      title: "本物の朝",
      body: [
        "2032年、ワシントンD.C.の朝は、認証済みの映像から始まるようになった。ニュース番組の隅には、撮影者、生成履歴、編集履歴を示す小さな印が光っている。",
        "高校教師のマリアは、生徒たちに演説動画を二つ見せる。片方は本物で、片方は生成されたものだ。教室はすぐに答えを出せなかった。声も表情も、どちらも十分に人間らしかった。",
        "放課後、マリアは母から送られてきた動画を開く。認証印はない。削除するには優しすぎ、信じるには危うすぎた。彼女は返信欄に『あとで一緒に確かめよう』と書いた。",
      ],
    },
  };

  return stories[theme.id] || {
    title: "2041年の供給表",
    body: [
      `${theme.title}は、都市の予定表、企業の購買承認、家庭の小さな選択にまで降りてきた。人々はニュースを読むより先に、変わってしまった朝を覚えた。`,
      `${theme.countries.join("、")}の名前は、画面上のタグではなく、生活の速度を決める見えない装置になっていた。`,
      "未来は突然来ない。価格、納期、制度、信頼が静かに並び替わる。最初に気づくのは、昨日と同じ生活を続けようとする人間だった。",
    ],
  };
}

function scenarioFictionCard(theme) {
  const fiction = scenarioFiction(theme);
  return `
    <section class="section scenario-fiction-section">
      <div class="section-head">
        <span>未来短編</span>
        <h2>未来短編</h2>
        <p>隣の部屋から見えた、あり得たかもしれない未来。</p>
      </div>
      <article class="scenario-fiction-card">
        <span class="fiction-label">未来記録</span>
        <h3>${fiction.title}</h3>
        <div class="fiction-body">
          ${fiction.body.map((paragraph) => `<p>${paragraph}</p>`).join("")}
        </div>
        <footer>未来の記憶として保存される断片</footer>
      </article>
    </section>
  `;
}

function worldLine(theme) {
  const lines = {
    "us-china-ai-chip-controls": "Silicon drifts into separate skies.",
    "taiwan-contingency-risk": "A quiet sea changes the price of morning.",
    "middle-east-oil": "The route bends before the flame appears.",
    "russia-ukraine-energy": "Winter learns to wait.",
    "generative-ai-regulation": "Memory asks who may keep it.",
    "state-backed-cyber": "The city wakes and checks yesterday.",
    "supply-chain-fragmentation": "Every shelf becomes a border.",
    "us-political-fragmentation": "A republic dreams in divided signals.",
    "europe-populism-migration": "Old streets hear new borders forming.",
    "billionaire-capital-ai-space": "Private moons pull public tides.",
    "climate-migration-water-stress": "The city grows where the river disappears.",
    "aging-society-care-labor": "The future learns to care for the old.",
    "housing-affordability-generation": "A city can be full and still have no room.",
    "food-security-price-shock": "The weather arrives at the table.",
    "information-trust-fracture": "Reality begins to split by screen.",
  };
  return themeCopy[theme.id]?.tagline || lines[theme.id] || "Some changes travel quietly.";
}

function flowChapters(theme) {
  const chapters = {
    "us-china-ai-chip-controls": ["シリコンの門", "使えない計算資源", "国産エンジン", "分かれるクラウド", "新しい供給網"],
    "taiwan-contingency-risk": ["海峡の静電気", "保険料の潮", "半導体の霧", "工場の迂回", "市場の震え"],
    "middle-east-oil": ["狭い海", "長い航路", "燃料の天気", "価格の熱", "朝の売り控え"],
    "russia-ukraine-energy": ["続く冬", "壊れたインフラ", "揺れる電力", "再軍備", "財政の重さ"],
    "generative-ai-regulation": ["目覚めたモデル", "許可の壁", "地域の記憶", "クラウドの重力", "標準の争い"],
    "state-backed-cyber": ["静かな侵入", "偽の朝", "都市の疑い", "紙の痕跡", "監査の季節"],
    "supply-chain-fragmentation": ["輸出の壁", "工場の移動", "長い航路", "利益率の天気", "新しい地図"],
    "us-political-fragmentation": ["選挙の雑音", "揺れる政策", "国境の熱", "ドルの天気", "同盟国の時計"],
    "europe-populism-migration": ["冷たい通り", "境界の声", "遅いブリュッセル", "防衛の冬", "古い大陸"],
    "billionaire-capital-ai-space": ["民間軌道", "計算資源の潮", "電力への飢え", "メディアの重力", "国家資本の影"],
    "climate-migration-water-stress": ["乾いた季節", "失われた畑", "到着する都市", "水の列", "新しい境界"],
    "aging-society-care-labor": ["長い寿命", "空いた夜勤", "介護機械", "家族の時計", "静かな病棟"],
    "housing-affordability-generation": ["上がる家賃", "長い通勤", "遅れる家族", "外側の都市", "新しい共有地"],
    "food-security-price-shock": ["乾いた収穫", "肥料の不足", "輸出の門", "学校給食", "備蓄された穀物"],
    "information-trust-fracture": ["合成された声", "壊れたタイムライン", "選挙の疑い", "家族の沈黙", "共有された証明"],
  };
  return chapters[theme.id] || ["兆し", "痕跡", "遅れ", "適応", "新しい均衡"];
}

function possibilityTitles(theme) {
  const titles = {
    "us-china-ai-chip-controls": ["Split Cloud", "Long Silicon", "Red Compute"],
    "taiwan-contingency-risk": ["Quiet Strait", "Waiting Years", "Red Horizon"],
    "middle-east-oil": ["Quiet Route", "Long Detour", "Burning Premium"],
    "russia-ukraine-energy": ["Quiet Winter", "Long Season", "Red Horizon"],
    "generative-ai-regulation": ["Garden of Consent", "Locked Memory", "Two Intelligences"],
    "state-backed-cyber": ["Ordinary Morning", "Silent Logs", "The Forgetting City"],
    "supply-chain-fragmentation": ["Spare Room", "Long Inventory", "Broken Calendar"],
    "us-political-fragmentation": ["The Calm", "The Waiting Years", "The Fire Beyond"],
    "europe-populism-migration": ["Old Stone", "Long Border", "Closing Gate"],
    "billionaire-capital-ai-space": ["Private Moon", "Waiting Engines", "Red Orbit"],
    "climate-migration-water-stress": ["Cool Room", "Long Heat", "Dry Gate"],
    "aging-society-care-labor": ["Gentle Machine", "Long Afternoon", "Empty Ward"],
    "housing-affordability-generation": ["Small Room", "Long Commute", "Childless City"],
    "food-security-price-shock": ["Full Shelf", "Long Harvest", "Empty Plate"],
    "information-trust-fracture": ["Shared Screen", "Long Doubt", "False Morning"],
  };
  return titles[theme.id] || ["The Calm", "The Waiting Years", "The Fire Beyond"];
}

function possibilitySubtitles(theme) {
  const subtitles = {
    "us-china-ai-chip-controls": ["Divergent clouds", "A semiconductor season", "A compute sphere under strain"],
    "taiwan-contingency-risk": ["A calm sea with tense calendars", "Waiting as a form of logistics", "A horizon no one names aloud"],
    "middle-east-oil": ["The old route stays open", "Distance becomes ordinary", "Small costs gather heat"],
    "russia-ukraine-energy": ["Heat returns, but memory remains", "A winter that lasts through budgets", "The line beyond the power grid"],
    "generative-ai-regulation": ["Consent becomes a garden", "Memory behind locked doors", "Two forms of machine knowledge"],
    "state-backed-cyber": ["The morning works, almost", "Logs stop answering", "A city forgets what it trusted"],
    "supply-chain-fragmentation": ["Room for another route", "Inventory becomes weather", "Schedules lose their old promises"],
    "us-political-fragmentation": ["A pause between elections", "Institutions learn to wait", "The far edge of rhetoric"],
    "europe-populism-migration": ["Old streets, new suspicion", "Borders return as mood", "The gate closes slowly"],
    "billionaire-capital-ai-space": ["Private moons above public borders", "Engines waiting under capital", "An orbit colored by power"],
    "climate-migration-water-stress": ["A livable room", "Heat as a long migration", "Water writes the gate"],
    "aging-society-care-labor": ["Machines learn tenderness", "An afternoon that does not end", "Wards with empty shifts"],
    "housing-affordability-generation": ["A room too small for the future", "The commute becomes a life", "A city without children"],
    "food-security-price-shock": ["Shelves remain full", "Harvests stretch across politics", "The plate remembers scarcity"],
    "information-trust-fracture": ["A screen everyone can share", "Suspicion becomes weather", "A morning that needs proof"],
  };
  return subtitles[theme.id] || ["A temporary calm", "Years spent waiting", "The fire beyond the frame"];
}

function possibilityNotes(theme) {
  const notes = {
    "climate-migration-water-stress": ["Cities add shade and water before they add language.", "The map of livable places changes slowly.", "Water-rich regions become borders of a different kind."],
    "aging-society-care-labor": ["Technology and human hands learn to support one another.", "Care shortages reshape family time and urban schedules.", "The line between home and hospital grows thin."],
    "housing-affordability-generation": ["Cities survive by making futures smaller.", "Long commutes and delayed families become ordinary.", "Young people leave cities that no longer leave room for them."],
    "food-security-price-shock": ["Stockpiles and substitutes keep dinner intact.", "Price shocks change menus before they change politics.", "Food anxiety becomes a civic language."],
    "information-trust-fracture": ["Verified words slowly gain weight.", "Suspicion reaches family conversations.", "A false morning delays real decisions."],
  };
  return notes[theme.id] || ["Change appears to pause.", "A small unease becomes a long season.", "A distant event rewrites the assumptions of daily life."];
}

function storyParagraphs(theme) {
  const stories = {
    "us-china-ai-chip-controls": [
      "2022年以降、AIを動かす半導体は、単なる部品ではなく国家の未来を左右する装置になった。米国は先端GPUと製造装置の対中輸出を絞り、中国はNVIDIAやASMLに頼らない計算基盤を急いで組み立て始めた。",
      "この変化の中心には、NVIDIA、TSMC、ASML、SMIC、Huawei、そしてクラウドを借りる無数のAI企業がいる。研究室の実験、生成AIサービス、データセンターの電力計画まで、見えない場所で同じ部品表を見つめている。",
      "人々の生活には、AI機能の地域差、クラウド料金、端末の発売時期として現れる。近未来の世界では、同じ問いをAIに投げても、住んでいる経済圏によって返ってくる答えが少しずつ違っていくかもしれない。",
    ],
    "taiwan-contingency-risk": [
      "台湾海峡は、世界で最も細い未来の通路の一つになった。この海を渡るのは軍艦だけではない。半導体、スマートフォン、自動車、通信機器、保険契約、海底ケーブル、そして各国の安全保障戦略が、見えない形でここを通過している。",
      "台湾にはTSMCを中心とする先端半導体生産が集中している。もしこの地域の緊張が高まれば、世界の工場、電子機器価格、企業の在庫戦略が同時に揺れる。戦争が起きなくても、軍事演習の常態化だけで航路は変わり、保険契約は書き換わる。",
      "台湾海峡の未来は、アジアだけの問題ではない。次に届くスマートフォン、止まる工場、上がる部品価格として、世界中の生活に静かに現れる。人々はニュースより先に、配送予定日の遅れで海峡の気配を知る。",
    ],
    "middle-east-oil": [
      "中東の緊張は、いつも地図の上だけで終わらない。ホルムズ海峡、紅海、LNG基地、タンカー航路、航空路は、都市の電気代や飛行機の運賃へとつながっている。遠い海の警報は、数週間後の請求書に姿を変える。",
      "イラン、イスラエル、サウジアラビア、カタール、米国。そこにSaudi Aramco、Shell、ExxonMobil、JERA、航空会社が重なる。燃料は商品である前に、都市を動かし、冷房を回し、工場の夜勤を続けるための時間そのものになっている。",
      "近未来の空港では、天候と同じように航路の政治が表示されるかもしれない。少し高いコーヒー、少し長い迂回、少し遅い物流。その小さな差額の中で、人々は世界の火種を知らないまま支払っていく。",
    ],
    "russia-ukraine-energy": [
      "2022年、ロシアによるウクライナ侵攻は、ヨーロッパのエネルギー地図を塗り替えた。戦争は国境線だけで起きたわけではない。ガスパイプライン、LNGタンカー、穀物輸送、電力市場、防衛予算、国家財政へと広がっていった。",
      "安価なロシア産エネルギーに依存していた欧州は、急速に供給網を組み替えた。ドイツは戦後の安全保障政策を転換し、各国は防衛費とエネルギー投資を同時に増やし始めた。Gazprom、Equinor、Rheinmetall、穀物メジャーの名前が、同じ冬の画面に並ぶようになった。",
      "遠くの戦争は、暖房費、食品価格、金利、税金という形で人々の日常に届く。この戦争が終わったとしても、世界は元の形には戻らない。エネルギーは単なる商品ではなく、国家の生存装置として扱われる時代に入った。",
    ],
    "generative-ai-regulation": [
      "生成AIは、便利な道具として広がったあと、記憶と権利の問題として戻ってきた。文章、声、画像、診療記録、学校の作文。モデルが学ぶものは、かつて人間が生活の中に置き忘れてきた断片だった。",
      "米国、EU、中国、日本、英国は、それぞれ違う速度でAIのルールを作っている。OpenAI、Google、Microsoft、Meta、Anthropicは、技術企業であると同時に、未来の知識の保管庫になりつつある。",
      "人々の生活には、同意画面、学校の教材、職場のAI利用規約、死後の声の保存として現れる。近未来では、誰に自分の記憶を預けるのかが、銀行口座を選ぶのと同じくらい日常的な選択になるかもしれない。",
    ],
    "state-backed-cyber": [
      "国家支援型のサイバー攻撃は、爆発音を持たない。水道、電力、金融、通信、選挙、物流。都市が毎朝当然のように信じている仕組みの奥で、昨日の記録が本当に正しかったのかを静かに揺らす。",
      "米国、中国、ロシア、北朝鮮、イラン。そしてMicrosoft、CrowdStrike、Palo Alto Networks、金融機関、通信事業者。攻撃と防御は、企業のサーバー室だけでなく、病院の受付、学校の給食、ATMの前にも影を落とす。",
      "近未来の都市では、便利さよりも確認が重くなる。水は出ている。信号も動いている。それでも職員は紙の台帳に判を押し、数秒だけインクが乾くのを待つ。信じるための手続きが、生活の一部になる。",
    ],
    "supply-chain-fragmentation": [
      "サプライチェーンは、かつて効率の名前で世界を細く結んだ。だが輸出規制、制裁、港湾混雑、為替、半導体の割当が重なるにつれ、その細い線は季節のように読まれるものへ変わっていった。",
      "米国、中国、日本、インド、メキシコ、EU。Apple、Toyota、Samsung、Foxconn、商社。どこで作り、どこを通り、どの通貨で支払うかは、製品の性能と同じくらい重要になっている。",
      "人々の生活には、入荷未定、代替品、修理待ち、在庫予報として現れる。近未来の家庭では、食費や光熱費と並んで、欲しいものが届くまで待てる時間を管理するようになるかもしれない。",
    ],
    "us-political-fragmentation": [
      "米国の政治分断は、選挙のたびに世界へ影を伸ばす。議会対立、移民、司法判断、SNS、対中政策、防衛支出。国内の言葉の割れ目が、同盟国の計画や企業の投資判断にまで届く。",
      "Meta、Google、Tesla、防衛関連企業、金融機関は、政策の振れ幅を読みながら次の一年を設計する。国境、広告、AI、ドル金利、軍事協力。かつて別々だった画面が、同じ夜のニュースに並ぶ。",
      "人々の生活には、SNSの表示、移民制度、物価、大学の研究費、海外製品の価格として現れる。近未来の市民は、大統領選の結果をニュース速報としてではなく、自分のスマートフォンの設定変更として受け取るかもしれない。",
    ],
    "europe-populism-migration": [
      "欧州の街路には、古い石畳と新しい国境感覚が同時に存在している。移民、生活費、エネルギー価格、防衛費、気候政策。統合を前提に進んできた大陸は、もう一度、内側の境界線を見つめ直している。",
      "EU、フランス、ドイツ、イタリア、ポーランド。電力会社、自動車メーカー、防衛関連企業、金融機関。政治の空気は、議会だけでなく工場の稼働、補助金、住宅、学校の教室にまで降りてくる。",
      "近未来の欧州では、移動の自由は消えないかもしれない。だが駅の広告、公共サービス、暖房費、投票日の沈黙の中に、以前より少し重い境界が残る。大陸は開かれたまま、ゆっくりと身構えていく。",
    ],
    "billionaire-capital-ai-space": [
      "世界の富豪は、かつて企業を作り、株を持ち、都市に塔を建てた。いま彼らの資本は、AIデータセンター、衛星通信、宇宙輸送、防衛テック、メディア、財団、都市開発へ流れている。",
      "SpaceX、Amazon、Meta、OpenAI周辺企業、湾岸資本、シンガポール、欧州の研究拠点。個人資本と国家の計画は、完全に同じではないが、低軌道、電力網、計算資源の上で互いを見つけ始めている。",
      "人々の生活には、衛星インターネット、AIの利用料、都市の再開発、ニュースの見え方として現れる。近未来では、国旗よりも先に、誰が空と計算機を持っているのかが、世界の速度を決めるかもしれない。",
    ],
    "climate-migration-water-stress": [
      "気候変動は、気温の数字としてだけでなく、人がどこに住めるかという問いとして現れ始めている。熱波、水不足、干ばつ、農地の劣化は、農村から都市へ、乾いた土地から水のある土地へ、人々をゆっくり動かしている。",
      "インド、エジプト、ナイジェリア、EU、米国。淡水化、水再利用、気候予測、都市冷却の技術が注目される一方で、都市の水道、住宅、病院、学校は、新しく到着する人々の生活を受け止めなければならない。",
      "近未来では、移民とは国境を越える人だけを指さなくなる。暑さを避けて都市の北側へ移る家族、水のある地区へ引っ越す高齢者、学校を変える子ども。気候は、住所そのものを書き換える力になる。",
    ],
    "aging-society-care-labor": [
      "高齢化は、静かな未来の始まり方をしている。ある朝、病院の待合室が少し混み、介護施設の夜勤表が埋まらず、家族のカレンダーに通院と見守りの予定が増える。社会は長く生きることに成功したが、その時間を誰が支えるのかをまだ決めきれていない。",
      "日本、韓国、イタリア、ドイツ、中国。介護ロボット、遠隔医療、見守りAI、在宅医療は、未来的な装置である前に、誰かの手が足りない夜を埋めるために家の中へ入ってくる。",
      "近未来の都市では、ケアは医療の話だけではなくなる。働く時間、移民政策、住宅設計、家族の距離、地方交通。人が長く生きるほど、都市はゆっくりと看護の形に近づいていく。",
    ],
    "housing-affordability-generation": [
      "住宅危機は、若い世代の未来から部屋を一つずつ消している。都市には仕事があり、大学があり、文化がある。けれど家賃と住宅価格が上がるほど、その都市で人生を始めることは難しくなる。",
      "米国、英国、カナダ、オーストラリア、日本。不動産会社、住宅ローン、建設会社、投資ファンド、リモートワーク。住宅は住む場所であると同時に、資産、投資商品、世代間の境界線になった。",
      "近未来では、家を持つかどうかだけでなく、どの都市に住む権利を持てるかが人生を分ける。長い通勤、遅れる結婚、小さくなる部屋、郊外へ伸びる生活。都市は満員なのに、誰かの未来だけが空室のまま残される。",
    ],
    "food-security-price-shock": [
      "食料は、遠い畑から食卓へまっすぐ届くものではなくなった。戦争、干ばつ、肥料価格、港湾、輸出規制、冷蔵物流。そのどれか一つが揺れるだけで、学校給食の献立や家庭の買い物かごが変わる。",
      "ウクライナ、ロシア、インド、ブラジル、エジプト。穀物メジャー、食品メーカー、肥料会社、小売企業。精密農業や作物予測が進んでも、雨が降らない年と船が出ない港は、人々の食卓を待ってくれない。",
      "近未来では、安い食料が当たり前だった時代の記憶が薄れていく。都市は備蓄を考え、家庭は代替品に慣れ、子どもたちは給食のメニュー変更で世界の天候を知る。食べることは、もう一度、世界とつながる行為になる。",
    ],
    "information-trust-fracture": [
      "情報空間の分断は、世界を騒がしくするだけではない。人々が同じ出来事を見て、同じ現実にいると感じる力を少しずつ弱めていく。生成AIは声や映像を作り、SNSは怒りや不安を速く運ぶ。",
      "米国、EU、インド、ブラジル、日本。Meta、X、Google、TikTok、報道機関。推薦アルゴリズム、本人確認、透かし技術、ファクトチェックは、ニュースの裏側で、現実をつなぎ止めるための細い糸になっている。",
      "近未来では、家族が同じ食卓にいても、見ている世界が違うことが増えるかもしれない。選挙、災害、戦争、感染症。何が起きたかより先に、誰の画面を信じるのかが問われる時代が来ている。",
    ],
  };
  const story = stories[theme.id] || [
    `${theme.title}は、ある日突然現れた出来事ではない。${theme.countries.slice(0, 3).join("、")}のあいだで積み重なった選択が、企業、技術、生活の画面へ少しずつ降りてきた。`,
    `${theme.companies.slice(0, 4).join("、")}、そして${theme.technologies.slice(0, 3).join("、")}。それらの名前はニュースの外側で、人々の支払い、移動、学習、仕事の速度を変えていく。`,
    "近未来は派手な姿で来るとは限らない。予約の遅れ、選択肢の減少、以前と少し違う価格。その小さな違和感の中で、世界はもう次の形を始めている。",
  ];
  if (story.join("").length >= 430) return story;
  return [
    ...story,
    `${theme.impact.slice(0, 3).join("、")}は、専門家の画面にだけ現れる言葉ではない。朝の通知、店頭の張り紙、家族の予定、会社の承認欄に姿を変え、誰も名前をつけないまま生活の輪郭を少しずつ変えていく。`,
  ];
}

function storySignals(theme) {
  const signals = {
    "taiwan-contingency-risk": ["軍事演習が日常の天気のように報じられる。", "企業が在庫と調達先を静かに増やしている。", "海運と保険の契約が以前より慎重になっている。", "半導体の産地が、製品説明の裏側で重くなる。"],
    "russia-ukraine-energy": ["欧州の冬が、政治と電力価格を同じ画面に映す。", "防衛産業とエネルギー投資が同時に増えている。", "穀物とガスのニュースが家庭の支出に近づいている。", "古いパイプラインの時代が戻らないものになっている。"],
    "billionaire-capital-ai-space": ["AIデータセンターが砂漠と電力網を求めている。", "民間宇宙企業が国家の通信と防衛に近づいている。", "富豪の寄付、投資、メディア所有が同じ物語に重なる。", "都市と研究機関が、巨大資本の軌道に入っていく。"],
    "climate-migration-water-stress": ["熱波の日数が、学校と労働時間を変えている。", "水道、住宅、病院が新しい人口移動を受け止め始めている。", "農地の乾燥が、都市の家賃と食料価格に近づいている。", "国境より先に、生活圏が静かに移動している。"],
    "aging-society-care-labor": ["夜勤表の空白が、家族の予定表に移っている。", "見守りAIと遠隔医療が家庭の中へ入っている。", "移民政策と介護制度が同じ会議で語られ始めている。", "長寿の社会が、時間の使い方を変えている。"],
    "housing-affordability-generation": ["家賃が、若い世代の人生の開始時期を遅らせている。", "都市の仕事と住まいの距離が広がっている。", "住宅が暮らしの場ではなく、資産として扱われすぎている。", "郊外と地方の意味が変わり始めている。"],
    "food-security-price-shock": ["穀物と肥料の価格が、献立の小さな変更として届いている。", "輸出規制が、遠い国の食卓を揺らしている。", "気候予測が、小売と学校給食の判断材料になっている。", "食料備蓄が、家庭と国家の両方で見直されている。"],
    "information-trust-fracture": ["本物らしい声と映像が、誰でも作れるようになっている。", "タイムラインが、人々の世界観を別々に育てている。", "選挙と災害時に、何を信じるかが争点になっている。", "家族の会話に、画面の違いが入り込んでいる。"],
  };
  return signals[theme.id] || theme.scenarios.map((item) => item.replace(/する。$/, "している。")).slice(0, 4);
}

function nearFuture(theme) {
  const futures = {
    "us-china-ai-chip-controls": ["AIサービスの性能差が地域ごとに見え始める。", "大学と企業は、使える計算資源を前提に研究計画を組み直す。", "半導体の部品表が、国境のように読まれる。"],
    "taiwan-contingency-risk": ["電子機器の納期が、海峡の静けさに左右される。", "企業は同じ製品を複数の産地で作ることを常識にする。", "海底ケーブルと衛星通信が、日常の見えない保険になる。"],
    "middle-east-oil": ["航空券と物流費に、遠い海の迂回が織り込まれる。", "都市は燃料の価格よりも、燃料が届く道筋を気にし始める。", "小さな値上げが、世界の緊張を生活へ翻訳する。"],
    "russia-ukraine-energy": ["暖房、税金、防衛費が同じ家計の中で語られる。", "欧州の産業は、安いエネルギーの記憶から離れていく。", "戦後の平和より先に、戦後の電力網が設計される。"],
    "generative-ai-regulation": ["子どもの声や写真に、未来の利用許可が紐づく。", "企業はモデルの賢さより、どこで学んだかを示すようになる。", "忘れられる権利が、保存したい記憶とぶつかる。"],
    "state-backed-cyber": ["都市は止まるより先に、自分の記録を疑い始める。", "紙の手続きが、最後の安心として戻ってくる。", "毎朝の確認作業が、水道や金融の見えない儀式になる。"],
    "supply-chain-fragmentation": ["家庭は価格だけでなく、届くまでの時間を買うようになる。", "工場は効率より、代替できる余白を持つようになる。", "在庫予報が天気予報の隣に並ぶ。"],
    "us-political-fragmentation": ["選挙の結果が、アプリの規約や研究費の条件として届く。", "同盟国は米国の約束を、年単位ではなく選挙周期で読む。", "情報空間の不信が、日常会話の温度を下げる。"],
    "europe-populism-migration": ["駅、学校、住宅、暖房費の中に新しい境界感覚が残る。", "気候政策と生活費のあいだで、古い合意が揺れる。", "開かれた大陸が、静かに身構える。"],
    "billionaire-capital-ai-space": ["衛星とAIが、公共インフラの影に入り込む。", "都市の未来が、国家予算だけでなく個人資本に左右される。", "空と計算機を持つ者が、世界の速度を決め始める。"],
    "climate-migration-water-stress": ["暑さを避ける移動が、都市計画の前提になる。", "水のある地域が、仕事と住宅の価値を変える。", "冷房、給水、日陰が、公共インフラの中心になる。"],
    "aging-society-care-labor": ["介護ロボットは未来の象徴ではなく、夜勤の相棒になる。", "家族の距離と働き方が、ケアを中心に再設計される。", "都市の交通と住宅は、高齢者の速度に合わせて変わる。"],
    "housing-affordability-generation": ["家族を持つ時期が、住宅ローンと家賃に左右される。", "若い世代は所有より移動できる生活を選ぶ。", "都市は中心ではなく、複数の小さな生活圏へ分かれる。"],
    "food-security-price-shock": ["学校給食の献立が、気候と港の状況を反映する。", "代替タンパクと備蓄食品が、日常の棚に増える。", "食料政策は安全保障と福祉の両方として扱われる。"],
    "information-trust-fracture": ["本人確認された言葉が、価値を持つようになる。", "家族や学校は、情報の読み方を生活技術として教える。", "社会は速さよりも、確かめる時間を必要とし始める。"],
  };
  return futures[theme.id] || theme.scenarios.slice(0, 3);
}

function memoriesFromTomorrow(theme) {
  const memories = {
    "taiwan-contingency-risk": [
      {
        date: "2032",
        place: "バンコク",
        country: "タイ",
        viewpoint: "工場経営者",
        body: "2032年、タイのバンコクで、工場経営者は郊外へ伸びる道路沿いに新しい半導体工場が建っていくのを見ていた。日本企業の看板が並ぶ通りでは、日本語教室が人気になっている。彼らは台湾海峡で起きたことを、ニュースではなく仕事として知っていた。",
      },
      {
        date: "2034",
        place: "ホーチミン市",
        country: "ベトナム",
        viewpoint: "若い半導体技術者",
        body: "2034年、ベトナムのホーチミン市で、若い半導体技術者たちは、かつて深圳で行われていた仕事を引き継いでいた。工場の食堂には、台湾、日本、韓国、米国の部品表が並ぶ。世界の緊張は、彼らにとって恐怖だけではなく、新しい職能の始まりでもあった。",
      },
      {
        date: "2033",
        place: "台北",
        country: "台湾",
        viewpoint: "高校生",
        body: "2033年、台湾の台北で、高校生のリンは進路希望に半導体材料と書いた。先生は理由を尋ねない。街では緊張のニュースが流れているが、彼女にとって未来は避難訓練だけではなかった。まだここで学び、作り、残るという選択でもあった。",
      },
    ],
    "russia-ukraine-energy": [
      {
        date: "2031",
        place: "ベルリン",
        country: "ドイツ",
        viewpoint: "年金生活者",
        body: "2031年、ドイツのベルリンで、年金生活者は暖房費が安定したことを家計簿に記録していた。しかし住民は、以前の価格を誰も覚えていなかった。安いエネルギーの時代は、思い出ではなく、古い請求書の中にだけ残っていた。",
      },
      {
        date: "2032",
        place: "オスロ",
        country: "ノルウェー",
        viewpoint: "港湾労働者",
        body: "2032年、ノルウェーのオスロで、港湾労働者はLNG船の入港予定を学校の天気予報のように聞いていた。欧州の不安は、ここでは雇用と税収と新しい住宅地になっていた。危機は、場所によって別の名前を持つ。",
      },
      {
        date: "2034",
        place: "ワルシャワ",
        country: "ポーランド",
        viewpoint: "若い送電技師",
        body: "2034年、ポーランドのワルシャワで、若い送電技師は送電網の図面を前に、平和とは停電しないことでもあると思った。戦争が遠ざかっても、変電所のフェンスは高いままだった。",
      },
    ],
    "us-china-ai-chip-controls": [
      {
        date: "2033",
        place: "ニューデリー",
        country: "インド",
        viewpoint: "半導体技術者",
        body: "2033年、インドのニューデリーで、半導体技術者たちは米中の分断を地図ではなく求人票で知った。新しい研究棟では、台湾帰りの講師が歩留まりについて教えている。世界の分裂は、彼らにとって遅れて届いた招待状でもあった。",
      },
      {
        date: "2035",
        place: "東京",
        country: "日本",
        viewpoint: "AI研究者",
        body: "2035年、日本の東京で、AI研究者はクラウドGPUの予約画面を人気コンサートの抽選のように見ていた。研究者たちは待ち時間の中で、軽いモデルを作る技術を覚えていく。不足は、別の発明の先生になることがある。",
      },
      {
        date: "2036",
        place: "北京",
        country: "中国",
        viewpoint: "若い開発者",
        body: "2036年、中国の北京で、若い開発者は海外製チップを知らない世代として働いていた。遅い計算機で育った彼らは、最初から別の制約を前提にコードを書いた。世界は分かれたが、片方だけが止まったわけではなかった。",
      },
    ],
    "middle-east-oil": [
      {
        date: "2032",
        place: "ドーハ",
        country: "カタール",
        viewpoint: "港湾管理者",
        body: "2032年、カタールのドーハで、港湾管理者は夜通し消えない港の灯りを見ていた。LNG船の予定表は、遠い都市の暖房と工場を支えている。海峡の緊張は、ここでは不安だけでなく、仕事の増えた夜でもあった。",
      },
      {
        date: "2033",
        place: "マニラ",
        country: "フィリピン",
        viewpoint: "船員の家族",
        body: "2033年、フィリピンのマニラで、船員の家族は父の航路がいつもより長いことを地図アプリで知った。危険な海を避けるための迂回は、ビデオ通話の時間を少しずつ遅らせていく。",
      },
      {
        date: "2034",
        place: "カイロ",
        country: "エジプト",
        viewpoint: "通勤客",
        body: "2034年、エジプトのカイロで、通勤客はバス運賃が小さく上がったことに気づいた。誰もそれを地政学とは呼ばない。ただ通勤客は、財布の中の硬貨が前より早く減ることだけを知っていた。",
      },
    ],
  };

  const selectedMemories = memories[theme.id] || [
    {
      date: "2032",
      place: cityFromCountry(theme.countries[0] || "日本"),
      country: theme.countries[0] || "日本",
      viewpoint: "生活者",
      body: `${theme.title}は、誰かにとって不安であり、別の誰かにとっては新しい仕事や移動の理由だった。世界は一つの意味だけでは動かない。`,
    },
    {
      date: "2034",
      place: cityFromCountry(theme.countries[1] || "ドイツ"),
      country: theme.countries[1] || "ドイツ",
      viewpoint: "生活者",
      body: `${theme.impact[0] || "生活"}の変化は、ニュースより遅れて家庭に届く。だが届いたあとは、予定表、買い物、通勤、学校の選択に静かに残り続ける。`,
    },
    {
      date: "2036",
      place: cityFromCountry(theme.countries[2] || "米国"),
      country: theme.countries[2] || "米国",
      viewpoint: "生活者",
      body: `同じ出来事を見ても、人々は同じ未来を想像しない。RESONAは正解ではなく、その分岐した記憶を集めていく。`,
    },
  ];
  return selectedMemories.map((memory, index) => normalizeMemoryRecord(memory, theme, index));
}

function futureGlimpse(theme) {
  const memories = memoriesFromTomorrow(theme);
  const rotatingMemory = memories[Math.floor(Date.now() / 86400000) % memories.length];
  if (rotatingMemory) {
    return {
      date: rotatingMemory.date,
      place: rotatingMemory.place,
      city: rotatingMemory.city,
      country: rotatingMemory.country,
      viewpoint: rotatingMemory.viewpoint,
      body: rotatingMemory.body.split("。").filter(Boolean).map((line) => `${line}。`),
    };
  }
  const glimpses = {
    "us-china-ai-chip-controls": {
      date: "2034年11月",
      place: "東京",
      body: [
        "大学の研究室では、夜間のGPU利用枠が抽選制になっていた。",
        "学生たちは新しいモデルを諦め、三年前の重みを丁寧に圧縮する。教授はそれを節約ではなく、地政学的な実験環境だと言った。",
        "画面の進捗バーは遅く、窓の外では配送トラックが静かに通り過ぎる。誰も分断という言葉を使わない。ただ、同じ問いに届くまでの時間だけが、国ごとに違っていた。",
      ],
    },
    "taiwan-contingency-risk": {
      date: "2033年5月",
      place: "台北",
      body: [
        "ノートPCの納期は六か月になっていた。",
        "店員はもう、短い沈黙にも慣れていた。客はため息をつき、古い端末のバッテリー交換を予約する。",
        "港のニュースは店内の音楽に紛れて聞こえない。誰も戦争とは呼ばなかった。ただ、世界の在庫表だけが静かに書き換わっていた。",
      ],
    },
    "middle-east-oil": {
      date: "2032年9月",
      place: "ドーハ",
      body: [
        "出発案内の横に、燃料サーチャージの指数が表示されていた。",
        "二十分の遅延は珍しくない。遠回りの航路も、いまでは天候と同じように受け入れられている。",
        "乗客は海峡の名前を知らないまま、少し高いコーヒーを買う。遠い火は、日常の端数として届いていた。",
      ],
    },
    "russia-ukraine-energy": {
      date: "2031年1月",
      place: "ベルリン",
      body: [
        "集合住宅の暖房は、夜明け前の二時間だけ強くなる。",
        "管理アプリには、電力価格、防衛支出、気温、ガス備蓄が一つの線で表示されていた。住民は理由を尋ねなくなった。",
        "戦争は遠くで続いている。けれど朝の床が少し冷たいことだけが、世界がまだ解決していない証拠だった。",
      ],
    },
    "generative-ai-regulation": {
      date: "2030年4月",
      place: "ブリュッセル",
      body: [
        "保育園の入園書類には、子どもの声をAI学習に使うかどうかの欄があった。",
        "母親はペンを止める。許可すれば便利になる。拒否すれば、未来のどこかで少し不便になるかもしれない。",
        "同意とは、いま目の前にない都市へ署名することだった。窓の外では、古い石畳の上を自動配送車が静かに曲がっていく。",
      ],
    },
    "state-backed-cyber": {
      date: "2035年2月",
      place: "ワシントンD.C.",
      body: [
        "水道局の朝礼は、昨日のログが正しかったかを確認するところから始まる。",
        "水は出ている。信号も動いている。だからこそ、誰も異常を証明できない。",
        "職員は紙の台帳に押印し、数秒だけインクが乾くのを待った。その短い沈黙が、都市に残された最後の確かさのように見えた。",
      ],
    },
    "supply-chain-fragmentation": {
      date: "2036年8月",
      place: "東京",
      body: [
        "自転車の変速機を直すために、二つの部品が提示された。",
        "安いが入荷未定のもの。高いが同盟国経由で保証されるもの。父親は仕事で見慣れた選択肢が、娘の通学路に現れたことに気づく。",
        "家庭の予算表には、新しい項目が増えていた。食費、光熱費、教育費、そして供給余白。",
      ],
    },
    "climate-migration-water-stress": {
      date: "2037年7月",
      place: "ニューデリー",
      body: [
        "午後二時、屋外授業はすべて中止になった。",
        "学校の廊下には給水ポイントの列ができ、教師は出席簿の横に熱中症アラートを開いている。",
        "転校してきた子どもは、前の村の井戸がいつ涸れたのかを覚えていなかった。ただ、母親が水のある地区の家賃を毎晩調べていたことだけを覚えていた。",
      ],
    },
    "aging-society-care-labor": {
      date: "2038年3月",
      place: "東京",
      body: [
        "朝の通勤電車で、介護シフトの通知音が一斉に鳴った。",
        "父の見守りAIは正常を示している。だが娘は、正常という言葉が安心ではなく、次に確認するまでの猶予だと知っていた。",
        "駅前の広告には、新しいケアロボットの案内が映っている。都市は少しずつ、誰かを支える形に作り替えられていた。",
      ],
    },
    "housing-affordability-generation": {
      date: "2034年10月",
      place: "ロンドン",
      body: [
        "内見は七分で終わった。",
        "部屋は狭く、窓の外には別の新築マンションの壁が見える。それでも応募者は二百人いた。",
        "若い夫婦は帰りの地下鉄で、子どもの名前ではなく、次に住める都市の名前を話し合った。未来は間取り図の中で、少しずつ小さくなっていた。",
      ],
    },
    "food-security-price-shock": {
      date: "2036年2月",
      place: "カイロ",
      body: [
        "給食のパンは、週に三日だけになった。",
        "校長は理由を長く説明しなかった。黒海、肥料、港、雨不足。どの言葉も子どもたちの空腹より遠かった。",
        "帰り道、母親は小麦粉の棚の前で立ち止まる。価格表示は昨日と違っていた。遠い畑の天気が、夕食の量を決めていた。",
      ],
    },
    "information-trust-fracture": {
      date: "2032年11月",
      place: "ワシントンD.C.",
      body: [
        "選挙の朝、祖母から送られてきた動画は本物に見えた。",
        "孫は返信を書きかけて、画面の右上にある小さな認証マークを探す。そこには何もなかった。",
        "家族のグループチャットは静まり返る。誰も嘘をつきたいわけではない。ただ、同じ朝を見ている自信だけが失われていた。",
      ],
    },
  };

  const glimpse =
    glimpses[theme.id] || {
      date: "2035年6月",
      place: "東京",
      body: [
        "朝の通知は、昨日と同じ生活を少しだけ高く、少しだけ遅くした。",
        `${theme.title}は、納期、保険料、承認フロー、店頭価格として人々の前に現れる。`,
        "世界は突然変わらない。ただ、選べるはずだった選択肢が、静かに一つずつ減っていく。",
      ],
    };

  const bodyLength = glimpse.body.join("").length;
  if (bodyLength < 300) {
    return {
      ...glimpse,
      body: [
        ...glimpse.body,
        `${theme.impact.slice(0, 3).join("、")}は、予約画面、請求書、在庫表示の中で小さく瞬く。`,
        `人々は理由を完全には知らない。それでも、${theme.countries.slice(0, 3).join("、")}のあいだで何かが移動し、自分の一日が少しだけ傾いたことには気づいている。`,
        "その変化は劇的ではない。だからこそ長く残る。朝の会話、会社の承認、店頭の小さな張り紙が、遠い星のように瞬いている。",
      ],
    };
  }

  return glimpse;
}

storyParagraphs = function storyParagraphsEnglish(theme) {
  return [
    `${themeTitle(theme)} is not presented here as news. It is treated as raw material for fiction: a pressure in the real world that may become memory, myth, work, grief, comedy or ritual somewhere else.`,
    themeSummary(theme),
    "The same signal will not produce one universal future. Japan, Southeast Asia, Europe, Africa and South America may inherit different consequences, different opportunities and different kinds of loss.",
  ];
};

storySignals = function storySignalsEnglish(theme) {
  const seeds = sourceSignalSeeds[theme.id] || [themeSummary(theme)];
  return seeds.slice(0, 4).map((signal) => `A real-world signal enters the archive: ${signal}`);
};

nearFuture = function nearFutureEnglish() {
  return [
    "A new story may appear from a minor change in work, travel, school, energy, identity or money.",
    "Characters in different regions may experience the same event as loss, opportunity, absurdity or relief.",
    "The archive may revisit this world decades or centuries later through another voice.",
  ];
};

memoriesFromTomorrow = function memoriesFromTomorrowEnglish(theme) {
  return scenarioStories(theme).slice(0, 3).map((story, index) => ({
    ...story,
    date: story.year,
    place: story.city,
    body: story.text.join(" "),
    id: story.id || `Memory #${String(index + 1).padStart(3, "0")}`,
  }));
};

futureGlimpse = function futureGlimpseEnglish(theme) {
  const story = latestScenarioStory(theme);
  return {
    date: story.year,
    place: story.city,
    city: story.city,
    country: story.country,
    viewpoint: story.viewpoint,
    body: story.text.slice(0, 3),
  };
};

function marketSignals(theme) {
  const signalNames = ["Static", "Drift", "Echo", "Afterglow"];
  return signalNames.map((name, index) => {
    const value = Math.min(98, Math.max(42, theme.score - 12 + index * 5));
    return { name, value };
  });
}

function eventWhisper(event) {
  const whispers = {
    Politics: "Capital cities exhale, and distant routines change.",
    Geopolitics: "Borders stay still while daily life quietly moves.",
    Semiconductor: "Tiny machines cast long shadows into future rooms.",
    Energy: "Routes of fuel decide the temperature of cities.",
    AI: "Behind closed doors, intelligence learns new jurisdictions.",
    "Cyber Security": "Every morning, the city checks whether yesterday was real.",
    Technology: "Unnamed tools enter daily life before they enter language.",
    "Market Impact": "Numbers move, and choices become narrower or stranger.",
    "Capital Flows": "Private capital pulls public futures into orbit.",
    Society: "Ordinary life changes its shape without asking permission.",
    Climate: "Heat and water begin to rewrite addresses.",
    Food: "Weather in distant fields reaches the dinner table.",
  };
  return whispers[event.category] || "Change arrives quietly, then stays.";
}

function experienceMapDots(theme) {
  return [...theme.countries, ...theme.impact.slice(0, 3)]
    .slice(0, 8)
    .map((item, index) => {
      const positions = [
        [75, 43],
        [80, 48],
        [62, 36],
        [49, 34],
        [31, 42],
        [68, 58],
        [56, 51],
        [73, 62],
      ];
      const [x, y] = positions[index];
      return `<span class="geo-dot dot-${index + 1}" style="--x:${x}%;--y:${y}%"><i></i><b>${item}</b></span>`;
    })
    .join("");
}

function themeDetail(id) {
  const theme = themes.find((item) => item.id === id) || themes[0];
  const glimpse = futureGlimpse(theme);
  const chapters = theme.nodes;
  const horizons = possibilityTitles(theme);
  const horizonSubtitles = possibilitySubtitles(theme);
  const horizonNotes = possibilityNotes(theme);
  const story = storyParagraphs(theme);
  const signals = storySignals(theme);
  const futures = nearFuture(theme);
  const memories = memoriesFromTomorrow(theme);
  const fiction = latestScenarioStory(theme);
  const archiveStories = scenarioStories(theme);
  const pendingStories = pendingScenarioStories(theme);
  const memoryPreview = memories.slice(0, 3);
  const remainingMemoryCount = Math.max(0, archiveDepth(theme) - memoryPreview.length);
  app.innerHTML = `
    <article class="experience-shell">
      <section class="experience-hero reveal">
        <div class="space-noise"></div>
        <div class="experience-inner hero-grid story-hero-grid">
          <div class="world-copy">
            <a class="back-link dark" href="#/themes">← Themes</a>
            <span class="kicker">World Entry</span>
            <h1>${themeTitle(theme)}</h1>
            <p>${worldLine(theme)}</p>
            <small class="era-line">A signal archive for stories that may outlive the present.</small>
          </div>
        </div>
        <div class="abstract-earth" aria-hidden="true">
          <div class="earth-core"></div>
          ${experienceMapDots(theme)}
        </div>
      </section>

      <section class="experience-section story-section reveal">
        <div class="experience-inner reading-layout">
          <span class="kicker">Story Origin</span>
          <h2>What kind of fiction can this reality produce?</h2>
          <div class="story-copy">
            ${story.map((paragraph) => `<p>${paragraph}</p>`).join("")}
          </div>
          <div class="story-constellation" aria-label="Story elements">
            ${theme.countries.slice(0, 5).map((item) => `<span>${item}</span>`).join("")}
            ${theme.companies.slice(0, 4).map((item) => `<span>${item}</span>`).join("")}
            ${theme.technologies.slice(0, 3).map((item) => `<span>${item}</span>`).join("")}
          </div>
        </div>
      </section>

      <section class="experience-section narrative-list-section reveal">
        <div class="experience-inner dual-reading-grid">
          <div>
            <span class="kicker">Signals</span>
            <h2>What the world is handing to the archive.</h2>
            <div class="narrative-list">
              ${signals
                .map(
                  (item, index) => `
                    <article>
                      <span>${String(index + 1).padStart(2, "0")}</span>
                      <p>${item}</p>
                    </article>
                  `,
                )
                .join("")}
            </div>
          </div>
          <div>
            <span class="kicker">Near Futures</span>
            <h2>The next room is already lit.</h2>
            <div class="narrative-list future-list">
              ${futures
                .map(
                  (item, index) => `
                    <article>
                      <span>${String(index + 1).padStart(2, "0")}</span>
                      <p>${item}</p>
                    </article>
                  `,
                )
                .join("")}
            </div>
          </div>
        </div>
      </section>

      <section class="future-glimpse reveal">
        <div class="glimpse-frame">
          <span class="kicker">Future Glimpse</span>
          <div class="glimpse-meta">
            <strong>${glimpse.date}</strong>
            <b>${glimpse.city || glimpse.place} / ${glimpse.country || ""} / ${glimpse.viewpoint || "生活者"}</b>
          </div>
          <div class="glimpse-text">
            ${glimpse.body.map((line) => `<p>${line}</p>`).join("")}
          </div>
        </div>
      </section>

      <section class="experience-section possibility-space reveal">
        <div class="experience-inner">
          <span class="kicker">Memories from Tomorrow</span>
          <h2>Recently added fragments.</h2>
          <div class="possibility-grid">
            ${memoryPreview
              .map(
                (memory, index) => `
                  <article>
                    <span>#${String(archiveDepth(theme) - index).padStart(3, "0")}</span>
                    <h3>${memory.city}</h3>
                    <small>${memory.date} / ${memory.city} / ${memory.country} / ${memory.viewpoint}</small>
                    <p>${excerpt(memory.body, 96)}</p>
                  </article>
                `,
              )
              .join("")}
          </div>
          <p class="era-line">${remainingMemoryCount} more records in the archive</p>
          <div class="hero-actions">
            <a class="secondary" href="#/archive">Read the Archive</a>
          </div>
        </div>
      </section>

      <section class="experience-section possibility-space reveal">
        <div class="experience-inner">
          <span class="kicker">Possible Futures</span>
          <h2>Several tomorrows are waiting.</h2>
          <div class="possibility-grid">
            <article>
              <span>01</span>
              <h3>${horizons[0]}</h3>
              <small>${horizonSubtitles[0]}</small>
              <p>${horizonNotes[0]}</p>
            </article>
            <article>
              <span>02</span>
              <h3>${horizons[1]}</h3>
              <small>${horizonSubtitles[1]}</small>
              <p>${horizonNotes[1]}</p>
            </article>
            <article>
              <span>03</span>
              <h3>${horizons[2]}</h3>
              <small>${horizonSubtitles[2]}</small>
              <p>${horizonNotes[2]}</p>
            </article>
          </div>
        </div>
      </section>

      <section class="experience-section scenario-fiction-section reveal">
        <div class="experience-inner reading-layout">
          <span class="kicker">Featured Story</span>
          <h2>${fiction.title}</h2>
          <article class="scenario-fiction-card story-fiction-card">
            <span class="fiction-label">${fiction.id} / Story Record</span>
            <div class="glimpse-meta">
              <strong>${fiction.year}</strong>
              <b>${fiction.city} / ${fiction.country} / ${fiction.viewpoint}</b>
            </div>
            <div class="fiction-body">
              ${fiction.text.map((paragraph) => `<p>${paragraph}</p>`).join("")}
            </div>
            <footer>A fictional memory born from current signals</footer>
          </article>
        </div>
      </section>

      <section class="experience-section possibility-space reveal">
        <div class="experience-inner">
          <span class="kicker">Story Archive</span>
          <h2>The archive grows as time accumulates.</h2>
          <div class="possibility-grid">
            ${archiveStories
              .slice(-3)
              .reverse()
              .map(
                (story) => `
                  <article>
                    <span>${story.id}</span>
                    <h3>${story.title}</h3>
                    <small>${story.year} / ${story.city} / ${story.country} / ${story.viewpoint}${story.status === "pending" ? " / pending" : ""}</small>
                    <p>${story.status === "pending" ? "A draft memory waiting to enter the archive." : excerpt(story.text[0], 110)}</p>
                  </article>
                `,
              )
              .join("")}
          </div>
          <p class="era-line">Archive path: ${storyStoragePath(theme, fiction).replace(/\/\d+\.json$/, "/")}</p>
          ${
            pendingStories.length
              ? `<p class="era-line">${pendingStories.length} draft memories are waiting for review.</p>`
              : ""
          }
          <div class="hero-actions">
            <a class="secondary" href="#/archive">Open Archive</a>
          </div>
        </div>
      </section>

      <section class="experience-section causal-flow-section trace-section reveal">
        <div class="experience-inner">
          <span class="kicker">Trace</span>
          <h2>Every event leaves a life behind.</h2>
          <div class="causal-network quiet-trace">
            ${chapters
              .map(
                (node, index) => `
                  <button class="flow-node" type="button" data-node="${index + 1}" style="--i:${index}">
                    <span>${String(index + 1).padStart(2, "0")}</span>
                    <strong>${node}</strong>
                  </button>
                  ${index < theme.nodes.length - 1 ? `<i class="flow-line" style="--i:${index}"></i>` : ""}
                `,
              )
              .join("")}
          </div>
        </div>
      </section>
    </article>
  `;
  initExperienceDetailSoon();
}

function themeCard(theme) {
  return `
    <article class="theme-card motion-reveal">
      <div class="card-head">
        <span>${categoryLabel(theme.category)}</span>
        <strong>MEMORY</strong>
      </div>
          <h3>${themeTitle(theme)}</h3>
      <p>${worldLine(theme)}</p>
      <div class="causal-hint" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="card-actions">
        <a href="${themeHref(theme)}">Read</a>
        <span>Fragment</span>
      </div>
    </article>
  `;
}

const themeVisuals = {
  "us-china-ai-chip-controls": ["rgba(103,232,249,0.24)", "rgba(99,102,241,0.12)", "Chips / AI"],
  "taiwan-contingency-risk": ["rgba(56,189,248,0.22)", "rgba(245,158,11,0.13)", "Strait / Machines"],
  "middle-east-oil": ["rgba(245,158,11,0.24)", "rgba(185,28,59,0.12)", "Routes / Energy"],
  "russia-ukraine-energy": ["rgba(148,163,184,0.2)", "rgba(96,165,250,0.12)", "Winter / Power"],
  "generative-ai-regulation": ["rgba(168,85,247,0.18)", "rgba(103,232,249,0.12)", "Memory / AI"],
  "state-backed-cyber": ["rgba(34,197,94,0.18)", "rgba(103,232,249,0.11)", "Cities / Logs"],
  "supply-chain-fragmentation": ["rgba(245,158,11,0.18)", "rgba(15,23,42,0.6)", "Inventory / Routes"],
  "billionaire-capital-ai-space": ["rgba(103,232,249,0.18)", "rgba(245,158,11,0.14)", "Capital / Orbit"],
  "climate-migration-water-stress": ["rgba(14,165,233,0.18)", "rgba(245,158,11,0.12)", "Water / Migration"],
  "information-trust-fracture": ["rgba(185,28,59,0.16)", "rgba(103,232,249,0.12)", "Voice / Proof"],
};

function themeArchiveCard(theme, index) {
  const latest = latestScenarioStory(theme);
  const visual = themeVisuals[theme.id] || ["rgba(103,232,249,0.16)", "rgba(255,255,255,0.045)", categoryLabel(theme.category)];
  return `
    <article class="archive-theme-card motion-reveal" style="--i:${index};--v1:${visual[0]};--v2:${visual[1]}">
      <a href="${themeHref(theme)}" aria-label="Open ${themeTitle(theme)}">
        <div class="archive-card-bg" aria-hidden="true">
          <span></span><i></i><b>${visual[2]}</b>
        </div>
        <div class="archive-card-rest">
          <span>${categoryLabel(theme.category)}</span>
          <h2>${themeTitle(theme)}</h2>
          <p>${worldLine(theme)}</p>
        </div>
        <div class="archive-card-hover">
          <p>${themeSummary(theme)}</p>
          <dl>
            <div><dt>Signal Strength</dt><dd>${theme.score}</dd></div>
            <div><dt>Related Story</dt><dd>${latest.title}</dd></div>
          </dl>
          <span class="open-signal">Open Signal</span>
        </div>
      </a>
    </article>
  `;
}

function worldMapPreview(limit = riskEvents.length) {
  const priorityIds = ["us-political-fragmentation", "europe-populism-migration", "billionaire-capital-ai-space"];
  const priorityEvents = riskEvents.filter((event) => priorityIds.includes(event.id));
  const baseEvents = riskEvents.filter((event) => !priorityIds.includes(event.id));
  const events = limit < riskEvents.length ? [...baseEvents.slice(0, Math.max(0, limit - priorityEvents.length)), ...priorityEvents] : riskEvents;
  return `
    <div class="world-map-panel">
      <div class="map-canvas" aria-label="Map of world signals">
        <div class="real-risk-map" data-limit="${limit}"></div>
        <div class="map-caption">The lights remain after the event moves on.</div>
      </div>
      <div class="map-event-list">
        ${events
          .map((event) => {
            const level = riskLevel(event.score);
            const href = eventHref(event);
            return `
              <a class="map-event ${level.className}" href="${href}">
                <span>${categoryLabel(event.category)}</span>
                <strong>${event.label}</strong>
                <small>${event.region}</small>
              </a>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function eventHref(event) {
  if (!event.themeId) return "#/map";
  const theme = themes.find((item) => item.id === event.themeId);
  return theme ? themeHref(theme) : "#/map";
}

function initRiskMapsSoon() {
  window.setTimeout(initRiskMaps, 0);
}

function initRiskMaps() {
  const mapNodes = document.querySelectorAll(".real-risk-map:not([data-ready='true'])");
  if (!mapNodes.length) return;
  if (!window.L) {
    window.setTimeout(initRiskMaps, 250);
    return;
  }

  mapNodes.forEach((node) => {
    node.dataset.ready = "true";
    const limit = Number(node.dataset.limit || riskEvents.length);
    const events = riskEvents.slice(0, limit);
    const map = L.map(node, {
      center: [18, 18],
      zoom: limit > 12 ? 2 : 2,
      minZoom: 1,
      maxZoom: 5,
      zoomControl: false,
      attributionControl: true,
      scrollWheelZoom: false,
      dragging: true,
      worldCopyJump: true,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
      subdomains: "abcd",
      maxZoom: 6,
    }).addTo(map);

    const lineCoords = events
      .map((event) => eventCoordinates[event.id])
      .filter(Boolean);
    for (let index = 0; index < lineCoords.length - 1; index += 1) {
      L.polyline([lineCoords[index], lineCoords[index + 1]], {
        className: "risk-geo-line",
        color: "rgba(103, 232, 249, 0.22)",
        weight: 1,
        opacity: 0.55,
        dashArray: "4 10",
      }).addTo(map);
    }

    events.forEach((event, index) => {
      const level = riskLevel(event.score);
      const coord = eventCoordinates[event.id];
      if (!coord) return;
      const size = Math.round(9 + event.score / 8);
      const icon = L.divIcon({
        className: `geo-risk-dot ${level.className}`,
        html: `<span style="--s:${size}px;--i:${index}"><i></i><b>${event.label}</b></span>`,
        iconSize: [size + 130, size + 18],
        iconAnchor: [size / 2, size / 2],
      });
      const marker = L.marker(coord, { icon, title: event.label }).addTo(map);
      marker.on("click", () => {
        window.location.hash = eventHref(event);
      });
    });

    window.setTimeout(() => map.invalidateSize(), 120);
  });
}

function initExperienceDetailSoon() {
  window.setTimeout(initExperienceDetail, 0);
}

function initPageMotionSoon() {
  window.setTimeout(initPageMotion, 0);
}

function initPageMotion() {
  initImmersiveMotion();
  const revealItems = document.querySelectorAll(".motion-reveal, .section, .split-section, .list-card, .map-event");
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add("is-visible");
      });
    },
    { threshold: 0.16 },
  );
  revealItems.forEach((item) => observer.observe(item));

  document.querySelectorAll(".count-up").forEach((item) => {
    const target = Number(item.dataset.count || item.textContent || 0);
    let start = null;
    const duration = 1400;
    const step = (timestamp) => {
      start ??= timestamp;
      const progress = Math.min(1, (timestamp - start) / duration);
      item.textContent = String(Math.round(target * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

function initExperienceDetail() {
  const root = document.querySelector(".experience-shell");
  if (!root) return;
  initImmersiveMotion(root);

  const revealItems = root.querySelectorAll(".reveal");
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add("is-visible");
      });
    },
    { threshold: 0.22 },
  );
  revealItems.forEach((item) => observer.observe(item));

  const flowNodes = root.querySelectorAll(".flow-node");
  flowNodes.forEach((node) => {
    node.addEventListener("mouseenter", () => root.dataset.focusNode = node.dataset.node);
    node.addEventListener("focus", () => root.dataset.focusNode = node.dataset.node);
    node.addEventListener("mouseleave", () => root.dataset.focusNode = "");
    node.addEventListener("blur", () => root.dataset.focusNode = "");
    node.addEventListener("click", () => node.classList.toggle("is-pinned"));
  });
}

function initImmersiveMotion(scope = document) {
  const root = scope === document ? document : scope;
  const stages = [...root.querySelectorAll(".immersive-stage, .experience-section, .experience-hero, .future-glimpse")];
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    stages.forEach((stage) => stage.style.setProperty("--scroll-depth", "0px"));
    return;
  }

  const updateDepth = () => {
    const viewport = window.innerHeight || 1;
    stages.forEach((stage) => {
      const rect = stage.getBoundingClientRect();
      const depth = Number(stage.dataset.depth || 0.12);
      const progress = (rect.top + rect.height * 0.5 - viewport * 0.5) / viewport;
      const clamped = Math.max(-1.2, Math.min(1.2, progress));
      stage.style.setProperty("--scroll-depth", `${(clamped * depth * -80).toFixed(2)}px`);
      stage.style.setProperty("--scroll-fade", String(Math.max(0, 1 - Math.abs(clamped) * 0.38)));
    });
  };

  updateDepth();
  window.removeEventListener("scroll", window.__resonaDepthHandler || (() => {}));
  window.__resonaDepthHandler = () => requestAnimationFrame(updateDepth);
  window.addEventListener("scroll", window.__resonaDepthHandler, { passive: true });
}

function home() {
  const featuredThemeIds = [
    "taiwan-contingency-risk",
    "us-political-fragmentation",
    "billionaire-capital-ai-space",
    "climate-migration-water-stress",
    "information-trust-fracture",
    "us-china-ai-chip-controls",
    "state-backed-cyber",
    "housing-affordability-generation",
    "europe-populism-migration",
  ];
  const featuredThemes = featuredThemeIds.map((themeId) => themes.find((theme) => theme.id === themeId)).filter(Boolean);
  app.innerHTML = `
    <section class="hero cinematic-hero motion-reveal immersive-stage" data-depth="0.32">
      <div class="orbital-stage" aria-hidden="true"><span></span><span></span><span></span></div>
      <div class="hero-copy">
        <span class="eyebrow">Archive of Possible Futures</span>
        <h1>RESONA GeoTech Board</h1>
        <p class="lead">An ever-growing collection of science fiction born from reality.</p>
        <div class="hero-actions">
          <a class="primary" href="#/archive">Read the Archive</a>
          <a class="secondary" href="#/themes">Explore Themes</a>
        </div>
      </div>
      <aside class="status-panel">
        <div>
          <span>Stories</span>
          <strong>∞</strong>
        </div>
        <div class="signal-grid">
          <span>AI compute <b>splits</b></span>
          <span>Straits <b>remember</b></span>
          <span>Energy routes <b>bend</b></span>
          <span>Cities <b>dream</b></span>
        </div>
      </aside>
    </section>

    <section class="section">
      <div class="section-head">
        <span>Featured Themes</span>
        <h2>Signals are raw material. Stories are the product.</h2>
      </div>
      <div class="dashboard-grid">
        ${featuredThemes.map(themeCard).join("")}
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <span>World Map</span>
        <h2>The map is not the story. It is where stories begin.</h2>
        <p>Lights appear, routes bend, and possible futures begin to gather.</p>
      </div>
      ${worldMapPreview(12)}
    </section>

    <section class="split-section">
      <div>
        <div class="section-head">
          <span>Worldlines</span>
          <h2>Choose a signal. Enter a story.</h2>
        </div>
        <div class="category-grid">${categories.map((category) => `<a href="#/themes?category=${encodeURIComponent(category)}">${categoryLabel(category)}</a>`).join("")}</div>
      </div>
      <div class="monetize-panel">
          <span>Story Archive</span>
          <h2>The future survives as voices.</h2>
        <div class="route-list">
          <a href="#/theme/strait-of-machines">The Strait of Machines</a>
          <a href="#/theme/silicon-divide">The Silicon Divide</a>
          <a href="#/theme/city-that-checks-yesterday">The City That Checks Yesterday</a>
          <a href="#/themes">All Themes</a>
        </div>
      </div>
    </section>

    <section class="section capital-section">
      <div class="section-head">
        <span>Capital Weather</span>
        <h2>Some private futures move before public language catches up.</h2>
        <p>Compute, satellites, energy and media drift through the archive.</p>
      </div>
      <div class="capital-grid">
        ${capitalMoves
          .map(
            (move, index) => `
              <article class="capital-card motion-reveal" style="--i:${index}">
                <span>${move.actor}</span>
                <h3>${move.title}</h3>
                <p>${move.vector}</p>
                <small>${move.region}</small>
                <i style="--v:${move.intensity}%"></i>
              </article>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
  initPageMotionSoon();
  initRiskMapsSoon();
}

function themesPage() {
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  const category = params.get("category");
  const filtered = category ? themes.filter((theme) => theme.category === category) : themes;
  app.innerHTML = `
    <section class="page-title">
      <span>Themes</span>
      <h1>Signals that become stories</h1>
      <p>Each theme is a doorway into fiction, not a dashboard tile.</p>
    </section>
    <div class="filter-row">
      <a class="${!category ? "active" : ""}" href="#/themes">All</a>
      ${categories.map((item) => `<a class="${category === item ? "active" : ""}" href="#/themes?category=${encodeURIComponent(item)}">${categoryLabel(item)}</a>`).join("")}
    </div>
    <section class="theme-archive-grid">
      ${filtered.map(themeArchiveCard).join("")}
    </section>
  `;
  initPageMotionSoon();
}

function proPage() {
  const features = [
    ["Full Archive", "Every story, every era, every recurring world."],
    ["Audio Narration", "Slow, atmospheric readings for long-form stories."],
    ["Extended Stories", "Longer literary editions with deeper character arcs."],
    ["AI Discussions", "Conversations with the archive about possible futures."],
    ["PDF Export", "Collect stories into beautifully formatted reading files."],
    ["Story Collections", "Curated sequences across decades and worlds."],
  ];
  app.innerHTML = `
    <section class="page-title">
      <span>Premium</span>
      <h1>Coming Soon</h1>
      <p>Premium is planned as a deeper reading room for the archive. Access features are still being shaped.</p>
    </section>
    <section class="pricing-grid">
      ${features
        .map(
          ([name, body]) => `
            <article class="price-card">
              <span>${name}</span>
              <h2>Future Feature</h2>
              <p>${body}</p>
              <button type="button">Coming Soon</button>
            </article>
          `,
        )
        .join("")}
    </section>
  `;
}

function studioPage() {
  const options = themes
    .map((theme) => `<option value="${theme.id}">${themeTitle(theme)}</option>`)
    .join("");
  app.innerHTML = `
    <section class="page-title immersive-stage" data-depth="0.18">
      <span>Story Studio</span>
      <h1>Signals enter. Drafts wait.</h1>
      <p>This is the first API-connected room: live signals, OpenAI-assisted drafting and pending archive storage.</p>
    </section>
    <section class="studio-grid">
      <article class="info-panel studio-panel">
        <span class="eyebrow">API Status</span>
        <h2>Generation pipeline</h2>
        <p id="studio-state" class="studio-state muted">Checking the local API server...</p>
        <div class="studio-controls">
          <label for="studio-token">Admin Token</label>
          <div class="admin-token-row">
            <input id="studio-token" type="password" value="${escapeHtml(adminToken())}" placeholder="Paste ADMIN_TOKEN for review actions" autocomplete="off">
            <button class="secondary" type="button" onclick="saveStudioToken()">Save</button>
          </div>
          <p class="muted-line">Stored only in this browser. Production secrets stay in the server environment.</p>
          <label for="studio-theme">Theme</label>
          <select id="studio-theme" onchange="loadStudioSignals(this.value)">
            ${options}
          </select>
          <button class="secondary" type="button" onclick="analyzeStudioSignals(document.querySelector('#studio-theme').value)">Create Story Seed</button>
          <button class="primary" type="button" onclick="generateStudioDraft(document.querySelector('#studio-theme').value)">Generate Pending Draft</button>
        </div>
      </article>
      <article class="info-panel studio-panel">
        <span class="eyebrow">Live Signals</span>
        <h2>Current material</h2>
        <div id="studio-signals" class="studio-signals">
          <p class="muted-line">Waiting for the signal feed.</p>
        </div>
      </article>
    </section>
    <section class="section">
      <div class="section-head">
        <span>Story Seed</span>
        <h2>Signals become material before they become fiction.</h2>
        <p>OpenAI summarizes, classifies and extracts causal threads before the story draft is written.</p>
      </div>
      <div id="studio-seed">
        <article class="info-panel wide">
          <h2>No seed created yet.</h2>
          <p>Create a Story Seed to inspect how raw signals become literary material.</p>
        </article>
      </div>
    </section>
    <section class="section">
      <div class="section-head">
        <span>Pending Story</span>
        <h2>Generated stories are not published automatically.</h2>
        <p>Drafts are saved as pending records so an editor can review them before they enter the public archive.</p>
      </div>
      <div id="studio-draft">
        <article class="info-panel wide">
          <h2>No draft generated yet.</h2>
          <p>Start the API server, choose a theme, and generate a pending story draft.</p>
        </article>
      </div>
    </section>
    <section class="section">
      <div class="section-head">
        <span>Review Queue</span>
        <h2>Drafts wait for approval.</h2>
        <p>Publishing moves a draft into the public archive storage. The site does not auto-publish generated work.</p>
      </div>
      <div id="studio-review" class="studio-review-list">
        <p class="muted-line">Loading drafts...</p>
      </div>
    </section>
  `;
  initPageMotionSoon();
  loadStudioSignals();
  loadStudioDrafts();
}

function reportsPage() {
  app.innerHTML = `
    <section class="page-title">
      <span>Archive Notes</span>
      <h1>Records arriving from elsewhere</h1>
      <p>The world leaves copies of itself in unexpected places.</p>
    </section>
    <section class="report-grid">
      <article class="info-panel wide">
        <h2>Observation Notes</h2>
        <p>The map fades. The trace remains.</p>
      </article>
      <article class="info-panel wide">
        <h2>Story Archive</h2>
        <p>Fragments wait for the next reader.</p>
      </article>
    </section>
  `;
}

function archivePage() {
  const allStories = themes.flatMap((theme) =>
    scenarioStories(theme).map((story) => ({
      ...story,
      themeId: theme.id,
      themeTitle: themeTitle(theme),
      category: theme.category,
      path: storyStoragePath(theme, story),
    })),
  );
  const visibleStories = allStories;
  const saved = savedStoryIds();
  const publishedCount = allStories.filter((story) => story.status === "published").length;
  const pendingCount = allStories.filter((story) => story.status === "pending").length;
  app.innerHTML = `
    <section class="page-title">
      <span>Archive</span>
      <h1>A museum of possible futures</h1>
      <p>Stories are the main product. Signals and themes exist only to inspire new fiction.</p>
    </section>
    <section class="section">
      <div class="section-head">
        <span>Open Archive</span>
        <h2>Stories are never deleted.</h2>
        <p>The value of RESONA is the accumulation of imagined futures over time.</p>
      </div>
      <div class="filter-row">
        <a class="active" href="#/archive">All</a>
        <a href="#/archive">Country</a>
        <a href="#/archive">Region</a>
        <a href="#/archive">Technology</a>
        <a href="#/archive">Era</a>
        <a href="#/archive">Viewpoint</a>
      </div>
      <div class="dashboard-grid">
        <article class="theme-card motion-reveal">
          <div class="card-head"><span>Status</span><strong>Open</strong></div>
          <h3>Public Archive</h3>
          <p>All current stories are available during the MVP phase.</p>
        </article>
        <article class="theme-card motion-reveal">
          <div class="card-head"><span>Stories</span><strong>${publishedCount}</strong></div>
          <h3>Published Works</h3>
          <p>Each story is treated as a literary artifact, not as a forecast.</p>
        </article>
        <article class="theme-card motion-reveal">
          <div class="card-head"><span>Premium</span><strong>Soon</strong></div>
          <h3>Coming Soon</h3>
          <p>Audio narration, collections, extended stories and PDF export are planned.</p>
        </article>
        <article class="theme-card motion-reveal">
          <div class="card-head"><span>Drafts</span><strong>${pendingCount}</strong></div>
          <h3>Pending Memories</h3>
          <p>Drafts can be reviewed before joining the archive.</p>
        </article>
      </div>
    </section>
    <section class="section">
      <div class="section-head">
        <span>Published Records</span>
        <h2>Stories approved through Studio enter here.</h2>
        <p>Generated drafts are never public until they are reviewed and published.</p>
      </div>
      <div id="published-api-stories" class="api-story-grid">
        <p class="muted-line">Reading published records...</p>
      </div>
    </section>
    <section class="theme-list">
      ${visibleStories
        .map(
          (story) => `
            <article class="list-card">
              <div class="story-marker"><span>${story.id}</span></div>
              <div>
                <span class="eyebrow">${story.status} / ${categoryLabel(story.category)}</span>
                <h2>${story.title}</h2>
                <p>${story.year} / ${story.city} / ${story.country} / ${story.viewpoint}</p>
                <p>${excerpt(story.text[0], 140)}</p>
                <div class="tags">
                  <span>${story.themeTitle}</span>
                  <span>${story.path}</span>
                  ${story.engine ? `<span>${story.engine.form}</span><span>${story.engine.pattern.domain}</span>` : ""}
                  ${story.sourceSignals.slice(0, 3).map((signal) => `<span>${signal}</span>`).join("")}
                </div>
                <a class="text-link" href="${themeHref(themes.find((theme) => theme.id === story.themeId) || themes[0])}">Read Theme</a>
                <button class="text-link button-link" type="button" onclick="toggleSavedStory('${story.themeId}:${story.id}')">${saved.has(`${story.themeId}:${story.id}`) ? "Saved" : "Bookmark"}</button>
              </div>
            </article>
          `,
        )
        .join("")}
    </section>
  `;
  initPageMotionSoon();
  loadPublishedApiStories();
}

function mapPage() {
  app.innerHTML = `
    <section class="page-title">
      <span>World Map</span>
      <h1>Night Map</h1>
      <p>Events leave traces somewhere.</p>
    </section>
    <section class="section">
      ${worldMapPreview()}
    </section>
    <section class="theme-list">
      ${riskEvents
        .map(
          (event) => `
            <article class="list-card map-detail-card">
              <div class="story-marker"><span>${categoryLabel(event.category)}</span></div>
              <div>
                <span class="eyebrow">${categoryLabel(event.category)} / ${event.region}</span>
                <h2>${event.label}</h2>
                <p>${eventWhisper(event)}</p>
                <a class="text-link" href="${eventHref(event)}">Read</a>
              </div>
            </article>
          `,
        )
        .join("")}
    </section>
  `;
  initPageMotionSoon();
  initRiskMapsSoon();
}

const englishThemeDataset = {
  "us-china-ai-chip-controls": {
    title: "US-China AI Chip Controls",
    dashboardTitle: "The Silicon Divide",
    summary: "Export controls on advanced AI chips reshape laboratories, data centers, sovereign AI programs and the geography of computation.",
    countries: ["United States", "China", "Taiwan", "Japan", "Netherlands"],
    companies: ["NVIDIA", "AMD", "TSMC", "ASML", "SMIC", "Huawei"],
    technologies: ["AI accelerators", "EUV lithography", "HBM", "EDA tools", "Cloud GPUs"],
    impact: ["Semiconductor supply", "AI investment", "Cloud pricing", "US-China capital flows"],
    scenarios: ["Compute becomes a border.", "Domestic AI stacks grow under constraint.", "Chip supply chains become political memory."],
    nodes: ["AI chip controls", "Cloud capacity fragments", "Domestic GPU programs accelerate", "AI ecosystems diverge", "Supply chains remember the split"],
  },
  "taiwan-contingency-risk": {
    title: "Taiwan Strait and the Machine World",
    dashboardTitle: "The Strait of Machines",
    summary: "The Taiwan Strait carries chips, cables, insurance contracts, shipping routes and industrial calendars through a narrow passage of uncertainty.",
    countries: ["Taiwan", "China", "United States", "Japan", "Philippines"],
    companies: ["TSMC", "UMC", "Apple", "Sony", "Toyota"],
    technologies: ["Advanced logic chips", "Subsea cables", "Satellite monitoring", "Air defense systems"],
    impact: ["Chip production", "Shipping", "Defense industries", "Currency exposure", "Device prices"],
    scenarios: ["Shipping routes bend before headlines do.", "Inventory becomes a form of memory.", "Manufacturing disperses into several futures."],
    nodes: ["Strait tension", "Shipping routes shift", "TSMC supply anxiety", "Device makers redesign sourcing", "Households meet the delay"],
  },
  "middle-east-oil": {
    title: "Middle East Routes and Energy",
    dashboardTitle: "The Bending Route",
    summary: "Energy routes through the Gulf, Red Sea and LNG networks translate distant tensions into flights, freight, electricity and household prices.",
    countries: ["Iran", "Israel", "Saudi Arabia", "United States", "Qatar"],
    companies: ["Saudi Aramco", "ExxonMobil", "Shell", "JERA", "Airlines"],
    technologies: ["LNG terminals", "Tanker logistics", "Missile defense", "Energy trading systems"],
    impact: ["Oil prices", "Inflation", "Jet fuel", "Emerging-market currencies", "Central bank timing"],
    scenarios: ["Routes become longer.", "Fuel premiums enter daily life.", "Airports learn new weather."],
    nodes: ["Gulf tension", "Shipping insurance changes", "Fuel prices drift", "Airlines reroute", "Cities pay the difference"],
  },
  "russia-ukraine-energy": {
    title: "Ukraine, Russia and the Winter Ledger",
    dashboardTitle: "Winter Ledger",
    summary: "War, sanctions, pipelines, LNG, defense budgets and grain routes reshape Europe's memory of heat, power and security.",
    countries: ["Russia", "Ukraine", "European Union", "United States", "Turkey"],
    companies: ["Gazprom", "Rheinmetall", "Equinor", "Grain traders"],
    technologies: ["LNG", "Drones", "Air defense", "Grid protection"],
    impact: ["European power prices", "Defense spending", "Grain prices", "Sanctions exposure", "Public budgets"],
    scenarios: ["Winter becomes political.", "Energy routes are rebuilt.", "Defense and heat share the same ledger."],
    nodes: ["War extends", "Energy sites remain exposed", "Gas memory changes", "Defense investment rises", "Households inherit the bill"],
  },
  "generative-ai-regulation": {
    title: "Generative AI and the Memory License",
    dashboardTitle: "The Memory License",
    summary: "AI regulation turns voices, images, consent, copyright and model provenance into everyday decisions about who may use memory.",
    countries: ["United States", "European Union", "China", "Japan", "United Kingdom"],
    companies: ["OpenAI", "Google", "Microsoft", "Meta", "Anthropic"],
    technologies: ["LLMs", "AI safety", "RAG", "Data governance", "Watermarking"],
    impact: ["AI services", "Advertising", "Cloud demand", "Copyright cases", "Compliance costs"],
    scenarios: ["Consent becomes infrastructure.", "Model origin becomes a passport.", "Private memory enters public systems."],
    nodes: ["AI enters daily work", "Consent and copyright harden", "Regional rules diverge", "Cloud gatekeepers gain weight", "Memory becomes licensed"],
  },
  "state-backed-cyber": {
    title: "The City That Checks Yesterday",
    dashboardTitle: "The City That Checks Yesterday",
    summary: "State-backed cyber operations turn trust in water, power, money, records and elections into a daily ritual of verification.",
    countries: ["United States", "China", "Russia", "North Korea", "Iran"],
    companies: ["Microsoft", "CrowdStrike", "Palo Alto Networks", "Banks", "Telecom operators"],
    technologies: ["APT operations", "Zero-days", "EDR", "SIEM", "OT security"],
    impact: ["Infrastructure", "Financial systems", "Communications", "Elections", "Institutional trust"],
    scenarios: ["Cities verify their past.", "Paper returns as comfort.", "The ordinary login becomes a civic act."],
    nodes: ["Tension rises", "Intrusions multiply", "Infrastructure checks itself", "Records require witnesses", "Trust becomes maintenance"],
  },
  "supply-chain-fragmentation": {
    title: "The Season of Inventory",
    dashboardTitle: "The Season of Inventory",
    summary: "Decoupling, sanctions, rerouting and friend-shoring turn efficiency into memory and inventory into a way of reading the world.",
    countries: ["United States", "China", "Japan", "India", "Mexico", "European Union"],
    companies: ["Apple", "Toyota", "Samsung", "Foxconn", "Trading houses"],
    technologies: ["Manufacturing automation", "Supply chain software", "Chip fabrication", "Logistics systems"],
    impact: ["Margins", "Capital expenditure", "Consumer prices", "Currency exposure", "Emerging-market investment"],
    scenarios: ["Companies buy time, not only parts.", "Factories carry spare futures.", "Delivery dates become weather."],
    nodes: ["Controls expand", "Sourcing moves", "Logistics costs rise", "Margins change shape", "Inventory becomes a season"],
  },
  "us-political-fragmentation": {
    title: "American Fracture",
    dashboardTitle: "American Fracture",
    summary: "Elections, courts, immigration, China policy and social platforms turn domestic division into a global condition.",
    countries: ["United States", "China", "Mexico", "European Union", "Japan"],
    companies: ["Meta", "Google", "Tesla", "Defense firms", "Financial institutions"],
    technologies: ["Election security", "Social platforms", "AI policy", "Border systems", "Defense technology"],
    impact: ["Dollar rates", "China policy", "Immigration rules", "Platform regulation", "Alliance planning"],
    scenarios: ["Promises are read by election cycle.", "Allies learn political weather.", "Apps inherit the vote."],
    nodes: ["Domestic fracture", "Policy swings widen", "Technology and defense respond", "Allies hedge", "Daily interfaces change"],
  },
  "europe-populism-migration": {
    title: "Europe's Inner Borders",
    dashboardTitle: "Europe's Inner Borders",
    summary: "Migration, cost of living, energy, defense and climate policy make Europe's open spaces feel newly conditional.",
    countries: ["European Union", "France", "Germany", "Italy", "Poland"],
    companies: ["Utilities", "Automakers", "Defense firms", "Financial institutions"],
    technologies: ["Border systems", "Renewables", "Defense systems", "Public data infrastructure"],
    impact: ["EU regulation", "Migration policy", "Defense budgets", "Climate policy", "European markets"],
    scenarios: ["Stations feel heavier.", "Climate policy meets household bills.", "The continent remains open, but braced."],
    nodes: ["Cost of living rises", "Migration politics intensifies", "EU consensus slows", "Industry policy adjusts", "Public trust narrows"],
  },
  "billionaire-capital-ai-space": {
    title: "Private Moons",
    dashboardTitle: "Private Moons",
    summary: "Founders, sovereign funds, AI infrastructure, satellites, defense technology and media ownership pull private capital into public futures.",
    countries: ["United States", "United Arab Emirates", "Saudi Arabia", "France", "Singapore"],
    companies: ["SpaceX", "Amazon", "Meta", "AI infrastructure firms", "Data center operators"],
    technologies: ["AI data centers", "Satellite networks", "Robotics", "Fusion", "Defense technology"],
    impact: ["AI power demand", "Space infrastructure", "Defense industries", "Media influence", "Urban investment"],
    scenarios: ["Money moves before flags do.", "Low orbit becomes private weather.", "Cities enter another person's plan."],
    nodes: ["Private capital concentrates", "Compute demands power", "Satellites approach public life", "Media and defense converge", "Cities inherit capital weather"],
  },
  "climate-migration-water-stress": {
    title: "The Water Address",
    dashboardTitle: "The Water Address",
    summary: "Heat, drought, water scarcity and urban migration begin rewriting where people can live, work and age.",
    countries: ["India", "Egypt", "Nigeria", "European Union", "United States"],
    companies: ["Water utilities", "Agriculture firms", "Insurers", "Construction firms"],
    technologies: ["Desalination", "Water reuse", "Climate forecasting", "Urban cooling", "Irrigation"],
    impact: ["Urban infrastructure", "Housing", "Food prices", "Healthcare", "Border systems"],
    scenarios: ["Heat changes school hours.", "Water changes rent.", "Addresses become climate documents."],
    nodes: ["Heat rises", "Fields dry", "Families move", "Cities absorb pressure", "New neighborhoods appear"],
  },
  "aging-society-care-labor": {
    title: "The Care Calendar",
    dashboardTitle: "The Care Calendar",
    summary: "Aging, labor shortages, care work, migration and robotics reorganize family time and the design of cities.",
    countries: ["Japan", "South Korea", "Italy", "Germany", "China"],
    companies: ["Hospitals", "Care providers", "Robotics firms", "Insurers"],
    technologies: ["Care robots", "Telemedicine", "Monitoring AI", "Dementia care", "Home healthcare"],
    impact: ["Families", "Healthcare systems", "Labor markets", "Migration policy", "Regional cities"],
    scenarios: ["Care becomes the calendar.", "Robots enter the night shift.", "Cities slow down to human fragility."],
    nodes: ["Populations age", "Care labor thins", "Homes become clinics", "Family time changes", "Cities redesign pace"],
  },
  "housing-affordability-generation": {
    title: "The Unowned City",
    dashboardTitle: "The Unowned City",
    summary: "Housing prices, rent, interest rates, urban concentration and generational wealth alter the right to begin a future.",
    countries: ["United States", "United Kingdom", "Canada", "Australia", "Japan"],
    companies: ["Real estate firms", "Mortgage lenders", "Construction firms", "Investment funds"],
    technologies: ["Housing data", "Construction automation", "Smart cities", "Remote work"],
    impact: ["Young adults", "Family formation", "Commuting", "Education", "Regional migration"],
    scenarios: ["Rooms become smaller futures.", "Ownership becomes inheritance weather.", "Commuting becomes biography."],
    nodes: ["Housing prices rise", "Rent eats time", "Young choices narrow", "Cities push outward", "Family timing changes"],
  },
  "food-security-price-shock": {
    title: "The Weather in Bread",
    dashboardTitle: "The Weather in Bread",
    summary: "War, climate, fertilizer, ports and grain exports translate distant weather into school lunches and household shelves.",
    countries: ["Ukraine", "Russia", "India", "Brazil", "Egypt"],
    companies: ["Grain traders", "Food manufacturers", "Fertilizer firms", "Retailers"],
    technologies: ["Precision agriculture", "Alternative protein", "Crop forecasting", "Cold-chain logistics"],
    impact: ["Meals", "School lunches", "Emerging-market budgets", "Agricultural investment", "Logistics"],
    scenarios: ["Menus read the climate.", "Ports enter the pantry.", "Food becomes a public memory."],
    nodes: ["Weather and war collide", "Grain routes strain", "Export controls return", "Meals change", "Food policy hardens"],
  },
  "information-trust-fracture": {
    title: "The Proof of Morning",
    dashboardTitle: "The Proof of Morning",
    summary: "Synthetic media, social feeds and authentication systems turn shared reality into something people must practice together.",
    countries: ["United States", "European Union", "India", "Brazil", "Japan"],
    companies: ["Meta", "X", "Google", "TikTok", "News organizations"],
    technologies: ["Generative media", "Recommendation systems", "Identity verification", "Watermarking", "Fact checking"],
    impact: ["Elections", "Education", "Family conversation", "Media", "Public policy"],
    scenarios: ["Reality asks for a signature.", "Families verify the morning.", "Speed loses to proof."],
    nodes: ["Synthetic media spreads", "Feeds diverge", "Trust thins", "Elections and schools adapt", "Reality becomes a practice"],
  },
};

const englishEventDataset = {
  "south-china-sea": ["South China Sea Routes", "South China Sea", "Shipping lanes alter consumer goods, chips, insurance and ASEAN investment decisions."],
  "korean-peninsula": ["Korean Peninsula Missiles and Cyber", "Korean Peninsula", "Missile tests and cyber activity disturb defense planning, crypto flows and financial monitoring."],
  "india-china-border": ["India-China Border and Manufacturing", "Himalayas / India", "Border friction and manufacturing relocation reshape smartphones, investment and logistics."],
  "red-sea-shipping": ["Red Sea and Suez Routes", "Red Sea / Suez", "Maritime risk lengthens routes into Europe and changes energy, freight and inventory planning."],
  "arctic-route": ["Arctic Routes and Resource Claims", "Arctic Circle", "New routes and resource claims reshape long-term strategy for Russia, China, Europe and shipping firms."],
  "eu-ai-act": ["European AI Rules", "Brussels / European Union", "AI regulation changes model evaluation, data governance, enterprise adoption and cloud use."],
  "us-election-cyber": ["Election Interference and Influence", "United States", "Disinformation, intrusions and leaks disturb policy expectations, markets and platform rules."],
  "global-ransomware": ["Industrialized Ransomware", "Global", "Attacks on hospitals, municipalities and logistics systems raise audit, insurance and continuity demands."],
  "rare-earth-controls": ["Rare Earth Controls", "China / Global Supply Chains", "Critical mineral controls reach EVs, wind power, chips and defense industries."],
  "lithium-triangle": ["Lithium Nationalism", "Chile / Argentina / Bolivia", "State control over battery resources changes EV prices, storage investment and mining rights."],
  "panama-canal-drought": ["Panama Canal Drought", "Panama Canal", "Water shortages restrict passage and alter freight, grain, energy transport and inventory timing."],
  "black-sea-food": ["Black Sea Grain Routes", "Black Sea", "Shipping insecurity touches grain prices, emerging-market inflation and food manufacturers."],
  "space-asat": ["Space Infrastructure Attacks", "Low Earth Orbit", "Threats to satellite communication, positioning and observation reach defense, finance, logistics and disaster response."],
  "quantum-encryption": ["Post-Quantum Encryption Shift", "United States / European Union / Japan", "Migration to quantum-safe encryption changes finance, procurement, cloud systems and long-lived secrets."],
  "dollar-liquidity": ["Dollar Liquidity Shock", "New York / Global Markets", "US rates and dollar funding conditions ripple through currencies, corporate debt and resource prices."],
  "climate-migration": ["Climate Migration and Water Stress", "Sahel / Middle East", "Water scarcity and heat move people before policy language catches up."],
  "copper-grid-shortage": ["Copper and Grid Bottlenecks", "Chile / Peru / Global Grids", "Copper supply and grid delays touch AI data centers, EVs, renewables and electricity prices."],
};

const englishSourceSignals = {
  "taiwan-contingency-risk": ["Semiconductor investment moves toward Southeast Asia", "Shipping routes adjust near the Taiwan Strait", "Japanese firms redesign sourcing"],
  "russia-ukraine-energy": ["European LNG procurement stays long-term", "Defense investment expands", "Norway and other suppliers gain new weight"],
  "us-china-ai-chip-controls": ["AI chip export controls tighten", "India increases semiconductor investment", "Cloud GPU supply remains constrained"],
  "information-trust-fracture": ["Synthetic video becomes ordinary", "Election authentication systems spread", "Identity verification enters daily media"],
  "billionaire-capital-ai-space": ["AI infrastructure follows power", "Private satellite networks expand", "Sovereign capital enters compute"],
};

function applyGlobalEnglishDataset() {
  themes.forEach((theme) => {
    const next = englishThemeDataset[theme.id];
    if (next) Object.assign(theme, next);
  });

  riskEvents.forEach((event) => {
    const theme = themes.find((item) => item.id === event.themeId);
    const direct = englishEventDataset[event.id];
    if (direct) {
      [event.label, event.region, event.note] = direct;
    } else if (theme) {
      event.label = themeTitle(theme);
      event.region = theme.countries.slice(0, 3).join(" / ");
      event.note = themeSummary(theme);
    }
  });

  Object.entries(englishSourceSignals).forEach(([themeId, signals]) => {
    sourceSignalSeeds[themeId] = signals;
  });
}

function notFound() {
  app.innerHTML = `<section class="page-title"><h1>Page not found</h1><a class="text-link" href="#/">Return to Observatory</a></section>`;
}

function router() {
  const hash = location.hash || "#/";
  const path = hash.split("?")[0].replace("#", "");
  if (path === "/") return home();
  if (path === "/themes") return themesPage();
  if (path.startsWith("/themes/")) return themeDetail(path.split("/")[2]);
  if (path.startsWith("/theme/")) return themeDetail(themeFromSlug(path.split("/")[2])?.id);
  if (path === "/map") return mapPage();
  if (path === "/pro") return proPage();
  if (path === "/premium") return proPage();
  if (path === "/studio") return studioPage();
  if (path === "/reports") return reportsPage();
  if (path === "/archive") return archivePage();
  return notFound();
}

window.addEventListener("hashchange", router);
applyGlobalEnglishDataset();
router();
