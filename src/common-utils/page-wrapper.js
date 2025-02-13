const util = require('./util');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const { program } = require('commander');

// Define chalk color
const infoColor = chalk.bold.hex('#ff5f15');
const errorColor = chalk.bold.red;

class PageWrapper {
    constructor(browser, page, evalPage, startUrl) {
        this.browser = browser;
        this.page = page;
        this.evalPage = evalPage;

        let parsedUrl = new URL(startUrl);
        this.baseUrl = parsedUrl.protocol + '//' + parsedUrl.host;
        this.hostname = parsedUrl.hostname;

        this.trace = [];
        this.traceRecording = false;
    }

    async addBlackWidowScripts() {
        // We only use a subset of the Black Widow scripts
        let scriptNames = ['lib.js', 'md5.js', 'addeventlistener_wrapper.js', 'xss_xhr.js'];

        for (let scriptName of scriptNames) {
            let scriptPath = path.resolve(__dirname, '../black-widow-scripts/', scriptName);
            await this.page.evaluateOnNewDocument(fs.readFileSync(scriptPath).toString());
        }
    }

    addAlertListener() {
        this.page.on('dialog', async dialog => {
            await dialog.accept();
            console.log(infoColor('Alert box detected and removed!'));
        });
    }

    async restrictNavigationToSameHost() {
        this.page.on('request', req => {
            let isSameHost = util.checkUrlHostname(req.url(), this.hostname);
            if (req.isNavigationRequest() && !isSameHost) {
                console.log(infoColor('Abort cross-host navigation request to', req.url()));
                req.abort('aborted');
            } else {
                req.continue();
            }
        });
        await this.page.setRequestInterception(true);
    }

    getPageObj() {
        return this.page;
    }

    getEvalPageObj() {
        return this.evalPage;
    }

    async goto(url) {
        try {
            await this.page.goto(url);
            return;
        } catch (error) {
            console.log(errorColor('[!] Got error when going to', url, error));
            await this.page.close();
            this.browser.off('targetcreated');
            this.page = await this.browser.newPage();
            // Immediately close newly created tabs
            this.browser.on('targetcreated', async (target) => {
                const page = await target.page();
                if (page) page.close();
            });
            await this.restrictNavigationToSameHost();
            console.log(errorColor('[!] Recreated page'));
        }
        await this.page.goto(url);
    }

    getUrl() {
        return this.page.url();
    }

    async getTitle() {
        return await this.page.title();
    }

    async typeElement(element, text) {
        await this.recordType(element, text);
        await element.type(text);
    }
    async clickElementNoNavigation(element) {
        await this.recordClickNoNavigation(element);
        await element.click();
    }

    async clickElement(element) {
        await this.recordClick(element);
        // Rewrite anchor tags that are supposed to be opened in a new tab
        try {
            let rewroteTarget = await element.evaluate((el) => {
                if (el.tagName === 'A' && el.target === '_blank') {
                    el.target = '_self';
                    return true;
                }
            });
            if (rewroteTarget) {
                console.log(infoColor('Rewrote target attribute to open the link in the same tab!'));
            }
        } catch (error) {
            console.log(errorColor('[!] Got error when checking clicked element for target="_blank":', error));
        }

        // Now actually click the element
        try {
            await Promise.all([
                element.click(),
                this.page.waitForNavigation({ timeout: 5000 })
            ]);
            if (program.opts().orangehrmFix) {
                await this.page.waitForSelector('[class="oxd-layout"]', {timeout: 2000});
            }
            return true;
        } catch (error) {
            if (error.name !== 'TimeoutError') {
                console.log(errorColor('[!] An error occurred while clicking the element:\n' + error));
                return false;
            } else {
                return true;
            }
        }
    }

    async clearInput(element) {
        await element.focus();
        await this.page.keyboard.press('Home');
        await this.page.keyboard.down('Shift');
        await this.page.keyboard.press('End');
        await this.page.keyboard.up('Shift');
        await this.page.keyboard.press('Backspace');
    }

    async getUniqueClickables() {
        let clickablesHandle = await this.page.evaluateHandle(() => {
            // We fetch the "basic" clickables using CSS selectors
            let selectorClickables = [...document.querySelectorAll('a, button, input[type="submit"], input[type="button"], [onclick]')];

            // Elements with click listeners are fetched using the Black Widow scripts (stored in "added_events")
            let listenerClickables = added_events
                .filter((e) => e.event === 'click')
                .map((e) => e.element);

            // Merge the two lists while also removing duplicates
            return [...new Set(selectorClickables.concat(listenerClickables))];
        });

        // We have to iterate over this list to convert it a list of separate element handles
        let count = await clickablesHandle.evaluate((x) => x.length);
        let clickables = [];
        for (let i=0; i < count; i++) {
            let clickable = await clickablesHandle.evaluateHandle((handle, i) => handle[i], i);
            clickables.push(clickable);
        }

        return this.#filterClickables(clickables);
    }


    async #filterClickables(clickables) {
        // (1) Remove elements which point to URLs with a different host
        // (2) Filter out elements which are currently obscured by other elements or invisible
        let pointsToOtherHostMapping = [];
        let obscuredMapping = [];

        for (let clickable of clickables) {
            pointsToOtherHostMapping.push(await this.pointsToOtherHost(clickable));
            obscuredMapping.push(await this.isObscuredOrInvisible(clickable));
        }

        // I have to filter after using map first, since filter does not support async calls
        clickables = clickables.filter((item, index) => {
            return !pointsToOtherHostMapping[index] && !obscuredMapping[index];
        });

        // (3) Map each element to a corresponding text representation (e.g., ariaLabel, innerText, ...)
        const innerTextMapping = await Promise.all(
            clickables.map(async (element) => {
                let trimmedText = await util.elementToText(element);
                return [trimmedText, element];
            })
        );

        let filteredMapping = innerTextMapping.filter((item, index) => {
            const currInnerText = item[0]

            // Filter out elements with innerTexts that are empty or are too long
            if (currInnerText === '' || currInnerText.length > 50) {
                return false
            } else {
                // Only allow two elements with duplicate text each (e.g., a subcategory in a dashboard can have the same name as the main category)
                const firstIndex = innerTextMapping.findIndex((el, idx) => el[0] === currInnerText);
                const secondIndex = innerTextMapping.findIndex((el, idx) => el[0] === currInnerText && idx > firstIndex);
                return index === firstIndex || index === secondIndex;
            }
        });

        return filteredMapping.map(x => x[1]);
    }


    async isObscuredOrInvisible(element) {
        try {
            // Scroll element into view, otherwise, it is counted as obscured
            await element.scrollIntoView();

            let obscured = await this.page.evaluate((el) => {
                const { top, left, bottom, right } = el.getBoundingClientRect();
                const elementFromPoint = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
                let obscured = !(el === elementFromPoint || el.contains(elementFromPoint));
                console.log(el, '=> Obscured?', obscured);
                return obscured;
            }, element);

            let invisible = await this.page.evaluate((el) => {
                return !el.checkVisibility();
            }, element);

            return obscured || invisible;
        } catch {   // scrollIntoView could throw a "Node is detached from document" error
            return true;
        }
    }


    // Check whether an element has an href attribute which points to a different hostname
    async pointsToOtherHost(element) {
        let href = await this.page.evaluate(el => el.href, element);
        return !util.checkUrlHostname(href, this.hostname);
    }


    async getUniqueInputFields() {
        let unfilteredInputs = await this.page.$$('input[type="text"], input[type="password"], input[type="email"],' +
            'input[type="number"], textarea');

        // Filter input fields which are obscured, invisible, read-only or disabled, since the LLM cannot use them anyway
        let filteredInputs = [];
        for (let input of unfilteredInputs) {
            let usable = await this.page.evaluate((el) => {
                return !(el.readOnly || el.disabled);
            }, input);

            let obscuredOrInvisible = await this.isObscuredOrInvisible(input);

            if (usable && !obscuredOrInvisible) {
                filteredInputs.push(input);
            }
        }

        return filteredInputs;
    }


    async getForms() {
        let forms = await this.page.$$('form');

        // Filter out forms that would have an empty string representation
        let emptyFormMapping = [];
        for (let form of forms) {
            // The string representation of a form is empty if none of its elements are considered
            let formElems = await this.getFormElements(form);
            let isEmpty = true;
            for (let formElem of formElems) {
                if (await this.formElemConsideredForRepresentation(formElem)) {
                    isEmpty = false;
                    break;
                }
            }
            emptyFormMapping.push(isEmpty);
        }

        // Only return the "non-empty" forms
        return forms.filter((_, idx) => !emptyFormMapping[idx]);
    }


    async formElemConsideredForRepresentation(elem) {
        let isInput = await this.isInput(elem);
        let isTextarea = await this.isTextarea(elem);
        let isHidden = await this.isHidden(elem);

        // We also exclude some input types since they may bloat the representation too much
        let type = await elem.evaluate((el) => el.type);
        let typeAllowed = !['radio', 'checkbox'].includes(type);

        return (isInput || isTextarea) && !isHidden && typeAllowed;
    }


    async getFormElements(form) {
        let length = await this.page.evaluate((form) => form.elements.length, form);
        let formElements = [];

        // Get all form elements (has to be done separately s.t. we do not get one big ElementHandle)
        for (let i=0; i < length; i++) {
            let formElement = await this.page.evaluateHandle((form, i) => {
                return form.elements[i];
            }, form, i);
            formElements.push(formElement);
        }

        return formElements;
    }


    async getOriginalFormElem(formObject) {
        let candidates = await this.getElementsByXPath(formObject.xpath);
        return candidates[0];
    }


    async submitForm(form) {
        await this.recordFormSubmission(form);
        let submitButton = await this.page.evaluateHandle((form) => {
            let submitButton;
            if (form === undefined) {
                return undefined;
            }
            for (let input of form.elements) {
                if (input.type === 'submit') {
                    submitButton = input;
                }
            }
            return submitButton;
        }, form);

        // Check whether the submit button could be identified (explicitly convert to boolean due to possible serialization issues!)
        let submitButtonIdentified = await this.page.evaluate((button) => !!button, submitButton);

        // If submit button has been identified, click it
        let clickSuccessful;
        if (submitButtonIdentified) {
            clickSuccessful = await this.clickElement(submitButton);
        }

        // Fallback if we could not find any submit button or the click was not successful
        if (!submitButtonIdentified || !clickSuccessful) {
            try {
                await Promise.all([
                    form.evaluate((form) => HTMLFormElement.prototype.submit.call(form)),
                    this.page.waitForNavigation({ timeout: 2000 })
                ]);
            } catch (e) {
                // Rethrow any errors, except a timeout which is triggered in case of no navigation
                if (e.name !== 'TimeoutError') {
                    throw e;
                }
            }
        }
    }


    async collectDiscoveredUrls() {
        try {
            // Collect all anchor tag URLs within the page
            let urls = await this.page.evaluate(() => {
                let urls = [];
                let anchors = document.getElementsByTagName('a');

                // Get href attribute of anchor elements
                for (let anchor of anchors) {
                    if (anchor.href !== undefined) {
                        urls.push(anchor.href);
                    }
                }
                return urls;
            });

            // Temporarily convert to a set to throw out duplicates
            let urlSet = new Set(urls);

            // Also add the current page URL
            urlSet.add(this.getUrl());

            // Filter the set before returning it
            return this.filterCollectedUrls([...urlSet]);
        } catch (e) {
            console.error('[!] URL collection failed with error:', e);
            return [];
        }
    }


    filterCollectedUrls(urls) {
        // Filter out URLs that do not have the same hostname (probably lead to other websites)
        return urls.filter(x => {
            try {
                let parsedUrl = new URL(x);
                return parsedUrl.hostname === this.hostname;
            } catch (e) {
                return false;
            }
        });
    }


    async collectDiscoveredForms() {
        let forms = await this.page.$$('form');
        let formObjects = [];
        let trace = [...this.saveTrace()];

        for (let form of forms) {
            let formObject = await form.evaluate((form) => {
                return {
                    id: form.id,
                    name: form.name,
                    action: form.getAttribute('action') ? form.getAttribute('action') : '',
                    method: form.method
                }
            });
            if (formObject === undefined) {
                continue;
            }

            // Get the names of the elements inside the form
            let formElements = await this.getFormElements(form);
            let formElemNames = [];
            for (let formElement of formElements) {
                let name = await formElement.evaluate((formElem) => formElem.name);
                formElemNames.push(name);
            }

            formObject.elemNames = formElemNames.sort()

            formObject.containingUrl = this.getUrl();
            formObject.xpath = await this.getXPath(form);

            formObject.trace = trace;
            formObjects.push(formObject);
        }

        return formObjects
    }


    async canBeFocused(element) {
        // Focuses the element and checks whether the activeElement property reflects this
        await element.focus();
        return await this.page.evaluate((elem) => {
            return document.activeElement === elem;
        }, element);
    }


    async isInput(element) {
        return await element.evaluate((el) => el.tagName === 'INPUT');
    }


    async isTextarea(element) {
        return await element.evaluate((el) => el.tagName === 'TEXTAREA');
    }

    async getHref(element) {
        return await element.evaluate((el) => el.href);
    }

    async getXPath(element) {
        return await element.evaluate((el) => getXPath(el));
    }

    async getElementsByXPath(xpath) {
        try {
            await this.page.waitForXPath(xpath, { timeout: 2000 });
        } catch (error) {
            console.log(errorColor('[!] An error occurred while waiting for the element:\n' + error));
        }
        return await this.page.$x(xpath);
    }


    async isSelect(element) {
        return await element.evaluate((el) => el.tagName === 'SELECT');
    }


    async isHidden(element) {
        return await element.evaluate((el) => el.type === 'hidden');
    }

    async retryOnDestroyedContext(callback) {
        // FIXME: This is a hacky way of fixing navigations which are not properly handled by waitForNavigation
        // (and thus cause a "Execution context was destroyed" exception)
        for (let i = 0; i < 5; i++) {
            try {
                return await callback();
            } catch (e) {
                console.log(errorColor(`[!] ${e} Attempt recovery...`));
                await util.sleep(1000);
            }
        }
    }

    startTraceRecording(reset=true) {
        if (reset) {
            this.trace = [];
        }
        this.traceRecording = true;
    }

    stopTraceRecording() {
        this.traceRecording = false;
        return this.trace;
    }

    saveTrace() {
        return this.trace;
    }

    loadTrace(trace) {
        //this.trace = trace;
        // let's clone it instead
        this.trace = [...trace];
    }

    async replayTrace() {
        if (this.traceRecording) {
            console.error(`[!] ${replayTrace.caller} tried to replay trace that is still recording.`);
            return;
        }
        for (let [action, data] of this.trace) {
            console.log('executing', action, 'with', data);
            if (action === "click") {
                let elements = await this.getElementsByXPath(data);
                await this.clickElement(elements[0]);
            } else if (action === "click_no_nav") {
                let elements = await this.getElementsByXPath(data);
                await this.clickElementNoNavigation(elements[0]);
            } else if (action === "type") {
                let elements = await this.getElementsByXPath(data[0]);
                await this.typeElement(elements[0], data[1]);
            } else if (action === "submit_form") {
                let elements = await this.getElementsByXPath(data);
                await this.submitForm(elements[0]);
            }
        }
    }

    async recordClick(element) {
        if (!this.traceRecording) {
            return;
        }
        let xpath = await this.getXPath(element);
        this.trace.push(['click', xpath]);
    }
    async recordClickNoNavigation(element) {
        if (!this.traceRecording) {
            return;
        }
        let xpath = await this.getXPath(element);
        this.trace.push(['click_no_nav', xpath]);
    }
    async recordType(element, text) {
        if (!this.traceRecording) {
            return;
        }
        let xpath = await this.getXPath(element);
        this.trace.push(['type', [xpath, text]]);
    }
    async recordFormSubmission(element) {
        if (!this.traceRecording) {
            return;
        }
        let xpath = await this.getXPath(element);
        this.trace.push(['submit_form', xpath]);
    }
}

class ActionTrace {
    constructor() {

    }
}

module.exports = PageWrapper
