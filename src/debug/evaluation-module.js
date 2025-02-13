const {program} = require('commander');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

// Define chalk colors
const infoColor = chalk.bold.hex('#ff5f15');
const errorColor = chalk.bold.red;

class EvaluationModule {
    constructor(pageWrapper) {
        // Check whether evaluation enabled
        if (!program.opts().eval) {
            return;
        }

        this.page = pageWrapper.getPageObj();

        // Create one evaluationHelper instance which all tests use
        this.evaluationHelper = new EvaluationHelper(pageWrapper);

        this.applicationTestsObj = this.#fetchApplicationTests();
        this.stepCounter = this.#initializeStepCounter();
        this.outputFilepath = this.#initializeOutputFile();
    }

    #fetchApplicationTests() {
        // Open the provided file and dynamically evaluate the JS code
        let applicationTestsCode = fs.readFileSync(program.opts().eval).toString();
        let applicationTestsObj = eval(applicationTestsCode)(this.evaluationHelper);

        if (Object.prototype.toString.call(applicationTestsObj) !== '[object Object]') {
            throw 'The application tests JS code has to return an object containing the test methods!';
        } else {
            return applicationTestsObj;
        }
    }

    #initializeStepCounter() {
        let stepCounter = {};
        for (let task of Object.keys(this.applicationTestsObj)) {
            stepCounter[task] = 0;
        }
        return stepCounter;
    }

    #generateOutputFilepath() {
        // Ensure that the output directory exists
        let outputDir = path.resolve(__dirname, '../../evaluation/results');
        if (!fs.existsSync(outputDir)){
            fs.mkdirSync(outputDir, {recursive: true});
        }

        // Name the results file after the provided application tests JS file
        let applicationTestsFilename = path.parse(program.opts().eval).name;
        let filename = '[test results] ' + applicationTestsFilename + ' (' + new Date().toISOString() + ').md';
        return path.resolve(outputDir, filename);
    }

    #initializeOutputFile() {
        let outputFilepath = this.#generateOutputFilepath();

        // Write heading and execution details
        let stream = fs.createWriteStream(outputFilepath, {flags:'a+'});
        stream.write('# Evaluation Results\n');
        stream.write(`- **Tests File:** \`${program.opts().eval}\`\n`);
        stream.write(`- **Command-line Arguments:** \`${process.argv.slice(2).join(' ')}\`\n`);
        stream.write('\n');

        // Write the header row of the results table
        stream.write('| Task | Result | Completed Steps | Total Steps |\n');
        stream.write('|------|--------|-----------------|-------------|\n');
        stream.end();

        return outputFilepath;
    }

    #writeToOutputFile(currTask) {
        let results = this.applicationTestsObj[currTask];

        // In case there are no tests defined for the current task, we have nothing to export
        if (results === undefined) {
            return;
        }

        let completedSteps = results.filter(x => x.passed).length;
        let expectedSteps = results.length;
        let result = (completedSteps === expectedSteps) ? 'PASS ✔️' : 'FAIL ❌';
        let totalSteps = this.stepCounter[currTask];

        // This adds a new row in the Markdown table
        let stream = fs.createWriteStream(this.outputFilepath, {flags:'a+'});
        stream.write(`| ${currTask} | ${result} | ${completedSteps}/${expectedSteps} | ${totalSteps} |\n`);
        stream.end();
    }

    // Is called after each command execution ("CLICK" or "FILL & SUBMIT FORM")
    async performEvaluationTests(command, selectedElemString, currentTask) {
        // Only perform evaluation when explicitly activated
        if (!program.opts().eval) {
            return;
        }

        // We only consider the application tests for the current task
        let tests = this.applicationTestsObj[currentTask];
        if (tests === undefined) {
            console.log(errorColor('[!] No evaluation tests defined for the current task!'));
            return;
        } else {
            console.log(infoColor('[INFO] Executing evaluation tests...'));
        }

        this.stepCounter[currentTask] += 1;

        // We merely need to check the tests that have not been passed yet
        let failedTests = tests.filter((x) => !x.passed);
        for (let [index, test] of failedTests.entries()) {
            try {
                test.passed = await test.func(command, selectedElemString);

                // If a hard requirement test was passed, all previous soft tests are also considered passed
                if (test.passed && test.hardReq) {
                    for (let i=0; i < index; i++) {
                        if (!failedTests[i].hardReq) {
                            failedTests[i].passed = true;
                        }
                    }
                }
            } catch (e) {
                console.log(errorColor('[!] Evaluation test execution failed due to error:', e));
            }
        }
    }

    // Is called every time after a task has been finished (after "STOP" command or max step limit)
    finishCurrentTaskEvaluation(currentTask) {
        if (!program.opts().eval) {
            return;
        }

        this.#writeToOutputFile(currentTask);
        this.evaluationHelper.resetElemCounter();
    }
}


class EvaluationHelper {
    constructor(pageWrapper) {
        this.evalPage = pageWrapper.getEvalPageObj();
        this.pageWrapper = pageWrapper;

        this.elemCounter = undefined;
    }

    resetElemCounter() {
        this.elemCounter = undefined;
    }

    softReq(testFunc) {
        return {'func': testFunc, 'passed': false, 'hardReq': false};
    }

    hardReq(testFunc) {
        return {'func': testFunc, 'passed': false, 'hardReq': true};
    }

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
    // * Below, we implement generic checker methods that can be reused. *
    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    checkClickedElem(expectedElemString) {
        // We have to work on strings as the execution context is already destroyed at that point in time
        return async (command, elemString) => {
            return command === 'CLICK' && elemString.includes(expectedElemString);
        };
    }

    checkUrlPathname(expectedPathname, expectedQueryParams = {}) {
        return () => {
            const currentUrl = new URL(this.pageWrapper.getUrl());

            // Check pathname
            if (currentUrl.pathname !== expectedPathname) {
                return false;
            }

            // Check query params (if specified)
            for (let key of Object.keys(expectedQueryParams)) {
                let queryParam = currentUrl.searchParams.get(key);
                if (queryParam !== expectedQueryParams[key]) {
                    return false;
                }
            }

            return true;
        };
    }

    // Can be used for ambiguous elements to ensure the correct context
    checkClickedElemAndPathname(expectedElemString, expectedPathname, expectedQueryParams = {}) {
        let checkClick = this.checkClickedElem(expectedElemString);
        let checkPathname = this.checkUrlPathname(expectedPathname, expectedQueryParams);
        return async (command, elemString) => {
            return await checkClick(command, elemString) && checkPathname();
        }
    }

    // Checking for the effects of a form submission should be preferred, but not always feasible
    checkFilledForm(expectedFormString) {
        return async (command, elemString) => {
            return command === 'FILL & SUBMIT FORM' && elemString.includes(expectedFormString);
        };
    }

    #checkElemCountChanged(urlPath, cssSelector, comparator) {
        return async () => {
            await this.evalPage.bringToFront();
            await this.evalPage.goto(this.pageWrapper.baseUrl + urlPath);

            // Inspect the number of hits using the CSS selector
            let foundElems = await this.evalPage.$$(cssSelector);
            let countChanged = comparator(foundElems.length, this.elemCounter);

            // This basically sets the counter from undefined to the actual value before any elements were added
            if (!countChanged) {
                this.elemCounter = foundElems.length;
            }

            // Switch focus back to crawling tab
            await this.pageWrapper.getPageObj().bringToFront();
            return countChanged;
        }
    }

    checkElemCountIncreased(urlPath, cssSelector) {
        return this.#checkElemCountChanged(urlPath, cssSelector, (a, b) => a > b);
    }

    checkElemCountDecreased(urlPath, cssSelector) {
        return this.#checkElemCountChanged(urlPath, cssSelector, (a, b) => a < b);
    }
}

module.exports = EvaluationModule