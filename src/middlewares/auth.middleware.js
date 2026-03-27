// src/middlewares/auth.middleware.js



import jwt from "jsonwebtoken";
import { sendError } from "../utils/apiResponse.js";

export default function authMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return sendError(res, "Unauthorized: No token provided", 401);
      }

      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // New token payload shape from badgeconnect_user:
      // { userId, orgId, profileId, email, mobile, scopes, loginScope }
      if (decoded.loginScope !== "admin") {
        return sendError(res, "Unauthorized: Invalid token scope", 401);
      }

      req.admin = {
        userId: decoded.userId,
        orgId: decoded.orgId || null,
        email: decoded.email || null,
        phone: decoded.phone || null,
        scopes: decoded.scopes,
        loginScope: decoded.loginScope,
      };

      next();
    } catch (err) {
      console.error("❌ JWT ERROR:", err.message);
      return sendError(res, "Unauthorized: Invalid or expired token", 401);
    }
}
