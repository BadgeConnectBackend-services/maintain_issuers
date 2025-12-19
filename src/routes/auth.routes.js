// src/routes/auth.routes.js

import express from "express";
import {
    loginController,
    logoutController,
    refreshTokenController,
    adminExistsController
} from "../controllers/auth.controller.js";

const router = express.Router();

router.post("/admin-exists", adminExistsController);
router.post("/login", loginController);
router.post("/refresh-token", refreshTokenController);
router.post("/logout", logoutController);

export default router;
