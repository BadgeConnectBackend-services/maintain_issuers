// src/models/admin.model.js
import mongoose from "mongoose";

const adminSchema = new mongoose.Schema(
    {
        firstName: { type: String, required: true },
        lastName: { type: String, required: true },

        // Either email OR mobile (or both) can exist
        // We use unique + sparse so many docs can have null email/mobile
        email: {
            type: String,
            unique: true,
            sparse: true, // uniqueness only enforced when value exists
            trim: true,
        },
        mobile: {
            type: String,
            unique: true,
            sparse: true,
            trim: true,
        },

        otp: { type: String },        // temporary OTP (string to preserve leading zeros)
        otpExpiresAt: { type: Date }, // OTP expiry time

        isActive: { type: Boolean, default: true },
    },
    { timestamps: true } // createdAt, updatedAt
);

// NOTE:
// - You must manually ensure that for each admin, at least ONE of (email, mobile) is set.
// - Backend login logic will handle matching by either email or mobile.
export default mongoose.model("Admin", adminSchema);
