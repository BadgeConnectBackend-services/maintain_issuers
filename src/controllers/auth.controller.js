// src/controllers/auth.controller.js

import jwt from "jsonwebtoken";
import crypto from "crypto";
import Admin from "../models/admin.model.js";
import { sendSuccess, sendError } from "../utils/apiResponse.js";

/**
 * Generate JWT access token (1 MIN for testing)
 */
function generateAccessToken(admin) {
    const token = jwt.sign(
        {
            adminId: admin._id.toString(), // ✅ FIXED
            email: admin.email || null,
            mobile: admin.mobile || null,
        },
        process.env.JWT_SECRET,
        { expiresIn: "30m" } // 🔥 1 MIN
    );

    const decoded = jwt.decode(token);

    // console.log("🟢 ACCESS TOKEN GENERATED");
    // console.log("   Token:", token);
    // console.log("   Expires At:", new Date(decoded.exp * 1000).toISOString());

    return token;
}

function generateRefreshToken() {
    return crypto.randomBytes(32).toString("hex");
}

const REFRESH_TOKEN_LIFETIME_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * POST /auth/admin-exists
 */
export async function adminExistsController(req, res) {
    try {
        const { identifier } = req.body;
        if (!identifier) return sendError(res, "Identifier is required", 400);

        const normalized = identifier.trim().toLowerCase();

        const admin = await Admin.findOne({
            isActive: true,
            $or: [{ email: normalized }, { mobile: normalized }],
        }).select("_id");

        return sendSuccess(res, { exists: !!admin }, "Admin existence checked");
    } catch (err) {
        console.error("ADMIN EXISTS ERROR:", err);
        return sendError(res, "Server error", 500);
    }
}

/**
 * POST /auth/login
 */
export async function loginController(req, res) {
    try {
        const { identifier } = req.body;
        if (!identifier) return sendError(res, "Identifier is required", 400);

        const normalized = identifier.trim().toLowerCase();

        const admin = await Admin.findOne({
            isActive: true,
            $or: [{ email: normalized }, { mobile: normalized }],
        });

        if (!admin) return sendError(res, "Admin not registered", 403);

        const accessToken = generateAccessToken(admin);
        const refreshToken = generateRefreshToken();

        admin.refreshToken = refreshToken;
        admin.refreshTokenExpiresAt = new Date(
            Date.now() + REFRESH_TOKEN_LIFETIME_MS
        );
        await admin.save();

        // console.log("🔵 LOGIN SUCCESS");
        // console.log("   Refresh Token:", refreshToken);

        return sendSuccess(res, {
            accessToken,
            refreshToken,
            admin: {
                id: admin._id,
                firstName: admin.firstName,
                lastName: admin.lastName,
                email: admin.email,
                mobile: admin.mobile,
            },
        });
    } catch (err) {
        console.error("LOGIN ERROR:", err);
        return sendError(res, "Login failed", 500);
    }
}

/**
 * POST /auth/refresh-token
 */
export async function refreshTokenController(req, res) {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) return sendError(res, "Refresh token required", 400);

        // console.log("🟠 REFRESH TOKEN REQUEST");
        // console.log("   Incoming Refresh Token:", refreshToken);

        const admin = await Admin.findOne({ refreshToken, isActive: true });

        if (
            !admin ||
            !admin.refreshTokenExpiresAt ||
            admin.refreshTokenExpiresAt < new Date()
        ) {
            console.log("🔴 INVALID REFRESH TOKEN");
            return sendError(res, "Invalid refresh token", 401);
        }

        const newAccessToken = generateAccessToken(admin);
        const newRefreshToken = generateRefreshToken();

        admin.refreshToken = newRefreshToken;
        admin.refreshTokenExpiresAt = new Date(
            Date.now() + REFRESH_TOKEN_LIFETIME_MS
        );
        await admin.save();

        // console.log("🟢 TOKEN REFRESHED");
        // console.log("   New Refresh Token:", newRefreshToken);

        return sendSuccess(res, {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
        });
    } catch (err) {
        console.error("REFRESH TOKEN ERROR:", err);
        return sendError(res, "Server error", 500);
    }
}

/**
 * POST /auth/logout
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
        return sendSuccess(res, null, "Logged out");
    } catch (err) {
        return sendError(res, "Server error", 500);
    }
}
