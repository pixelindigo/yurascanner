const chalk = require('chalk');
const { program } = require('commander');
const util = require('./util');

// Define chalk color
const loginInfo = chalk.bold.hex('#ff5f15');
const errorColor = chalk.bold.red;

class LoginModule {
    constructor(pageWrapper) {
        this.pageWrapper = pageWrapper;
        this.page = pageWrapper.getPageObj();
        this.username = program.opts().username;
        this.password = program.opts().password;

        // Login module is only active if credentials were passed as command line params
        this.active = this.username !== undefined && this.password !== undefined;
    }


    /**
     * Checks whether a login form is present in the current page. If yes, it logs in using the credentials provided in
     * the config.
     * @returns {Promise<void>}
     */
    async loginIfPossible() {
        // If the login module is disabled, do nothing
        if (!this.active) {
            console.log(loginInfo('[INFO] Login module is disabled'));
            return;
        }

        // Try to automatically identify and fill the login form on the current page
        try {
            let loginForm = await this.#findLoginForm();
            console.log(loginInfo('[INFO] Logging in...'));

            // Wait for the page to actually load before trying to log in (e.g., required for SuiteCRM)
            await util.sleep(2000);

            await Promise.all([
                this.#fillAndSubmitLoginForm(loginForm),
                this.page.waitForNavigation({timeout: 5000})
            ]);
        } catch (error) {
            if (error.name !== 'TimeoutError')  {
                console.log(errorColor('[!] Could not log in: ' + error));
            }
        }

        // Additional waiting time in case waitForNavigation does not suffice
        await util.sleep(2000);
    }


    /**
     * Identifies a potential login form out of all forms in a page.
     *
     * @param {puppeteer.Page} page
     * @returns {Promise<void>}
     */
    async #findLoginForm() {
        await this.page.waitForSelector('form', {timeout: 2000});
        // Get all forms on page
        let loginForm = await this.page.evaluateHandle(() => {
            let forms = document.getElementsByTagName('form');

            for (let form of forms) {
                let inputs = form.getElementsByTagName('input');

                // If there are too many input fields, it is probably not a login form (could be registration instead)
                let counter = 0;
                let found = false;
                for (let input of inputs) {
                    if (input.type !== 'hidden') {
                        counter += 1;
                    }
                    // Check whether there is a password input field
                    if (input.type === 'password') {
                        found = true;
                    }
                }
                if (counter > 10) {
                    continue;
                }
                if (found) {
                    return form;
                }
            }
        });

        if (loginForm.asElement() === null) {
            throw 'No login form found!';
        } else {
            return loginForm;
        }
        /*
        let jsonValue;
        try {       // Sometimes, a "Could not serialize referenced object" error occurs
            jsonValue = await loginForm.jsonValue();
        } catch {   // We can ignore it since the actual value is not "undefined" in this case
            return loginForm;
        }

        if (await jsonValue === undefined) {
            throw 'No login form found!';
        } else {
            return loginForm;
        }
        */
    }


    async #fillAndSubmitLoginForm(form) {
        // OpenEMR has an invisible email field that may not be altered
        let usernameFieldTypes = program.opts().openemrFix ? ['text'] : ['text', 'email'];

        let formElems = await this.pageWrapper.getFormElements(form);
        let submitBtn;
        for (let formElem of formElems) {
            let elemType = await formElem.evaluate(x => x.type);

            if (usernameFieldTypes.includes(elemType)) {
                // Sometimes, the username might be prefilled. Clear it so that do not have cases like "useruser"
                await this.pageWrapper.clearInput(formElem);
                await formElem.type(this.username);
            } else if (elemType === 'password') {
                await formElem.type(this.password);
            } else if (elemType === 'submit') {
                submitBtn = formElem;
            }
        }

        if (submitBtn !== undefined) {
            // If submit button has been identified, click it
            try {
                await submitBtn.click();
                return;
            } catch {
                // fallback
            }
        }
        // Fallback
        await form.evaluate(x => x.submit());
    }
}

module.exports = LoginModule
