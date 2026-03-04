const express = require("express");
const fetch = require("node-fetch");

app.post("/refresh", async (req, res) => {
  try {
    pageCache = { fetchedAt: 0, pages: [] };
    await getCurriculumPages();
    res.json({ ok: true, pages: pageCache.pages.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

const CANVAS_BASE_URL = process.env.CANVAS_BASE_URL;
const CANVAS_TOKEN = process.env.CANVAS_TOKEN;
const CURRICULUM_COURSE_ID = process.env.CURRICULUM_COURSE_ID;

// Basic in-memory cache so we don’t hit Canvas every question
let pageCache = { fetchedAt: 0, pages: [] };
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function stripHtml(html = "") {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function canvasFetch(path) {
  if (!CANVAS_BASE_URL || !CANVAS_TOKEN) {
    throw new Error("Canvas env vars missing: CANVAS_BASE_URL or CANVAS_TOKEN");
  }

  const url = `${CANVAS_BASE_URL.replace(/\/$/, "")}/api/v1${path}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${CANVAS_TOKEN}` },
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Canvas API error ${resp.status}: ${text}`);
  }
  return resp;
}

async function fetchAllPages(courseId) {
  // Get list of pages (paginated)
  let pages = [];
  let nextUrl = `/courses/${courseId}/pages?per_page=100`;

  while (nextUrl) {
    const resp = await canvasFetch(nextUrl);
    const batch = await resp.json();
    pages = pages.concat(batch);

    // Parse Link header for pagination
    const link = resp.headers.get("link") || "";
    const matchNext = link
      .split(",")
      .map(s => s.trim())
      .find(s => s.includes('rel="next"'));

    if (matchNext) {
      const m = matchNext.match(/<([^>]+)>/);
      if (m && m[1]) {
        // m[1] is a full URL; convert back to /api/v1 path
        const full = m[1];
        const idx = full.indexOf("/api/v1");
        nextUrl = idx >= 0 ? full.substring(idx + "/api/v1".length) : null;
      } else nextUrl = null;
    } else {
      nextUrl = null;
    }
  }
  return pages;
}

async function fetchPageBody(courseId, pageUrl) {
  const resp = await canvasFetch(`/courses/${courseId}/pages/${encodeURIComponent(pageUrl)}?include[]=body`);
  const data = await resp.json();
  return {
    title: data.title,
    url: data.html_url,
    bodyText: stripHtml(data.body || ""),
  };
}

function tokenize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s.]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function scoreByOverlap(query, doc) {
  const q = new Set(tokenize(query));
  const d = tokenize(doc);
  let score = 0;
  for (const w of d) if (q.has(w)) score += 1;
  return score;
}

async function getCurriculumPages() {
  const now = Date.now();
  if (pageCache.pages.length && (now - pageCache.fetchedAt) < CACHE_TTL_MS) {
    return pageCache.pages;
  }

  if (!CURRICULUM_COURSE_ID) {
    throw new Error("Missing CURRICULUM_COURSE_ID env var");
  }

  const list = await fetchAllPages(CURRICULUM_COURSE_ID);

  // Pull bodies for each page (this can be a lot; keep it simple first)
  const pagesWithBody = [];
  for (const p of list) {
    try {
      const full = await fetchPageBody(CURRICULUM_COURSE_ID, p.url);
      if (full.bodyText) pagesWithBody.push(full);
    } catch (e) {
      // skip pages we can't fetch
      console.warn("Page fetch failed:", p.url, e.message);
    }
  }

  pageCache = { fetchedAt: now, pages: pagesWithBody };
  return pagesWithBody;
}

function pickTopPages(question, pages, topK = 3) {
  return pages
    .map(p => ({ ...p, score: scoreByOverlap(question, `${p.title}\n${p.bodyText}`) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

const app = express();
app.use(express.json());

app.use(express.urlencoded({ extended: true }));

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Accept ANY method and both trailing-slash / non-trailing-slash
app.all(["/lti/login", "/lti/login/"], (req, res) => {
  res.redirect("/chat");
});

app.all(["/lti/launch", "/lti/launch/"], (req, res) => {
  res.redirect("/chat");
});

app.get("/chat", (req, res) => {
  res.send(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://cdn.tailwindcss.com"></script>
  <title>Curriculum Coach</title>
</head>
<body class="bg-slate-50">
  <div class="min-h-screen flex items-center justify-center p-4">
    <div class="w-full max-w-3xl bg-white shadow-sm rounded-2xl border border-slate-200 overflow-hidden">
      <!-- Header -->
      <div class="px-5 py-4 border-b border-slate-200 bg-white">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-xl font-semibold text-slate-900">Curriculum Coach</h1>
            <p class="text-sm text-slate-500">Ask for differentiation ideas grounded in Curriculum Hub.</p>
          </div>
          <span class="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">Canvas</span>
        </div>
      </div>

      <!-- Chat -->
      <div id="thread" class="px-5 py-4 space-y-4 h-[55vh] overflow-y-auto bg-slate-50"></div>

      <!-- Composer -->
      <div class="p-4 border-t border-slate-200 bg-white">
        <div class="flex gap-2">
          <input id="question"
            class="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
            placeholder="Example: What remediation can I give students struggling with 6.RP.A.1?"
          />
          <button id="askBtn"
            class="rounded-xl bg-slate-900 text-white px-4 py-3 font-medium hover:bg-slate-800 active:bg-slate-950 disabled:opacity-50">
            Ask
          </button>
        </div>
        <div class="mt-2 text-xs text-slate-500">
          Tip: include the standard (e.g., 6.RP.A.1) and what you observed (below proficiency, misconceptions, etc.).
        </div>
      </div>
    </div>
  </div>

<script>
  const thread = document.getElementById("thread");
  const input = document.getElementById("question");
  const btn = document.getElementById("askBtn");

  function addBubble(role, text, metaHtml = "") {
    const wrap = document.createElement("div");
    wrap.className = role === "user" ? "flex justify-end" : "flex justify-start";

    const bubble = document.createElement("div");
    bubble.className =
      (role === "user"
        ? "max-w-[85%] rounded-2xl rounded-br-sm bg-slate-900 text-white px-4 py-3 shadow-sm"
        : "max-w-[85%] rounded-2xl rounded-bl-sm bg-white text-slate-900 px-4 py-3 shadow-sm border border-slate-200");

    bubble.innerHTML = \`
      <div class="whitespace-pre-wrap leading-relaxed text-sm">\${escapeHtml(text)}</div>
      \${metaHtml}
    \`;

    wrap.appendChild(bubble);
    thread.appendChild(wrap);
    thread.scrollTop = thread.scrollHeight;
    return bubble;
  }

  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;");
  }

  function sourcesHtml(sources) {
    if (!sources || !sources.length) return "";
    const links = sources.map(s => \`<a class="underline" href="\${s.url}" target="_blank" rel="noopener">\${escapeHtml(s.title)}</a>\`).join("<br/>");
    return \`
      <div class="mt-3 pt-3 border-t border-slate-200">
        <div class="text-xs font-semibold text-slate-600 mb-1">Sources</div>
        <div class="text-xs text-slate-600">\${links}</div>
      </div>
    \`;
  }

  async function ask() {
    const q = input.value.trim();
    if (!q) return;

    input.value = "";
    btn.disabled = true;

    addBubble("user", q);

    const thinking = addBubble("assistant", "Thinking…");

    try {
      const res = await fetch("/ask", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ question: q })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        thinking.innerHTML = \`
          <div class="text-sm font-semibold text-red-700">Error</div>
          <div class="text-sm text-red-700 whitespace-pre-wrap">\${escapeHtml(data.error || "Request failed")}</div>
        \`;
        return;
      }

      const answer = data.answer || "(No answer returned)";
      thinking.innerHTML = \`
        <div class="whitespace-pre-wrap leading-relaxed text-sm">\${escapeHtml(answer)}</div>
        \${sourcesHtml(data.sources)}
      \`;
    } catch (e) {
      thinking.innerHTML = \`
        <div class="text-sm font-semibold text-red-700">Error</div>
        <div class="text-sm text-red-700 whitespace-pre-wrap">\${escapeHtml(String(e))}</div>
      \`;
    } finally {
      btn.disabled = false;
      input.focus();
    }
  }

  btn.addEventListener("click", ask);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") ask();
  });

  // Welcome message
  addBubble("assistant", "Hi! Ask me for differentiated remediation ideas. If you include the standard (like 6.RP.A.1), I can be more specific.");
</script>
</body>
</html>
  `);
});

app.post("/ask", async (req, res) => {
  try {
    const question = (req.body?.question || "").trim();
    if (!question) return res.status(400).json({ error: "Please type a question." });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "OPENAI_API_KEY is not set on Render." });

    // 1) Load curriculum pages from Canvas (cached)
    const pages = await getCurriculumPages();

    // 2) Pick the most relevant pages
    const top = pickTopPages(question, pages, 3);

    // 3) Build “trusted context”
    const context = top.map((p, i) => {
      const excerpt = p.bodyText.slice(0, 1800); // keep prompt small
      return `SOURCE ${i + 1}: ${p.title}\n${p.url}\n\n${excerpt}`;
    }).join("\n\n---\n\n");

    const OpenAI = require("openai");
    const client = new OpenAI({ apiKey });

    const prompt = `
You are The District Curriculum Coach, an instructional support assistant.
Use ONLY the provided SOURCES from the district's Curriculum Hub (Canvas Pages) as your primary reference.
If the sources don't contain enough, say what you need and give a best-practice suggestion clearly labeled "General best practice".

Teacher question:
${question}

SOURCES:
${context}

Respond with:
1) Quick diagnosis (what students likely missed)
2) 3–5 differentiated remediation options (small group, independent, scaffolded)
3) Checks for understanding / exit ticket
4) Cite which SOURCE(s) you used (by SOURCE number)
`.trim();

    const result = await client.responses.create({
      model: "gpt-4.1-mini",
      input: prompt
    });

    const answer = result.output?.[0]?.content?.[0]?.text || "(No answer returned)";
    res.json({
      answer,
      sources: top.map(t => ({ title: t.title, url: t.url }))
    });
  } catch (err) {
    console.error("ASK_ERROR:", err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, ()=>{
  console.log("Server running on port "+PORT);
});
