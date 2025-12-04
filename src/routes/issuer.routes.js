import express from "express";
import {
    createIssuer,
    getAllIssuers,
    getIssuerById,
    updateIssuer,
    deleteIssuer,
} from "../controllers/issuer.controller.js";

const router = express.Router();

// CREATE
router.post("/", createIssuer);

// READ ALL
router.get("/", getAllIssuers);

// READ ONE
router.get("/:id", getIssuerById);

// UPDATE (partial allowed)
router.put("/:id", updateIssuer);

// SOFT DELETE
router.delete("/:id", deleteIssuer);

export default router;
