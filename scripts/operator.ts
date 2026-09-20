import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import { ROOT } from "./context";

const { values } = parseArgs({
  options: { council: { type: "boolean", default: false } },
});
const councilOnly = values.council;
const children: ReturnType<typeof spawn>[] = [];
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
if (!councilOnly) {
  let online = false;
  try {
    online = (
      await fetch("http://127.0.0.1:1633/readiness", {
        signal: AbortSignal.timeout(2000),
      })
    ).ok;
  } catch {}
  if (!online && !stopping) {
    const { startBee } = await import("./bee-process");
    if (!stopping) {
      const bee = await startBee();
      children.push(bee);
      bee.on("exit", () => {
        if (!stopping) {
          console.error("Bee stopped; closing the operator.");
          process.exitCode = 1;
          stop();
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
      if (!online && !stopping) {
        stop();
        throw new Error("Bee did not become ready. Check its RPC and connection.");
      }
    }
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
        RELAY_COUNCIL_ONLY: councilOnly ? "1" : "0",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: "inherit",
    },
  );
  children.push(web);
  web.on("exit", (code, signal) => {
    if (!stopping) process.exitCode = code ?? (signal ? 1 : 0);
    stop();
  });
  web.on("error", (error) => {
    console.error(`The operator could not start: ${error.message}`);
    process.exitCode = 1;
    stop();
  });
  console.log(
    councilOnly
      ? "Relay council review: http://127.0.0.1:3002. Review and sign portable proposals with your own key; access to the storage node is not required. Ctrl-C closes this session."
      : "Relay operator: http://127.0.0.1:3002. Ctrl-C closes this session and any Bee process it started.",
  );
}
