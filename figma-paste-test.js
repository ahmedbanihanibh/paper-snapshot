// =============================================================================
// FIGMA PASTE FORMAT TESTER
// =============================================================================
// HOW TO USE:
// 1. Run figma-clipboard-interceptor.js FIRST (see that file)
// 2. Copy a native element in Figma (Cmd+C) — observe the output format
// 3. Then run THIS script to test different paste formats
// 4. After running, press Cmd+V on the Figma canvas to paste
// 5. Check which format Figma actually accepts
// =============================================================================

(function() {
  const testHtml = '<div style="background: #6366f1; color: white; padding: 16px; border-radius: 8px; font-family: sans-serif;">Test Button</div>';

  // ── TEST 1: Plain HTML as text/html ────────────────────────────────────────
  window.testPaste1_PlainHTML = async function() {
    console.log("%c[Test 1] Writing plain HTML to clipboard...", "color: #A259FF; font-weight: bold;");
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/plain": new Blob([testHtml], { type: "text/plain" }),
        "text/html": new Blob([testHtml], { type: "text/html" }),
      }),
    ]);
    console.log("Done. Now press Cmd+V on the Figma canvas.");
  };

  // ── TEST 2: SVG with foreignObject ─────────────────────────────────────────
  window.testPaste2_SVG = async function() {
    console.log("%c[Test 2] Writing SVG foreignObject to clipboard...", "color: #A259FF; font-weight: bold;");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="60">
      <foreignObject width="300" height="60">
        <body xmlns="http://www.w3.org/1999/xhtml" style="margin:0">
          ${testHtml}
        </body>
      </foreignObject>
    </svg>`;
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/plain": new Blob([svg], { type: "text/plain" }),
        "text/html": new Blob([svg], { type: "text/html" }),
      }),
    ]);
    console.log("Done. Now press Cmd+V on the Figma canvas.");
  };

  // ── TEST 3: Pure SVG (no foreignObject) ────────────────────────────────────
  window.testPaste3_PureSVG = async function() {
    console.log("%c[Test 3] Writing pure SVG to clipboard...", "color: #A259FF; font-weight: bold;");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="50" viewBox="0 0 200 50">
      <rect width="200" height="50" rx="8" fill="#6366f1"/>
      <text x="100" y="30" text-anchor="middle" fill="white" font-family="sans-serif" font-size="14">Test Button</text>
    </svg>`;
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/plain": new Blob([svg], { type: "text/plain" }),
        "text/html": new Blob([svg], { type: "text/html" }),
      }),
    ]);
    console.log("Done. Now press Cmd+V on the Figma canvas.");
  };

  // ── TEST 4: SVG via DataTransfer (execCommand copy trick) ──────────────────
  window.testPaste4_SVGDataTransfer = function() {
    console.log("%c[Test 4] Writing SVG via DataTransfer...", "color: #A259FF; font-weight: bold;");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="50" viewBox="0 0 200 50">
      <rect width="200" height="50" rx="8" fill="#6366f1"/>
      <text x="100" y="30" text-anchor="middle" fill="white" font-family="sans-serif" font-size="14">Test Button</text>
    </svg>`;
    const handler = (e) => {
      e.preventDefault();
      e.clipboardData.setData("text/plain", svg);
      e.clipboardData.setData("text/html", svg);
      // Try the SVG MIME type — Figma might read this
      try { e.clipboardData.setData("image/svg+xml", svg); } catch(err) { console.log("image/svg+xml not supported:", err.message); }
      document.removeEventListener("copy", handler, true);
      console.log("Done. Now press Cmd+V on the Figma canvas.");
    };
    document.addEventListener("copy", handler, true);
    document.execCommand("copy");
  };

  // ── TEST 5: SVG as image/svg+xml blob (Async Clipboard API) ───────────────
  window.testPaste5_SVGBlob = async function() {
    console.log("%c[Test 5] Writing SVG as image/svg+xml blob...", "color: #A259FF; font-weight: bold;");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="50" viewBox="0 0 200 50">
      <rect width="200" height="50" rx="8" fill="#6366f1"/>
      <text x="100" y="30" text-anchor="middle" fill="white" font-family="sans-serif" font-size="14">Test Button</text>
    </svg>`;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "image/svg+xml": new Blob([svg], { type: "image/svg+xml" }),
          "text/plain": new Blob([svg], { type: "text/plain" }),
        }),
      ]);
      console.log("Done. Now press Cmd+V on the Figma canvas.");
    } catch(err) {
      console.log("image/svg+xml rejected by browser:", err.message);
      console.log("Falling back to text/html...");
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([svg], { type: "text/plain" }),
          "text/html": new Blob([`<div>${svg}</div>`], { type: "text/html" }),
        }),
      ]);
      console.log("Done (fallback). Now press Cmd+V on the Figma canvas.");
    }
  };

  // ── TEST 6: PNG image ──────────────────────────────────────────────────────
  window.testPaste6_PNG = async function() {
    console.log("%c[Test 6] Rendering to PNG and writing to clipboard...", "color: #A259FF; font-weight: bold;");
    const canvas = document.createElement("canvas");
    canvas.width = 200; canvas.height = 50;
    const ctx = canvas.getContext("2d");
    // Draw rounded rect
    ctx.beginPath();
    ctx.roundRect(0, 0, 200, 50, 8);
    ctx.fillStyle = "#6366f1";
    ctx.fill();
    // Draw text
    ctx.fillStyle = "white";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Test Button", 100, 25);

    canvas.toBlob(async (blob) => {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        console.log("Done. Now press Cmd+V on the Figma canvas. (Will paste as image fill)");
      } catch(err) {
        console.error("PNG clipboard write failed:", err.message);
      }
    }, "image/png");
  };

  console.log("%c[Paste Tester] Ready! Run any of these in console:", "color: #A259FF; font-weight: bold; font-size: 14px;");
  console.log("%ctestPaste1_PlainHTML()  — plain HTML as text/html", "color: #aaa;");
  console.log("%ctestPaste2_SVG()        — SVG with foreignObject", "color: #aaa;");
  console.log("%ctestPaste3_PureSVG()    — pure SVG shapes", "color: #aaa;");
  console.log("%ctestPaste4_SVGDataTransfer() — SVG via DataTransfer + execCommand", "color: #aaa;");
  console.log("%ctestPaste5_SVGBlob()    — SVG as image/svg+xml blob", "color: #aaa;");
  console.log("%ctestPaste6_PNG()        — rendered PNG image", "color: #aaa;");
  console.log("%c\nAfter running a test, click the Figma canvas and press Cmd+V", "color: #FFD700;");
})();
