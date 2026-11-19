import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const { name, version, packageManager } = JSON.parse(read("package.json"));
const skill = read("skills/gtm-growth/SKILL.md").split("---")[1] ?? "";
const skillVersion = /^\s+version: "([^"]+)"\s*$/m.exec(skill)?.[1];
const releases = [...read("CHANGELOG.md").matchAll(/^## \[([^\]]+)\] - (\d{4}-\d{2}-\d{2})$/gm)];
const release = releases.find(([, entry]) => entry === version);
const heading = /^Release review \*\*([^*]+)\*\* · \*\*(\d{4}-\d{2}-\d{2})\*\*\./m.exec(read("docs/journey/CAPABILITIES.md"));
const tag = process.argv[2] ?? (process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : undefined);

const checks = [
  [/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version), "Package version must use stable semantic versioning."],
  [/^pnpm@\d+\.\d+\.\d+$/.test(packageManager), "Pin the pnpm version in package.json."],
  [skillVersion === version && read("skills/gtm-growth/VERSION.txt").trim() === version, "Agent skill versions must match package.json."],
  [release && releases[0] === release, "Add the current release as the first dated CHANGELOG version."],
  [release && heading?.[1] === version && heading[2] === release[2], "Review the capability register for the current release and date."],
  [!tag || tag === `v${version}`, "Tag must match the package version."],
];
const failures = checks.filter(([valid]) => !valid).map(([, message]) => message);
if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
} else {
  console.log(`${name} ${version} readiness metadata verified${tag ? ` for ${tag}` : ""}.`);
}
