// src/server.js

import "./env.js"; // MUST be first

import express from "express";
import cors from "cors";

import { connectDB } from "./config/db.js";
import authRoutes from "./routes/auth.routes.js";
import issuerRoutes from "./routes/issuer.routes.js";

const required = [
    "MONGO_URI",
    "JWT_SECRET",
    "USER_SERVICE_URL",
    "INTERNAL_SERVICE_SECRET",
];
for (const key of required) {
    if (!process.env[key]) {
        console.error(`❌ Missing required env var: ${key}`);
    process.exit(1);
  }
}

const app = express();
app.use(cors());
app.use(express.json());

connectDB();

app.use("/auth", authRoutes);
app.use("/issuer", issuerRoutes);

app.get("/", (req, res) => {
    res.send("✅ maintain_issuers backend running");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});