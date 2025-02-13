const LLMBridge = require("../bridge/llm-bridge");
const FormTemplate = require("../prompt-templates/form-template");

class FormModule {
    constructor(sensors, pageWrapper) {
        this.sensors = sensors;
        this.pageWrapper = pageWrapper;
        this.template = new FormTemplate();
        this.llmBridge = new LLMBridge("form", this.template);

        this.indexLookupTable = [];
        this.selects = []; // We collect the <select> elements separately since we perform an automated selection
    }

    async fillForm(form) {
        let formRepresentation = await this.generateFormRepresentation(form);
        let prompt = this.template.generatePrompt(formRepresentation);
        let reply = await this.llmBridge.requestApiStateless(prompt);

        // Since the reply consists of multiple commands, we have to iterate over each line
        let commandList = reply.split("\n");
        for (let command of commandList) {
            await this.#interpretAndExecuteCommand(command);
        }

        // Click all check boxes (if any) and select elements to help the LLM with forms
        // Note: Clicking radio buttons can trigger navigations in PrestaShop (activating products), use with care!
        await this.#clickAllCheckboxes();
        await this.#makeAutomatedSelections();
    }

    async generateFormRepresentation(form) {
        let formRepresentation =
            (await this.sensors.formToString(form)) + "\n";
        this.indexLookupTable = [];
        this.selects = [];
        let idCounter = 0;

        let formElements = await this.pageWrapper.getFormElements(form);

        // Create form representation string and lookup table by iterating over the form elements
        for (let elem of formElements) {
            // For the form representation, we only consider (non-hidden) input elements inside the form
            if (
                await this.pageWrapper.formElemConsideredForRepresentation(elem)
            ) {
                this.indexLookupTable[idCounter] = elem;
                formRepresentation +=
                    (await this.sensors.inputFieldToString(elem, idCounter)) +
                    "\n";
                idCounter++;

                // We collect the <select> elements separately, since they are not included in the form representation
            } else if (await this.pageWrapper.isSelect(elem)) {
                this.selects.push(elem);
            }
        }

        // Close form element
        formRepresentation += "</form>";

        return formRepresentation;
    }

    async #interpretAndExecuteCommand(reply) {
        // Extract the first integer from the response (sometimes the LLM provides multiple commands at once)
        let replyNumber;
        try {
            replyNumber = Number(reply.match(/\d+/)[0]);
        } catch {
            // Has wrong format (does not contain a number)
            return false;
        }

        if (replyNumber >= this.indexLookupTable.length) {
            // Index provided by LLM out of range
            return false;
        }

        let selectedElement = this.indexLookupTable[replyNumber];

        // Check whether element can be focused correctly
        let canBeFocused = await this.pageWrapper.canBeFocused(selectedElement);
        if (!canBeFocused) {
            return false;
        }

        // TODO: Add other commands/types (e.g. radio elements)?
        if (reply.toLowerCase().startsWith("type")) {
            let inputText = reply.match(/"(.*?)"/)[1];

            // to record traces
            //await selectedElement.type(inputText);
            await this.pageWrapper.typeElement(selectedElement, inputText);
            return true;

            // TODO: Add error handling (e.g., cannot type in radio element)?
            /*stepEntry = `TYPE ${replyNumber} "${inputText}" (${await this.template.clickableToString(selectedElement, replyNumber)})`;
            stepEntry += ' (FAILED! You are not allowed to type on clickable elements.)';
            this.completedStepsHistory.push(stepEntry);
            return false;*/
        } else {
            // Command could not be parsed
            return false;
        }
    }

    async #clickAllCheckboxes() {
        // Filter for currently unchecked checkboxes (first create mapping, as filter() does not support async)
        let uncheckedMapping = await Promise.all(
            this.indexLookupTable.map(async (element) => {
                return await element.evaluate(
                    (el) =>
                        (el.type === "checkbox" || el.type === "radio") &&
                        !el.checked,
                );
            }),
        );
        let filteredCheckboxes = this.indexLookupTable.filter((item, index) => {
            return uncheckedMapping[index];
        });

        // Click all checkboxes that fulfill the criteria
        for (let checkbox of filteredCheckboxes) {
            try {
                // to record traces
                //await checkbox.click();
                await this.pageWrapper.clickElementNoNavigation(checkbox);
            } catch {}
        }
    }

    async #makeAutomatedSelections() {
        // Iterate over every <select> element of the current form
        for (let select of this.selects) {
            await select.evaluate((el) => {
                // If there has not been selected an option yet (and if the form has more than one option)
                if (el.selectedIndex === 0 && el.length > 1) {
                    el.selectedIndex = 1;
                }
            });
        }
    }
}

module.exports = FormModule;
