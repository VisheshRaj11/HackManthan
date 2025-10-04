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
import passport from "passport";
import {Strategy as GoogleStrategy} from "passport-google-oauth20";

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
app.use(async (req, res, next) => {
    try {
        const token = req.cookies.token;
        if (!token) {
            res.locals.user = null;
            return next();
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select("-password");
        res.locals.user = user;
        next();

    } catch (error) {
        res.locals.user = null;
        next();
    }
});



// --- Passport Google OAuth setup ---
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let currentUser = await User.findOne({ googleId: profile.id });
        if (currentUser) {
          return done(null, currentUser);
        }
        const newUser = await new User({
          googleId: profile.id,
          username: profile.displayName,
          email: profile.emails[0].value,
          imageUrl: profile.photos[0].value,
        }).save();
        done(null, newUser);
      } catch (error) {
        done(error, null);
      }
    }
  )
);

app.use(passport.initialize());


const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.warn("⚠️ WARNING: GEMINI_API_KEY is not set in the .env file.");
}

// --- NEW: AUTO ANALYSIS FUNCTION (Reusable for both manual and automatic analysis) ---
async function analyzeFrame(frameData, analysisType = "automatic") {
    try {
        const prompt = analysisType  = `
        You are an AI assistant monitoring a road traffic camera feed. 
        Please describe the scene politely and clearly, focusing on:
        - Vehicle movement and traffic flow
        - Any unusual activities or incidents
        - Weather and road conditions
        - Pedestrian activity if visible
        
        ONLY mark a situation as critical if it involves:
        - A car accident
        - A physical fight or confrontation
        - Fire or hazardous situation
        - Extremely heavy traffic causing severe blockage
        
        If you detect a critical situation as described above, append the special keyword "yyeess" at the very end of your response. 
        Otherwise, do not include it.
        
        Always keep your description polite, professional, and concise.
        `;
        

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GEMINI_API_KEY}`;

        const requestBody = analysisType === "automatic" 
            ? {
                contents: [
                    {
                        parts: [
                            { text: prompt },
                            { inline_data: { mime_type: "image/jpeg", data: frameData } },
                        ],
                    },
                ],
            }
            : {
                contents: [
                    {
                        parts: [
                            { text: prompt },
                            { inline_data: { mime_type: "image/jpeg", data: frameData } },
                        ],
                    },
                ],
            };

        const response = await fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("Gemini API Error:", JSON.stringify(errorData, null, 2));
            throw new Error(errorData?.error?.message || "An unknown error occurred with the AI model.");
        }

        const data = await response.json();
        const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text.trim() || "No analysis available.";

        // Check for alert keyword
        const alertKeyword = 'yyeess';
        const hasAlert = answer.includes(alertKeyword);
        const cleanAnswer = hasAlert ? answer.replace(alertKeyword, '').trim() : answer;

        return { answer: cleanAnswer, alert: hasAlert };

    } catch (err) {
        console.error("Error in analyzeFrame:", err.message);
        throw err;
    }
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
        GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAP_API,
    });
});

// Google Auth routes
app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login", session: false }),
  (req, res) => {
    const token = jwt.sign({ id: req.user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.cookie("token", token, { httpOnly: true });
    res.redirect("/");
  }
);

app.get("/logout", (req, res) => {
  res.clearCookie("token");
  res.redirect("/");
});



// --- UPDATED: User Question Endpoint (uses the shared analyzeFrame function) ---
app.post("/ask-question", async (req, res) => {
  try {
    const { question, frame } = req.body;

    if (!question || !frame) {
      return res.status(400).json({ error: "Missing question or frame data." });
    }

    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: "Gemini API key is not configured on the server." });
    }

    const result = await analyzeFrame(frame, "manual");
    res.json({ answer: result.answer, alert: result.alert });

  } catch (err) {
    console.error("Error in /ask-question:", err.message);
    res.status(500).json({ error: "An internal server error occurred." });
  }
});

// --- NEW: Cached auto-analysis for 15-second interval ---
let lastAutoResult = null;
let lastCaptureTime = 0;
const AUTO_INTERVAL_MS = 15000; // 15 seconds

app.post("/auto-analyze", async (req, res) => {
    try {
        const { frame } = req.body;

        if (!frame) {
            return res.status(400).json({ error: "Missing frame data." });
        }

        const now = Date.now();

        // Check if 15 seconds have passed since last capture
        if (!lastAutoResult || now - lastCaptureTime > AUTO_INTERVAL_MS) {
            // Capture a new frame and analyze
            lastCaptureTime = now;

            // Run analysis (might take several seconds)
            const result = await analyzeFrame(frame, "automatic");

            lastAutoResult = {
                description: result.answer,
                alert: result.alert,
                timestamp: new Date().toLocaleTimeString()
            };
        } 

        // Return cached result
        res.json(lastAutoResult);

    } catch (err) {
        console.error("Error in /auto-analyze:", err.message);
        res.status(500).json({ error: "An internal server error occurred." });
    }
});

// User Route:
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