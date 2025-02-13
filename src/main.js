#!/usr/bin/env node

const puppeteer = require('puppeteer');

const MainModule = require('./modules/main-module'),
     PageWrapper = require('./common-utils/page-wrapper'),
     { program } = require('commander');


(async () => {
    // Parse command line arguments
    program
        .argument('url', 'url of the web application to crawl')
        .option('--headless', 'start Chrome in headless mode')
        .option('--debug', 'activate debug mode')
        .option('--manual', 'provide commands yourself instead of an LLM')
        .option('--clipboard', 'copy LLM prompt to clipboard automatically (only in manual mode)')
        .option('--gpt4', 'use gpt-4 instead of the default gpt-3.5-turbo')
        .option('--gpt4vision', 'use the gpt-4 vision preview API')
        .option('--screenshot', 'take a screenshot of every step')
        .option('--autotask', 'generate tasks automatically')
        .option('--autotask-only', 'exit after autotask generation')
        .option('--no-attack', 'skip the attack phase after the crawl')
        .option('--openemr-fix', 'fix a login-related issue occurring in OpenEMR')
        .option('--orangehrm-fix', 'fix a load issue occurring in OrangeHRM')
        .option('-m, --model <modelname>','model name to use')
        .option('-me, --model-endpoint <url>', 'specify a custom OpenAI-compatible model endpoint to use', null)
        .option('-w, --context-window <tokens>', 'specify a custom LLM context window limit which is obeyed', 8192)
        .option('-a, --run-attack <filepath>', 'attack the forms from a file')
        .option('-t, --timeout <mins>', 'timeout after which the entire scan stops (in minutes)')
        .option('-c, --crawl-timeout <mins>', 'timeout after which the crawling phase stops (in minutes)')
        .option('-u, --username <user>', 'log in with the specified username')
        .option('-p, --password <pass>', 'log in with the specified password')
        .option('-f, --taskfile <filepath>', 'use a custom task file instead of /input/default-tasks.txt')
        .option('-e, --eval <jsfile>', 'evaluate the crawler\'s performance using custom JS tests')
        .parse();

    // Setup timeout after which the crawler is terminated
    if (program.opts().timeout !== undefined) {
        console.log('Setting timeout to', program.opts().timeout, 'minutes.')
        setTimeout(() => {
            console.log('[' + new Date().toISOString() + ']', 'Scanning timeout was reached! The process is stopped...');
            process.exit(0);
        }, 1000 * 60 * program.opts().timeout);
    }

    // Method for creating a new browser
    const setupBrowser = async () => {
        const browser = await puppeteer.launch({
            headless: Boolean(program.opts().headless),
            args: ['--no-sandbox', '--disable-dev-shm-usage'],
            defaultViewport: {
                width:1920,
                height:1080
            }
        });
        const page = (await browser.pages())[0];
        const cdp = await page.target().createCDPSession();
        return {browser, page, cdp}
    }

    // Initialize page wrapper
    let startUrl = program.args[0];
    let { browser, page } = await setupBrowser();

    // Create a separate page for the evaluation module (if activated)
    let evalPage;
    if (program.opts().eval) {
        await browser.newPage();
        evalPage = (await browser.pages())[1];
        await page.bringToFront();  // Bring the original crawling tab back to front
    }

    // Immediately close newly created tabs
    browser.on('targetcreated', async (target) => {
        const page = await target.page();
        if (page) page.close();
    });

    let pageWrapper = new PageWrapper(browser, page, evalPage, startUrl);

    // Initialize modules
    let mainModule = new MainModule(pageWrapper, startUrl);

    // Start crawling
    await mainModule.crawl();
    process.exit();
})();
