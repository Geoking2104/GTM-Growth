/** Check repository Markdown local links and heading/HTML anchors, without network access. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [...new Set(execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" }).split("\0"))]
  .filter(file => /\.md$/i.test(file) && fs.existsSync(path.join(root, file)));
const errors = [];
const cache = new Map();
let checked = 0;

// Preserve newlines for diagnostics; ignore fenced examples and HTML comments.
function prose(text) {
  let fence = null;
  return text.replace(/<!--[\s\S]*?-->/g, match => match.replace(/[^\n]/g, " "))
    .split("\n").map(line => {
      const mark = line.match(/^\s{0,3}(`{3,}|~{3,})/);
      if (mark) {
        if (!fence) fence = mark[1];
        else if (mark[1][0] === fence[0] && mark[1].length >= fence.length) fence = null;
        return "";
      }
      return fence ? "" : line;
    }).join("\n");
}

function anchors(file) {
  if (cache.has(file)) return cache.get(file);
  const text = prose(fs.readFileSync(file, "utf8"));
  const result = new Set();
  const counts = new Map();
  for (const match of text.matchAll(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const slug = match[1].replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/<[^>]*>/g, "").toLowerCase()
      .replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, "").replace(/ /g, "-");
    const count = counts.get(slug) ?? 0;
    result.add(count ? `${slug}-${count}` : slug);
    counts.set(slug, count + 1);
  }
  for (const match of text.matchAll(/\b(?:id|name)=["']([^"']+)["']/g)) result.add(match[1]);
  cache.set(file, result);
  return result;
}

function check(file, raw, index, text) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(raw) || !raw) return;
  const line = text.slice(0, index).split("\n").length;
  const fail = message => errors.push(`${file}:${line}: ${message} (${raw})`);
  let target;
  try { target = decodeURIComponent(raw); } catch { fail("invalid URL encoding"); return; }
  const [pathname, fragment] = target.split("#", 2);
  const local = pathname.split("?", 1)[0];
  const absolute = local ? path.resolve(local.startsWith("/") ? root : path.dirname(path.join(root, file)), local.replace(/^\//, "")) : path.join(root, file);
  checked++;
  if (!fs.existsSync(absolute)) { fail("missing local target"); return; }
  if (fragment && /\.md$/i.test(absolute) && !anchors(absolute).has(fragment)) fail("missing Markdown anchor");
}

for (const file of files) {
  const text = prose(fs.readFileSync(path.join(root, file), "utf8"));
  // Inline/image links with angle-bracket or balanced-parenthesis destinations.
  for (const match of text.matchAll(/!?\[[^\]\n]*\]\(\s*(<[^>\n]+>|(?:[^\s()]|\([^()]*\))+)(?:\s+["'][^\n]*?["'])?\s*\)/g)) {
    check(file, match[1].replace(/^<|>$/g, ""), match.index, text);
  }
  for (const match of text.matchAll(/^ {0,3}\[[^\]]+\]:\s*(<[^>\n]+>|\S+)/gm)) {
    check(file, match[1].replace(/^<|>$/g, ""), match.index, text);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  console.error(`Documentation check failed: ${errors.length} issue(s), ${checked} local links, ${files.length} Markdown files.`);
  process.exitCode = 1;
} else console.log(`Documentation check OK: ${checked} local links in ${files.length} Markdown files.`);
