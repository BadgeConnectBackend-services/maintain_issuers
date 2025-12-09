// src/routes/issuer.routes.js
import express from "express";
import {
    createIssuer,
    getIssuers,
    getIssuerById,
    updateIssuer,
    deleteIssuer,
} from "../controllers/issuer.controller.js";

const router = express.Router();

// Create new issuer
router.post("/", createIssuer);

// Get all issuers
router.get("/", getIssuers);

// Get issuer by ID
router.get("/:id", getIssuerById);

// Update issuer
router.put("/:id", updateIssuer);

// Soft delete issuer
router.delete("/:id", deleteIssuer);

export default router;
