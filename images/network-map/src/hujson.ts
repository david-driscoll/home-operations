/**
 * HuJSON ("human JSON", what a Tailscale policy file is written in) -> JSON:
 * `//` and `/* *\/` comments removed and trailing commas dropped, then
 * JSON.parse. Strings are copied verbatim, so a `//` inside a URL survives.
 *
 * Small on purpose: the policy file is the only HuJSON the collector reads,
 * and `GET /acl` with `Accept: application/hujson` returns it as written.
 */
export function stripHujson(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      // Copy the string, escapes and all.
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
    } else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      if (end < 0) throw new Error("HuJSON: unterminated block comment");
      i = end + 2;
    } else {
      out += c;
      i++;
    }
  }
  // Trailing commas: a comma followed only by whitespace before } or ].
  // Comments and strings are gone or intact by now, so this cannot hit a string.
  return removeTrailingCommas(out);
}

function removeTrailingCommas(json: string): string {
  let out = "";
  let i = 0;
  while (i < json.length) {
    const c = json[i];
    if (c === '"') {
      let j = i + 1;
      while (j < json.length && json[j] !== '"') j += json[j] === "\\" ? 2 : 1;
      out += json.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === ",") {
      let j = i + 1;
      while (j < json.length && /\s/.test(json[j])) j++;
      if (json[j] === "}" || json[j] === "]") {
        i++;
        continue;
      }
    }
    out += c;
    i++;
  }
  return out;
}

export function parseHujson<T = unknown>(text: string): T {
  return JSON.parse(stripHujson(text)) as T;
}
