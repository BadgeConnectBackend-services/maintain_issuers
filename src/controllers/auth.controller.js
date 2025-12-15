// src/controllers/auth.controller.js

import jwt from "jsonwebtoken";
import crypto from "crypto";
import Admin from "../models/admin.model.js";
import { sendSuccess, sendError } from "../utils/apiResponse.js";

/**
 * Helpers (UNCHANGED LOGIC)
 */
function generateAccessToken(admin) {
    return jwt.sign(
        {
            adminId: admin._id,
            email: admin.email || null,
            mobile: admin.mobile || null,
        },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
    );
}

function generateRefreshToken() {
    return crypto.randomBytes(32).toString("hex");
}

const REFRESH_TOKEN_LIFETIME_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * POST /auth/admin-exists
 * Public endpoint — used BEFORE OTP generation
 */
export async function adminExistsController(req, res) {
    try {
        const { identifier } = req.body;

        if (!identifier) {
            return sendError(res, "Invalid request", 400);
        }

        const admin = await Admin.findOne({
            $or: [{ email: identifier }, { mobile: identifier }],
            isActive: true,
        }).select("_id");

        if (!admin) {
            return sendError(res, "Admin does not exist", 404);
        }

        return sendSuccess(
            res,
            { exists: true },
            "Admin exists",
            200
        );
    } catch (err) {
        console.error("ADMIN EXISTS ERROR:", err);
        return sendError(res, "Server error", 500);
    }
}

/**
 * POST /auth/login-with-otp
 * OTP already verified by OTP_service
 */
export async function loginWithOtpController(req, res) {
    try {
        const { verificationId } = req.body;

        if (!verificationId) {
            return sendError(res, "Invalid request", 400);
        }

        // 🔒 Call OTP_service internally
        const response = await fetch(
            `${process.env.OTP_SERVICE_BASE_URL}/otp/verification/${verificationId}`,
            {
                headers: {
                    "x-internal-api-key": process.env.OTP_SERVICE_INTERNAL_KEY,
                },
            }
        );

        if (!response.ok) {
            return sendError(res, "OTP verification failed", 401);
        }

        const { data } = await response.json();
        const { identifier, purpose } = data;

        // 🔐 Enforce correct purpose
        if (purpose !== "admin_login") {
            return sendError(res, "Unauthorized", 403);
        }

        // 🔍 Find admin
        const admin = await Admin.findOne({
            $or: [{ email: identifier }, { mobile: identifier }],
            isActive: true,
        });

        if (!admin) {
            return sendError(res, "Admin not registered", 403);
        }

        // ✅ Issue tokens (UNCHANGED logic)
        const accessToken = generateAccessToken(admin);
        const refreshToken = generateRefreshToken();

        admin.refreshToken = refreshToken;
        admin.refreshTokenExpiresAt = new Date(
            Date.now() + REFRESH_TOKEN_LIFETIME_MS
        );
        await admin.save();

        return sendSuccess(
            res,
            {
                accessToken,
                refreshToken,
                admin: {
                    id: admin._id,
                    firstName: admin.firstName,
                    lastName: admin.lastName,
                    email: admin.email,
                    mobile: admin.mobile,
                },
            },
            "Login successful",
            200
        );
    } catch (err) {
        console.error("LOGIN WITH OTP ERROR:", err);
        return sendError(res, "Login failed", 500);
    }
}

/**
 * POST /auth/refresh-token (UNCHANGED)
 */
export async function refreshTokenController(req, res) {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return sendError(res, "Refresh token is required", 400);
        }

        const admin = await Admin.findOne({ refreshToken, isActive: true });

        if (
            !admin ||
            !admin.refreshTokenExpiresAt ||
            admin.refreshTokenExpiresAt < new Date()
        ) {
            return sendError(res, "Invalid refresh token", 401);
        }

        const newAccessToken = generateAccessToken(admin);
        const newRefreshToken = generateRefreshToken();

        admin.refreshToken = newRefreshToken;
        admin.refreshTokenExpiresAt = new Date(
            Date.now() + REFRESH_TOKEN_LIFETIME_MS
        );
        await admin.save();

        return sendSuccess(
            res,
            {
                accessToken: newAccessToken,
                refreshToken: newRefreshToken,
            },
            "Token refreshed",
            200
        );
    } catch (err) {
        console.error("REFRESH TOKEN ERROR:", err);
        return sendError(res, "Server error", 500);
    }
}

/**
 * POST /auth/logout (UNCHANGED)
 */
export async function logoutController(req, res) {
    try {
        const { refreshToken } = req.body;

        if (refreshToken) {
            await Admin.updateOne(
                { refreshToken },
                { refreshToken: null, refreshTokenExpiresAt: null }
            );
        }

        return sendSuccess(res, null, "Logged out successfully", 200);
    } catch (err) {
        console.error("LOGOUT ERROR:", err);
        return sendError(res, "Server error", 500);
    }
}
