import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import issuerRoutes from "./routes/issuer.routes.js";
import { connectDB } from "./config/db.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// Connect DB
connectDB();

// Routes
app.use("/issuer", issuerRoutes);

app.get("/", (req, res) => {
    res.send("Issuer API Service Running");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
