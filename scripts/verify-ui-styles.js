"use strict";
const fs = require("node:fs");
const path = require("node:path");

// These layout utilities are used by the pinned workspace shell. A successful
// JS build alone does not establish that Tailwind found the source files.
const REQUIRED = [
  "flex",
  "fixed",
  "hidden",
  "items-center",
  "justify-between",
  "w-full",
  "h-full",
  "p-4",
];
function verifyUIStyles(dist) {
  const html = fs.readFileSync(path.join(dist, "index.html"), "utf8");
  const links = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map(([tag]) => {
      if (!/\brel=["']stylesheet["']/i.test(tag)) return null;
      return tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
    })
    .filter((href) => href && !/^(?:https?:)?\/\//i.test(href));
  if (!links.length)
    throw new Error("Packaged UI has no local stylesheet links.");
  const css = links
    .map((href) => {
      const file = path.resolve(dist, href.replace(/^\//, ""));
      if (!file.startsWith(path.resolve(dist) + path.sep))
        throw new Error("Stylesheet escapes the UI directory.");
      return fs.readFileSync(file, "utf8");
    })
    .join("\n");
  for (const name of REQUIRED) {
    if (!new RegExp(`\\.${name}(?=[\\s,{.:#\\[])`).test(css)) {
      throw new Error(
        `Packaged UI is missing layout utility .${name}; check Tailwind's build working directory.`,
      );
    }
  }
  return { local_stylesheets: links, required_layout_utilities: REQUIRED };
}
module.exports = { verifyUIStyles, REQUIRED };
