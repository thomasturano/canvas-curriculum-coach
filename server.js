const express = require("express");
const OpenAI = require("openai");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const PORT = process.env.PORT || 3000;

/* ------------------------------
Basic health check
------------------------------ */

app.get("/", (req, res) => {
  res.send("Curriculum Coach is running.");
});

/* ------------------------------
post thing
------------------------------ */

app.post("/generate", async (req, res) => {
  try {
    const { standard, prompt } = req.body;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You help teachers create standards-aligned classroom content for Canvas LMS. Return ONLY valid HTML. Do not use markdown. Do not wrap the response in code fences."
        },
        {
          role: "user",
          content: `Standard: ${standard}
Teacher request: ${prompt}`
        }
      ]
    });

    const html = completion.choices[0].message.content;
    res.send(html);
  } catch (error) {
    console.error(error);
    res.send("<p>Error generating content.</p>");
  }
});

/* ------------------------------
Canvas LTI Endpoints
------------------------------ */

app.all("/lti/editor/login", (req, res) => {
  const idToken = req.body.id_token || "";

  res.send(`
    <!DOCTYPE html>
    <html>
    <body onload="document.forms[0].submit()">
      <form method="POST" action="/lti/editor/launch">
        <input type="hidden" name="id_token" value="${idToken}" />
      </form>
    </body>
    </html>
  `);
});

app.all("/lti/launch", (req, res) => {
  res.redirect("/chat");
});

app.all("/lti/editor/login", (req, res) => {
  res.redirect("/lti/editor/launch");
});

app.all("/lti/editor/launch", (req, res) => {
  let deepLinkReturnUrl = "";

  try {
    const idToken = req.body.id_token;

    if (idToken) {
      const payload = JSON.parse(
        Buffer.from(idToken.split(".")[1], "base64").toString()
      );

deepLinkReturnUrl =
  payload["https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings"]?.deep_link_return_url || "";

global.deepLinkReturnUrl = deepLinkReturnUrl;
    }
  } catch (error) {
    console.error("Could not decode id_token:", error);
  }

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Curriculum Content Builder</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          padding: 24px;
          background: #f7f7f7;
        }
        .card {
          background: white;
          border: 1px solid #ddd;
          border-radius: 10px;
          padding: 20px;
          max-width: 800px;
          margin: 0 auto;
        }
        h1 {
          margin-top: 0;
        }
        label {
          display: block;
          font-weight: bold;
          margin-top: 14px;
          margin-bottom: 6px;
        }
        input, textarea {
          width: 100%;
          padding: 12px;
          border-radius: 8px;
          border: 1px solid #ccc;
          font-family: Arial, sans-serif;
          font-size: 14px;
          box-sizing: border-box;
        }
        textarea {
          min-height: 160px;
        }
        button {
          margin-top: 16px;
          margin-right: 10px;
          background: #2563eb;
          color: white;
          border: none;
          border-radius: 8px;
          padding: 12px 18px;
          font-weight: bold;
          cursor: pointer;
        }
        button:hover {
          background: #1d4ed8;
        }
        .helper {
          color: #666;
          font-size: 13px;
          margin-bottom: 12px;
        }
        .preview {
          margin-top: 20px;
          padding: 15px;
          border: 1px solid #ddd;
          border-radius: 8px;
          background: #fafafa;
          min-height: 80px;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Curriculum Content Builder</h1>

        <p class="helper">
          This is a prototype. Generate content, preview it, then click Insert Into Canvas.
        </p>

        <label for="standard">Standard</label>
        <input id="standard" placeholder="ex: 6.RP.A.1" />

        <label for="prompt">Teacher Prompt</label>
        <textarea id="prompt" placeholder="Create a reteach activity for struggling students"></textarea>

        <button onclick="generate()">Generate</button>
        <button onclick="copyContent()">Copy Content</button>

        <div id="preview" class="preview"></div>
      </div>

<script>
  const deepLinkReturnUrl = "${deepLinkReturnUrl}";
  
  async function generate() {
    try {
      const standard = document.getElementById("standard").value;
      const prompt = document.getElementById("prompt").value;

      const response = await fetch("https://coach.thomasturano.com/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ standard, prompt })
      });

      const data = await response.text();
      document.getElementById("preview").innerHTML = data;
    } catch (error) {
      console.error("GENERATE ERROR:", error);
      alert("Generate failed.");
    }
  }

async function copyContent() {

  const html = document.getElementById("preview").innerHTML;

  try {
    await navigator.clipboard.writeText(html);

    alert("Content copied! Paste it into Canvas.");

  } catch (err) {

    const textarea = document.createElement("textarea");
    textarea.value = html;

    document.body.appendChild(textarea);
    textarea.select();

    document.execCommand("copy");

    document.body.removeChild(textarea);

    alert("Content copied! Paste it into Canvas.");
  }
}
</script>
    </body>
    </html>
  `);
});


/* ------------------------------
Chat Page
------------------------------ */

app.get("/chat", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Curriculum Coach</title>
  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: #f4f5f7;
      color: #1f2937;
    }

    .page {
      max-width: 960px;
      margin: 0 auto;
      padding: 24px;
    }

    .card {
      background: #ffffff;
      border: 1px solid #d1d5db;
      border-radius: 12px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
      overflow: hidden;
    }

    .header {
      padding: 20px 24px 16px 24px;
      border-bottom: 1px solid #e5e7eb;
      background: #ffffff;
    }

    .title {
      margin: 0;
      font-size: 28px;
      font-weight: 700;
      color: #1f2937;
    }

    .subtitle {
      margin: 8px 0 0 0;
      font-size: 14px;
      color: #6b7280;
      line-height: 1.5;
    }

    .chat-window {
      height: 460px;
      overflow-y: auto;
      padding: 20px;
      background: #f9fafb;
    }

    .message-row {
      display: flex;
      margin-bottom: 14px;
    }

    .message-row.user {
      justify-content: flex-end;
    }

    .message-row.bot {
      justify-content: flex-start;
    }

    .bubble {
      max-width: 78%;
      padding: 12px 14px;
      border-radius: 14px;
      line-height: 1.5;
      white-space: pre-wrap;
      font-size: 14px;
    }

    .user .bubble {
      background: #0f172a;
      color: #ffffff;
      border-bottom-right-radius: 4px;
    }

    .bot .bubble {
      background: #ffffff;
      color: #1f2937;
      border: 1px solid #d1d5db;
      border-bottom-left-radius: 4px;
    }

    .sources {
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #6b7280;
    }

    .sources strong {
      display: block;
      margin-bottom: 6px;
      color: #374151;
    }

    .sources a {
      color: #1d4ed8;
      text-decoration: none;
    }

    .sources a:hover {
      text-decoration: underline;
    }

    .composer {
      padding: 16px 20px 20px 20px;
      border-top: 1px solid #e5e7eb;
      background: #ffffff;
    }

    .input-row {
      display: flex;
      gap: 10px;
      align-items: center;
    }

    .question-input {
      flex: 1;
      padding: 12px 14px;
      font-size: 14px;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      outline: none;
    }

    .question-input:focus {
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
    }

    .ask-button {
      padding: 12px 18px;
      background: #2563eb;
      color: white;
      border: none;
      border-radius: 10px;
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
    }

    .ask-button:hover {
      background: #1d4ed8;
    }

    .ask-button:disabled {
      background: #93c5fd;
      cursor: not-allowed;
    }

    .helper-text {
      margin-top: 10px;
      font-size: 12px;
      color: #6b7280;
    }

    .status {
      margin-top: 8px;
      font-size: 12px;
      color: #6b7280;
      min-height: 16px;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="card">
      <div class="header">
        <h1 class="title">Curriculum Coach</h1>
        <p class="subtitle">
          Ask for differentiation ideas, remediation support, and instructional guidance.
          Include the standard or skill for more targeted help.
        </p>
      </div>

      <div id="chatWindow" class="chat-window"></div>

      <div class="composer">
        <div class="input-row">
          <input
            id="questionInput"
            class="question-input"
            type="text"
            placeholder="Example: What remediation can I give students struggling with 6.RP.A.1?"
          />
          <button id="askButton" class="ask-button" onclick="askQuestion()">Ask</button>
        </div>
        <div class="helper-text">
          Tip: include what students missed, the standard, and whether you want small-group, independent, or scaffolded support.
        </div>
        <div id="status" class="status"></div>
      </div>
    </div>
  </div>

  <script>
    const chatWindow = document.getElementById("chatWindow");
    const questionInput = document.getElementById("questionInput");
    const askButton = document.getElementById("askButton");
    const status = document.getElementById("status");

    function addMessage(role, text, sources = []) {
      const row = document.createElement("div");
      row.className = "message-row " + role;

      const bubble = document.createElement("div");
      bubble.className = "bubble";
      bubble.textContent = text;

      if (sources && sources.length > 0) {
        const sourcesDiv = document.createElement("div");
        sourcesDiv.className = "sources";

        let html = "<strong>Sources</strong>";
        for (const source of sources) {
          html += '<div><a href="' + source.url + '" target="_blank" rel="noopener noreferrer">' + source.title + "</a></div>";
        }
        sourcesDiv.innerHTML = html;
        bubble.appendChild(sourcesDiv);
      }

      row.appendChild(bubble);
      chatWindow.appendChild(row);
      chatWindow.scrollTop = chatWindow.scrollHeight;
      return row;
    }

    async function askQuestion() {
      const question = questionInput.value.trim();
      if (!question) return;

      addMessage("user", question);
      questionInput.value = "";
      askButton.disabled = true;
      status.textContent = "Thinking...";

      const loadingRow = addMessage("bot", "Thinking...");

      try {
        const response = await fetch("/ask", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ question })
        });

        const data = await response.json().catch(() => ({}));

        loadingRow.remove();

        if (!response.ok) {
          addMessage("bot", data.error || "Something went wrong.");
        } else {
          addMessage("bot", data.answer || "No answer returned.", data.sources || []);
        }
      } catch (error) {
        loadingRow.remove();
        addMessage("bot", "Request failed. Please try again.");
      } finally {
        askButton.disabled = false;
        status.textContent = "";
        questionInput.focus();
      }
    }

    questionInput.addEventListener("keydown", function(event) {
      if (event.key === "Enter") {
        askQuestion();
      }
    });

    addMessage(
      "bot",
      "Hi! I can help with differentiation, remediation, and instructional ideas. Ask me about a specific standard, skill, or student need."
    );
  </script>
</body>
</html>
  `);
});

/* ------------------------------
Ask OpenAI
------------------------------ */

app.post("/ask", async (req, res) => {

try {

const question = req.body.question;

const response = await openai.responses.create({
model: "gpt-4.1-mini",
input: `
You are an instructional coach helping teachers differentiate instruction.

Teacher question:
${question}

Provide a practical answer with:
• differentiation strategies
• scaffolding ideas
• small group ideas
`
});

const answer = response.output_text;

res.json({
answer,
sources:[]
});

} catch(err){

console.error(err);

res.status(500).json({
error:"AI request failed"
});

}

});

app.post("/editor/deeplink", (req, res) => {

  const html = req.body.html;
  const deepLinkReturnUrl = global.deepLinkReturnUrl;

  if (!html || !deepLinkReturnUrl) {
    return res.send("Missing html or deep link return URL.");
  }

  const payload = {
    "https://purl.imsglobal.org/spec/lti-dl/claim/content_items": [
      {
        type: "html",
        html: html
      }
    ]
  };

  const jwtValue = Buffer.from(JSON.stringify(payload)).toString("base64");

  res.send(`
    <form action="${deep_link_return_url}" method="POST">
      <input type="hidden" name="JWT" value="${jwtValue}" />
    </form>
  `);
});

/* ------------------------------
Start server
------------------------------ */

app.listen(PORT, () => {
console.log("Server running on port", PORT);
});
