// src/models/issuer.model.js

import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const adminDetailsSchema = new mongoose.Schema(
    {
        firstName: String,
        lastName: String,
        email: String,
        orgDept: String,
    },
    { _id: false }
);

const primaryContactSchema = new mongoose.Schema(
    {
        firstName: String,
        lastName: String,
        email: String,
        phone: String,
    },
    { _id: false }
);

const issuerSchema = new mongoose.Schema(
    {
        // ✅ PUBLIC IDENTIFIER (UUID)
        issuerId: {
            type: String,
            required: true,
            unique: true,
            index: true,
            default: uuidv4,
            immutable: true,
        },

        orgName: { type: String, required: true },
        postal: { type: String, required: true },
        website: { type: String, required: true },

        orgEmail: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },

        primaryContact: primaryContactSchema,

        supportEmail: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
        },

        apiAuthKey: {
            type: String,
            default: "",
            select: false,
        },

        admin1: adminDetailsSchema,
        admin2: adminDetailsSchema,
        admin3: adminDetailsSchema,

        // ✅ AUDIT FIELDS
        addedByAdmin: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
            immutable: true, // 🔒 cannot be changed after creation
        },

        lastUpdatedBy: {
            type: String,
            default: null,
            lowercase: true,
            trim: true,
        },

        isDeleted: { type: Boolean, default: false },
    },
    { timestamps: true }
);

export default mongoose.model("Issuer", issuerSchema);
