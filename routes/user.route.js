import {Router} from "express";
import passport from 'passport';
import {signup, login, updateProfile, logout} from  "../controllers/user.controllers.js"

const userRouter = Router();

userRouter.get('/google', passport.authenticate('google', {
    scope: ['profile', 'email'] // What information we want from the user's Google account
}));


userRouter.get('/google/callback', passport.authenticate('google'), (req, res) => {
    res.redirect('/');
});

userRouter.post('/signup', signup);

userRouter.post('/login', login);

userRouter.put('/edit/:id', updateProfile);

userRouter.get('/logout', logout);

export {userRouter};
