import express from "express";
import methodOverride from "method-override";
import ejsMate from "ejs-mate";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";
import cors from "cors"
import dotenv from "dotenv";
import { userRouter } from "./routes/user.route.js";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { User } from "./models/user.model.js";

dotenv.config();

// Fix for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// View engine setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.engine("ejs", ejsMate);

// Middleware
app.use(express.json({limit: '10mb'}));
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static("public"));
app.use(methodOverride("_method"));
app.use(cookieParser());

// --- NEW MIDDLEWARE TO FETCH AND ATTACH USER ---
// This middleware will run on EVERY request
app.use(async (req, res, next) => {
    try {
        const token = req.cookies.token; // Get token from cookies
        if (!token) {
            res.locals.user = null;
            return next();
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select("-password"); // Find user, exclude password

        // Make the user object available in res.locals
        // This makes it automatically available in all EJS templates
        res.locals.user = user;
        next();

    } catch (error) {
        // If token is invalid or expired
        res.locals.user = null;
        next();
    }
});

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.warn("⚠️ WARNING: GEMINI_API_KEY is not set in the .env file.");
}

// --- Routes ---

app.get("/", (req, res) => {
  res.render("home");
});


app.get('/login', (req, res) => {
  res.render('includes/login.ejs');
});

app.get('/signup', (req, res) => {
  res.render('includes/signup.ejs');
});

app.get("/analysis", (req, res) => {
  const videoUrl = req.query.videoUrl || "";
  res.render("includes/analysis", { videoUrl });
});

app.get('/yourway', (req, res) => {
  res.render('includes/yourway.ejs',{
        GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAP_API 
    });
});

app.post("/ask-question", async (req, res) => {
  try {
    const { question, frame } = req.body;

    if (!question || !frame) {
      return res.status(400).json({ error: "Missing question or frame data." });
    }

    if (!GEMINI_API_KEY) {
      return res
        .status(500)
        .json({ error: "Gemini API key is not configured on the server." });
    }
    
    // --- 🧠 NEW PROMPT LOGIC 🧠 ---
    // The AI is now instructed to ALWAYS describe the scene,
    // but to add a special keyword at the end if a critical event is found.
    const priorityPrompt = `You are an AI assistant monitoring a road traffic camera feed. Your task is to answer the user's question about the scene.

CRITICAL RULE: If your analysis of the image reveals a car accident, physical fight, severe traffic jam, or an injured person, you MUST describe the scene and then you MUST append the special keyword "yyeess" at the very end of your response.

Example of an alert: "A two-car collision is visible in the center of the road. yyeess"
Example of a normal response: "The traffic is flowing smoothly under a clear sky."

Now, answer this question: "${question}"`;

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: priorityPrompt },
              { inline_data: { mime_type: "image/jpeg", data: frame } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Gemini API Error:", JSON.stringify(errorData, null, 2));
      const errorMessage =
        errorData?.error?.message || "An unknown error occurred with the AI model.";
      return res.status(response.status).json({ error: errorMessage });
    }

    const data = await response.json();
    
    const answer =
      data?.candidates?.[0]?.content?.parts?.[0]?.text.trim() ||
      "Sorry, I couldn't get a clear answer.";

    // --- 🚨 NEW KEYWORD CHECK LOGIC 🚨 ---
    const alertKeyword = 'yyeess';

    if (answer.includes(alertKeyword)) {
        // If the keyword is found, remove it from the text before sending
        // it to the user and set the alert flag to true.
        const cleanAnswer = answer.replace(alertKeyword, '').trim();
        res.json({ answer: cleanAnswer, alert: true });
    } else {
        // Otherwise, send the answer normally.
        res.json({ answer: answer, alert: false });
    }

  } catch (err) {
    console.error("Error in /ask-question:", err.message);
    res.status(500).json({ error: "An internal server error occurred." });
  }
});

//User Route:
app.use("/user", userRouter);


// --- Start server ---
const PORT = 8080;

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("✅ Connected to MongoDB");
        app.listen(PORT, () => {
            console.log(`✅ Server is listening at http://localhost:${PORT}`);
        });
    })
    .catch(err => {
        console.error("❌ MongoDB connection error:", err);
});