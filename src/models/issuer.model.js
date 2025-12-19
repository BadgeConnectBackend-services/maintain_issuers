// src/models/issuer.model.js


import mongoose from "mongoose";

const adminDetailsSchema = new mongoose.Schema({
    firstName: String,
    lastName: String,
    email: String,
    orgDept: String,
});

const primaryContactSchema = new mongoose.Schema({
    firstName: String,
    lastName: String,
    email: String,
    phone: String,
});

const issuerSchema = new mongoose.Schema(
    {
        orgName: { type: String, required: true },
        postal: { type: String, required: true },
        website: { type: String, required: true },
        orgEmail: { type: String, required: true, unique: true },

        primaryContact: primaryContactSchema,

        supportEmail: { type: String, required: true },
        apiAuthKey: {
            type: String,
            default: "",      // 👈 THIS IS THE KEY
            select: false,    // keep it hidden
        },


        admin1: adminDetailsSchema,
        admin2: adminDetailsSchema,
        admin3: adminDetailsSchema,



        isDeleted: { type: Boolean, default: false },

        createdAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

export default mongoose.model("Issuer", issuerSchema);
