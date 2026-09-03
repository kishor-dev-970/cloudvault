import express from "express";
import cors from "cors";
import { env } from "./config.js";
import { authRouter } from "./routes/auth.js";
import { connectRouter } from "./routes/connect.js";
import { filesRouter } from "./routes/files.js";

const app = express();

app.use(
  cors({
    origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(","),
  })
);
app.use(express.json({ limit: "12mb" }));

app.use((req, _res, next) => {
  console.log(`[req] ${req.method} ${req.originalUrl}`);
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRouter);
app.use("/api/connect", connectRouter);
app.use("/api/files", filesRouter);

app.listen(env.PORT, () => {
  console.log(`CloudVault server listening on http://localhost:${env.PORT}`);
});
