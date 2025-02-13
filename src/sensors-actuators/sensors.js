const util = require('../common-utils/util');
const actionsMapping = require('./actions-mapping');

class Sensors {
    constructor(pageWrapper) {
        this.pageWrapper = pageWrapper;
        this.abstractPage = '';
    }

    getAbstractPage() {
        return this.abstractPage;
    }

    async updateAbstractPage() {
        // Collect page elements
        let clickableElements = await this.pageWrapper.retryOnDestroyedContext(() => this.pageWrapper.getUniqueClickables());
        //let inputFields = await this.pageWrapper.getUniqueInputFields();
        let forms = await this.pageWrapper.retryOnDestroyedContext(() => this.pageWrapper.getForms());

        this.abstractPage = '';
        actionsMapping.clear();

        // Create page representation string and lookup table by iterating over all relevant page elements
        for (let elem of clickableElements) {
            let id = actionsMapping.addAction(elem, 'clickable');
            this.abstractPage += await this.clickableToString(elem, id) + '\n';
        }

        /*for (let elem of inputFields) {
            let id = actionsMapping.addAction(elem, 'input');
            this.pageRepresentation += await this.inputFieldToString(elem, id) + '\n';
        }*/

        for (let form of forms) {
            let id = actionsMapping.addAction(form, 'form');
            this.abstractPage += await this.formToString(form, id) + '\n';
        }
    }

    async clickableToString(elem, idCounter = undefined) {
        let innerText = await util.elementToText(elem);
        let tagName = await elem.evaluate((el) => {
            // An input with type "submit" is usually a button, so change the tag name accordingly
            if (el.type === 'submit') {
                return 'button';
            } else {
                return el.tagName.toLowerCase();
            }
        });

        // Only set ID if it is provided as an argument
        let idString = '';
        if (idCounter !== undefined) {
            idString = ' id=' + idCounter;
        }
        return `<${tagName}` + `${idString}>${innerText}</${tagName}>`;
    }

    async inputFieldToString(elem, idCounter = undefined) {
        let type = await elem.evaluate((el) => el.type);
        let label = await elem.evaluate((el) => {
            let label = document.querySelector('label[for="' + el.id + '"]');
            if (label) {
                return label.innerText.trim();
            } else {
                return '';
            }
        });
        let value = await elem.evaluate((el) => {
            if (el.value) {
                return ` value="${el.value}"`;
            } else {
                return '';
            }
        });
        let required = await elem.evaluate((el) => {
            if (el.required) {
                return ' required';
            } else {
                return '';
            }
        });
        let name = await elem.evaluate((el) => el.name);
        let placeholder = await elem.evaluate((el) => el.placeholder);

        // Only set ID if it is provided as an argument
        let idString = '';
        if (idCounter !== undefined) {
            idString = ' id=' + idCounter;
        }
        return `<input` + `${idString} type="${type}" name="${name}" placeholder="${placeholder}"` +
            `${value}${required}>${label}</input>`;
    }

    async formToString(elem, idCounter = undefined) {
        let name = await elem.evaluate((el) => el.name ? el.name : el.id);
        let action = await elem.evaluate((el) => el.action);
        let method = await elem.evaluate((el) => el.method);

        // Only set ID if it is provided as an argument
        let idString = '';
        if (idCounter !== undefined) {
            idString = ' id=' + idCounter;
        }
        return `<form` + `${idString} name="${name}" action="${action}" method="${method}">`;
    }
}

module.exports = Sensors