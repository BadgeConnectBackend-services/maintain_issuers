import express from "express";
import dotenv from "dotenv";
import cors from "cors";

import { connectDB } from "./config/db.js";
import issuerRoutes from "./routes/issuer.routes.js";
import authRoutes from "./routes/auth.routes.js"; // <-- NEW

dotenv.config();

if (!process.env.JWT_SECRET) {
    console.error("❌ ERROR: JWT_SECRET is missing in .env");
    process.exit(1);
}

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Connect database
connectDB();

// Auth routes (must come BEFORE protected routes)
app.use("/auth", authRoutes);

// Protected routes
app.use("/issuer", issuerRoutes);

app.get("/", (req, res) => {
    res.send("Issuer API + Admin Auth Service Running");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});
