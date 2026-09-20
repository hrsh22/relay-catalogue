import { spawn } from "node:child_process";
import { startBee } from "./bee-process";
import { ROOT } from "./context";

const children: ReturnType<typeof spawn>[] = [];
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
let online = false;
try {
  online = (
    await fetch("http://127.0.0.1:1633/readiness", {
      signal: AbortSignal.timeout(2000),
    })
  ).ok;
} catch {}
if (!online) {
  const bee = await startBee();
  children.push(bee);
  bee.on("exit", () => {
    if (!stopping) {
      console.error("Bee stopped; closing the operator.");
      stop();
      process.exitCode = 1;
    }
  });
  for (let i = 0; i < 90 && !online && !stopping; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      online = (
        await fetch("http://127.0.0.1:1633/readiness", {
          signal: AbortSignal.timeout(1000),
        })
      ).ok;
    } catch {}
  }
  if (!online) {
    stop();
    throw new Error("Bee did not become ready. Check its RPC and connection.");
  }
}
if (!stopping) {
  const web = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3002",
    ],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        RELAY_LOCAL_OPERATOR: "1",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: "inherit",
    },
  );
  children.push(web);
  web.on("exit", (code) => {
    process.exitCode = code || 0;
    stop();
  });
  console.log(
    "Relay operator: http://127.0.0.1:3002. Ctrl-C closes this session and any Bee process it started. No tunnel or background service is installed.",
  );
}
