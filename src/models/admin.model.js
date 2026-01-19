// src/models/admin.model.js
import mongoose from "mongoose";

// admin schema for mongodb
const adminSchema = new mongoose.Schema(
    {
        firstName: { type: String, required: true },
        lastName: { type: String, required: true },

        email: { type: String, unique: true, sparse: true },
        mobile: { type: String, unique: true, sparse: true },

        // 🔥 Refresh token (KEEP)
        refreshToken: { type: String },
        refreshTokenExpiresAt: { type: Date },

        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

export default mongoose.model("Admin", adminSchema);
