const express = require("express");
const cors = require("cors");
const { errorHandler } = require("./middleware/errorHandler");
const { generalLimiter, authLimiter } = require("./middleware/rateLimit");

const authRoutes = require("./routes/auth");
const tripRoutes = require("./routes/trips");
const driverRoutes = require("./routes/drivers");
const vehicleRoutes = require("./routes/vehicles");
const paymentRoutes = require("./routes/payments");
const supportRoutes = require("./routes/support");
const safetyRoutes = require("./routes/safety");
const ratingRoutes = require("./routes/ratings");
const adminRoutes = require("./routes/admin");
const placesRoutes = require("./routes/places");

const app = express();

app.use(cors());
app.use(express.json({ limit: "12mb" })); // room for base64 driver documents
app.use(generalLimiter);

app.get("/health", (req, res) => res.json({ status: "ok", service: "spring-backend" }));

app.use("/api/v1/auth", authLimiter, authRoutes);
app.use("/api/v1/trips", tripRoutes);
app.use("/api/v1/drivers", driverRoutes);
app.use("/api/v1/vehicles", vehicleRoutes);
app.use("/api/v1/payments", paymentRoutes);
app.use("/api/v1/support", supportRoutes);
app.use("/api/v1/safety", safetyRoutes);
app.use("/api/v1/ratings", ratingRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/places", placesRoutes);

app.use((req, res) => res.status(404).json({ error: "Not found" }));
app.use(errorHandler); // must be registered last

module.exports = app;
