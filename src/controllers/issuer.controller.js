// src/controllers/issuer.controller.js

import Issuer from "../models/issuer.model.js";
import { sendSuccess, sendError } from "../utils/apiResponse.js";

/* ------------------------------------------------------------------
   Helper Normalizers
   These prevent null/undefined issues and stabilize API responses
------------------------------------------------------------------ */

function normalizeAdmin(admin = {}) {
    return {
        firstName: admin.firstName || "",
        lastName: admin.lastName || "",
        email: admin.email || "",
        orgDept: admin.orgDept || "",
    };
}

function normalizePrimaryContact(pc = {}) {
    return {
        firstName: pc.firstName || "",
        lastName: pc.lastName || "",
        email: pc.email || "",
        phone: pc.phone || "",
    };
}

/**
 * Normalize issuer document before sending response
 * IMPORTANT:
 * - Exposes issuerId (UUID)
 * - Never exposes Mongo _id
 */
function normalizeIssuerDoc(doc) {
    if (!doc) return null;

    const obj = doc.toObject ? doc.toObject() : { ...doc };

    return {
        issuerId: obj.issuerId, // ✅ UUID (public identifier)

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

/**
 * Normalize incoming request body for create/update
 * NOTE:
 * - issuerId is NEVER accepted from client
 */
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

/* ------------------------------------------------------------------
   CREATE ISSUER  (POST /issuer)
------------------------------------------------------------------ */
export async function createIssuer(req, res) {
    try {
        const payload = normalizeIssuerPayload(req.body);

        const issuer = await Issuer.create(payload);

        return sendSuccess(
            res,
            normalizeIssuerDoc(issuer),
            "Issuer created successfully",
            201
        );
    } catch (err) {
        console.error("CREATE ISSUER ERROR:", err);

        if (err.code === 11000 && err.keyPattern?.orgEmail) {
            return sendError(res, "Organization email already exists", 400);
        }

        return sendError(res, err.message || "Failed to create issuer", 500);
    }
}

/* ------------------------------------------------------------------
   GET ALL ISSUERS (GET /issuer)
------------------------------------------------------------------ */
export async function getIssuers(req, res) {
    try {
        const issuers = await Issuer.find({ isDeleted: false })
            .sort({ createdAt: -1 })
            .lean();

        const normalized = issuers.map(normalizeIssuerDoc);

        return sendSuccess(res, normalized, "Issuers fetched successfully", 200);
    } catch (err) {
        console.error("GET ISSUERS ERROR:", err);
        return sendError(res, "Failed to fetch issuers", 500);
    }
}

/* ------------------------------------------------------------------
   GET SINGLE ISSUER (GET /issuer/:id)
   :id === issuerId (UUID)
------------------------------------------------------------------ */
export async function getIssuerById(req, res) {
    try {
        const { id } = req.params;

        if (!id || typeof id !== "string") {
            return sendError(res, "Invalid issuer ID", 400);
        }

        const issuer = await Issuer.findOne({
            issuerId: id,
            isDeleted: false,
        });

        if (!issuer) {
            return sendError(res, "Issuer not found", 404);
        }

        return sendSuccess(
            res,
            normalizeIssuerDoc(issuer),
            "Issuer fetched successfully",
            200
        );
    } catch (err) {
        console.error("GET ISSUER ERROR:", err);
        return sendError(res, "Failed to fetch issuer", 500);
    }
}

/* ------------------------------------------------------------------
   UPDATE ISSUER (PUT /issuer/:id)
   :id === issuerId (UUID)
------------------------------------------------------------------ */
export async function updateIssuer(req, res) {
    try {
        const { id } = req.params;

        const existing = await Issuer.findOne({
            issuerId: id,
            isDeleted: false,
        });

        if (!existing) {
            return sendError(res, "Issuer not found", 404);
        }

        const payload = normalizeIssuerPayload(req.body);

        Object.assign(existing, payload);
        await existing.save();

        return sendSuccess(
            res,
            normalizeIssuerDoc(existing),
            "Issuer updated successfully",
            200
        );
    } catch (err) {
        console.error("UPDATE ISSUER ERROR:", err);
        return sendError(res, err.message || "Failed to update issuer", 500);
    }
}

/* ------------------------------------------------------------------
   DELETE ISSUER (DELETE /issuer/:id)
   Soft delete using issuerId (UUID)
------------------------------------------------------------------ */
export async function deleteIssuer(req, res) {
    try {
        const { id } = req.params;

        const issuer = await Issuer.findOne({ issuerId: id });

        if (!issuer) {
            return sendError(res, "Issuer not found", 404);
        }

        if (issuer.isDeleted) {
            return sendError(res, "Issuer already deleted", 400);
        }

        issuer.isDeleted = true;
        await issuer.save();

        return sendSuccess(
            res,
            { issuerId: id },
            "Issuer deleted successfully",
            200
        );
    } catch (err) {
        console.error("DELETE ISSUER ERROR:", err);
        return sendError(res, "Failed to delete issuer", 500);
    }
}
