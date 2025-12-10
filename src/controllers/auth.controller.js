// src/controllers/auth.controller.js

import Admin from "../models/admin.model.js";
import { sendSuccess, sendError } from "../utils/apiResponse.js";
import jwt from "jsonwebtoken";

/**
 * Utility: Generate a 6-digit OTP
 */
function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * POST /auth/send-otp
 * Step 1 — Admin enters emailOrMobile → backend checks admin exists → generates OTP → saves → returns message + OTP (temporarily)
 */
export async function sendOtp(req, res) {
    try {
        const { emailOrMobile } = req.body;

        if (!emailOrMobile) {
            return sendError(res, "Email or mobile is required", 400);
        }

        // 1️⃣ Check admin exists
        const admin = await Admin.findOne({ emailOrMobile });

        if (!admin) {
            // Admin must be manually created by super admin (your rule)
            return sendError(res, "Admin not found", 404);
        }

        // 2️⃣ Generate OTP
        const otp = generateOtp();
        const expiry = new Date(Date.now() + 5 * 60 * 1000); // valid for 5 minutes

        // 3️⃣ Store OTP in DB
        admin.otp = otp;
        admin.otpExpiresAt = expiry;
        await admin.save();

        // 4️⃣ Return OTP (TEMPORARY only for debug)
        return sendSuccess(
            res,
            { otp }, // remove in production
            "OTP generated successfully",
            200
        );
    } catch (err) {
        console.error("SEND OTP ERROR:", err);
        return sendError(res, "Failed to send OTP", 500);
    }
}

/**
 * POST /auth/verify-otp
 * Step 2 — Admin enters OTP → backend verifies → generates JWT → clears OTP
 */
export async function verifyOtp(req, res) {
    try {
        const { emailOrMobile, otp } = req.body;

        if (!emailOrMobile || !otp) {
            return sendError(res, "Email/Mobile and OTP are required", 400);
        }

        // 1️⃣ Find admin
        const admin = await Admin.findOne({ emailOrMobile });

        if (!admin) {
            return sendError(res, "Admin not found", 404);
        }

        // 2️⃣ Check OTP exists
        if (!admin.otp || !admin.otpExpiresAt) {
            return sendError(res, "OTP not generated. Please request again.", 400);
        }

        // 3️⃣ Check expiry
        if (admin.otpExpiresAt < new Date()) {
            return sendError(res, "OTP expired. Request a new one.", 400);
        }

        // 4️⃣ Check OTP match
        if (admin.otp !== otp) {
            return sendError(res, "Invalid OTP", 400);
        }

        // 5️⃣ Generate JWT token
        const token = jwt.sign(
            {
                id: admin._id,
                emailOrMobile: admin.emailOrMobile,
                firstName: admin.firstName,
                lastName: admin.lastName,
            },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );

        // 6️⃣ Clear OTP
        admin.otp = null;
        admin.otpExpiresAt = null;
        await admin.save();

        // 7️⃣ Return success + token + admin details
        return sendSuccess(res, { token, admin }, "OTP verified successfully", 200);
    } catch (err) {
        console.error("VERIFY OTP ERROR:", err);
        return sendError(res, "Failed to verify OTP", 500);
    }
}
