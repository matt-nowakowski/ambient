// Writes brand/mark.svg (favicon / web logo; flips light in dark mode) and
// brand/mark-glyph.svg (currentColor) from the same B1 "Lens" orb geometry as
// generate-icons.swift: four circles, top-left in focus, the rest receding.
//   node brand/generate-svg.mjs
import { writeFileSync } from "node:fs";

// Static pose (matches markAlphas in generate-icons.swift).
const ALPHAS = [1, 0.5, 0.26, 0.38];
const CORNERS = [[-4.5, -4.5], [4.5, -4.5], [4.5, 4.5], [-4.5, 4.5]];
const K = 2.6; // 64-unit canvas per 28px-stage px

const filters = ALPHAS.map((a, i) =>
  a < 1
    ? `<filter id="b${i}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${((1 - a) * 2 * K * 0.5).toFixed(2)}"/></filter>`
    : "",
).join("");

const circles = CORNERS.map(([x, y], i) => {
  const a = ALPHAS[i];
  const r = 3 * K * (1 + (1 - a) * 0.12);
  const f = a < 1 ? ` filter="url(#b${i})"` : "";
  return `<circle cx="${(32 + x * K).toFixed(2)}" cy="${(32 + y * K).toFixed(2)}" r="${r.toFixed(2)}" opacity="${a}"${f}/>`;
}).join("");

const svg = (fill, style = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${style}<defs>${filters}</defs><g fill="${fill}">${circles}</g></svg>\n`;

writeFileSync(
  new URL("./mark.svg", import.meta.url),
  svg("#0A0A0A", "<style>@media (prefers-color-scheme: dark){g{fill:#F5F5F5}}</style>"),
);
writeFileSync(new URL("./mark-glyph.svg", import.meta.url), svg("currentColor"));
console.log("svg written");
