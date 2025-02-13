const config = require('../config');

class BaseTemplate {
    //generateCrawlingPrompt(pageRepresentation, currentUrl, currentPageTitle, lastCompletedSteps) {}

    //generateStepCompletedPrompt(pageRepresentation, currentUrl, currentPageTitle, lastCompletedSteps) {}

    //getExplanatoryMessage() {}

    getLastCompletedStepsString(completedStepsHistory) {
        let completedStepSubset = completedStepsHistory.slice(-1 * config.includedCompletedStepsCount);
        let stringRepr = '';
        for (let step of completedStepSubset) {
            stringRepr += '\n' + step + ',';
        }
        stringRepr = stringRepr.slice(0, -1);    // (Remove last comma)
        return stringRepr;
    }
}

module.exports = BaseTemplate