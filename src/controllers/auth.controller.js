// src/controllers/auth.controller.js

import { callAuthService } from "../utils/internalRequest.js";
import { sendSuccess, sendError } from "../utils/apiResponse.js";

/**
 * POST /auth/admin-exists
 * Forwards to: POST /internal/auth/exists
 */
export async function adminExistsController(req, res) {
    try {
        const { identifier } = req.body;
        if (!identifier) return sendError(res, "Identifier is required", 400);

        const result = await callAuthService("/internal/auth/exists", {
            loginScope: "admin",
            identifier: identifier.trim().toLowerCase(),
        });

        return sendSuccess(res, result.data, result.message);
    } catch (err) {
        console.error("❌ ADMIN EXISTS PROXY ERROR:", err?.response?.data || err.message);
        const status = err?.response?.status || 500;
        const message = err?.response?.data?.message || "Server error";
        return sendError(res, message, status);
    }
}

/**
 * POST /auth/login
 * Forwards to: POST /internal/auth/login
 */
export async function loginController(req, res) {
    try {
        const { identifier } = req.body;
        if (!identifier) return sendError(res, "Identifier is required", 400);

        const result = await callAuthService("/internal/auth/login", {
            loginScope: "admin",
            identifier: identifier.trim().toLowerCase(),
        });

        return sendSuccess(res, result.data, result.message);
    } catch (err) {
        console.error("❌ ADMIN LOGIN PROXY ERROR:", err?.response?.data || err.message);
        const status = err?.response?.status || 500;
        const message = err?.response?.data?.message || "Login failed";
        return sendError(res, message, status);
    }
}

/**
 * POST /auth/refresh-token
 * Forwards to: POST /internal/auth/refresh-token
 */
export async function refreshTokenController(req, res) {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) return sendError(res, "Refresh token required", 400);

        const result = await callAuthService("/internal/auth/refresh-token", {
            refreshToken,
        });

        return sendSuccess(res, result.data, result.message);
    } catch (err) {
        console.error("❌ ADMIN REFRESH PROXY ERROR:", err?.response?.data || err.message);
        const status = err?.response?.status || 500;
        const message = err?.response?.data?.message || "Server error";
        return sendError(res, message, status);
    }
}

/**
 * POST /auth/logout
 * Forwards to: POST /internal/auth/logout
 */
export async function logoutController(req, res) {
    try {
        const { refreshToken } = req.body;

        if (refreshToken) {
            await callAuthService("/internal/auth/logout", { refreshToken });
        }

        return sendSuccess(res, null, "Logged out");
    } catch (err) {
        console.error("❌ ADMIN LOGOUT PROXY ERROR:", err?.response?.data || err.message);
        // Logout should never hard-fail on the client — still return success
        return sendSuccess(res, null, "Logged out");
    }
}