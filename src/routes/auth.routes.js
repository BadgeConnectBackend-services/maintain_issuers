// src/routes/auth.routes.js
import express from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import Admin from "../models/admin.model.js";
import { sendSuccess, sendError } from "../utils/apiResponse.js";

const router = express.Router();

// ====== TOKEN SETTINGS ======
const ACCESS_TOKEN_EXPIRY = "1h"; // JWT validity
const REFRESH_TOKEN_LIFETIME_MS = 2 * 24 * 60 * 60 * 1000; // 2 days

// ====== HELPERS ======

// 6-digit OTP
function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// random refresh token
function generateRefreshToken() {
    return crypto.randomBytes(32).toString("hex");
}

// Find admin by email OR mobile
async function findAdminByIdentifier(identifier) {
    const value = (identifier || "").trim();
    if (!value) return null;

    const isEmail = value.includes("@");

    const query = {
        isActive: true,
        ...(isEmail ? { email: value } : { mobile: value }),
    };

    return Admin.findOne(query);
}

// ====== SEND OTP ======
// POST /auth/send-otp
router.post("/send-otp", async (req, res) => {
    try {
        const { emailOrMobile } = req.body;
        const identifier = (emailOrMobile || "").trim();

        if (!identifier) {
            return sendError(res, "Email or mobile is required", 400);
        }

        const admin = await findAdminByIdentifier(identifier);

        if (!admin) {
            return sendError(res, "Admin not registered", 404);
        }

        const otp = generateOtp();
        const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min

        admin.otp = otp;
        admin.otpExpiresAt = otpExpiresAt;
        await admin.save();

        // For development only – return OTP in response
        return sendSuccess(res, { otp }, "OTP generated successfully", 200);
    } catch (err) {
        console.error("SEND OTP ERROR:", err);
        return sendError(res, "Server error while generating OTP", 500);
    }
});

// ====== VERIFY OTP + ISSUE TOKENS ======
// POST /auth/verify-otp
router.post("/verify-otp", async (req, res) => {
    try {
        const { emailOrMobile, otp } = req.body;
        const identifier = (emailOrMobile || "").trim();
        const submittedOtp = (otp || "").trim();

        if (!identifier || !submittedOtp) {
            return sendError(res, "Email/mobile and OTP are required", 400);
        }

        const admin = await findAdminByIdentifier(identifier);

        if (!admin) {
            return sendError(res, "Admin not registered", 404);
        }

        // Check OTP
        if (!admin.otp || admin.otp !== submittedOtp) {
            return sendError(res, "Invalid OTP", 400);
        }

        // Check OTP expiry
        if (!admin.otpExpiresAt || admin.otpExpiresAt < new Date()) {
            return sendError(res, "OTP expired", 400);
        }

        if (!process.env.JWT_SECRET) {
            console.error("JWT_SECRET missing");
            return sendError(res, "Server configuration error", 500);
        }

        // ✅ ACCESS TOKEN
        const accessToken = jwt.sign(
            {
                adminId: admin._id,
                email: admin.email || null,
                mobile: admin.mobile || null,
            },
            process.env.JWT_SECRET,
            { expiresIn: ACCESS_TOKEN_EXPIRY }
        );

        // 🔁 REFRESH TOKEN (2 days)
        const refreshToken = generateRefreshToken();
        const refreshTokenExpiresAt = new Date(
            Date.now() + REFRESH_TOKEN_LIFETIME_MS
        );

        admin.refreshToken = refreshToken;
        admin.refreshTokenExpiresAt = refreshTokenExpiresAt;

        // clear OTP after successful login
        admin.otp = null;
        admin.otpExpiresAt = null;

        await admin.save();

        const responseData = {
            accessToken,
            refreshToken,
            admin: {
                id: admin._id,
                firstName: admin.firstName,
                lastName: admin.lastName,
                email: admin.email || null,
                mobile: admin.mobile || null,
            },
        };

        return sendSuccess(res, responseData, "Login successful", 200);
    } catch (err) {
        console.error("VERIFY OTP ERROR:", err);
        return sendError(res, "Server error while verifying OTP", 500);
    }
});

// ====== REFRESH TOKEN ======
// POST /auth/refresh-token
router.post("/refresh-token", async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return sendError(res, "Refresh token is required", 400);
        }

        const admin = await Admin.findOne({ refreshToken, isActive: true });

        if (!admin) {
            return sendError(res, "Invalid refresh token", 401);
        }

        // Check expiry
        if (
            !admin.refreshTokenExpiresAt ||
            admin.refreshTokenExpiresAt < new Date()
        ) {
            // clear dead token
            admin.refreshToken = null;
            admin.refreshTokenExpiresAt = null;
            await admin.save();

            return sendError(res, "Refresh token expired", 401);
        }

        if (!process.env.JWT_SECRET) {
            console.error("JWT_SECRET missing");
            return sendError(res, "Server configuration error", 500);
        }

        // New access token
        const newAccessToken = jwt.sign(
            {
                adminId: admin._id,
                email: admin.email || null,
                mobile: admin.mobile || null,
            },
            process.env.JWT_SECRET,
            { expiresIn: ACCESS_TOKEN_EXPIRY }
        );

        // Rotate refresh token (best practice)
        const newRefreshToken = generateRefreshToken();
        const newRefreshExpiresAt = new Date(
            Date.now() + REFRESH_TOKEN_LIFETIME_MS
        );

        admin.refreshToken = newRefreshToken;
        admin.refreshTokenExpiresAt = newRefreshExpiresAt;

        await admin.save();

        const responseData = {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
            admin: {
                id: admin._id,
                firstName: admin.firstName,
                lastName: admin.lastName,
                email: admin.email || null,
                mobile: admin.mobile || null,
            },
        };

        return sendSuccess(res, responseData, "Token refreshed", 200);
    } catch (err) {
        console.error("REFRESH TOKEN ERROR:", err);
        return sendError(res, "Server error while refreshing token", 500);
    }
});

// ====== LOGOUT ======
// POST /auth/logout
router.post("/logout", async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return sendError(res, "Refresh token is required", 400);
        }

        const admin = await Admin.findOne({ refreshToken });

        if (admin) {
            admin.refreshToken = null;
            admin.refreshTokenExpiresAt = null;
            await admin.save();
        }

        // Even if admin not found, respond success to avoid leaking info
        return sendSuccess(res, null, "Logged out successfully", 200);
    } catch (err) {
        console.error("LOGOUT ERROR:", err);
        return sendError(res, "Server error while logging out", 500);
    }
});

export default router;
