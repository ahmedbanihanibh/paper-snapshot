#!/usr/bin/env node

/**
 * Test script to verify the clipboard wrapper format
 * This simulates what the extension does and verifies the output
 */

// Simulate the copyToClipboardForOpenPencil function
function wrapForOpenPencil(html) {
  return `<x-openpencil-html>${html}</x-openpencil-html>`;
}

// Test HTML samples
const testCases = [
  {
    name: "Simple button",
    input: `<button style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; padding: 12px 24px; font-size: 14px; font-weight: 600;">Primary Button</button>`,
  },
  {
    name: "Card with nested elements",
    input: `<div style="background: white; border-radius: 16px; padding: 32px; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
  <h2 style="color: #1a202c; font-size: 24px; font-weight: 600; margin-bottom: 16px;">Card Title</h2>
  <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">Card description text</p>
</div>`,
  },
  {
    name: "Flexbox container",
    input: `<div style="display: flex; gap: 12px; justify-content: space-between; align-items: center; padding: 16px; background: rgba(255,255,255,0.95); border-radius: 12px;">
  <span style="font-weight: 700; color: #667eea;">Logo</span>
  <nav style="display: flex; gap: 24px;">
    <a href="#" style="color: #4a5568; font-size: 14px;">Home</a>
    <a href="#" style="color: #4a5568; font-size: 14px;">About</a>
  </nav>
</div>`,
  },
];

console.log("🧪 Testing OpenPencil Clipboard Format\n");
console.log("=" .repeat(60));

let passCount = 0;
let failCount = 0;

for (const testCase of testCases) {
  console.log(`\n📋 Test: ${testCase.name}`);
  console.log("-" .repeat(60));

  const wrapped = wrapForOpenPencil(testCase.input);

  // Verify wrapper tags
  const hasOpenTag = wrapped.startsWith("<x-openpencil-html>");
  const hasCloseTag = wrapped.endsWith("</x-openpencil-html>");
  const containsOriginal = wrapped.includes(testCase.input);

  console.log(`   Opening tag: ${hasOpenTag ? "✅" : "❌"}`);
  console.log(`   Closing tag: ${hasCloseTag ? "✅" : "❌"}`);
  console.log(`   Contains original HTML: ${containsOriginal ? "✅" : "❌"}`);

  if (hasOpenTag && hasCloseTag && containsOriginal) {
    console.log(`   Result: ✅ PASS`);
    passCount++;
  } else {
    console.log(`   Result: ❌ FAIL`);
    failCount++;
  }

  // Show a preview
  const preview = wrapped.length > 150
    ? wrapped.slice(0, 150) + "..."
    : wrapped;
  console.log(`   Preview: ${preview}`);
}

console.log("\n" + "=" .repeat(60));
console.log(`\n📊 Results: ${passCount} passed, ${failCount} failed\n`);

if (failCount === 0) {
  console.log("✅ All tests passed! The clipboard format is correct.");
  process.exit(0);
} else {
  console.log("❌ Some tests failed. Check the implementation.");
  process.exit(1);
}
