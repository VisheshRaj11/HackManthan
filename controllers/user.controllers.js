import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { User } from '../models/user.model.js';
import { z } from 'zod';

// --- Zod Schemas for Validation ---
const signupSchema = z.object({
    username: z.string().min(3, "Username must be at least 3 characters long"),
    email: z.string().email("Invalid email address"),
    password: z.string().min(6, "Password must be at least 6 characters long"),
    imageUrl: z.string().url("Invalid URL").optional()
});

const loginSchema = z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(6, "Password is required")
});

const updateSchema = z.object({
    username: z.string().min(3).optional(),
    email: z.string().email().optional(),
    password: z.string().min(6).optional(),
    imageUrl: z.string().url().optional()
}).refine(data => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
});


// --- Helper function to create and send token ---
const sendTokenAndRedirect = (user, res) => {
    // Create JWT
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });

    // Set token in an HttpOnly cookie for security
    res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 1 day
    });
    
    // Redirect to the homepage after successful login/signup
    res.redirect('/');
};

// --- Controller Functions ---

/**
 * Handles new user registration.
 */
export const signup = async (req, res) => {
    try {
        const { imageUrl, username, email, password } = signupSchema.parse(req.body);

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'Email is already registered' });
        }

        // Hash the password before saving
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await User.create({
            username,
            email,
            password: hashedPassword,
            imageUrl
        });
        
        // **CORRECTION:** Log the user in by sending a token and redirecting.
        sendTokenAndRedirect(newUser, res);

    } catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({ errors: err.errors });
        }
        res.status(500).json({ message: "An internal server error occurred." });
    }
};

/**
 * Handles user login.
 */
export const login = async (req, res) => {
    try {
        const { email, password } = loginSchema.parse(req.body);

        const user = await User.findOne({ email });
        if (!user) {
            // Use a generic message for security
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        // **CORRECTION:** The original code sent an error on success.
        // Now, it correctly sends a token and redirects.
        sendTokenAndRedirect(user, res);
        
    } catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({ errors: err.errors });
        }
        // **CORRECTION:** Removed duplicate error response.
        res.status(500).json({ message: "An internal server error occurred." });
    }
};

/**
 * Handles updating a user's profile.
 */
export const updateProfile = async (req, res) => {
    try {
        // SECURITY NOTE: It's safer to get the user ID from the JWT (e.g., req.user.id)
        // set by an auth middleware, rather than from req.params, to prevent
        // one user from trying to update another's profile.
        const userId = req.params.id;
        const updates = updateSchema.parse(req.body);

        // If the password is being updated, it must be hashed
        if (updates.password) {
            updates.password = await bcrypt.hash(updates.password, 10);
        }

        const updatedUser = await User.findByIdAndUpdate(userId, updates, { new: true }).select("-password");
        
        if (!updatedUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.status(200).json({ message: 'Profile updated successfully', user: updatedUser });

    } catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({ errors: err.errors });
        }
        res.status(500).json({ message: "An internal server error occurred." });
    }
};

/**
 * Handles user logout.
 */
export const logout = (req, res) => {
    res.clearCookie('token');
    res.redirect('/');
};