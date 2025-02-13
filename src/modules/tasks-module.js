const LLMBridge = require('../bridge/llm-bridge');
const TasksTemplate = require('../prompt-templates/tasks-template');
const util = require('../common-utils/util');
const path = require('path');
const {program} = require('commander');
const fs = require('fs');
const chalk = require('chalk');

const infoColor = chalk.bold.hex("#ff5f15");

class TasksModule {
    constructor(startUrl, pageWrapper, loginModule, screenshotModule, statisticsModule) {
        this.startUrl = startUrl;
        this.pageWrapper = pageWrapper;
        this.loginModule = loginModule;
        this.screenshotModule = screenshotModule;
        this.statisticsModule = statisticsModule;

        // For task generation
        this.template = new TasksTemplate();
        this.llmBridge = new LLMBridge('tasks', this.template);
        this.actionLabels = new Set();

        // For task execution
        this.taskQueue = [];
        this.taskCounter = 0;
        this.taskStepCounter = 0;
    }

    readTasksFromFile() {
        let filepath = path.join(__dirname, "..", "..", "input", "default-tasks.txt");

        // If a custom task file was provided, use it instead of the default one
        if (program.opts().taskfile) {
            filepath = program.opts().taskfile;
        }

        let tasks = fs.readFileSync(filepath).toString().split("\n");

        for (let task of tasks) {
            this.taskQueue.push([this.startUrl, task]);
        }

        fs.writeFileSync(path.join(__dirname, '../../output/autotasklist.txt'), JSON.stringify(this.taskQueue));
        console.log(infoColor(`[INFO] ${this.taskQueue.length} tasks generated.`))
        console.log(infoColor(
            `[INFO] Autotask generation finished! (Total elapsed time: ${this.statisticsModule.getElapsedTime()})`
        ));
    }

    async performAutotaskCrawl() {
        let clickables = await this.pageWrapper.getUniqueClickables();
        let toClick = [];
        for (let clickable of clickables) {
            toClick.push(await this.pageWrapper.getXPath(clickable));
        }
        console.log('getting ready to click through', toClick);
        let clickableCounter = 0;
        for (let xpath of toClick) {
            clickableCounter += 1;
            await this.pageWrapper.goto(this.startUrl);
            await this.loginModule.loginIfPossible();

            await this.screenshotModule.takeStopScreenshot(
                'exec',
                `autotask_${clickableCounter}_a.jpg`,
            );
            let candidates = await this.pageWrapper.getElementsByXPath(xpath);
            if (candidates[0] === undefined) {
                continue;
            }
            this.pageWrapper.startTraceRecording();
            await this.pageWrapper.clickElement(candidates[0]);
            this.pageWrapper.stopTraceRecording();
            await this.screenshotModule.takeStopScreenshot(
                'exec',
                `autotask_${clickableCounter}_b.jpg`,
            );
            console.log(`autotask ${clickableCounter} trace ${this.pageWrapper.saveTrace()}`)
            await this.requestNewTasksAndPush();
        }
    }

    async requestNewTasksAndPush() {
        let newLabels = await this.getNewLabelsAndPush();
        if (newLabels.length === 0) {
            return;
        }
        let pageTasks = await this.getTasks(newLabels);
        for (let task of pageTasks) {
            this.taskQueue.push([this.pageWrapper.saveTrace(), task]);
        }

        this.statisticsModule.logTaskGeneration(pageTasks, this.taskQueue.length);
    }

    async getNewLabelsAndPush() {
        let clickables = await this.pageWrapper.retryOnDestroyedContext(() => this.pageWrapper.getUniqueClickables());
        let newLabels = [];
        for (let clickable of clickables) {
            let label = await util.elementToText(clickable);
            // nodejs doesn't support Set.difference :(
            if (!this.actionLabels.has(label)) {
                newLabels.push(label);
                this.actionLabels.add(label);
            }
        }
        return newLabels;
    }

    async getTasks(labels) {
        let pageRepresentation = '';
        for (let label of labels) {
            pageRepresentation += `* ${label}\n`
        }
        let prompt = this.template.generatePrompt(pageRepresentation);
        let reply = await this.llmBridge.requestApiStateless(prompt);

        return await this.#parseReply(reply);
    }

    async #parseReply(reply) {
        return reply.split('\n').filter((task) => task !== '');
    }

    getCurrentTask() {
        return this.taskQueue[this.taskCounter][1];
    }

    getCurrentTaskTrace() {
        return this.taskQueue[this.taskCounter][0];
    }

    getTaskCounter() {
        return this.taskCounter;
    }

    getTaskStepCounter() {
        return this.taskStepCounter;
    }

    increaseTaskStepCounter() {
        this.taskStepCounter++;
    }

    allTasksFinished() {
        if (this.taskCounter < this.taskQueue.length - 1) {
            this.taskCounter++;
            this.taskStepCounter = 0;
            return false;
        } else {
            return true;
        }
    }
}

module.exports = TasksModule
