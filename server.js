const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.get("/lti/login", (req, res) => {
  res.redirect("/chat");
});

app.post("/lti/login", (req, res) => {
  res.redirect("/chat");
});

app.get("/lti/launch", (req, res) => {
  res.redirect("/chat");
});

app.post("/lti/launch", (req, res) => {
  res.redirect("/chat");
});

app.get("/lti/launch", (req, res) => {
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

app.post("/ask", async (req,res)=>{

  const question = req.body.question;

  const response = await fetch("https://api.openai.com/v1/responses",{
    method:"POST",
    headers:{
      "Authorization":`Bearer ${OPENAI_API_KEY}`,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      model:"gpt-4.1-mini",
      input: question
    })
  });

  const data = await response.json();

  res.json({
    answer: data.output[0].content[0].text
  });

});

const PORT = process.env.PORT || 3000;

app.listen(PORT, ()=>{
  console.log("Server running on port "+PORT);
});
