// =============================================================================
// LOTTIELAB CLIPBOARD INTERCEPTOR
// =============================================================================
// 1. Open app.lottielab.com, open any project
// 2. Open DevTools (F12) → Console
// 3. Paste this script, press Enter
// 4. Select a layer on canvas → Cmd+C → check console output
// 5. Then try Cmd+V to see what Lottielab reads
// =============================================================================

(function() {
  console.log("%c[Lottielab Interceptor] Loading...", "color: #FF6B6B; font-weight: bold; font-size: 14px;");

  // ── INTERCEPT: document copy event ────────────────────────────────────────
  document.addEventListener("copy", function(e) {
    console.log("%c════ COPY EVENT ════", "color: #FF6B6B; font-weight: bold;");
    var types = e.clipboardData.types;
    console.log("MIME types:", JSON.stringify(Array.from(types)));
    for (var i = 0; i < types.length; i++) {
      var type = types[i];
      var data = e.clipboardData.getData(type);
      console.log("[COPY] " + type + " (" + data.length + " chars):");
      if (data.length < 5000) {
        console.log(data);
      } else {
        console.log("First 2000:", data.substring(0, 2000));
        console.log("Last 500:", data.substring(data.length - 500));
      }
      // Check for known patterns
      if (data.indexOf("lottielab") >= 0) console.log("%c  → Contains 'lottielab'!", "color: #10B981; font-weight: bold;");
      if (data.indexOf("data-contents") >= 0) console.log("%c  → Contains 'data-contents'!", "color: #10B981; font-weight: bold;");
      if (data.indexOf("lottie") >= 0) console.log("%c  → Contains 'lottie'!", "color: #10B981; font-weight: bold;");
      // Try to decode if it looks like encoded JSON
      if (type === "text/html") {
        var doc = new DOMParser().parseFromString(data, "text/html");
        var allEls = doc.querySelectorAll("*");
        for (var j = 0; j < allEls.length; j++) {
          var el = allEls[j];
          for (var k = 0; k < el.attributes.length; k++) {
            var attr = el.attributes[k];
            if (attr.value.length > 50) {
              console.log("%c  Element: " + el.tagName + "#" + (el.id || "") + " attr=" + attr.name + " len=" + attr.value.length, "color: #6366f1;");
              // Try URL decoding
              try {
                var decoded = decodeURIComponent(attr.value);
                if (decoded.charAt(0) === '[' || decoded.charAt(0) === '{') {
                  console.log("%c  → URL-decoded JSON!", "color: #10B981; font-weight: bold;");
                  var parsed = JSON.parse(decoded);
                  console.log("  Parsed:", parsed);
                  window.__lottielabCopyData = parsed;
                }
              } catch(ex) {}
              // Try base64
              try {
                var b64decoded = atob(attr.value);
                if (b64decoded.charAt(0) === '[' || b64decoded.charAt(0) === '{') {
                  console.log("%c  → Base64-decoded JSON!", "color: #10B981; font-weight: bold;");
                  console.log("  Parsed:", JSON.parse(b64decoded));
                }
              } catch(ex) {}
            }
          }
        }
      }
    }
  }, true);

  // ── INTERCEPT: document paste event ───────────────────────────────────────
  document.addEventListener("paste", function(e) {
    console.log("%c════ PASTE EVENT ════", "color: #00BFFF; font-weight: bold;");
    var types = e.clipboardData.types;
    console.log("MIME types:", JSON.stringify(Array.from(types)));
    for (var i = 0; i < types.length; i++) {
      var type = types[i];
      var data = e.clipboardData.getData(type);
      console.log("[PASTE] " + type + " (" + data.length + " chars):");
      console.log(data.substring(0, 2000));
    }
    if (e.clipboardData.files && e.clipboardData.files.length) {
      console.log("[PASTE] Files:", e.clipboardData.files.length);
      for (var f = 0; f < e.clipboardData.files.length; f++) {
        console.log("  File:", e.clipboardData.files[f].name, e.clipboardData.files[f].type, e.clipboardData.files[f].size + "b");
      }
    }
    if (e.clipboardData.items) {
      console.log("[PASTE] Items:", e.clipboardData.items.length);
      for (var ii = 0; ii < e.clipboardData.items.length; ii++) {
        console.log("  Item:", e.clipboardData.items[ii].kind, e.clipboardData.items[ii].type);
      }
    }
  }, true);

  // ── MONKEY-PATCH: navigator.clipboard.write ───────────────────────────────
  var origWrite = navigator.clipboard.write.bind(navigator.clipboard);
  navigator.clipboard.write = async function(items) {
    console.log("%c[clipboard.write] " + items.length + " item(s)", "color: #FFA500; font-weight: bold;");
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      console.log("  types:", item.types);
      for (var j = 0; j < item.types.length; j++) {
        var type = item.types[j];
        try {
          var blob = await item.getType(type);
          var text = await blob.text();
          console.log("  " + type + " (" + blob.size + "b):", text.substring(0, 3000));
          if (type === "text/html" && text.indexOf("lottielab") >= 0) {
            console.log("%c  → Lottielab HTML payload!", "color: #10B981; font-weight: bold;");
            window.__lottielabWriteData = text;
          }
        } catch(ex) {
          console.log("  " + type + ": (could not read:", ex.message + ")");
        }
      }
    }
    return origWrite(items);
  };

  // ── MONKEY-PATCH: navigator.clipboard.read ────────────────────────────────
  var origRead = navigator.clipboard.read.bind(navigator.clipboard);
  navigator.clipboard.read = async function() {
    console.log("%c[clipboard.read] called", "color: #FFA500; font-weight: bold;");
    var items = await origRead();
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      console.log("  types:", item.types);
      for (var j = 0; j < item.types.length; j++) {
        var type = item.types[j];
        try {
          var blob = await item.getType(type);
          if (blob.size < 200000) {
            var text = await blob.text();
            console.log("  " + type + " (" + blob.size + "b):", text.substring(0, 3000));
          } else {
            console.log("  " + type + ": " + blob.size + "b (too large)");
          }
        } catch(ex) {}
      }
    }
    return items;
  };

  // ── MONKEY-PATCH: navigator.clipboard.writeText ───────────────────────────
  var origWriteText = navigator.clipboard.writeText.bind(navigator.clipboard);
  navigator.clipboard.writeText = async function(text) {
    console.log("%c[clipboard.writeText] " + text.length + " chars", "color: #FFA500;");
    console.log(text.substring(0, 1000));
    return origWriteText(text);
  };

  // ── MONKEY-PATCH: navigator.clipboard.readText ────────────────────────────
  var origReadText = navigator.clipboard.readText.bind(navigator.clipboard);
  navigator.clipboard.readText = async function() {
    console.log("%c[clipboard.readText] called", "color: #FFA500;");
    var text = await origReadText();
    console.log("  result (" + text.length + " chars):", text.substring(0, 1000));
    return text;
  };

  // ── MONKEY-PATCH: DataTransfer.setData ────────────────────────────────────
  var origSetData = DataTransfer.prototype.setData;
  DataTransfer.prototype.setData = function(type, data) {
    console.log("%c[DataTransfer.setData] " + type + " (" + data.length + " chars)", "color: #FFA500;");
    if (data.length < 3000) console.log(data);
    else console.log(data.substring(0, 2000) + "...");
    return origSetData.call(this, type, data);
  };

  console.log("%c[Lottielab Interceptor] Ready!", "color: #FF6B6B; font-weight: bold; font-size: 14px;");
  console.log("%cNow: select a layer → Cmd+C → check output above", "color: #888;");
  console.log("%cThen: Cmd+V to see what Lottielab reads on paste", "color: #888;");
  console.log("");
  console.log("%cAfter copying, run: console.log(window.__lottielabCopyData)", "color: #888;");
  console.log("%cOr: console.log(window.__lottielabWriteData)", "color: #888;");
})();
