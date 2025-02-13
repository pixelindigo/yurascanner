const BaseTemplate = require('./base-template');
const dedent = require('dedent-js');

class TasksTemplate extends BaseTemplate {
    getExplanatoryMessage() {
        return '';
    }


    generatePrompt(pageRepresentation) {
        let prompt = dedent(`
        Use the following list of button labels on the website to generate a list of tasks to complete on the website. Adding items, Editing items and, finally, Deleting items. Keep tasks simple and straight to point. Like, "Add a product", "Send E-mail", "Delete a comment".
        ${pageRepresentation}

        The list of tasks:
        `);

        console.log(prompt);
        return prompt;
    }
}

module.exports = TasksTemplate