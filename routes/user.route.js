import {Router} from "express";
import {signup, login, updateProfile, logout} from  "../controllers/user.controllers.js"

const userRouter = Router();

userRouter.post('/signup', signup);

userRouter.post('/login', login);

userRouter.put('/edit/:id', updateProfile);

userRouter.get('/logout', logout);

export {userRouter};
