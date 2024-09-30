let express = require("express"),
  http = require("http"),
  app = require("express")(),
  server = http.createServer(app),
  bodyParser = require("body-parser");

// const path = require('path');
// app.use('/image-upload', express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

console.log("Server started");
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.all("/*", function(req, res, next) {
 
  res.header("Access-Control-Allow-Origin", "*");  
  res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-type,Accept,X-Access-Token,X-Key"
  );
  if (req.method == "OPTIONS") {
    res.status(200).end();
  } else {
    next();
  }
});

app.get("/", function(req, res) {
    res.send("BackEnd POS Mandiri Server Online.");
  });

app.use("/api/inventory", require("./inventory"));
app.use("/api/customers", require("./customers"));
app.use("/api/categories", require("./categories"));
app.use("/api/settings", require("./settings"));
app.use("/api/users", require("./users"));
app.use("/api", require("./transactions"));

server.listen(PORT, () => console.log(`Listening on PORT ${PORT}`));
