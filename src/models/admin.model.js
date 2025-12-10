// src/models/admin.model.js
import mongoose from "mongoose";

const adminSchema = new mongoose.Schema(
    {
        firstName: { type: String, required: true },
        lastName: { type: String, required: true },

        // Can have only email, only mobile or both
        email: { type: String, unique: true, sparse: true },
        mobile: { type: String, unique: true, sparse: true },

        // OTP login
        otp: { type: String },
        otpExpiresAt: { type: Date },

        // 🔥 Refresh token (for silent login)
        refreshToken: { type: String },
        refreshTokenExpiresAt: { type: Date },

        isActive: { type: Boolean, default: true },
    },
    { timestamps: true } // adds createdAt, updatedAt
);

export default mongoose.model("Admin", adminSchema);
