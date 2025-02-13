const path = require('path');
const fs = require('fs');
const {program} = require('commander');

class StatisticsModule {
    constructor(page) {
        this.startTime = new Date();
        this.requestCounter = 0;
        this.requestCounterWithoutLogin = 0;

        // Increase total request count when a top-level navigation occurs
        page.on('framenavigated', frame => {
            if (frame === page.mainFrame()) {
                this.requestCounter++;
                this.requestCounterWithoutLogin++;
            }
        });

        // Task generation and execution time logs
        this.currentTaskId = undefined;
        this.currentTask = undefined;
        this.currentTaskStartTime = undefined;

        let outputDir = path.resolve(__dirname, '../../output');
        this.taskGenLogFilepath = path.join(outputDir, 'task_generation_log.csv');
        this.taskExecLogFilepath = path.join(outputDir, 'task_execution_log.csv');
        this.setupTaskLogFiles();
    }

    setupTaskLogFiles() {
        fs.writeFileSync(this.taskGenLogFilepath, 'taskId;task;elapsedTime\n');

        if (program.opts().autotask || program.opts().autotaskOnly) {
            fs.writeFileSync(this.taskExecLogFilepath, 'taskId;task;startTime;endTime;duration;steps\n');
        }
    }

    getElapsedTime() {
        return this.calculateTimeDiff(this.startTime, new Date());
    }

    calculateTimeDiff(startTime, endTime) {
        let timeDiff = endTime - startTime;

        // Return as hh:mm:ss string
        return new Date(timeDiff).toISOString().slice(11, 19);
    }

    getTotalRequestCount() {
        return this.requestCounter;
    }

    getRequestCountWithoutLogin() {
        return this.requestCounterWithoutLogin;
    }

    // For removing requests that should not contribute to the total count
    removeRequestFromCount() {
        this.requestCounterWithoutLogin--;
    }

    logTaskGeneration(tasks, totalTaskCount) {
        let elapsedTime = this.getElapsedTime();
        let taskId = totalTaskCount - tasks.length; // Calculate taskId to start with

        let stream = fs.createWriteStream(this.taskGenLogFilepath, {flags:'a+'});
        for (let task of tasks) {
            stream.write([taskId, task.replace(';', ''), elapsedTime].join(';') + '\n');
            taskId++;
        }
    }

    logTaskExecutionStart(taskId, task) {
        this.currentTaskId = taskId;
        this.currentTask = task.replaceAll(';', '');
        this.currentTaskStartTime = new Date();
    }

    logTaskExecutionEnd(stepCount) {
        let endTime = new Date();

        // Times are given relative to the start of the run
        let startTimeElapsed = this.calculateTimeDiff(this.startTime, this.currentTaskStartTime);
        let endTimeElapsed = this.calculateTimeDiff(this.startTime, endTime);
        let duration = this.calculateTimeDiff(this.currentTaskStartTime, endTime);

        let entries = [this.currentTaskId, this.currentTask, startTimeElapsed, endTimeElapsed, duration, stepCount];
        fs.appendFileSync(this.taskExecLogFilepath, entries.join(';') + '\n');
    }
}

module.exports = StatisticsModule