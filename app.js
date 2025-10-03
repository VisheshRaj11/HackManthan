const express = require("express");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const path = require("path");
const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({extended: true}));
app.use(express.static('public'));
app.use(methodOverride("_method"));
app.engine("ejs",ejsMate);



app.get("/",(req, res)=> {
    res.render("home.ejs");
})


// Start server
app.listen(8080, () => {
    console.log("Server is listening at port 8000");
  });