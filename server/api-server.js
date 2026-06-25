const http = require("node:http");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { URL } = require("node:url");

const rootDir = path.resolve(__dirname, "..");
const serverDir = __dirname;
const dataDir = path.join(rootDir, "data");

loadEnv(path.join(serverDir, ".env"));

const port = Number(process.env.PORT || 4173);
const openaiModel = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const translationModel = process.env.OPENAI_TRANSLATION_MODEL || openaiModel;
const cacheTtlMs = Number(process.env.SIGNAL_CACHE_TTL_MINUTES || 60) * 60 * 1000;
const defaultSource = process.env.RESONA_SIGNAL_SOURCE || "gdelt";
const adminToken = process.env.ADMIN_TOKEN || "";

const signalThemes = {
  ai: {
    label: "Artificial Intelligence",
    gdeltQuery: '(AI OR "artificial intelligence" OR "generative AI" OR "AI regulation" OR "AI chip")',
    newsQuery: 'AI OR "artificial intelligence" OR "generative AI"',
  },
  energy: {
    label: "Energy",
    gdeltQuery: '(energy OR oil OR LNG OR "power grid" OR "Red Sea" OR Hormuz)',
    newsQuery: 'energy OR oil OR LNG',
  },
  geopolitics: {
    label: "Geopolitics",
    gdeltQuery: '(geopolitics OR Taiwan OR Ukraine OR "South China Sea" OR sanctions OR election)',
    newsQuery: 'geopolitics OR Taiwan OR Ukraine OR sanctions',
  },
  climate: {
    label: "Climate",
    gdeltQuery: '(climate OR drought OR heatwave OR "water stress" OR migration)',
    newsQuery: 'climate OR drought OR heatwave',
  },
  security: {
    label: "Security",
    gdeltQuery: '("cyber attack" OR cybersecurity OR ransomware OR "state backed" OR infrastructure)',
    newsQuery: '"cyber attack" OR cybersecurity OR ransomware',
  },
  space: {
    label: "Space",
    gdeltQuery: '(space OR satellite OR "low earth orbit" OR launch OR "space defense")',
    newsQuery: 'space OR satellite OR launch',
  },
};

const themeToSignalTheme = {
  "us-china-ai-chip-controls": "ai",
  "generative-ai-regulation": "ai",
  "middle-east-oil": "energy",
  "russia-ukraine-energy": "energy",
  "taiwan-contingency-risk": "geopolitics",
  "supply-chain-fragmentation": "geopolitics",
  "us-political-fragmentation": "geopolitics",
  "europe-populism-migration": "geopolitics",
  "state-backed-cyber": "security",
  "information-trust-fracture": "security",
  "climate-migration-water-stress": "climate",
  "food-security-price-shock": "climate",
  "billionaire-capital-ai-space": "space",
};

const fallbackSignals = {
  ai: [
    "AI chip controls reshape access to computation.",
    "Regulators ask model providers to document training and safety practices.",
    "Companies seek regional AI infrastructure instead of one global cloud.",
  ],
  energy: [
    "Shipping disruptions alter energy costs before consumers understand the route.",
    "LNG and grid investments become part of national resilience planning.",
    "Fuel prices translate distant waters into ordinary receipts.",
  ],
  geopolitics: [
    "A strategic corridor becomes a calendar for manufacturers and insurers.",
    "Election cycles begin to affect alliance planning and industrial policy.",
    "Sanctions and export controls change how companies imagine distance.",
  ],
  climate: [
    "Heat and water scarcity reshape school hours, housing and migration.",
    "Food systems respond to weather, ports and fertilizer constraints at once.",
    "Cities begin to treat shade and water as civic infrastructure.",
  ],
  security: [
    "Public infrastructure learns to verify yesterday's records.",
    "Ransomware and state-backed intrusion blur the line between crime and geopolitics.",
    "Authentication becomes a daily practice of trust.",
  ],
  space: [
    "Private satellite systems become part of public life.",
    "Low Earth orbit turns into a commercial and strategic layer.",
    "AI, defense and space capital gather around power and launch capacity.",
  ],
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function loadEnv(filePath) {
  try {
    const content = fsSync.readFileSync(filePath, "utf8");
    content.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const index = trimmed.indexOf("=");
      if (index < 0) return;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
      if (key && process.env[key] === undefined) process.env[key] = value;
    });
  } catch {
    // .env is optional.
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload, null, 2));
}

function isProtectedApiRoute(method, pathname) {
  const protectedRoutes = new Set([
    "POST /api/signals/analyze",
    "POST /api/story-seeds",
    "POST /api/stories/draft",
    "GET /api/admin/drafts",
    "GET /api/admin/published",
    "POST /api/admin/publish",
  ]);
  return protectedRoutes.has(`${method} ${pathname}`);
}

function verifyAdmin(request) {
  if (!adminToken) {
    return {
      ok: false,
      status: 503,
      error: "ADMIN_TOKEN is not configured. Set it in server/.env or your deployment environment.",
    };
  }
  const bearer = request.headers.authorization || "";
  const headerToken = request.headers["x-admin-token"] || "";
  const supplied = bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : String(headerToken).trim();
  if (supplied !== adminToken) {
    return { ok: false, status: 401, error: "Admin authorization is required for this API route." };
  }
  return { ok: true };
}

function slug(value, fallback = "item") {
  return String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90) || fallback;
}

function idHash(input) {
  return crypto.createHash("sha1").update(String(input)).digest("hex").slice(0, 16);
}

function signalThemeFromRequest(value) {
  const raw = slug(value || "ai");
  return signalThemes[raw] ? raw : themeToSignalTheme[raw] || "ai";
}

function themeIdFromRequest(value) {
  return slug(value || "general", "general");
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2));
}

async function listJsonFiles(dir) {
  try {
    const files = await fs.readdir(dir);
    return files.filter((file) => file.endsWith(".json")).sort();
  } catch {
    return [];
  }
}

async function cachedJson(key, producer) {
  const cachePath = path.join(dataDir, "cache", `${slug(key)}.json`);
  const cached = await readJson(cachePath);
  if (cached && Date.now() - new Date(cached.cachedAt).getTime() < cacheTtlMs) {
    return { ...cached.payload, cache: "hit" };
  }
  try {
    const payload = await producer();
    await writeJson(cachePath, { cachedAt: new Date().toISOString(), payload });
    return { ...payload, cache: "miss" };
  } catch (error) {
    if (cached?.payload) return { ...cached.payload, cache: "stale", warning: error.message };
    throw error;
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function serveStatic(request, response, pathname) {
  const target = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(rootDir, target));
  if (!filePath.startsWith(rootDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  try {
    const content = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
    });
    response.end(content);
  } catch {
    const index = await fs.readFile(path.join(rootDir, "index.html"));
    response.writeHead(200, { "Content-Type": mimeTypes[".html"] });
    response.end(index);
  }
}

function normalizeRegion(article) {
  return article.sourceCountry || article.location || article.country || article.domain || "Global";
}

function relevanceScore(text, theme) {
  const haystack = String(text || "").toLowerCase();
  const terms = signalThemes[theme].gdeltQuery.toLowerCase().match(/[a-z][a-z-]+/g) || [];
  const hits = terms.filter((term) => haystack.includes(term)).length;
  return Math.min(100, 48 + hits * 8);
}

function normalizeSignal(raw, theme, sourceName) {
  const title = raw.title || raw.webTitle || raw.name || "Untitled signal";
  const url = raw.url || raw.webUrl || raw.link || "";
  const publishedAt = raw.seendate || raw.publishedAt || raw.published || raw.date || new Date().toISOString();
  const region = normalizeRegion(raw);
  const summary = raw.summary || raw.description || raw.snippet || raw.domain || "";
  return {
    id: `sig_${idHash(`${sourceName}:${url || title}:${publishedAt}`)}`,
    title,
    source: sourceName,
    url,
    region,
    theme,
    summary,
    publishedAt,
    relevanceScore: relevanceScore(`${title} ${summary} ${region}`, theme),
  };
}

async function fetchGdeltSignals(theme, limit) {
  const endpoint = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  endpoint.searchParams.set("query", signalThemes[theme].gdeltQuery);
  endpoint.searchParams.set("mode", "artlist");
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("maxrecords", String(limit));
  endpoint.searchParams.set("sort", "hybridrel");
  const response = await fetchWithTimeout(endpoint, {}, Number(process.env.SOURCE_FETCH_TIMEOUT_MS || 8000));
  if (!response.ok) throw new Error(`GDELT request failed: ${response.status}`);
  const payload = await response.json();
  return (payload.articles || []).map((article) => normalizeSignal(article, theme, "gdelt"));
}

async function fetchNewsApiSignals(theme, limit) {
  if (!process.env.NEWSAPI_KEY) return [];
  const endpoint = new URL("https://newsapi.org/v2/everything");
  endpoint.searchParams.set("q", signalThemes[theme].newsQuery);
  endpoint.searchParams.set("language", "en");
  endpoint.searchParams.set("sortBy", "publishedAt");
  endpoint.searchParams.set("pageSize", String(Math.min(limit, 20)));
  const response = await fetchWithTimeout(endpoint, {
    headers: { "X-Api-Key": process.env.NEWSAPI_KEY },
  }, Number(process.env.SOURCE_FETCH_TIMEOUT_MS || 8000));
  if (!response.ok) throw new Error(`NewsAPI request failed: ${response.status}`);
  const payload = await response.json();
  return (payload.articles || []).map((article) => normalizeSignal({
    ...article,
    sourceCountry: article.source?.name,
  }, theme, "newsapi"));
}

function fallbackSignalRecords(theme) {
  return (fallbackSignals[theme] || fallbackSignals.ai).map((title, index) => ({
    id: `sig_fallback_${theme}_${index + 1}`,
    title,
    source: "curated-fallback",
    url: "",
    region: "Global",
    theme,
    summary: "Fallback signal used when external data sources are unavailable.",
    publishedAt: new Date().toISOString(),
    relevanceScore: 58 + index * 7,
  }));
}

async function collectSignals(theme, options = {}) {
  const limit = Number(options.limit || 12);
  return cachedJson(`signals-${theme}-${limit}-${defaultSource}`, async () => {
    const errors = [];
    let signals = [];
    try {
      signals = await fetchGdeltSignals(theme, limit);
    } catch (error) {
      errors.push(error.message);
    }
    if (signals.length < 3 && process.env.NEWSAPI_KEY) {
      try {
        signals = [...signals, ...(await fetchNewsApiSignals(theme, limit - signals.length))];
      } catch (error) {
        errors.push(error.message);
      }
    }
    if (!signals.length) signals = fallbackSignalRecords(theme);
    const unique = [...new Map(signals.map((signal) => [signal.url || signal.title, signal])).values()]
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);
    return {
      mode: signals[0]?.source || "fallback",
      theme,
      fetchedAt: new Date().toISOString(),
      errors,
      signals: unique,
    };
  });
}

async function saveSignals(theme, signals) {
  const filePath = path.join(dataDir, "signals", `${theme}.json`);
  const existing = await readJson(filePath, { theme, updatedAt: null, signals: [] });
  const merged = new Map(existing.signals.map((signal) => [signal.id, signal]));
  signals.forEach((signal) => merged.set(signal.id, signal));
  const payload = {
    theme,
    updatedAt: new Date().toISOString(),
    signals: [...merged.values()].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)),
  };
  await writeJson(filePath, payload);
  return payload;
}

async function getStoredSignals(theme, ids = []) {
  const stored = await readJson(path.join(dataDir, "signals", `${theme}.json`), { signals: [] });
  if (!ids.length) return stored.signals.slice(0, 8);
  const wanted = new Set(ids);
  return stored.signals.filter((signal) => wanted.has(signal.id));
}

async function callOpenAIJson(prompt, model = openaiModel, maxOutputTokens = 4500) {
  if (!process.env.OPENAI_API_KEY) return null;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: prompt,
      max_output_tokens: maxOutputTokens,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${detail.slice(0, 240)}`);
  }
  const payload = await response.json();
  const output = payload.output_text || payload.output?.flatMap((item) => item.content || []).map((part) => part.text || "").join("\n");
  if (!output) throw new Error("OpenAI response did not include text.");
  const jsonMatch = output.match(/\{[\s\S]*\}/);
  return JSON.parse(jsonMatch ? jsonMatch[0] : output);
}

function signalAnalysisPrompt(signals, theme) {
  return [
    "You are RESONA's signal editor.",
    "The website is not a news site. Do not write publishable news copy.",
    "Turn raw event data into story material for literary science fiction.",
    "Return only JSON with keys: signals, causalThreads, storySeed.",
    "signals must be an array preserving title, source, url, region, theme, summary, publishedAt, relevanceScore and adding classification, causalRole, humanImpact.",
    "causalThreads must be an array of short causal chains.",
    "storySeed must include premise, era, possibleRegions, protagonistOptions, tensions, objects, atmosphere.",
    `Theme: ${theme}`,
    JSON.stringify(signals, null, 2),
  ].join("\n");
}

function fallbackAnalysis(signals, theme) {
  return {
    signals: signals.map((signal) => ({
      ...signal,
      classification: signal.theme,
      causalRole: "source material",
      humanImpact: "May appear as a changed routine, price, delay, rule or memory.",
    })),
    causalThreads: [
      signals.slice(0, 3).map((signal) => signal.title),
      ["External event", "Institutional adjustment", "Ordinary life changes shape"],
    ],
    storySeed: {
      premise: `A person encounters the private afterimage of ${signalThemes[theme]?.label || theme}.`,
      era: "2030s to 2080s",
      possibleRegions: [...new Set(signals.map((signal) => signal.region))].slice(0, 5),
      protagonistOptions: ["archive technician", "teacher", "ship clerk", "nurse", "data-center engineer"],
      tensions: ["convenience versus dependency", "public language versus private life", "opportunity versus loss"],
      objects: ["receipt", "access code", "old device", "shipping notice", "photograph"],
      atmosphere: "quiet, cinematic, literary, unresolved",
    },
  };
}

async function analyzeSignals(signals, theme) {
  try {
    const analysis = await callOpenAIJson(signalAnalysisPrompt(signals, theme), openaiModel, 3500);
    return analysis || fallbackAnalysis(signals, theme);
  } catch (error) {
    return { ...fallbackAnalysis(signals, theme), warning: error.message };
  }
}

async function saveStorySeed(theme, analysis) {
  const timestamp = new Date().toISOString();
  const id = `seed_${timestamp.replace(/[-:.TZ]/g, "").slice(0, 14)}_${theme}`;
  const record = {
    id,
    status: "draft",
    theme,
    generatedAt: timestamp,
    ...analysis.storySeed,
    causalThreads: analysis.causalThreads || [],
    sourceSignalIds: (analysis.signals || []).map((signal) => signal.id).filter(Boolean),
  };
  const filePath = path.join(dataDir, "story-seeds", "draft", `${slug(id)}.json`);
  await writeJson(filePath, record);
  return { seed: record, path: path.relative(rootDir, filePath) };
}

function storyPrompt({ seed, signals }) {
  return [
    "You are writing for RESONA GeoTech Board, a global-first archive of literary science fiction born from reality.",
    "Do not write news, market analysis, a prediction, or a dashboard explanation.",
    "Write the story in English first.",
    "Target 1000 to 1800 words.",
    "Use a distinctive literary narrative form.",
    "Use a named protagonist with age, occupation, background, values, fear and motivation.",
    "The first paragraph must establish year, city, country and viewpoint.",
    "Use the signals only as invisible source material. Do not summarize the news.",
    "End with a memorable line or lingering emotional image.",
    "Return only JSON with keys: title, year, city, country, viewpoint, protagonist, narrativeForm, text. text must be an array of paragraphs.",
    `Story Seed: ${JSON.stringify(seed, null, 2)}`,
    `Signals: ${JSON.stringify(signals, null, 2)}`,
  ].join("\n");
}

function fallbackStory(seed, signals) {
  const year = seed.era?.match(/\d{4}/)?.[0] || "2041";
  const rawRegion = seed.possibleRegions?.[0] || "Singapore";
  const region = rawRegion === "Global" ? "Singapore" : rawRegion;
  const city = region.includes("/") ? region.split("/")[0].trim() : region;
  const country = region.includes("/") ? region.split("/").at(-1).trim() : region;
  const signal = signals[0]?.title || "a faint world signal";
  return {
    title: "The Room That Waited",
    year,
    city,
    country,
    viewpoint: "archive technician",
    protagonist: "Lina Voss, 41, a technician who preserves possible futures before they become official memory",
    narrativeForm: "field report",
    text: [
      `FIELD REPORT / ${year} / ${region}. Lina Voss, 41, an archive technician, began the morning by labeling a damaged signal record: ${signal}.`,
      "The record did not look important. Most important things no longer did. It arrived as a timestamp, a shipping delay, a vanished supplier, a translated policy note, a school notice, a quiet change in the price of waiting.",
      "Lina worked in a room without windows because windows made the technicians sentimental. Their job was to preserve possible futures before the world decided which ones had been real enough to remember.",
      "This local fallback draft proves the pipeline: signals enter, OpenAI analysis can shape them into a seed, and the story is saved as draft rather than published. Add OPENAI_API_KEY to generate a full literary story.",
      "At closing time, Lina wrote one sentence on the paper tag: not every future arrives loudly. Then she turned off the desk lamp and left the room waiting for a better version of itself.",
    ],
  };
}

async function generateStory(seed, signals) {
  try {
    const story = await callOpenAIJson(storyPrompt({ seed, signals }), openaiModel, 6000);
    return { story: story || fallbackStory(seed, signals), provider: story ? `openai:${openaiModel}` : "local-fallback" };
  } catch (error) {
    return { story: fallbackStory(seed, signals), provider: `local-fallback:${error.message}` };
  }
}

function translationPrompt(story) {
  return [
    "Translate this English literary science fiction story into Japanese.",
    "Do not summarize. Preserve tone, paragraphs, character names, metadata and ambiguity.",
    "Return only JSON with keys: titleJa, textJa. textJa must be an array of paragraphs.",
    JSON.stringify(story, null, 2),
  ].join("\n");
}

async function translateStory(story) {
  try {
    const translation = await callOpenAIJson(translationPrompt(story), translationModel, 6000);
    return translation || { status: "translation-pending", titleJa: null, textJa: [] };
  } catch (error) {
    return { status: "translation-pending", warning: error.message, titleJa: null, textJa: [] };
  }
}

async function saveDraftStory(themeId, payload) {
  const timestamp = new Date().toISOString();
  const id = `story_${timestamp.replace(/[-:.TZ]/g, "").slice(0, 14)}_${themeId}`;
  const record = {
    id,
    status: "draft",
    generatedAt: timestamp,
    theme: themeId,
    ...payload,
  };
  const filePath = path.join(dataDir, "themes", themeId, "stories", "draft", `${slug(id)}.json`);
  await writeJson(filePath, record);
  return { story: record, path: path.relative(rootDir, filePath) };
}

async function listStoryRecords(status = "draft") {
  const themesDir = path.join(dataDir, "themes");
  const records = [];
  try {
    const themeIds = await fs.readdir(themesDir);
    for (const themeId of themeIds) {
      const dir = path.join(themesDir, themeId, "stories", status);
      const files = await listJsonFiles(dir);
      for (const file of files) {
        const record = await readJson(path.join(dir, file));
        if (record) records.push({ ...record, file: path.relative(rootDir, path.join(dir, file)) });
      }
    }
  } catch {
    // No stories yet.
  }
  return records.sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
}

async function publishStory(file) {
  const source = path.normalize(path.join(rootDir, file));
  if (!source.startsWith(rootDir) || !source.includes(`${path.sep}stories${path.sep}draft${path.sep}`)) {
    throw new Error("Only draft story files can be published.");
  }
  const record = await readJson(source);
  if (!record) throw new Error("Draft story not found.");
  record.status = "published";
  record.publishedAt = new Date().toISOString();
  const target = source.replace(`${path.sep}draft${path.sep}`, `${path.sep}published${path.sep}`);
  await writeJson(target, record);
  await fs.unlink(source);
  return { story: record, path: path.relative(rootDir, target) };
}

async function archiveStats() {
  const draftStories = await listStoryRecords("draft");
  const publishedStories = await listStoryRecords("published");
  const signalFiles = await listJsonFiles(path.join(dataDir, "signals"));
  return {
    draft: draftStories.length,
    published: publishedStories.length,
    signalThemes: signalFiles.length,
  };
}

async function handleApi(request, response, url) {
  if (isProtectedApiRoute(request.method, url.pathname)) {
    const auth = verifyAdmin(request);
    if (!auth.ok) return sendJson(response, auth.status, { error: auth.error });
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    return sendJson(response, 200, {
      ok: true,
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
      newsApiConfigured: Boolean(process.env.NEWSAPI_KEY),
      adminConfigured: Boolean(adminToken),
      primarySource: "gdelt",
      supplementalSource: "newsapi",
      cacheTtlMinutes: Math.round(cacheTtlMs / 60000),
      model: openaiModel,
      archive: await archiveStats(),
    });
  }

  if (request.method === "GET" && url.pathname === "/api/signals") {
    const theme = signalThemeFromRequest(url.searchParams.get("theme") || url.searchParams.get("themeId"));
    const collected = await collectSignals(theme, { limit: url.searchParams.get("limit") || 12 });
    const saved = await saveSignals(theme, collected.signals);
    return sendJson(response, 200, { ...collected, savedCount: saved.signals.length });
  }

  if (request.method === "GET" && url.pathname === "/api/signals/stored") {
    const theme = signalThemeFromRequest(url.searchParams.get("theme"));
    return sendJson(response, 200, await readJson(path.join(dataDir, "signals", `${theme}.json`), { theme, signals: [] }));
  }

  if (request.method === "GET" && url.pathname === "/api/stories/published") {
    const stories = await listStoryRecords("published");
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") || 24)));
    return sendJson(response, 200, { stories: stories.slice(0, limit) });
  }

  if (request.method === "POST" && url.pathname === "/api/signals/analyze") {
    const body = await readBody(request);
    const theme = signalThemeFromRequest(body.theme);
    const signals = body.signals?.length ? body.signals : await getStoredSignals(theme, body.signalIds || []);
    const analysis = await analyzeSignals(signals, theme);
    const savedSignals = await saveSignals(theme, analysis.signals || signals);
    const seed = await saveStorySeed(theme, analysis);
    return sendJson(response, 200, { theme, analysis, savedSignals: savedSignals.signals.length, seed });
  }

  if (request.method === "POST" && url.pathname === "/api/story-seeds") {
    const body = await readBody(request);
    const theme = signalThemeFromRequest(body.theme);
    const signals = body.signals?.length ? body.signals : await getStoredSignals(theme, body.signalIds || []);
    const analysis = await analyzeSignals(signals, theme);
    const seed = await saveStorySeed(theme, analysis);
    return sendJson(response, 200, { theme, seed, analysis });
  }

  if (request.method === "POST" && url.pathname === "/api/stories/draft") {
    const body = await readBody(request);
    const theme = signalThemeFromRequest(body.theme || body.themeId);
    const themeId = themeIdFromRequest(body.themeId || theme);
    let signals = body.signals?.length ? body.signals : await getStoredSignals(theme, body.signalIds || []);
    if (!signals.length) {
      const collected = await collectSignals(theme, { limit: 10 });
      signals = collected.signals;
      await saveSignals(theme, signals);
    }
    const analysis = await analyzeSignals(signals, theme);
    const seedResult = await saveStorySeed(theme, analysis);
    const generated = await generateStory(seedResult.seed, analysis.signals || signals);
    const translation = await translateStory(generated.story);
    const saved = await saveDraftStory(themeId, {
      provider: generated.provider,
      storySeed: seedResult.seed,
      sourceSignals: analysis.signals || signals,
      english: generated.story,
      japanese: translation,
    });
    return sendJson(response, 200, {
      provider: generated.provider,
      seedPath: seedResult.path,
      path: saved.path,
      story: saved.story,
    });
  }

  if (request.method === "GET" && url.pathname === "/api/admin/drafts") {
    return sendJson(response, 200, { stories: await listStoryRecords("draft") });
  }

  if (request.method === "GET" && url.pathname === "/api/admin/published") {
    return sendJson(response, 200, { stories: await listStoryRecords("published") });
  }

  if (request.method === "POST" && url.pathname === "/api/admin/publish") {
    const body = await readBody(request);
    return sendJson(response, 200, await publishStory(body.file));
  }

  return sendJson(response, 404, { error: "API route not found." });
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }
    await serveStatic(request, response, decodeURIComponent(url.pathname));
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
});

server.listen(port, () => {
  console.log(`RESONA API server running at http://localhost:${port}`);
  console.log(`Primary source: GDELT`);
  console.log(`NewsAPI configured: ${Boolean(process.env.NEWSAPI_KEY)}`);
  console.log(`OpenAI configured: ${Boolean(process.env.OPENAI_API_KEY)}`);
});
