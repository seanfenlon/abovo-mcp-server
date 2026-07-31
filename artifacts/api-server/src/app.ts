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

// Order matters. staticPagesRouter has a catch-all that answers /mcp with the
// landing page, which silently shadowed the MCP endpoint: clients POSTing to
// /mcp got 21 KB of HTML instead of a JSON-RPC response. Mount the MCP router
// first so the publicly advertised path actually speaks MCP.
app.use(mcpRouter);
app.use(staticPagesRouter);
app.use("/api", mcpRouter);
app.use("/api", router);

export default app;
