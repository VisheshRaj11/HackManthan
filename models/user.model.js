import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    imageUrl: {
        type: String,
        required: false // optional, user may not upload an image
    },
    username: {
        type: String,
        required: true,
        unique: true, // usernames should be unique
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true, // emails should be unique
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    }
}, {
    timestamps: true // adds createdAt and updatedAt automatically
});

export const User = mongoose.model('User', userSchema);
 
