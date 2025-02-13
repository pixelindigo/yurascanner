const MainTemplate = require("../prompt-templates/main-template");
const { program } = require("commander");
const util = require("../common-utils/util");
const config = require("../config");
const LLMBridge = require("../bridge/llm-bridge");
const GPTVisionBridge = require("../bridge/gpt-vision-bridge");
const LoginModule = require("../common-utils/login-module");
const TasksModule = require("./tasks-module");
const AttackModule = require("./attack-module");
const ScreenshotModule = require("../debug/screenshot-module");
const EvaluationModule = require("../debug/evaluation-module");
const StatisticsModule = require("../debug/statistics-module");
const Sensors = require('../sensors-actuators/sensors');
const Actuators = require('../sensors-actuators/actuators');
const chalk = require("chalk");
const fs = require("fs");
require("dotenv").config();

// Define chalk colors
const infoColor = chalk.bold.hex("#ff5f15");
const errorColor = chalk.bold.red;

class MainModule {
    constructor(pageWrapper, startUrl) {
        // Instantiate the template class
        this.template = new MainTemplate();

        // Initialize submodules
        this.screenshotModule = new ScreenshotModule(pageWrapper);
        this.evaluationModule = new EvaluationModule(
            pageWrapper,
            this.template,
        );
        this.loginModule = new LoginModule(pageWrapper);
        this.attackModule = new AttackModule(pageWrapper, startUrl, this.loginModule);

        this.pageWrapper = pageWrapper;
        this.startUrl = startUrl;

        // Indicates when crawling should be stopped and attack phase starts
        this.keepCrawling = true;
        if (program.opts().crawlTimeout) {
            setTimeout(
                () => {
                    console.log(
                        "[" + new Date().toISOString() + "]",
                        "Crawling timeout was reached! Attack phase starts...",
                    );
                    this.keepCrawling = false;
                },
                1000 * 60 * program.opts().crawlTimeout,
            );
        }

        // For estimating application coverage
        this.discoveredUrls = new Set();
        this.discoveredForms = new Set();
        this.discoveredFormsFiltered = new Set();
        this.urlOutputFilepath = util.getOutputFilepath("urls");
        this.formOutputFilepath = util.getOutputFilepath("forms");

        // Statistics (elapsed time, total request count)
        this.statisticsModule = new StatisticsModule(
            this.pageWrapper.getPageObj(),
        );
        this.tasksModule = new TasksModule(
            this.startUrl,
            this.pageWrapper,
            this.loginModule,
            this.screenshotModule,
            this.statisticsModule
        );

        // Sensors and actuators
        this.sensors = new Sensors(this.pageWrapper);
        this.actuators = new Actuators(
            this.sensors,
            this.pageWrapper,
            this.tasksModule,
            this.screenshotModule,
            this.evaluationModule
        );

        // Initialize LLM Bridge
        if (program.opts().gpt4vision) {
            this.llmBridge = new GPTVisionBridge(
                "main",
                this.template,
                this.pageWrapper,
            );
        } else {
            this.llmBridge = new LLMBridge("main", this.template);
        }
    }

    loadAttackPlan(filepath) {
        let lines = fs.readFileSync(filepath).toString().split("\n");
        let forms = [];
        for (let line of lines) {
            let offset = -1;
            if (line === '') {
                continue;
            }
            for (let i = 0; i < 3; i++) {
                offset = line.indexOf(';', offset + 1);
            }
            console.log('parsing', line.substring(offset + 1));
            forms.push(JSON.parse(line.substring(offset + 1)));
        }
        return forms;
    }

    async crawl() {
        // Setup all required listeners
        await this.setup();

        // Navigate to start edge first (and try to log in)
        await this.pageWrapper.goto(this.startUrl);
	await util.sleep(5000);
        await this.loginModule.loginIfPossible();

        // Sometimes redirect after login fails, so let's visit start page again
        await this.pageWrapper.goto(this.startUrl);
        await this.loginModule.loginIfPossible();

        if (program.opts().runAttack) {
            console.log('loading forms from', program.opts().runAttack);
            let forms = this.loadAttackPlan(program.opts().runAttack);
            console.log('loaded forms', forms);
            await this.attackModule.attack(
                [],
                forms,
            );

            console.log(infoColor(
                `[INFO] Attack phase finished! (Total elapsed time: ${this.statisticsModule.getElapsedTime()})`
            ));
            return;
        } 

        // Do a shallow crawl for the auto task generation
        if (program.opts().autotask || program.opts().autotaskOnly) {
            await this.tasksModule.performAutotaskCrawl();

            if (program.opts().autotaskOnly) {
                return;
            }

            await this.pageWrapper.goto(this.startUrl);
            await this.loginModule.loginIfPossible();
        } else {
            this.tasksModule.readTasksFromFile();
        }


        // replay the trace
        this.pageWrapper.loadTrace(this.tasksModule.getCurrentTaskTrace());
        await this.pageWrapper.replayTrace();
        await this.pageWrapper.startTraceRecording(false);

        while (this.keepCrawling) {
            this.statisticsModule.logTaskExecutionStart(
                this.tasksModule.getTaskCounter(),
                this.tasksModule.getCurrentTask()
            );

            // Each task is only allowed to take a certain maximum number of steps to prevent infinite loops
            for (let steps = 0; steps < config.maxStepsPerTask; steps++) {
                await util.waitForKeypressDebug();
                await this.addDiscoveredUrlsAndForms();

                let stopCommandIssued =
                    await this.queryAndPerformNextStepFailsafe();
                this.tasksModule.increaseTaskStepCounter();

                if (stopCommandIssued) {
                    // STOP command itself is not counted (steps is 0-based)
                    this.statisticsModule.logTaskExecutionEnd(steps);
                    break;
                } else if (steps === config.maxStepsPerTask - 1) {
                    // Last command is counted, as it was not a STOP command
                    this.statisticsModule.logTaskExecutionEnd(steps + 1);
                    console.log(infoColor("[INFO] Maximum number of steps reached for this task!"));
                }
            }

            // Wrap up the evaluation of the finished task
            this.evaluationModule.finishCurrentTaskEvaluation(
                this.tasksModule.getCurrentTask(),
            );

            // Proceed to the next task if there is one. Else, we are finished and can leave the while-loop.
            let allTasksFinished = await this.proceedToNextTask();
            if (allTasksFinished) {
                break;
            }
        }
        console.log(infoColor(
            `[INFO] Crawling phase finished! (Total elapsed time: ${this.statisticsModule.getElapsedTime()})`
        ));

        this.pageWrapper.stopTraceRecording();

        // Start attack phase (if enabled)
        if (program.opts().attack) {
            await this.attackModule.attack(
                this.discoveredUrls,
                this.discoveredForms,
            );
            console.log(infoColor(
                `[INFO] Attack phase finished! (Total elapsed time: ${this.statisticsModule.getElapsedTime()})`));
        }

        console.log(infoColor(`[INFO] Run finished! (Total elapsed time: ${this.statisticsModule.getElapsedTime()})`));
    }

    /**
     * Is executed once at the start of the crawl to add listeners and inject scripts into the browser.
     */
    async setup() {
        // Hook addEventListener function using Black Widow's scripts
        await this.pageWrapper.addBlackWidowScripts();

        // Dismiss any JavaScript alerts which are blocking our crawl
        this.pageWrapper.addAlertListener();

        // Activate the navigation restriction so that we do not accidentally crawl another host
        await this.pageWrapper.restrictNavigationToSameHost();
    }

    async queryAndPerformNextStepFailsafe() {
        // If the method fails, execute it again, which will also update the page representation
        for (let i = 0; i < 2; i++) {
            try {
                return await this.queryAndPerformNextStep();
            } catch (e) {
                console.log(
                    errorColor(
                        "[!] Page representation probably outdated, retrying... (" +
                            e +
                            ")",
                    ),
                );
                console.log(e);
                this.llmBridge.removeLastChatHistoryEntry();
            }
        }
    }

    async queryAndPerformNextStep() {
        // Generate a page representation and give it to the LLM Bridge
        await this.sensors.updateAbstractPage();
        let prompt = await this.generateCrawlingPrompt();

        // Repeat step until valid response is given
        for (let i = 0; i < config.maxInvalidSyntaxReplies; i++) {
            // Interpret the reply and perform the corresponding action
            let reply = await this.llmBridge.requestApi(prompt);

            // The STOP command is a special case and is handled directly
            if (reply.toLowerCase().startsWith("stop")) {
                await this.screenshotModule.takeStopScreenshot(
                    this.tasksModule.getCurrentTask(),
                    `${this.tasksModule.getTaskCounter()}_${this.tasksModule.getTaskStepCounter()}.jpg`,
                );
                return true;
            }

            let validReply = await this.actuators.parseAbstractAction(reply);
            if (validReply) {
                // Return value indicates whether the STOP command was used (i.e., whether we should proceed to the next task)
                return false;
            }

            prompt =
                "The execution of your last command failed. Details are given in the last of the last steps at " +
                "the bottom. Now, please answer with a valid prompt. Do not include an apology!\n" +
                await this.generateCrawlingPrompt();
            console.log(
                errorColor(
                    "The execution of the last command failed due to invalid syntax, retrying...",
                ),
            );
            await util.waitForKeypressDebug();
        }

        // This code is only reached if there have been more invalid syntax replies than allowed
        console.log(
            errorColor(
                "Maximum number of replies with invalid syntax reached! Proceeding to next task...",
            ),
        );
        return true;
    }

    async generateCrawlingPrompt() {
        let currentUrl = this.pageWrapper.getUrl();
        let currentPageTitle = await this.pageWrapper.retryOnDestroyedContext(() => this.pageWrapper.getTitle());

        return this.template.generateCrawlingPrompt(
            this.sensors.getAbstractPage(),
            currentUrl,
            currentPageTitle,
            this.tasksModule.getCurrentTask(),
            this.template.getLastCompletedStepsString(
                this.actuators.getCompletedStepsHistory(),
            ),
        );
    }

    async proceedToNextTask() {
        await this.pageWrapper.stopTraceRecording();

        let finished = this.tasksModule.allTasksFinished();

        // Clear chat and step history such that the LLM is not confused by unrelated actions from previous tasks
        this.llmBridge.clearChatHistory();
        this.actuators.clearCompletedStepsHistory();

        // Navigate to the task page and try to log in again
        //await this.pageWrapper.goto(this.getCurrentTaskUrl());
        // reset page to root
        await this.pageWrapper.goto(this.startUrl);
        await this.loginModule.loginIfPossible();
        if (!finished) {
            // replay the trace
            this.pageWrapper.loadTrace(this.tasksModule.getCurrentTaskTrace());
            console.log('executing', this.tasksModule.getCurrentTaskTrace());
            await this.pageWrapper.replayTrace();
            await this.pageWrapper.startTraceRecording(false);
        }
        this.statisticsModule.removeRequestFromCount();
        console.log(">>> PROCEED TO NEXT STEP! >>>");
        return finished;
    }


    async addDiscoveredUrlsAndForms() {
        // Get statistics to include in findings
        let elapsedTime = this.statisticsModule.getElapsedTime();
        let totalRequestCount = this.statisticsModule.getTotalRequestCount();
        let requestCountWithoutLogin =
            this.statisticsModule.getRequestCountWithoutLogin();

        await this.addDiscoveredUrls(
            elapsedTime,
            totalRequestCount,
            requestCountWithoutLogin,
        );
        await this.addDiscoveredForms(
            elapsedTime,
            totalRequestCount,
            requestCountWithoutLogin,
        );
    }

    async addDiscoveredUrls(
        elapsedTime,
        totalRequestCount,
        requestCountWithoutLogin,
    ) {
        let urls = await this.pageWrapper.retryOnDestroyedContext(() => this.pageWrapper.collectDiscoveredUrls());

        // Identify all new URLs
        let newUrls = [];
        for (let url of urls) {
            if (!this.discoveredUrls.has(url)) {
                this.discoveredUrls.add(url);
                newUrls.push(url);
            }
        }

        // Write new URLs to file
        util.writeUrlsToOutputFile(
            this.urlOutputFilepath,
            newUrls,
            elapsedTime,
            totalRequestCount,
            requestCountWithoutLogin,
        );
    }

    async addDiscoveredForms(
        elapsedTime,
        totalRequestCount,
        requestCountWithoutLogin,
    ) {
        let formObjects = await this.pageWrapper.retryOnDestroyedContext(() => this.pageWrapper.collectDiscoveredForms());

        // Identify all new forms
        let newForms = [];
        for (let formObject of formObjects) {
            let formFiltered = Object.assign({}, formObject);
            formFiltered.trace = undefined;
            if (!this.discoveredFormsFiltered.has(formFiltered)) {
                this.discoveredFormsFiltered.add(formFiltered);
                this.discoveredForms.add(formObject);
                newForms.push(formObject);
            }
            /*
            if (!this.discoveredForms.has(formObject)) {
                this.discoveredForms.add(formObject);
                newForms.push(formObject);
            }
            */
        }

        // Write new form objects to file
        util.writeFormsToOutputFile(
            this.formOutputFilepath,
            newForms,
            elapsedTime,
            totalRequestCount,
            requestCountWithoutLogin,
        );
    }
}

module.exports = MainModule;
