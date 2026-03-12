import express, { type Express } from "express";
import cors from "cors";
import router from "./routes";
import staticPagesRouter from "./routes/static-pages";
import mcpRouter from "./routes/mcp";

const app: Express = express();

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "mcp-session-id"],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(staticPagesRouter);
app.use(mcpRouter);
app.use("/api", mcpRouter);
app.use("/api", router);

export default app;
