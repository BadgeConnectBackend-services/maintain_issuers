import Issuer from "../models/issuer.model.js";

// CREATE Issuer (POST /issuer)
export const createIssuer = async (req, res) => {
    try {
        const issuer = await Issuer.create(req.body);
        res.status(201).json({
            success: true,
            data: issuer,
        });
    } catch (error) {
        console.error("Create Issuer Error:", error);

        // Handle unique email conflict
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: "orgEmail must be unique",
            });
        }

        res.status(500).json({
            success: false,
            message: "Server error while creating issuer",
        });
    }
};

// GET ALL Issuers (GET /issuer)
export const getAllIssuers = async (req, res) => {
    try {
        const issuers = await Issuer.find({ isDeleted: false }); // exclude deleted
        res.json({
            success: true,
            data: issuers,
        });
    } catch (error) {
        console.error("Get All Issuers Error:", error);
        res.status(500).json({
            success: false,
            message: "Server error while fetching issuers",
        });
    }
};

// GET Single Issuer (GET /issuer/:id)
export const getIssuerById = async (req, res) => {
    try {
        const issuer = await Issuer.findById(req.params.id);

        if (!issuer || issuer.isDeleted) {
            return res.status(404).json({
                success: false,
                message: "Issuer not found",
            });
        }

        res.json({
            success: true,
            data: issuer,
        });
    } catch (error) {
        console.error("Get Issuer Error:", error);
        res.status(500).json({
            success: false,
            message: "Server error while fetching issuer",
        });
    }
};

// UPDATE Issuer (PATCH-style inside PUT /issuer/:id)
export const updateIssuer = async (req, res) => {
    try {
        const updatedIssuer = await Issuer.findByIdAndUpdate(
            req.params.id,
            { $set: req.body }, // partial update
            { new: true, runValidators: true }
        );

        if (!updatedIssuer) {
            return res.status(404).json({
                success: false,
                message: "Issuer not found",
            });
        }

        res.json({
            success: true,
            data: updatedIssuer,
        });
    } catch (error) {
        console.error("Update Issuer Error:", error);
        res.status(500).json({
            success: false,
            message: "Server error while updating issuer",
        });
    }
};

// SOFT DELETE (DELETE /issuer/:id)
export const deleteIssuer = async (req, res) => {
    try {
        const issuer = await Issuer.findByIdAndUpdate(
            req.params.id,
            { isDeleted: true },
            { new: true }
        );

        if (!issuer) {
            return res.status(404).json({
                success: false,
                message: "Issuer not found",
            });
        }

        res.json({
            success: true,
            message: "Issuer soft-deleted successfully",
        });
    } catch (error) {
        console.error("Delete Issuer Error:", error);
        res.status(500).json({
            success: false,
            message: "Server error while deleting issuer",
        });
    }
};
