#!/usr/bin/env node
// Connects to running Edge, waits for YOU to copy in Figma, then reads clipboard
import puppeteer from "puppeteer-core";
import fs from "fs";

const DEBUG_PORT = 9222;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log("[1] Connecting to Edge on port 9222...");
  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${DEBUG_PORT}` });
  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes("figma.com"));
  if (!page) { console.error("No Figma tab!"); browser.disconnect(); process.exit(1); }
  console.log(`Connected to: ${await page.title()}`);

  // ── STEP 1: Read clipboard after USER manually copies ─────────────────────
  console.log("\n===================================================");
  console.log("  GO TO EDGE NOW:");
  console.log("  1. Select any element on the Figma canvas");
  console.log("  2. Press Cmd+C to copy it");
  console.log("  3. Come back here — I'll read the clipboard in 20s");
  console.log("===================================================\n");

  await sleep(20000);

  console.log("[2] Reading clipboard...");
  const clipData = await page.evaluate(async () => {
    try {
      const items = await navigator.clipboard.read();
      const result = [];
      for (const item of items) {
        for (const type of item.types) {
          const blob = await item.getType(type);
          const text = await blob.text();
          result.push({ type, size: blob.size, content: text });
        }
      }
      return { ok: true, items: result };
    } catch(e) {
      return { ok: false, error: e.message };
    }
  });

  if (!clipData.ok) {
    console.log("Clipboard read failed:", clipData.error);
    console.log("Trying readText...");
    const textData = await page.evaluate(async () => {
      try { return { ok: true, text: await navigator.clipboard.readText() }; }
      catch(e) { return { ok: false, error: e.message }; }
    });
    console.log("readText result:", textData);
  } else {
    console.log(`\nClipboard has ${clipData.items.length} item(s):\n`);
    for (const item of clipData.items) {
      console.log(`── ${item.type} (${item.size} bytes) ──`);
      if (item.type === "text/html") {
        console.log("Preview:", item.content.substring(0, 3000));
        console.log("...(last 500):", item.content.substring(Math.max(0, item.content.length - 500)));
        fs.writeFileSync("/Users/ahmedbanihani/Documents/paper-snapshot/figma-clipboard-dump.html", item.content);
        console.log("\nFull HTML saved to figma-clipboard-dump.html");

        // Analyze structure
        console.log("\n── ANALYSIS ──");
        if (item.content.includes("data-metadata")) console.log("  HAS data-metadata span");
        if (item.content.includes("data-buffer")) console.log("  HAS data-buffer span");
        if (item.content.includes("figmeta")) console.log("  HAS figmeta marker");
        if (item.content.includes("figma")) console.log("  HAS figma marker");

        // Extract figmeta
        const metaMatch = item.content.match(/\(figmeta\)(.*?)\(\/figmeta\)/s);
        if (metaMatch) {
          try {
            const decoded = Buffer.from(metaMatch[1], "base64").toString("utf-8");
            console.log("  figmeta decoded:", decoded);
          } catch(e) {}
        }

        // Extract buffer header
        const bufMatch = item.content.match(/\(figma\)(.*?)\(\/figma\)/s);
        if (bufMatch) {
          const b64 = bufMatch[1];
          console.log("  buffer base64 length:", b64.length);
          try {
            const buf = Buffer.from(b64, "base64");
            console.log("  buffer binary length:", buf.length);
            console.log("  hex[0:64]:", buf.slice(0, 64).toString("hex").match(/.{2}/g).join(" "));
            console.log("  ascii[0:64]:", Array.from(buf.slice(0, 64)).map(b => b >= 32 && b < 127 ? String.fromCharCode(b) : ".").join(""));
          } catch(e) {}
        }
      } else if (item.type === "text/plain") {
        console.log("Content:", item.content.substring(0, 500));
      } else {
        console.log("Content:", item.content.substring(0, 500));
      }
    }
  }

  // ── STEP 2: Test what Figma accepts when pasting ──────────────────────────
  console.log("\n\n[3] Now testing what Figma accepts as paste...");
  console.log("Writing SVG to clipboard and pasting...\n");

  // Write SVG to clipboard, then let the user paste
  await page.evaluate(async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="50" viewBox="0 0 200 50"><rect width="200" height="50" rx="8" fill="#6366f1"/><text x="100" y="30" text-anchor="middle" fill="white" font-family="sans-serif" font-size="14">Pasted SVG</text></svg>';
    await navigator.clipboard.write([new ClipboardItem({
      "text/plain": new Blob([svg], { type: "text/plain" }),
      "text/html": new Blob([svg], { type: "text/html" }),
    })]);
    console.log("SVG written to clipboard");
  });

  console.log("SVG is on clipboard. Press Cmd+V in Figma now (10s)...");
  await sleep(10000);

  // Check if anything appeared - take a screenshot
  await page.screenshot({ path: "/Users/ahmedbanihani/Documents/paper-snapshot/figma-after-paste.png" });
  console.log("Screenshot saved to figma-after-paste.png");

  // Now try text/plain SVG only
  console.log("\n[4] Writing SVG as text/plain only...");
  await page.evaluate(async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="50" viewBox="0 0 200 50"><rect width="200" height="50" rx="8" fill="#FF6B6B"/><text x="100" y="30" text-anchor="middle" fill="white" font-family="sans-serif" font-size="14">Plain SVG</text></svg>';
    await navigator.clipboard.write([new ClipboardItem({
      "text/plain": new Blob([svg], { type: "text/plain" }),
    })]);
    console.log("SVG (plain only) written to clipboard");
  });

  console.log("SVG (text/plain) on clipboard. Press Cmd+V in Figma now (10s)...");
  await sleep(10000);
  await page.screenshot({ path: "/Users/ahmedbanihani/Documents/paper-snapshot/figma-after-paste2.png" });
  console.log("Screenshot saved to figma-after-paste2.png");

  console.log("\nDone! Edge stays open.");
  browser.disconnect();
}

main().catch(err => { console.error("FATAL:", err); process.exit(1); });
