// src/controllers/issuer.controller.js
import mongoose from "mongoose";
import Issuer from "../models/issuer.model.js";
import { sendSuccess, sendError } from "../utils/apiResponse.js";

function normalizeAdmin(admin = {}) {
    if (!admin || typeof admin !== "object") admin = {};
    return {
        firstName: admin.firstName || "",
        lastName: admin.lastName || "",
        email: admin.email || "",
        orgDept: admin.orgDept || "",
    };
}

function normalizePrimaryContact(pc = {}) {
    if (!pc || typeof pc !== "object") pc = {};
    return {
        firstName: pc.firstName || "",
        lastName: pc.lastName || "",
        email: pc.email || "",
        phone: pc.phone || "",
    };
}

function normalizeIssuerDoc(doc) {
    if (!doc) return null;
    // Mongoose document or plain object
    const obj = doc.toObject ? doc.toObject() : { ...doc };

    return {
        _id: obj._id?.toString(),
        orgName: obj.orgName || "",
        postal: obj.postal || "",
        website: obj.website || "",
        orgEmail: obj.orgEmail || "",
        primaryContact: normalizePrimaryContact(obj.primaryContact),
        supportEmail: obj.supportEmail || "",
        admin1: normalizeAdmin(obj.admin1),
        admin2: normalizeAdmin(obj.admin2),
        admin3: normalizeAdmin(obj.admin3),
        isDeleted: !!obj.isDeleted,
        createdAt: obj.createdAt,
        updatedAt: obj.updatedAt,
    };
}

function normalizeIssuerPayload(body) {
    return {
        orgName: body.orgName,
        postal: body.postal,
        website: body.website,
        orgEmail: body.orgEmail,
        primaryContact: normalizePrimaryContact(body.primaryContact),
        supportEmail: body.supportEmail,
        admin1: normalizeAdmin(body.admin1),
        admin2: normalizeAdmin(body.admin2),
        admin3: normalizeAdmin(body.admin3),
    };
}

// POST /issuer
export async function createIssuer(req, res) {
    try {
        const payload = normalizeIssuerPayload(req.body);

        const issuer = await Issuer.create(payload);
        const normalized = normalizeIssuerDoc(issuer);

        return sendSuccess(res, normalized, "Issuer created successfully", 201);
    } catch (err) {
        console.error("CREATE ISSUER ERROR:", err);

        // duplicate orgEmail, validation, etc.
        if (err.code === 11000 && err.keyPattern?.orgEmail) {
            return sendError(res, "Organization email already exists", 400);
        }

        return sendError(res, err.message || "Failed to create issuer", 500);
    }
}

// GET /issuer  (list non-deleted)
export async function getIssuers(req, res) {
    try {
        const issuers = await Issuer.find({ isDeleted: false }).sort({ createdAt: -1 }).lean();
        const normalized = issuers.map(normalizeIssuerDoc);
        return sendSuccess(res, normalized, "Issuers fetched successfully", 200);
    } catch (err) {
        console.error("GET ISSUERS ERROR:", err);
        return sendError(res, "Failed to fetch issuers", 500);
    }
}

// GET /issuer/:id  (single non-deleted)
export async function getIssuerById(req, res) {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return sendError(res, "Invalid issuer ID", 400);
        }

        const issuer = await Issuer.findOne({ _id: id, isDeleted: false });

        if (!issuer) {
            return sendError(res, "Issuer not found", 404);
        }

        const normalized = normalizeIssuerDoc(issuer);
        return sendSuccess(res, normalized, "Issuer fetched successfully", 200);
    } catch (err) {
        console.error("GET ISSUER BY ID ERROR:", err);
        return sendError(res, "Failed to fetch issuer", 500);
    }
}

// PUT /issuer/:id  (update non-deleted)
export async function updateIssuer(req, res) {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return sendError(res, "Invalid issuer ID", 400);
        }

        const existing = await Issuer.findOne({ _id: id, isDeleted: false });

        if (!existing) {
            return sendError(res, "Issuer not found", 404);
        }

        const payload = normalizeIssuerPayload(req.body);

        Object.assign(existing, payload);
        await existing.save();

        const normalized = normalizeIssuerDoc(existing);
        return sendSuccess(res, normalized, "Issuer updated successfully", 200);
    } catch (err) {
        console.error("UPDATE ISSUER ERROR:", err);
        return sendError(res, err.message || "Failed to update issuer", 500);
    }
}

// DELETE /issuer/:id  (soft delete)
export async function deleteIssuer(req, res) {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return sendError(res, "Invalid issuer ID", 400);
        }

        const issuer = await Issuer.findById(id);

        if (!issuer) {
            return sendError(res, "Issuer not found", 404);
        }

        if (issuer.isDeleted) {
            // Option A: treat as already deleted (can be either success or error)
            return sendError(res, "Issuer already deleted", 400);
        }

        issuer.isDeleted = true;
        await issuer.save();

        return sendSuccess(res, null, "Issuer deleted successfully", 200);
    } catch (err) {
        console.error("DELETE ISSUER ERROR:", err);
        return sendError(res, "Failed to delete issuer", 500);
    }
}
