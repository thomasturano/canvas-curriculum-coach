const express = require("express");
const fetch = require("node-fetch");

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
    <html>
      <body style="font-family: Arial; margin:40px">
        <h2>Curriculum Coach</h2>
        <p>Ask a question about differentiating instruction.</p>
        <input id="question" style="width:400px"/>
        <button onclick="ask()">Ask</button>
        <pre id="answer"></pre>

        <script>
          async function ask(){
            const q = document.getElementById("question").value;

            const res = await fetch("/ask",{
              method:"POST",
              headers:{"Content-Type":"application/json"},
              body:JSON.stringify({question:q})
            });

            const data = await res.json();
            document.getElementById("answer").innerText = data.answer;
          }
        </script>
      </body>
    </html>
  `);
});

app.post("/ask", async (req, res) => {
  try {
    const question = (req.body?.question || "").trim();
    if (!question) return res.status(400).json({ error: "Missing question" });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "OPENAI_API_KEY is not set on the server" });

    const OpenAI = require("openai");
    const client = new OpenAI({ apiKey });

    const result = await client.responses.create({
      model: "gpt-4.1-mini",
      input: question
    });

    const answer = result.output?.[0]?.content?.[0]?.text || "(No text returned)";
    res.json({ answer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, ()=>{
  console.log("Server running on port "+PORT);
});
