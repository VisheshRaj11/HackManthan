import express from "express";
import methodOverride from "method-override";
import ejsMate from "ejs-mate";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";
import { userRouter } from "./routes/user.route.js";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { User } from "./models/user.model.js";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";

dotenv.config();

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// View engine setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.engine("ejs", ejsMate);

// Middleware
app.use(express.json({ limit: "10mb" }));
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(methodOverride("_method"));
app.use(cookieParser());

// --- Middleware: Attach user from JWT ---
app.use(async (req, res, next) => {
  try {
    const token = req.cookies.token;
    if (!token) {
      res.locals.user = null;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");
    res.locals.user = user || null;
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

app.use(passport.initialize()); // ✅ no session, since JWT is used

// --- Routes ---
app.get("/", (req, res) => {
  res.render("home");
});

app.get("/login", (req, res) => {
  res.render("includes/login");
});

app.get("/signup", (req, res) => {
  res.render("includes/signup");
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

// User routes
app.use("/user", userRouter);

app.get("/analysis", (req, res) => {
  const videoUrl = req.query.videoUrl || "";
  res.render("includes/analysis", { videoUrl });
});

app.get("/yourway", (req, res) => {
  res.render("includes/yourway", {
    GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,
  });
});

// --- Gemini API Route ---
app.post("/ask-question", async (req, res) => {
  try {
    const { question, frame } = req.body;

    if (!question || !frame) {
      return res.status(400).json({ error: "Missing question or frame data." });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: "Gemini API key is not configured." });
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: `Based on the image, answer this question concisely: "${question}"` },
              { inline_data: { mime_type: "image/jpeg", data: frame } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Gemini API Error:", errorData);
      return res.status(response.status).json({ error: errorData.error?.message || "AI error" });
    }

    const data = await response.json();
    const answer =
      data?.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't get a clear answer.";

    res.json({ answer });
  } catch (err) {
    console.error("Error in /ask-question:", err.message);
    res.status(500).json({ error: "An internal server error occurred." });
  }
});

// --- Start server ---
const PORT = process.env.PORT || 8080;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ Connected to MongoDB");
    app.listen(PORT, () => {
      console.log(`✅ Server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
  });
