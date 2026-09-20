import { spawn } from "node:child_process";
import path from "node:path";
import { config } from "./context";

// The binary, data directory and password remain under the configured node operator's custody.
// No automatic startup or background service is installed.
export async function startBee(allowExecutorFunding = false) {
  const binary = process.env.RELAY_BEE_BINARY;
  const data = process.env.RELAY_BEE_DATA;
  const password = process.env.RELAY_BEE_PASSWORD_FILE;
  if (!binary || !data || !password)
    throw new Error(
      "Configure RELAY_BEE_BINARY, RELAY_BEE_DATA and RELAY_BEE_PASSWORD_FILE to start a node, or start your existing Bee manually.",
    );
  const args = [
    "start",
    "--data-dir",
    path.resolve(data),
    "--password-file",
    path.resolve(password),
    "--api-addr",
    "127.0.0.1:1633",
    "--p2p-addr",
    ":1634",
    "--cache-capacity",
    "250000",
    "--full-node=false",
    "--swap-enable=true",
    "--chequebook-enable=true",
    "--verbosity",
    "error",
    "--blockchain-rpc-endpoint",
    process.env.RELAY_BEE_RPC_URL || "https://xdai.fairdatasociety.org",
  ];
  if (allowExecutorFunding)
    args.push("--withdrawal-addresses-whitelist", (await config()).executor);
  return spawn(path.resolve(binary), args, { stdio: "inherit" });
}
