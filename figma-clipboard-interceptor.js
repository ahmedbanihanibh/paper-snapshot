// =============================================================================
// FIGMA CLIPBOARD REVERSE-ENGINEERING INTERCEPTOR
// =============================================================================
// HOW TO USE:
// 1. Open your Figma project in the browser (Edge/Chrome)
// 2. Open DevTools (F12 or Cmd+Option+I)
// 3. Go to the Console tab
// 4. Paste this ENTIRE script and press Enter
// 5. Now select an element on the Figma canvas and press Cmd+C (copy)
// 6. Check the console — it will log the EXACT clipboard data Figma writes
// 7. Then try Cmd+V (paste) on the canvas — it will log what Figma reads
// =============================================================================

(function() {
  console.log("%c[Figma Interceptor] Loaded! Now copy/paste elements on the canvas.", "color: #A259FF; font-weight: bold; font-size: 14px;");

  // ── INTERCEPT COPY (what Figma WRITES to clipboard) ────────────────────────
  document.addEventListener("copy", function(e) {
    console.log("%c══════════════════════════════════════════════", "color: #A259FF");
    console.log("%c[COPY EVENT INTERCEPTED]", "color: #A259FF; font-weight: bold; font-size: 14px;");

    // Log all MIME types on the clipboard
    const types = e.clipboardData.types;
    console.log("MIME types:", types);

    for (const type of types) {
      const data = e.clipboardData.getData(type);
      console.log(`\n%c── ${type} ──`, "color: #FF6B6B; font-weight: bold;");

      if (type === "text/html") {
        console.log("Raw HTML length:", data.length);
        console.log("First 500 chars:", data.substring(0, 500));
        console.log("Last 200 chars:", data.substring(data.length - 200));

        // Parse and extract Figma-specific attributes
        const parser = new DOMParser();
        const doc = parser.parseFromString(data, "text/html");

        // Look for data-metadata span
        const metaSpan = doc.querySelector("[data-metadata]");
        if (metaSpan) {
          const metaRaw = metaSpan.getAttribute("data-metadata");
          console.log("%c[FIGMA METADATA FOUND]", "color: #00FF00; font-weight: bold;");
          console.log("Raw data-metadata:", metaRaw.substring(0, 200));

          // Extract the base64 between (figmeta) tags
          const metaMatch = metaRaw.match(/\(figmeta\)(.*?)\(\/figmeta\)/s);
          if (metaMatch) {
            try {
              const decoded = atob(metaMatch[1]);
              console.log("Decoded figmeta (JSON):", decoded);
              try {
                const parsed = JSON.parse(decoded);
                console.log("Parsed figmeta:", parsed);
              } catch(e) { console.log("(not valid JSON)"); }
            } catch(e) { console.log("(base64 decode failed):", e.message); }
          }
        }

        // Look for data-buffer span
        const bufferSpan = doc.querySelector("[data-buffer]");
        if (bufferSpan) {
          const bufferRaw = bufferSpan.getAttribute("data-buffer");
          console.log("%c[FIGMA BUFFER FOUND]", "color: #00FF00; font-weight: bold;");
          console.log("Raw data-buffer length:", bufferRaw.length);
          console.log("First 300 chars:", bufferRaw.substring(0, 300));

          // Extract the base64 between (figma) tags
          const bufferMatch = bufferRaw.match(/\(figma\)(.*?)\(\/figma\)/s);
          if (bufferMatch) {
            const b64 = bufferMatch[1];
            console.log("Base64 payload length:", b64.length);
            try {
              const binary = atob(b64);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

              console.log("Binary length:", bytes.length);
              console.log("First 32 bytes (hex):", Array.from(bytes.slice(0, 32)).map(b => b.toString(16).padStart(2, "0")).join(" "));
              console.log("First 32 bytes (ascii):", Array.from(bytes.slice(0, 32)).map(b => b >= 32 && b < 127 ? String.fromCharCode(b) : ".").join(""));

              // Check for magic headers
              const header = String.fromCharCode(...bytes.slice(0, 12));
              console.log("Magic header:", JSON.stringify(header));

              if (header.startsWith("fig-kiwi")) {
                console.log("%c→ Confirmed: fig-kiwi binary format", "color: #FFD700; font-weight: bold;");
                console.log("Version byte at [8]:", bytes[8]);
                console.log("Bytes [8-16]:", Array.from(bytes.slice(8, 16)).map(b => b.toString(16).padStart(2, "0")).join(" "));
              }
            } catch(e) { console.log("(base64 decode failed):", e.message); }
          }
        }

        // Log all spans and their attributes
        const allSpans = doc.querySelectorAll("span");
        console.log(`Total <span> elements: ${allSpans.length}`);
        allSpans.forEach((span, i) => {
          const attrs = {};
          for (const attr of span.attributes) {
            attrs[attr.name] = attr.value.substring(0, 100) + (attr.value.length > 100 ? "..." : "");
          }
          if (Object.keys(attrs).length > 0) {
            console.log(`  span[${i}] attributes:`, attrs);
          }
        });
      } else {
        console.log("Data:", data.substring(0, 500));
      }
    }
    console.log("%c══════════════════════════════════════════════", "color: #A259FF");
  }, true); // capture phase to run before Figma's handler

  // ── INTERCEPT PASTE (what Figma READS from clipboard) ──────────────────────
  document.addEventListener("paste", function(e) {
    console.log("%c══════════════════════════════════════════════", "color: #00BFFF");
    console.log("%c[PASTE EVENT INTERCEPTED]", "color: #00BFFF; font-weight: bold; font-size: 14px;");

    const types = e.clipboardData.types;
    console.log("MIME types on clipboard:", types);

    for (const type of types) {
      const data = e.clipboardData.getData(type);
      console.log(`\n%c── ${type} ──`, "color: #FF6B6B; font-weight: bold;");
      console.log("Length:", data.length);
      console.log("Content:", data.substring(0, 500));
    }

    // Check for files/blobs
    if (e.clipboardData.files.length > 0) {
      console.log("%c[FILES ON CLIPBOARD]", "color: #FFD700; font-weight: bold;");
      for (const file of e.clipboardData.files) {
        console.log(`  File: ${file.name}, type: ${file.type}, size: ${file.size}`);
      }
    }

    // Check for items (Blob-based)
    if (e.clipboardData.items) {
      console.log("ClipboardItems:");
      for (let i = 0; i < e.clipboardData.items.length; i++) {
        const item = e.clipboardData.items[i];
        console.log(`  [${i}] kind: ${item.kind}, type: ${item.type}`);
      }
    }

    console.log("%c══════════════════════════════════════════════", "color: #00BFFF");
  }, true);

  // ── MONKEY-PATCH DataTransfer.setData to catch writes during copy ──────────
  const origSetData = DataTransfer.prototype.setData;
  DataTransfer.prototype.setData = function(type, data) {
    console.log(`%c[DataTransfer.setData] type="${type}", length=${data.length}`, "color: #FFA500;");
    if (type === "text/html" && data.includes("figma")) {
      console.log("%c→ Figma HTML payload detected in setData!", "color: #00FF00; font-weight: bold;");
    }
    return origSetData.call(this, type, data);
  };

  // ── MONKEY-PATCH navigator.clipboard.write to catch async writes ───────────
  const origWrite = navigator.clipboard.write;
  navigator.clipboard.write = async function(items) {
    console.log(`%c[clipboard.write] ${items.length} item(s)`, "color: #FFA500; font-weight: bold;");
    for (const item of items) {
      for (const type of item.types) {
        console.log(`  type: ${type}`);
        try {
          const blob = await item.getType(type);
          const text = await blob.text();
          console.log(`  size: ${blob.size}, preview: ${text.substring(0, 200)}`);
        } catch(e) { console.log(`  (could not read: ${e.message})`); }
      }
    }
    return origWrite.call(this, items);
  };

  // ── MONKEY-PATCH navigator.clipboard.read to catch async reads ─────────────
  const origRead = navigator.clipboard.read;
  navigator.clipboard.read = async function() {
    console.log("%c[clipboard.read] called", "color: #FFA500; font-weight: bold;");
    const items = await origRead.call(this);
    for (const item of items) {
      console.log("  types:", item.types);
      for (const type of item.types) {
        try {
          const blob = await item.getType(type);
          if (blob.size < 50000) {
            const text = await blob.text();
            console.log(`  ${type} (${blob.size}b):`, text.substring(0, 300));
          } else {
            console.log(`  ${type}: ${blob.size} bytes (too large to log)`);
          }
        } catch(e) { console.log(`  ${type}: (read failed: ${e.message})`); }
      }
    }
    return items;
  };

  console.log("%c[Figma Interceptor] All hooks installed. Ready!", "color: #A259FF; font-weight: bold;");
  console.log("%cStep 1: Select an element on canvas → Cmd+C", "color: #aaa;");
  console.log("%cStep 2: Check console for the clipboard data", "color: #aaa;");
  console.log("%cStep 3: Try pasting (Cmd+V) to see what Figma reads", "color: #aaa;");
})();
