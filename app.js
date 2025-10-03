import express from "express";
import methodOverride from "method-override";
import ejsMate from "ejs-mate";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config();

// Fix for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

console.log("Clerk Secret Key:", process.env.CLERK_SECRET_KEY ? "Loaded ✅" : "Missing ❌");

// View engine setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.engine("ejs", ejsMate);

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(methodOverride("_method"));

// --- Routes ---
app.get("/", (req, res) => {
  res.render("home.ejs");
});


// --- Start server ---
const PORT = 8080;
app.listen(PORT, () => {
  console.log(`✅ Server is listening at http://localhost:${PORT}`);
});