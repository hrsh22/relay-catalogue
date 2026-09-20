import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Public RPC is used only by Anvil for historical state reads. The worker can
// transact only against the new loopback instance and generates throwaway keys.
const root = fileURLToPath(new URL("..", import.meta.url));
const output = path.join(root, ".runtime/fork-verification");
const source = new URL(
  process.env.RELAY_FORK_SOURCE || "https://gnosis-rpc.publicnode.com",
);
let block = process.env.RELAY_FORK_BLOCK
  ? Number(process.env.RELAY_FORK_BLOCK)
  : undefined;
if (source.protocol !== "https:" || source.username || source.password)
  throw new Error(
    "The fork source must be a public HTTPS RPC without credentials.",
  );
if (block !== undefined && (!Number.isSafeInteger(block) || block < 1))
  throw new Error("RELAY_FORK_BLOCK must be a positive block number.");

const children = [];
const log = [];
let interrupted;
const inherited = Object.fromEntries(
  ["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "SystemRoot"].flatMap((key) =>
    process.env[key] ? [[key, process.env[key]]] : [],
  ),
);
function launch(args, extra = {}) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: { ...inherited, ...extra },
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.result = new Promise((resolve) => {
    child.once("error", (error) => resolve({ code: 1, error }));
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (bytes) => {
      log.push(bytes.toString());
      process.stdout.write(bytes);
    });
  children.push(child);
  return child;
}
function signal(child, name) {
  if (!child.pid) return;
  try {
    if (process.platform === "win32") child.kill(name);
    else process.kill(-child.pid, name);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function stop(child) {
  signal(child, "SIGTERM");
  const stopped = await Promise.race([
    child.result.then(() => true),
    pause(2000).then(() => false),
  ]);
  if (!stopped) {
    signal(child, "SIGKILL");
    await child.result;
  }
}
function interrupt(reason) {
  interrupted ||= new Error(reason);
  for (const child of children) signal(child, "SIGTERM");
}
for (const name of ["SIGINT", "SIGTERM"])
  process.on(name, () =>
    interrupt(`Fork verification interrupted by ${name}.`),
  );

await mkdir(output, { recursive: true });
await rm(path.join(output, "report.json"), { force: true });
const timer = setTimeout(
  () => interrupt("Fork verification exceeded three minutes."),
  180000,
);
let port;
let passed = false;
try {
  if (block === undefined) {
    const response = await fetch(source, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_blockNumber",
        params: [],
      }),
      signal: AbortSignal.timeout(25000),
    });
    const value = await response.json();
    if (!/^0x[0-9a-f]+$/i.test(value.result || ""))
      throw new Error("The public RPC did not return a block number.");
    block = Number(value.result);
  }
  if (interrupted) throw interrupted;
  // Ask the OS for an available port; never attach to someone's existing node.
  const reservation = createServer();
  await new Promise((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolve);
  });
  port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const rpc = `http://127.0.0.1:${port}`;
  const anvil = launch([
    "node_modules/@foundry-rs/anvil/bin.mjs",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--fork-url",
    source.href,
    "--fork-block-number",
    String(block),
    "--chain-id",
    "100",
    "--accounts",
    "0",
    "--silent",
  ]);
  const deadline = Date.now() + 45000;
  for (;;) {
    if (interrupted) throw interrupted;
    if (anvil.exitCode !== null || anvil.signalCode)
      throw new Error(
        "Anvil could not start. Inspect the fork log and public RPC availability.",
      );
    try {
      const response = await fetch(rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_chainId",
          params: [],
        }),
        signal: AbortSignal.timeout(1000),
      });
      if ((await response.json()).result === "0x64") break;
    } catch {}
    if (Date.now() > deadline)
      throw new Error("The isolated fork did not become ready in 45 seconds.");
    await pause(100);
  }
  console.log(`Isolated Gnosis fork at block ${block}; loopback port ${port}.`);
  const worker = launch(["--import", "tsx", "scripts/rehearse-chain.ts"], {
    RELAY_FORK_RPC: rpc,
    RELAY_FORK_BLOCK: String(block),
    RELAY_FORK_OUTPUT: path.join(output, "report.json"),
  });
  const result = await worker.result;
  if (interrupted) throw interrupted;
  if (result.code !== 0)
    throw new Error(`Fork checks failed (${result.signal || result.code}).`);
  passed = true;
} catch (error) {
  console.error(error.message);
  log.push(error.message + "\n");
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  for (const child of children.toReversed()) await stop(child);
  await writeFile(path.join(output, "run.log"), log.join(""));
  await writeFile(
    path.join(output, "lifecycle.json"),
    JSON.stringify(
      {
        observedAt: new Date().toISOString(),
        passed,
        forkBlock: block,
        loopbackPort: port,
        childProcessesStopped: children.every(
          (child) => child.exitCode !== null || child.signalCode,
        ),
        publicChainTransactions: false,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Isolated fork and verification worker stopped. Evidence: .runtime/fork-verification/",
  );
}
