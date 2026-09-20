import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
const files = execFileSync("git", [
  "ls-files",
  "--cached",
  "--others",
  "--exclude-standard",
  "-z",
])
  .toString()
  .split("\0")
  .filter(Boolean);
let localKeys = [];
try {
  localKeys = await Promise.all(
    (await readdir(".runtime/private"))
      .filter((f) => f.endsWith(".key"))
      .map(async (f) =>
        (await readFile(`.runtime/private/${f}`, "utf8"))
          .trim()
          .replace(/^0x/, ""),
      ),
  );
} catch {}
const failures = [];
for (const file of files) {
  if (
    /(^|\/)(\.env(?:\.|$)|\.runtime\/|.*\.(key|pem)$)/.test(file) &&
    file !== ".env.example"
  )
    failures.push(`${file}: private path`);
  const bytes = await readFile(file);
  if (bytes.length > 10_000_000) continue;
  const source = bytes.toString();
  if (localKeys.some((k) => source.toLowerCase().includes(k.toLowerCase())))
    failures.push(`${file}: actual local key material`);
  if (
    /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(source) ||
    /\b(?:ghp|gho)_[A-Za-z0-9]{30,}/.test(source)
  )
    failures.push(`${file}: credential pattern`);
  if (
    /[\u2014]/u.test(source) &&
    !file.endsWith("package-lock.json") &&
    !file.endsWith("loops-evaluator.json")
  )
    failures.push(`${file}: em dash`);
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Checked ${files.length} repository files; no local key material or credential patterns found.`,
  );
