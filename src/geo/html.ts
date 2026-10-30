/**
 * A small, dependency-free HTML reader.
 *
 * GEO auditing only needs a handful of primitives — title, meta/link tags,
 * headings, lists, links, images and JSON-LD blocks — so this module builds a
 * light tree instead of pulling a full HTML5 parser into the MCP server. It is
 * deliberately tolerant: unknown or malformed markup never throws, it just
 * yields fewer nodes.
 */

export interface HtmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: HtmlNode[];
  parent: HtmlNode | null;
  /** Raw text, only set on text nodes (`tag === "#text"`). */
  text: string;
}

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/** Elements whose content must be read verbatim (no tag parsing inside). */
const RAW_TEXT_TAGS = new Set(["script", "style", "textarea", "title"]);

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

const ATTR_RE = /([^\s"'=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let match: RegExpExecArray | null;
  ATTR_RE.lastIndex = 0;
  while ((match = ATTR_RE.exec(raw))) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (!(name in attrs)) attrs[name] = decodeEntities(value);
  }
  return attrs;
}

function makeNode(
  tag: string,
  attrs: Record<string, string>,
  parent: HtmlNode | null
): HtmlNode {
  return { tag, attrs, children: [], parent, text: "" };
}

export class HtmlDoc {
  readonly root: HtmlNode;

  private constructor(root: HtmlNode) {
    this.root = root;
  }

  static parse(html: string): HtmlDoc {
    const root = makeNode("#document", {}, null);
    const stack: HtmlNode[] = [root];
    const source = html.replace(/<!--[\s\S]*?-->/g, "");
    let index = 0;

    const appendText = (text: string) => {
      if (!text) return;
      const parent = stack[stack.length - 1];
      const node = makeNode("#text", {}, parent);
      node.text = decodeEntities(text);
      parent.children.push(node);
    };

    while (index < source.length) {
      const lt = source.indexOf("<", index);
      if (lt === -1) {
        appendText(source.slice(index));
        break;
      }
      if (lt > index) appendText(source.slice(index, lt));

      // Doctype and processing instructions are skipped.
      if (source[lt + 1] === "!" || source[lt + 1] === "?") {
        const end = source.indexOf(">", lt);
        index = end === -1 ? source.length : end + 1;
        continue;
      }

      const gt = source.indexOf(">", lt);
      if (gt === -1) {
        appendText(source.slice(lt));
        break;
      }

      const raw = source.slice(lt + 1, gt);
      if (raw.startsWith("/")) {
        const name = raw.slice(1).trim().toLowerCase();
        for (let i = stack.length - 1; i > 0; i--) {
          if (stack[i].tag === name) {
            stack.length = i;
            break;
          }
        }
        index = gt + 1;
        continue;
      }

      const selfClosing = raw.endsWith("/");
      const body = selfClosing ? raw.slice(0, -1) : raw;
      const nameMatch = /^([a-zA-Z][^\s/>]*)/.exec(body);
      if (!nameMatch) {
        index = gt + 1;
        continue;
      }
      const tag = nameMatch[1].toLowerCase();
      const attrs = parseAttrs(body.slice(nameMatch[1].length));
      const parent = stack[stack.length - 1];
      const node = makeNode(tag, attrs, parent);
      parent.children.push(node);

      if (VOID_TAGS.has(tag) || selfClosing) {
        index = gt + 1;
        continue;
      }

      if (RAW_TEXT_TAGS.has(tag)) {
        const closer = new RegExp(`</${tag}\\s*>`, "i");
        const rest = source.slice(gt + 1);
        const found = closer.exec(rest);
        const content = found ? rest.slice(0, found.index) : rest;
        if (content) {
          const textNode = makeNode("#text", {}, node);
          textNode.text = tag === "title" ? decodeEntities(content) : content;
          node.children.push(textNode);
        }
        index = found ? gt + 1 + found.index + found[0].length : source.length;
        continue;
      }

      stack.push(node);
      index = gt + 1;
    }

    return new HtmlDoc(root);
  }

  all(tag: string): HtmlNode[] {
    const target = tag.toLowerCase();
    const out: HtmlNode[] = [];
    const walk = (node: HtmlNode) => {
      for (const child of node.children) {
        if (child.tag === target) out.push(child);
        walk(child);
      }
    };
    walk(this.root);
    return out;
  }

  first(tag: string): HtmlNode | null {
    return this.all(tag)[0] ?? null;
  }

  /** `<html lang>` — the language signal AI engines use to route content. */
  htmlLang(): string | null {
    const html = this.first("html");
    const lang = html?.attrs.lang?.trim();
    return lang ? lang : null;
  }

  title(): string | null {
    const node = this.first("title");
    const text = node ? this.textOf(node).trim() : "";
    return text || null;
  }

  metaByName(name: string): HtmlNode | null {
    const wanted = name.toLowerCase();
    return (
      this.all("meta").find(
        (m) => (m.attrs.name || "").toLowerCase() === wanted
      ) ?? null
    );
  }

  metaByProperty(property: string): HtmlNode | null {
    const wanted = property.toLowerCase();
    return (
      this.all("meta").find(
        (m) => (m.attrs.property || "").toLowerCase() === wanted
      ) ?? null
    );
  }

  linkByRel(rel: string): HtmlNode | null {
    const wanted = rel.toLowerCase();
    return (
      this.all("link").find((l) =>
        (l.attrs.rel || "").toLowerCase().split(/\s+/).includes(wanted)
      ) ?? null
    );
  }

  /** Concatenated, whitespace-normalized text of a subtree. */
  textOf(node: HtmlNode): string {
    if (node.tag === "#text") return node.text;
    let out = "";
    for (const child of node.children) {
      out += child.tag === "#text" ? ` ${child.text} ` : ` ${this.textOf(child)} `;
    }
    return out.replace(/\s+/g, " ").trim();
  }

  /** Visible copy: `<body>` text without script/style/noscript/template. */
  bodyText(): string {
    const body = this.first("body") ?? this.root;
    return this.visibleText(body);
  }

  private visibleText(node: HtmlNode): string {
    if (node.tag === "#text") return node.text;
    if (["script", "style", "noscript", "template"].includes(node.tag)) return "";
    let out = "";
    for (const child of node.children) out += ` ${this.visibleText(child)} `;
    return out;
  }
}
