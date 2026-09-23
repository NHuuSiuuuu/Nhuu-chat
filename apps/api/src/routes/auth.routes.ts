import { Router } from "express";

import { forgotPassword, login, logout, refresh, register, resetPasswordController, session } from "../controllers/auth.controller.js";
import { authenticate } from "../auth/auth.middleware.js";

export const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.post("/forgot-password", forgotPassword);
authRouter.post("/reset-password", resetPasswordController);
authRouter.post("/refresh", refresh);
authRouter.post("/session", authenticate, session);
authRouter.post("/logout", logout);
