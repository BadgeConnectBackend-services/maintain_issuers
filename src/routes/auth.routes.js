// src/routes/auth.routes.js

import express from "express";
import Admin from "../models/admin.model.js";
import jwt from "jsonwebtoken";
import { sendSuccess, sendError } from "../utils/apiResponse.js";

const router = express.Router();

// -------------------------------------------------------
// Helper: Generate 6-digit OTP
// -------------------------------------------------------
function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// -------------------------------------------------------
// POST /auth/send-otp
// Step 1: Admin enters email/mobile → backend generates OTP
// -------------------------------------------------------
router.post("/send-otp", async (req, res) => {
    try {
        const { emailOrMobile } = req.body;

        if (!emailOrMobile) {
            return sendError(res, "Email or mobile is required", 400);
        }

        // Admin must already exist (NO auto-create)
        const admin = await Admin.findOne({ emailOrMobile });

        if (!admin) {
            return sendError(res, "Admin not registered", 404);
        }

        const otp = generateOtp();
        const otpExpiresAt = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes validity

        admin.otp = otp;
        admin.otpExpiresAt = otpExpiresAt;
        await admin.save();

        return sendSuccess(
            res,
            {
                otp, // visible only in dev mode — remove in production
            },
            "OTP generated successfully",
            200
        );

    } catch (err) {
        console.error("SEND OTP ERROR:", err);
        return sendError(res, "Server error while generating OTP", 500);
    }
});

// -------------------------------------------------------
// POST /auth/verify-otp
// Step 2: Validate OTP → create JWT token
// -------------------------------------------------------
router.post("/verify-otp", async (req, res) => {
    try {
        const { emailOrMobile, otp } = req.body;

        if (!emailOrMobile || !otp) {
            return sendError(res, "Email/mobile and OTP are required", 400);
        }

        const admin = await Admin.findOne({ emailOrMobile });

        if (!admin) {
            return sendError(res, "Admin not registered", 404);
        }

        // 1️⃣ Check OTP expiry FIRST
        if (!admin.otpExpiresAt || admin.otpExpiresAt < new Date()) {
            return sendError(res, "OTP expired", 400);
        }

        // 2️⃣ Then check OTP value
        if (admin.otp !== otp) {
            return sendError(res, "Invalid OTP", 400);
        }

        // OTP is valid → generate JWT token
        const token = jwt.sign(
            {
                adminId: admin._id,
                emailOrMobile: admin.emailOrMobile,
            },
            process.env.JWT_SECRET,
            { expiresIn: "6h" } // adjustable
        );

        // Clear OTP after login
        admin.otp = null;
        admin.otpExpiresAt = null;
        await admin.save();

        return sendSuccess(
            res,
            {
                token,
                admin: {
                    id: admin._id,
                    emailOrMobile: admin.emailOrMobile,
                    firstName: admin.firstName || "",
                    lastName: admin.lastName || "",
                },
            },
            "Login successful",
            200
        );

    } catch (err) {
        console.error("VERIFY OTP ERROR:", err);
        return sendError(res, "Server error while verifying OTP", 500);
    }
});

export default router;
