const LLMBridge = require('./llm-bridge');


class GPTVisionBridge extends LLMBridge {
    constructor(id, template, pageWrapper) {
        super(id, template);
        this.model = 'gpt-4-vision-preview';
        this.page = pageWrapper.getPageObj();   // The page object is required to take screenshots
    }

    _writeConversationToFile(prompt, reply) {
        prompt = prompt.find(x => x.type === 'text').text;
        super._writeConversationToFile(prompt, reply);
    }

    async _wrapPromptMessage(prompt) {
        let base64Screenshot = await this.page.screenshot({encoding: 'base64'});

        return {role: "user", content: [
                {"type": "text", "text": prompt},
                {
                    "type": "image_url",
                    "image_url": {
                        "url": `data:image/png;base64,${base64Screenshot}`,
                        "detail": "high"
                    },
                },
            ]};
    }


    // Hacky fix since token check does not work for the different message types required for vision
    _checkTokenLimit(messages) {
        return messages;
    }
}


module.exports = GPTVisionBridge