import jwt from "jsonwebtoken";

export default function authMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer")) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized: No token provided",
            });
        }

        const token = authHeader.split(" ")[1];

        // Validate token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Attach admin data to request
        req.admin = {
            id: decoded.adminId,
            emailOrMobile: decoded.emailOrMobile,
        };

        next(); // continue to controller
    } catch (err) {
        console.error("JWT ERROR:", err);

        return res.status(401).json({
            success: false,
            message: "Unauthorized: Invalid or expired token",
        });
    }
}
