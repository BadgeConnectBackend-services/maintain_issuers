// src/routes/auth.routes.js

import express from "express";
import {
    adminExistsController,
    loginWithOtpController,
    refreshTokenController,
    logoutController,
} from "../controllers/auth.controller.js";

const router = express.Router();

/**
 * Check if admin exists (PUBLIC)
 * Used before OTP generation
 */
router.post("/admin-exists", adminExistsController);

/**
 * Login using OTP verification proof
 */
router.post("/login-with-otp", loginWithOtpController);

/**
 * Refresh token (UNCHANGED)
 */
router.post("/refresh-token", refreshTokenController);

/**
 * Logout (UNCHANGED)
 */
router.post("/logout", logoutController);

export default router;
