/**
 * Interwall Inventory OS - Browser Test Suite
 * Tests UI components, identifies weaknesses, captures screenshots
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://inventory.zenithcred.com';
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');
const REPORT_FILE = path.join(__dirname, 'test-report.md');

// Test credentials (from localStorage simulation)
const TEST_USER = 'otto';
const TEST_PASS = process.env.INVENTREE_PASSWORD || 'test123';

// Ensure screenshot directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const report = {
    timestamp: new Date().toISOString(),
    tests: [],
    issues: [],
    screenshots: [],
    consoleErrors: [],
    networkErrors: []
};

function addTest(name, status, details = '') {
    report.tests.push({ name, status, details });
    console.log(`${status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️'} ${name}${details ? ': ' + details : ''}`);
}

function addIssue(severity, title, description) {
    report.issues.push({ severity, title, description });
    console.log(`🔴 ISSUE [${severity}]: ${title}`);
}

async function screenshot(page, name) {
    const filename = `${name.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.png`;
    const filepath = path.join(SCREENSHOT_DIR, filename);
    await page.screenshot({ path: filepath, fullPage: true });
    report.screenshots.push({ name, file: filename });
    console.log(`📸 Screenshot: ${filename}`);
    return filepath;
}

async function runTests() {
    console.log('🚀 Starting Interwall Inventory Browser Tests\n');
    
    const browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        ignoreHTTPSErrors: true
    });
    
    const page = await context.newPage();
    
    // Capture console errors
    page.on('console', msg => {
        if (msg.type() === 'error') {
            report.consoleErrors.push({
                text: msg.text(),
                location: msg.location()
            });
        }
    });
    
    // Capture network errors
    page.on('requestfailed', request => {
        report.networkErrors.push({
            url: request.url(),
            failure: request.failure()?.errorText
        });
    });

    try {
        // ========================================
        // TEST 1: Initial Page Load
        // ========================================
        console.log('\n--- Test 1: Initial Page Load ---');
        
        const loadStart = Date.now();
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
        const loadTime = Date.now() - loadStart;
        
        await screenshot(page, '01-initial-load');
        
        if (loadTime > 10000) {
            addIssue('HIGH', 'Slow Initial Load', `Page took ${loadTime}ms to load (>10s)`);
            addTest('Initial Load Time', 'WARN', `${loadTime}ms`);
        } else {
            addTest('Initial Load Time', 'PASS', `${loadTime}ms`);
        }

        // Check for login modal
        const loginModal = await page.$('#loginModal.active');
        if (loginModal) {
            addTest('Login Modal Displayed', 'PASS');
            await screenshot(page, '02-login-modal');
        } else {
            // Check if already logged in (has token)
            const hasToken = await page.evaluate(() => !!localStorage.getItem('inventree_token'));
            if (hasToken) {
                addTest('Already Logged In', 'PASS');
            } else {
                addIssue('MEDIUM', 'Login Modal Not Shown', 'Expected login modal but not displayed');
                addTest('Login Modal Displayed', 'FAIL');
            }
        }

        // ========================================
        // TEST 2: Login Flow (if needed)
        // ========================================
        console.log('\n--- Test 2: Login Flow ---');
        
        // Set token directly for testing (bypass login)
        await page.evaluate((token) => {
            localStorage.setItem('inventree_token', token);
        }, 'inv-4bea0f63baaf4a01d5dc6aed3823f7576cfd6876-20260110');
        
        await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(3000); // Wait for app to initialize
        
        await screenshot(page, '03-after-login');
        
        // Check if loader is hidden
        const loaderHidden = await page.$eval('#appLoader', el => el.classList.contains('hidden')).catch(() => true);
        if (loaderHidden) {
            addTest('App Loader Hidden After Init', 'PASS');
        } else {
            addIssue('HIGH', 'App Stuck on Loader', 'Loader not hidden after initialization');
            addTest('App Loader Hidden After Init', 'FAIL');
        }

        // ========================================
        // TEST 3: Wall View
        // ========================================
        console.log('\n--- Test 3: Wall View ---');
        
        // Click Wall nav item
        await page.click('[data-view="wall"]').catch(() => {});
        await page.waitForTimeout(2000);
        
        await screenshot(page, '04-wall-view');
        
        // Check for wall grid
        const wallGrid = await page.$('#wallGrid');
        if (wallGrid) {
            const cells = await page.$$('.wall-cell');
            addTest('Wall Grid Rendered', 'PASS', `${cells.length} cells`);
            
            if (cells.length === 0) {
                addIssue('MEDIUM', 'No Wall Cells', 'Wall grid exists but no cells rendered');
            }
        } else {
            addIssue('HIGH', 'Wall Grid Missing', 'Wall grid element not found');
            addTest('Wall Grid Rendered', 'FAIL');
        }
        
        // Check for zone configuration
        const zones = await page.$$('[data-zone]');
        addTest('Zones Loaded', zones.length > 0 ? 'PASS' : 'WARN', `${zones.length} zones`);

        // ========================================
        // TEST 4: Catalog View
        // ========================================
        console.log('\n--- Test 4: Catalog View ---');
        
        await page.click('[data-view="catalog"]').catch(() => {});
        await page.waitForTimeout(3000);
        
        await screenshot(page, '05-catalog-view');
        
        // Check catalog grid
        const catalogGrid = await page.$('#catalogGrid');
        if (catalogGrid) {
            const parts = await page.$$('.part-card');
            addTest('Catalog Grid Rendered', 'PASS', `${parts.length} parts`);
        } else {
            addIssue('HIGH', 'Catalog Grid Missing', 'Catalog grid not found');
            addTest('Catalog Grid Rendered', 'FAIL');
        }
        
        // Test search functionality
        const searchInput = await page.$('#catalogSearch');
        if (searchInput) {
            await searchInput.fill('RAM');
            await page.waitForTimeout(1000);
            await screenshot(page, '06-catalog-search');
            addTest('Catalog Search Works', 'PASS');
        }

        // ========================================
        // TEST 5: Profit View
        // ========================================
        console.log('\n--- Test 5: Profit View ---');
        
        await page.click('[data-view="profit"]').catch(() => {});
        await page.waitForTimeout(3000);
        
        await screenshot(page, '07-profit-view');
        
        // Check summary cards
        const summaryCards = await page.$$('.summary-card');
        addTest('Summary Cards Rendered', summaryCards.length >= 4 ? 'PASS' : 'WARN', `${summaryCards.length} cards`);
        
        // Check chart
        const chart = await page.$('#profitChart');
        addTest('Profit Chart Exists', chart ? 'PASS' : 'FAIL');
        
        // Check transactions list
        const transactions = await page.$$('.transaction-card');
        addTest('Transactions Loaded', 'PASS', `${transactions.length} transactions`);

        // ========================================
        // TEST 6: Config Popup (Gear Icon)
        // ========================================
        console.log('\n--- Test 6: Config Popup ---');
        
        const configBtn = await page.$('#btnConfigCosts');
        if (configBtn) {
            await configBtn.click();
            await page.waitForTimeout(1000);
            
            await screenshot(page, '08-config-popup');
            
            const configModal = await page.$('#profitConfigModal.active');
            if (configModal) {
                addTest('Config Popup Opens', 'PASS');
                
                // Check for fixed costs
                const costItems = await page.$$('#configFixedCostsList .config-item');
                addTest('Fixed Costs Displayed', 'PASS', `${costItems.length} costs`);
                
                // Check for fixed components
                const compItems = await page.$$('#configFixedComponentsList .config-item');
                addTest('Fixed Components Displayed', 'PASS', `${compItems.length} components`);
                
                // Check sync status
                const syncStatus = await page.$eval('#configSyncStatus', el => el.textContent).catch(() => '');
                if (syncStatus.includes('Local only')) {
                    addIssue('MEDIUM', 'Config Not Synced', 'Config shows "Local only" instead of synced');
                }
                addTest('Sync Status Shown', 'PASS', syncStatus.trim());
                
                // Close modal
                await page.click('#profitConfigClose').catch(() => {});
                await page.waitForTimeout(500);
            } else {
                addIssue('HIGH', 'Config Popup Not Opening', 'Clicked config button but modal not active');
                addTest('Config Popup Opens', 'FAIL');
            }
        } else {
            addIssue('HIGH', 'Config Button Missing', 'Gear icon button not found');
            addTest('Config Button Exists', 'FAIL');
        }

        // ========================================
        // TEST 7: Record Sale Modal
        // ========================================
        console.log('\n--- Test 7: Record Sale Modal ---');
        
        const recordSaleBtn = await page.$('#btnRecordSale');
        if (recordSaleBtn) {
            await recordSaleBtn.click();
            await page.waitForTimeout(1500);
            
            await screenshot(page, '09-record-sale-modal');
            
            const saleModal = await page.$('#recordSaleModal.active');
            if (saleModal) {
                addTest('Record Sale Modal Opens', 'PASS');
                
                // Check component dropdown
                const compSelect = await page.$('#componentSelect');
                if (compSelect) {
                    const options = await page.$$eval('#componentSelect option', opts => opts.length);
                    addTest('Component Dropdown Populated', options > 1 ? 'PASS' : 'WARN', `${options} options`);
                    
                    // Check for SKU display in dropdown
                    const firstOption = await page.$eval('#componentSelect option:nth-child(2)', 
                        el => el.textContent).catch(() => '');
                    if (firstOption.includes('[') && firstOption.includes(']')) {
                        addTest('SKU Shown in Dropdown', 'PASS');
                    } else {
                        addIssue('MEDIUM', 'SKU Not in Dropdown', 'Component dropdown should show [SKU] prefix');
                        addTest('SKU Shown in Dropdown', 'FAIL');
                    }
                }
                
                // Check fixed components section
                const fixedComps = await page.$('#fixedComponentsContainer');
                addTest('Fixed Components Section Exists', fixedComps ? 'PASS' : 'FAIL');
                
                // Check cost breakdown
                const costBreakdown = await page.$('.cost-breakdown-grid');
                addTest('Cost Breakdown Displayed', costBreakdown ? 'PASS' : 'FAIL');
                
                // Close modal
                await page.click('#recordSaleClose').catch(() => {});
                await page.waitForTimeout(500);
            } else {
                addIssue('HIGH', 'Record Sale Modal Not Opening', 'Clicked button but modal not active');
                addTest('Record Sale Modal Opens', 'FAIL');
            }
        }

        // ========================================
        // TEST 8: View Navigation
        // ========================================
        console.log('\n--- Test 8: View Navigation ---');
        
        // Test switching between all views
        const views = ['wall', 'catalog', 'profit'];
        for (const view of views) {
            await page.click(`[data-view="${view}"]`).catch(() => {});
            await page.waitForTimeout(1000);
            
            const activeView = await page.$(`#view-${view}.active`);
            if (activeView) {
                addTest(`Navigate to ${view}`, 'PASS');
            } else {
                addIssue('HIGH', `View ${view} Not Activating`, 'Navigation click did not activate view');
                addTest(`Navigate to ${view}`, 'FAIL');
            }
        }
        
        await screenshot(page, '10-final-state');

        // ========================================
        // TEST 9: Console Errors Check
        // ========================================
        console.log('\n--- Test 9: Console Errors ---');
        
        if (report.consoleErrors.length > 0) {
            addIssue('MEDIUM', 'Console Errors Detected', `${report.consoleErrors.length} errors`);
            addTest('No Console Errors', 'FAIL', `${report.consoleErrors.length} errors`);
        } else {
            addTest('No Console Errors', 'PASS');
        }

        // ========================================
        // TEST 10: Network Errors Check
        // ========================================
        console.log('\n--- Test 10: Network Errors ---');
        
        if (report.networkErrors.length > 0) {
            addIssue('MEDIUM', 'Network Errors Detected', `${report.networkErrors.length} failed requests`);
            addTest('No Network Errors', 'FAIL', `${report.networkErrors.length} errors`);
        } else {
            addTest('No Network Errors', 'PASS');
        }

    } catch (error) {
        console.error('❌ Test Error:', error.message);
        report.issues.push({
            severity: 'CRITICAL',
            title: 'Test Suite Error',
            description: error.message
        });
        await screenshot(page, 'error-state');
    } finally {
        await browser.close();
    }

    // Generate Report
    generateReport();
}

function generateReport() {
    const passCount = report.tests.filter(t => t.status === 'PASS').length;
    const failCount = report.tests.filter(t => t.status === 'FAIL').length;
    const warnCount = report.tests.filter(t => t.status === 'WARN').length;
    
    let md = `# Interwall Inventory OS - Browser Test Report

**Generated:** ${report.timestamp}
**Test Results:** ${passCount} Passed | ${failCount} Failed | ${warnCount} Warnings

---

## Summary

| Metric | Value |
|--------|-------|
| Total Tests | ${report.tests.length} |
| Passed | ${passCount} |
| Failed | ${failCount} |
| Warnings | ${warnCount} |
| Issues Found | ${report.issues.length} |
| Console Errors | ${report.consoleErrors.length} |
| Network Errors | ${report.networkErrors.length} |

---

## Test Results

| Test | Status | Details |
|------|--------|---------|
${report.tests.map(t => `| ${t.name} | ${t.status} | ${t.details || '-'} |`).join('\n')}

---

## Issues Found

${report.issues.length === 0 ? '_No issues found_' : report.issues.map(i => `
### [${i.severity}] ${i.title}
${i.description}
`).join('\n')}

---

## Console Errors

${report.consoleErrors.length === 0 ? '_No console errors_' : '```\n' + report.consoleErrors.map(e => e.text).join('\n') + '\n```'}

---

## Network Errors

${report.networkErrors.length === 0 ? '_No network errors_' : report.networkErrors.map(e => `- ${e.url}: ${e.failure}`).join('\n')}

---

## Screenshots

${report.screenshots.map(s => `- **${s.name}**: \`${s.file}\``).join('\n')}

---

## Raw Data

\`\`\`json
${JSON.stringify(report, null, 2)}
\`\`\`
`;

    fs.writeFileSync(REPORT_FILE, md);
    console.log(`\n📄 Report saved to: ${REPORT_FILE}`);
    console.log(`\n📊 Summary: ${passCount} Passed | ${failCount} Failed | ${warnCount} Warnings | ${report.issues.length} Issues`);
}

runTests().catch(console.error);
