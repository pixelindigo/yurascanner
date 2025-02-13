const puppeteer = require('puppeteer'),
         config = require('../config'),
          chalk = require('chalk'),
           path = require('path'),
             fs = require('fs');
const {program} = require('commander');

// Define chalk color
const debugColor = chalk.bold.yellow;
const infoColor = chalk.bold.hex('#ff5f15');


function checkUrlHostname(url, hostname) {
    // Reject URLs that do not have the same hostname (probably lead to other websites).
    // URLs beginning with "javascript:" are an exception, since the hostname is empty in that case!
    // E.g., there might be elements with href="javascript:history.back()"
    try {
        let parsedUrl = new URL(url);
        return (parsedUrl.hostname === hostname) || (parsedUrl.protocol === 'javascript:');
    } catch (e) {
        return true;
    }
}

async function elementToText(element) {
    return await element.evaluate((el) => {
        const isString = (value) => typeof value == 'string' || value instanceof String;

        // Find the first string in the array that is not empty or undefined
        let text = [el.ariaLabel, el.title, el.innerText, el.value].find(x => x && isString(x)) || '';
        return text.replace('\n', ' ').replace(/\s+/g, ' ').trim();
    });
}

async function collectEvents(page, newEventsOnly = false) {
    return await page.evaluate((newEventsOnly) => {
        let events1 = catch_properties();
        let events2 = added_events;

        // Save the old list (in case we only want to get the newly added events)
        let collectedEventsBefore = window.collectedEvents;

        // Concat lists and remove duplicates (by looking at function id)
        let events = events1.concat(events2);
        let functionIds = events.map(e => e.function_id);
        let collectedEventsAfter = events.filter(({function_id}, index) => !functionIds.includes(function_id, index + 1));

        // Update list of collected events on window object
        window.collectedEvents = collectedEventsAfter;
        console.warn('Collected Events:', window.collectedEvents);

        // Depending on whether we have a forced execution node, we only want to find the "new" event handlers
        if (newEventsOnly) {
            let functionIdsBefore = collectedEventsBefore.map(e => e.function_id);
            collectedEventsAfter = collectedEventsAfter.filter(e => !functionIdsBefore.includes(e.function_id));
        }

        // We can only return an array of function_ids because "element" property cannot be serialized
        return collectedEventsAfter.map(x => ({function_id: x.function_id}));
    }, newEventsOnly);
}

// Function code taken from https://stackoverflow.com/a/49959557
async function waitForKeypress() {
    process.stdin.setRawMode(true)
    return new Promise(resolve => process.stdin.once('data', data => {
        const byteArray = [...data]
        if (byteArray.length > 0 && byteArray[0] === 3) {
            console.log('^C')
            process.exit(1)
        }
        process.stdin.setRawMode(false)
        resolve()
    }))
}

async function waitForKeypressDebug() {
    if (program.opts().debug) {
        console.log(debugColor('[DEBUG MODE] Please press any key to continue...'));
        await waitForKeypress();
    }
}

async function sleep(milliseconds) {
    return new Promise(r => setTimeout(r, milliseconds));
}

function getOutputFilepath(identifier) {
    let filename = `[${identifier}] ` + new Date().toISOString();
    return path.resolve(__dirname, '../../output/', filename);
}

function writeUrlsToOutputFile(filepath, urls, elapsedTime, totalRequestCount, requestCountWithoutLogin) {
    let stream = fs.createWriteStream(filepath, {flags:'a+'});
    urls.forEach(url => stream.write(elapsedTime + ';' + totalRequestCount + ';' + requestCountWithoutLogin + ';'
        + url + '\n'));
}

function writeFormsToOutputFile(filepath, formObjects, elapsedTime, totalRequestCount, requestCountWithoutLogin) {
    let stream = fs.createWriteStream(filepath, {flags:'a+'});
    for (let formObject of formObjects) {
        stream.write(elapsedTime + ';' + totalRequestCount + ';' + requestCountWithoutLogin + ';'
            + JSON.stringify(formObject) + '\n');
    }
}

function addBrowserConsoleListener(page) {
    // Here we can specify special keywords we want to listen to in the browser console
    let messageKeywords = [
        'Found multiple event handlers registered for same event',
        'Emergency break'
    ];

    // Print all console messages which contain the specified keywords
    page.on('console', async (msg) => {
        if (messageKeywords.some(m => msg.text().includes(m))) {
            console.log(msg.text());

        } else if (msg.text().includes('Unexpected error from force Execution')) {
            // For errors, we have to get the error message
            let errorMessage = await msg.args()[1].executionContext().evaluate(arg => {
                if (arg instanceof Error) {
                    return arg.message;
                }
            }, msg.args()[1])
            console.warn('Error during forced execution:', errorMessage);
        }
    });
}



module.exports = {
    checkUrlHostname, elementToText, collectEvents, waitForKeypress, waitForKeypressDebug, sleep,
    getOutputFilepath, writeUrlsToOutputFile, writeFormsToOutputFile, addBrowserConsoleListener
};