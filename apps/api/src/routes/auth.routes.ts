import { Router } from "express";

import { login, logout, refresh, register, session } from "../controllers/auth.controller.js";
import { authenticate } from "../auth/auth.middleware.js";

export const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.post("/refresh", refresh);
authRouter.post("/session", authenticate, session);
authRouter.post("/logout", logout);
