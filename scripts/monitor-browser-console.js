const puppeteer = require('puppeteer');

const URL = 'https://colabora-app.fly.dev';

async function monitorConsole() {
  console.log('🚀 Launching browser to monitor console...\n');
  
  const browser = await puppeteer.launch({
    headless: false, // Show the browser
    defaultViewport: null,
    args: ['--start-maximized']
  });

  const page = await browser.newPage();

  // Monitor console messages
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    const timestamp = new Date().toISOString();
    
    const icon = {
      'log': '📝',
      'warning': '⚠️',
      'error': '❌',
      'info': 'ℹ️',
      'debug': '🔍'
    }[type] || '📄';

    console.log(`[${timestamp}] ${icon} [${type.toUpperCase()}] ${text}`);
  });

  // Monitor page errors
  page.on('pageerror', error => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ❌ [PAGE ERROR] ${error.message}`);
    if (error.stack) {
      console.log(`[${timestamp}] Stack: ${error.stack}`);
    }
  });

  // Monitor request failures
  page.on('requestfailed', request => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] 🔴 [REQUEST FAILED] ${request.url()}`);
    console.log(`[${timestamp}] Failure: ${request.failure().errorText}`);
  });

  // Monitor response errors
  page.on('response', response => {
    if (response.status() >= 400) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] ⚠️ [HTTP ${response.status()}] ${response.url()}`);
    }
  });

  console.log(`🌐 Navigating to ${URL}...\n`);
  await page.goto(URL, { 
    waitUntil: 'networkidle0',
    timeout: 60000 
  });

  console.log('\n✅ Page loaded. Monitoring console messages...\n');
  console.log('Press Ctrl+C to stop monitoring.\n');
  console.log('='.repeat(80) + '\n');

  // Keep the script running
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Stopping browser monitor...');
    await browser.close();
    process.exit(0);
  });
}

monitorConsole().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

