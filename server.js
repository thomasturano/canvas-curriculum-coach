const express = require("express");

const app = express();

app.get("/", (req, res) => {
  res.send("Curriculum Coach is running!");
});

app.get("/lti/login", (req, res) => {
  res.send("LTI login endpoint working");
});

app.get("/lti/launch", (req, res) => {
  res.send("LTI launch successful. Canvas connection works.");
});

app.get("/.well-known/jwks.json", (req, res) => {
  res.json({
    keys: []
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
