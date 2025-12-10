// src/routes/auth.routes.js
import express from "express";
import jwt from "jsonwebtoken";
import Admin from "../models/admin.model.js";
import { sendSuccess, sendError } from "../utils/apiResponse.js";

const router = express.Router();

// Helper: generate 6-digit OTP
function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Helper: find admin by identifier (email OR mobile)
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

// =======================================================
//  POST /auth/send-otp
//  Step 1: Admin enters email or mobile → send OTP
// =======================================================
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
        const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        admin.otp = otp;
        admin.otpExpiresAt = otpExpiresAt;
        await admin.save();

        // For now we return OTP in response (dev mode)
        return sendSuccess(
            res,
            { otp },
            "OTP generated successfully",
            200
        );
    } catch (err) {
        console.error("SEND OTP ERROR:", err);
        return sendError(res, "Server error while generating OTP", 500);
    }
});

// =======================================================
//  POST /auth/verify-otp
//  Step 2: Admin enters OTP → validate → return JWT
// =======================================================
router.post("/verify-otp", async (req, res) => {
    try {
        const { emailOrMobile, otp } = req.body;

        const identifier = (emailOrMobile || "").trim();
        const submittedOtp = (otp || "").trim();

        if (!identifier || !submittedOtp) {
            return sendError(
                res,
                "Email/mobile and OTP are required",
                400
            );
        }

        const admin = await findAdminByIdentifier(identifier);

        if (!admin) {
            return sendError(res, "Admin not registered", 404);
        }

        // Check OTP match
        if (!admin.otp || admin.otp !== submittedOtp) {
            return sendError(res, "Invalid OTP", 400);
        }

        // Check expiry
        if (!admin.otpExpiresAt || admin.otpExpiresAt < new Date()) {
            return sendError(res, "OTP expired", 400);
        }

        // OTP is valid → generate JWT
        if (!process.env.JWT_SECRET) {
            console.error("JWT_SECRET missing in environment");
            return sendError(res, "Server configuration error", 500);
        }

        const token = jwt.sign(
            {
                adminId: admin._id,
                email: admin.email || null,
                mobile: admin.mobile || null,
            },
            process.env.JWT_SECRET,
            { expiresIn: "1h" } // as per your choice
        );

        // Clear OTP after successful login
        admin.otp = null;
        admin.otpExpiresAt = null;
        await admin.save();

        const responseData = {
            token,
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

export default router;
