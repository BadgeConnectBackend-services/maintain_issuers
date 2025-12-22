// src/middlewares/auth.middleware.js
import jwt from "jsonwebtoken";

export default function authMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized: No token provided",
            });
        }

        const token = authHeader.split(" ")[1];

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        req.admin = {
            adminId: decoded.adminId,
            email: decoded.email || null,
            mobile: decoded.mobile || null,
        };


        next();
    } catch (err) {
        console.error("JWT ERROR:", err);

        return res.status(401).json({
            success: false,
            message: "Unauthorized: Invalid or expired token",
        });
    }
}
