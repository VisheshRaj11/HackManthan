import express from "express";
import methodOverride from "method-override";
import ejsMate from "ejs-mate";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { userRouter } from "./routes/user.route.js";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import jwt from "jsonwebtoken"; // <-- 1. IMPORT jsonwebtoken
import { User } from "./models/user.model.js"; // <-- 2. IMPORT your User model

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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


// --- Routes ---
// The 'user' variable from res.locals is now automatically available in all renders
app.get("/", (req, res) => {
    res.render("home.ejs");
});

app.get('/login', (req, res) => {
    res.render('includes/login.ejs');
});

app.get('/signup', (req, res) => {
    res.render('includes/signup.ejs');
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