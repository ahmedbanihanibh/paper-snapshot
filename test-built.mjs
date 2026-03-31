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

async function test() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('file:///tmp/test-colors.html');
  await page.waitForSelector('#btn');
  
  await page.addScriptTag({ content: builtJs });
  
  const result = await page.evaluate(async () => {
    try {
      const result = await serializeElement('#btn');
      return result;
    } catch (e) {
      return { error: e.message };
    }
  });
  
  console.log("=== BUILT Extension Output ===");
  if (result.html) {
    console.log(result.html);
    
    // Check for issues
    console.log("\n=== Analysis ===");
    const svgMatch = result.html.match(/<svg[^>]*>(.*?)<\/svg>/);
    if (svgMatch) {
      console.log("SVG found:", svgMatch[0].substring(0, 200));
      const hasPath = svgMatch[0].includes('<path');
      console.log("Has path:", hasPath);
    }
    
    // Check for noise
    const issues = [];
    if (result.html.includes('stroke="currentColor"')) issues.push('currentColor not resolved');
    if (result.html.includes('borderInlineColor') || result.html.includes('border-inline-color')) issues.push('border color noise present');
    if (result.html.includes('border-top-color')) issues.push('physical border color present');
    
    console.log("Issues:", issues.length === 0 ? 'None' : issues.join(', '));
  } else {
    console.log("Error:", result);
  }
  
  await browser.close();
}

test().catch(console.error);
