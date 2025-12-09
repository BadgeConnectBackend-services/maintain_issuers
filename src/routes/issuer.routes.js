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

// Add new issuer
router.post("/issuer", createIssuer);

//Get all issuers
router.get("/issuer", getIssuers);

// Get, issuer by ID
router.get("/issuer/:id", getIssuerById);

// Update issuer details
router.put("/issuer/:id", updateIssuer);

// Soft delete issuer
router.delete("/issuer/:id", deleteIssuer);

export default router;
