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
Canvas LTI Endpoints
------------------------------ */

app.all("/lti/login", (req, res) => {
  res.redirect("/chat");
});

app.all("/lti/launch", (req, res) => {
  res.redirect("/chat");
});

/* ------------------------------
Chat Page
------------------------------ */

app.get("/chat", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Curriculum Coach</title>
<style>

body{
font-family: Arial;
background:#f4f6fb;
margin:0;
padding:30px;
}

.container{
max-width:900px;
margin:auto;
background:white;
border-radius:12px;
box-shadow:0 10px 25px rgba(0,0,0,.08);
padding:20px;
}

h1{
margin-top:0;
}

.chat{
height:450px;
overflow-y:auto;
border:1px solid #ddd;
border-radius:8px;
padding:15px;
background:#fafafa;
}

.message{
margin-bottom:12px;
}

.user{
text-align:right;
}

.user span{
background:#111827;
color:white;
padding:10px 14px;
border-radius:12px;
display:inline-block;
}

.bot span{
background:white;
border:1px solid #ddd;
padding:10px 14px;
border-radius:12px;
display:inline-block;
}

.controls{
margin-top:15px;
display:flex;
gap:10px;
}

input{
flex:1;
padding:12px;
border-radius:8px;
border:1px solid #ccc;
font-size:14px;
}

button{
padding:12px 18px;
border-radius:8px;
border:none;
background:#111827;
color:white;
font-weight:bold;
cursor:pointer;
}

button:hover{
background:#000;
}

.sources{
margin-top:8px;
font-size:12px;
color:#555;
}

</style>
</head>

<body>

<div class="container">

<h1>Curriculum Coach</h1>
<p>Ask a question about differentiation or instructional support.</p>

<div id="chat" class="chat"></div>

<div class="controls">
<input id="question" placeholder="Example: Explain differentiation strategies for struggling math students">
<button onclick="ask()">Ask</button>
</div>

</div>

<script>

const chat = document.getElementById("chat");

function addMessage(role,text){

const div = document.createElement("div");
div.className = "message " + role;

const span = document.createElement("span");
span.innerText = text;

div.appendChild(span);
chat.appendChild(div);

chat.scrollTop = chat.scrollHeight;

}

async function ask(){

const input = document.getElementById("question");

const q = input.value.trim();
if(!q) return;

addMessage("user",q);
input.value="";

addMessage("bot","Thinking...");

const res = await fetch("/ask",{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({question:q})
});

const data = await res.json();

chat.lastChild.remove();

addMessage("bot",data.answer);

if(data.sources && data.sources.length){

const src = document.createElement("div");
src.className="sources";
src.innerHTML="<b>Sources</b><br>" +
data.sources.map(s=>'<a href="'+s.url+'" target="_blank">'+s.title+'</a>').join("<br>");

chat.appendChild(src);

}

}

addMessage("bot","Hi! Ask me for differentiation ideas.");

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

/* ------------------------------
Start server
------------------------------ */

app.listen(PORT, () => {
console.log("Server running on port", PORT);
});
