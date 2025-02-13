const FormModule = require('../modules/form-module');
const actionsMapping = require('./actions-mapping');

class Actuators {
    constructor(sensors, pageWrapper, tasksModule, screenshotModule, evaluationModule) {
        this.sensors = sensors;
        this.pageWrapper = pageWrapper;
        this.tasksModule = tasksModule;
        this.screenshotModule = screenshotModule;
        this.evaluationModule = evaluationModule;
        // Form module is only needed in this class, since it detects when "FILL FORM" command was issued
        this.formModule = new FormModule(sensors, pageWrapper);

        this.completedStepsHistory = [];
    }

    async parseAbstractAction(absAction) {
        // Extract the first integer from the response (sometimes LLM might provide multiple commands at once)
        let id;
        try {
            id = Number(absAction.match(/\d+/)[0]);
        } catch {
            // Has wrong format (does not contain a number)
            return false;
        }

        if (!actionsMapping.isValidId(id)) {
            // Index provided by LLM out of range
            return false;
        }

        let selectedElem = actionsMapping.getActionElem(id);
        let selectedElemType = actionsMapping.getActionType(id);
        let selectedElemString = await selectedElem.evaluate((e) => e.outerHTML.toString());

        // Handle the case where the absAction begins with "YOUR COMMAND:"
        if (absAction.startsWith('YOUR COMMAND: ')) {
            absAction = absAction.slice(14);
        }

        // CLICK {id}
        if (absAction.toLowerCase().startsWith('click')) {
            return await this.#handleClickCommand(id, selectedElem, selectedElemType, selectedElemString);

        // FILL & SUBMIT FORM {id}
        } else if (absAction.toLowerCase().startsWith('fill')) {
            return await this.#handleFormCommand(id, selectedElem, selectedElemType, selectedElemString);
        }

        // Fallback if command could not be parsed
        return false;
    }

    async #handleClickCommand(id, selectedElem, selectedElemType, selectedElemString) {
        let stepEntry = `CLICK ${id} (${await this.sensors.clickableToString(selectedElem, id)})`;

        if (selectedElemType === 'clickable') {
            await this.screenshotModule.takeElementScreenshot(
                selectedElem,
                this.tasksModule.getCurrentTask(),
                `${this.tasksModule.getTaskCounter()}_${this.tasksModule.getTaskStepCounter()}.jpg`
            );
            await this.pageWrapper.clickElement(selectedElem);
            this.completedStepsHistory.push(stepEntry);
            await this.evaluationModule.performEvaluationTests(
                'CLICK',
                selectedElemString,
                this.tasksModule.getCurrentTask()
            );
            return true;
        } else {
            stepEntry = `CLICK ${id} (${await this.sensors.inputFieldToString(selectedElem, id)})`;
            stepEntry += ' (FAILED! You are not allowed to click on inputs.)';
            this.completedStepsHistory.push(stepEntry);
            return false;
        }
    }

    async #handleFormCommand(id, selectedElem, selectedElemType, selectedElemString) {
        let stepEntry = `FILL & SUBMIT FORM ${id} (${await this.sensors.formToString(selectedElem, id)})`;

        if (selectedElemType === 'form') {
            await this.formModule.fillForm(selectedElem);
            // Take a screenshot of the filled form before submitting it
            await this.screenshotModule.takeFormScreenshot(
                selectedElem,
                this.tasksModule.getCurrentTask(),
                `${this.tasksModule.getTaskCounter()}_${this.tasksModule.getTaskStepCounter()}.jpg`
            );

            // Submit the form automatically
            await this.pageWrapper.submitForm(selectedElem);
            this.completedStepsHistory.push(stepEntry);
            await this.evaluationModule.performEvaluationTests(
                'FILL & SUBMIT FORM',
                selectedElemString,
                this.tasksModule.getCurrentTask()
            );
            return true;
        } else {
            stepEntry = `FILL & SUBMIT FORM ${id} (${await this.sensors.clickableToString(selectedElem, id)})`;
            stepEntry += ' (FAILED! You are not allowed to use the FILL FORM command on clickable elements.)';
            this.completedStepsHistory.push(stepEntry);
            return false;
        }
    }

    getCompletedStepsHistory() {
        return this.completedStepsHistory;
    }

    clearCompletedStepsHistory() {
        this.completedStepsHistory = [];
    }
}

module.exports = Actuators