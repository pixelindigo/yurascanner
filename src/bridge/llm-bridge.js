const commandLinePrompt = require('async-prompt'),
              clipboard = require('clipboardy'),
                 config = require('../config'),
                  chalk = require('chalk'),
                   path = require('path'),
                     fs = require('fs');
const util = require('../common-utils/util');
const { isWithinTokenLimit } = require('gpt-tokenizer/model/gpt-3.5-turbo');
const OpenAI = require("openai");
const { program } = require('commander');
require('dotenv').config();

// Define chalk colors
const errorColor = chalk.bold.red;
const infoColor = chalk.bold.hex('#ff5f15');
const replyColor = chalk.bold.greenBright;


class LLMBridge {
    constructor(id, template) {
        this.template = template;
        this.chatHistory = [];

        // Create chat-histories directory
        let chatHistoryDir = path.resolve(__dirname, '../../output/chat-histories');
        fs.mkdirSync(chatHistoryDir, { recursive: true });
        this.chatHistoryFilepath = path.join(chatHistoryDir, `[${id}] ${new Date().toISOString()}.md`);

        // gpt-3.5-turbo is used as the default model, but can be changed via command-line parameters
        this.model = 'gpt-3.5-turbo';
        if (program.opts().gpt4) {
            this.model = 'gpt-4';
        } else if (program.opts().model) {
            this.model = program.opts().model;
        }

        if (!program.opts().manual) {
            // Setup LLM API
            this.openai = new OpenAI({
                apiKey: this.model.includes('gpt') ? process.env.OPENAI_API_KEY : 'na',
                baseURL: program.opts().modelEndpoint
            });
        }
    }


    clearChatHistory() {
        this.chatHistory = [];
    }


    removeLastChatHistoryEntry() {
        this.chatHistory.pop();
    }


    async requestApi(prompt) {
        let messages = [];

        // Always include explanatory message, even if it is not in the sliding chat history window anymore
        if (this.chatHistory.length > config.includedChatHistoryLength) {
            messages.push({role: "user", content: this.template.getExplanatoryMessage()});
        }

        // Include last N messages of chat history
        messages = messages.concat(this.chatHistory.slice(-1 * config.includedChatHistoryLength));

        // If this is our first prompt, we prepend the explanatory message
        if (this.chatHistory.length === 0) {
            prompt = this.template.getExplanatoryMessage() + prompt;
        }
        const wrappedPromptMessage = await this._wrapPromptMessage(prompt);
        messages.push(wrappedPromptMessage);
        this.chatHistory.push(wrappedPromptMessage);

        // If manual mode is enabled, commands are provided in the command line, not by the LLM API
        if (program.opts().manual) {
            return await this._performManualCall(prompt);

        // Else, check the token limit and send the messages to the LLM API
        } else {
            this._checkTokenLimit(messages);
            return await this._performApiCall(messages);
        }
    }


    // In contrast to requestApi(), this method does not send along any previous messages to the LLM
    async requestApiStateless(prompt) {
        prompt = this.template.getExplanatoryMessage() + prompt;
        let messages = [{role: "user", content: prompt}];

        // If manual mode is enabled, commands are provided in the command line, not by the LLM API
        if (program.opts().manual) {
            return await this._performManualCall(prompt);

        // Else, send the messages to the OpenAI API and wait for the reply
        } else {
            return await this._performApiCall(messages);
        }
    }


    async _performManualCall(prompt) {
        if (program.opts().clipboard) {
            clipboard.writeSync(prompt);
        }
        return await commandLinePrompt('?>');
    }


    async _performApiCall(messages) {
        let completion;

        // In case of failure, the request is repeated up to maxApiRetries times
        for (let attempt = 0; attempt < config.maxApiRetries + 1; attempt++) {
            try {
                completion = await Promise.race([
                    this.openai.chat.completions.create({
                        model: this.model,
                        messages: messages
                    }),
                    new Promise((resolve, reject) => {
                        setTimeout(() => {
                            reject(new Error('API call timed out.'));
                        }, config.apiTimeout);
                    })
                ]);
                break;
            } catch (e) {
                console.log(errorColor(`[!] API error during attempt ${attempt + 1} (${e}).`));

                // Abort if all retries failed
                if (attempt === config.maxApiRetries) {
                    console.log(errorColor('[!] Maximum number of retries reached. Exiting...'));
                    process.exit(1);
                }

                // Check if error was caused by violating context length limit
                if (String(e).includes('Please reduce the length of the messages.')) {
                    this._reduceTokenCount(messages);
                }

                // The delay is doubled for every retry (initial delay * 2^x)
                let delay = config.initialRetryDelay * (2 ** attempt);
                await util.sleep(delay);
            }
        }

        let reply = completion.choices[0].message.content;

        //console.log("TOKENS USED:", completion.data.usage.total_tokens);

        // Update chat history
        let replyMessage = {role: 'assistant', content: reply};
        this.chatHistory.push(replyMessage);

        // Write the conversation to file
        let prompt = messages.slice(-1)[0].content;
        this._writeConversationToFile(prompt, reply);

        console.log(replyColor(reply) + '\n');
        return reply
    }


    _writeConversationToFile(prompt, reply) {
        let updateString = '```\n' + prompt + '\n```\n\n```\n' + reply + '\n```\n\n'
        fs.appendFileSync(this.chatHistoryFilepath, updateString);
    }


    async _wrapPromptMessage(prompt) {
        return {role: "user", content: prompt};
    }


    _checkTokenLimit(messages) {
        // The default token limit is 8192 tokens, but can be increased via a command-line option
        let tokenLimit = program.opts().contextWindow;

        // If necessary, reduce the number of included previous messages to comply with the token limit
        while (!isWithinTokenLimit(messages, tokenLimit) && messages.length > 2) {
            this._reduceTokenCount(messages);
        }
    }


    _reduceTokenCount(messages) {
        // Reduce token count by removing the second message entry (first one is always the explanation message)
        messages.splice(1, 1);
        console.log(infoColor('[INFO] Had to reduce number of messages to comply with the API\'s token limit!'));
    }
}


module.exports = LLMBridge