import { chromium } from 'playwright';
import fs from 'fs';

const testHtml = `
<!DOCTYPE html>
<html>
<body style="background: #1a1a1a; color: white; padding: 20px;">
  <button id="btn" style="background: #333; color: white; border: 1px solid #555; padding: 8px 16px; border-radius: 6px;">
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor">
      <path d="M3 8L7 12L13 4" stroke-width="2"/>
    </svg>
    Click me
  </button>
</body>
</html>
`;

fs.writeFileSync('/tmp/test-colors.html', testHtml);

// Read the BUILT extension file
const builtJs = fs.readFileSync('./packages/web-extension/dist/src/background/background.js', 'utf8');

// Extract the serializeElement function from the built code
// The function is defined as "async function serializeElement(selector)"
const serializeMatch = builtJs.match(/async function serializeElement\(selector\)\s*\{/);
console.log('Found serializeElement:', !!serializeMatch);

async function test() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('file:///tmp/test-colors.html');
  await page.waitForSelector('#btn');
  
  // Inject the entire background.js and extract the function
  await page.addScriptTag({ content: builtJs });
  
  // Test by calling the function the same way chrome.scripting.executeScript would
  const result = await page.evaluate(async () => {
    // Find the serializeElement function (it should be in scope)
    try {
      // The function is defined in the script but not exposed globally
      // Let's access it through the window object if it was defined there
      const fn = window.serializeElement || serializeElement;
      return await fn('#btn');
    } catch (e) {
      return { error: e.message, available: typeof serializeElement, windowFn: typeof window.serializeElement };
    }
  });
  
  console.log("Result:", result);
  
  await browser.close();
}

test().catch(console.error);
