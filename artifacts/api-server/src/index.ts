import app from "./app";
import { SERVER_VERSION } from "./lib/version";
import { logEvent } from "./lib/telemetry";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
  logEvent("server_init", { version: SERVER_VERSION, port });
});
