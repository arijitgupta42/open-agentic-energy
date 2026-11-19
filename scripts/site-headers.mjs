// Reads a site's _headers file, the format Cloudflare and Netlify use, so that the local
// server sends the same headers as the host: CORS on the public agent files and the
// Content-Security-Policy on the pages. The tests read the same rules.
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * A site's _headers rules, and which apply to a request path.
 */
export class SiteHeaders {
  /**
   * Read a _headers file. A line that starts at the left edge is a path; an indented
   * "Name: value" line under it is one of its headers. "#" starts a comment.
   *
   * :param text: The file's text.
   * :return: A list of {path, headers}, in file order. headers is a list of [name, value].
   * :raises Error: When a header line comes before any path, or has no colon.
   */
  static parse(text) {
    const rules = [];
    for (const [index, raw] of String(text).replace(/\r\n/g, "\n").split("\n").entries()) {
      if (!raw.trim() || raw.trim().startsWith("#")) {
        continue;
      }
      if (!/^\s/.test(raw)) {
        rules.push({path: raw.trim(), headers: []});
        continue;
      }
      const colon = raw.indexOf(":");
      if (!rules.length || colon === -1) {
        throw new Error(`_headers line ${index + 1} is not "Name: value" under a path: ${raw.trim()}`);
      }
      rules.at(-1).headers.push([raw.slice(0, colon).trim(), raw.slice(colon + 1).trim()]);
    }
    return rules;
  }

  /**
   * Whether a rule's path matches a request path. "*" matches any run of characters,
   * as on Cloudflare and Netlify.
   *
   * :param pattern: The rule's path, such as "/lab/*".
   * :param pathname: The request's path.
   * :return: True when it matches.
   */
  static matches(pattern, pathname) {
    const source = pattern.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
    return new RegExp(`^${source}$`).test(pathname);
  }

  /**
   * The headers for one request path. Two rules that set the same header are joined
   * with a comma, as Cloudflare does.
   *
   * :param rules: From parse().
   * :param pathname: The request's path.
   * :return: An object of header name (lower case) to value.
   */
  static forPath(rules, pathname) {
    const out = {};
    for (const rule of rules.filter((item) => SiteHeaders.matches(item.path, pathname))) {
      for (const [name, value] of rule.headers) {
        const key = name.toLowerCase();
        out[key] = out[key] ? `${out[key]}, ${value}` : value;
      }
    }
    return out;
  }

  /**
   * Read a site folder's _headers file.
   *
   * :param dir: The site's folder.
   * :return: The rules, or an empty list when the site has none.
   */
  static async load(dir) {
    try {
      return SiteHeaders.parse(await readFile(path.join(dir, "_headers"), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  /**
   * Fit rules to the origins the sites run on. A Content-Security-Policy cannot name an
   * IPv6 address, so when a site runs on one, connect-src and frame-src also allow any
   * http origin. Otherwise the rules are unchanged.
   *
   * :param rules: From parse().
   * :param origins: Every site's origin in this environment.
   * :return: {rules, widened}: the rules to send, and whether they were widened.
   */
  static forOrigins(rules, origins) {
    if (!origins.some((origin) => new URL(origin).hostname.startsWith("["))) {
      return {rules, widened: false};
    }
    const widen = (value) => value.replace(/(connect-src|frame-src) ([^;]*)/g, "$1 $2 http:");
    const fitted = rules.map((rule) => ({...rule, headers: rule.headers.map(([name, value]) => [name, name.toLowerCase() === "content-security-policy" ? widen(value) : value])}));
    return {rules: fitted, widened: true};
  }

  /**
   * Read the directives of a Content-Security-Policy.
   *
   * :param policy: The header's value.
   * :return: A Map of directive name to its list of sources.
   */
  static directives(policy) {
    const out = new Map();
    for (const part of String(policy || "").split(";")) {
      const [name, ...sources] = part.trim().split(/\s+/);
      if (name) {
        out.set(name.toLowerCase(), sources);
      }
    }
    return out;
  }
}
