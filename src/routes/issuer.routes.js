// src/routes/issuer.routes.js


import express from "express";
import {
    createIssuer,
    getIssuers,
    getIssuerById,
    updateIssuer,
    deleteIssuer,
    resendOrgEmailVerification,
} from "../controllers/issuer.controller.js";

import authMiddleware from "../middlewares/auth.middleware.js";

const router = express.Router();

// All issuer endpoints must be protected with JWT middleware

// Create new issuer
router.post("/", authMiddleware, createIssuer);

// Get all issuers
router.get("/", authMiddleware, getIssuers);

// Get issuer by ID
router.get("/:id", authMiddleware, getIssuerById);

// Update issuer
router.put("/:id", authMiddleware, updateIssuer);

// Resend org email verification
router.post("/:id/resend-org-email-verification", authMiddleware, resendOrgEmailVerification);

// Soft delete issuer
router.delete("/:id", authMiddleware, deleteIssuer);

export default router;
