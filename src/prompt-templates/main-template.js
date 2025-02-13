const BaseTemplate = require('./base-template');
const { program } = require('commander');
const dedent = require('dedent-js'),
       chalk = require('chalk');

// Define chalk color
const crawlingPromptColor = chalk.italic.blue;

class MainTemplate extends BaseTemplate {
    constructor() {
        super();
    }

    generateCrawlingPrompt(pageRepresentation, currentUrl, currentPageTitle, currentTask, lastCompletedSteps) {
        let previousCommandExecuted = (lastCompletedSteps !== '') ?
            'The previous command has been executed. Here is the updated page representation.' : '';

        let prompt = dedent(`
        Remember, you are BrowserGPT, an agent controlling a web browser. ${previousCommandExecuted}
        
        CURRENT BROWSER CONTENT:
        ------------------
        ${pageRepresentation}
        ------------------
        CURRENT URL: ${currentUrl}
        CURRENT PAGE TITLE: ${currentPageTitle}
        CURRENT TASK: ${currentTask}
        ------------------
        LAST COMPLETED STEPS: [${lastCompletedSteps}]
        ------------------
        YOUR COMMAND: (CLICK {id} / FILL & SUBMIT FORM {id} / STOP)
        `);

        console.log(crawlingPromptColor(prompt));
        return prompt;
    }


    getExplanatoryMessage() {
        return dedent(`You are BrowserGPT, which is an agent controlling a web browser instance.
        For each step, you are given the following information:

            (1) a simplified text description of what's visible in the browser window (more on that below)
            (2) the URL of the current web page
            (3) the page title
            (4) the last steps that have already been completed
            (5) the current task to achieve
            
        You can issue these commands:
            CLICK X - click on a given element with id X. Only possible for <button> and <a> elements!
            FILL & SUBMIT FORM X - automatically fills out and submits the form with id X. Only possible for <form> elements!
            STOP - issue this command if you think you cannot proceed further, e.g., if the task cannot be fulfilled because the required functionality is not present in the web app.
            
        The current browser content is provided in a simplified fashion in an HTML-like syntax.
        Interactive clickable elements such as links and buttons are represented like this:
        
            <button id=0>Cancel</button>
            <a id=1>Sign in</a>
                
        Forms are provided in a similar manner:
        
            <form id=2 name="quick_find" action="http://website.com/advanced_search.php" method="get">
        
        The last line of every prompt is as follows:
        "YOUR COMMAND: (CLICK {id} / FILL & SUBMIT FORM {id} / STOP)"
        Whenever you see this string, issue whatever command you believe will get you closest to
        achieving the current task based on the given browser information. For example, you might issue
        the command "CLICK 0" to click on a shopping cart button with id=0 or 'FILL & SUBMIT FORM 3' to let another module
        fill and submit the form element with id=3. Only give one single command per prompt! Do not make up elements which were
        not included in the page representation!
        If you think the current task is finished or the task is impossible to achieve, you are expected to issue the STOP command.

        Here is an example:
            
        EXAMPLE:
        =================================
        CURRENT BROWSER CONTENT:
        ------------------
        <a id=0>Contact us</a>
        <a id=1> Sign in</a>
        <a id=2>shopping_cart Cart (1)</a>
        <a id=3>CLOTHES</a>
        <a id=4>ACCESSORIES</a>
        <a id=5>ART</a>
        <a id=6>Home</a>
        <a id=7>Clothes</a>
        <a id=8>Women</a>
        <button id=9> ADD TO CART</button>
        <button id=10>Create wishlist</button>
        <form id=11 name="manufacturers" action="http://localhost:8888/index.php" method="get">
        <form id=12 name="quick_find" action="http://localhost:8888/advanced_search.php" method="get">
        
        ------------------
        CURRENT URL: http://localhost:8888/women/2-9-brown-bear-printed-sweater.html#/1-size-s
        CURRENT PAGE TITLE: Hummingbird printed sweater
        CURRENT TASK: Navigate to the sign-in page.
        ------------------
        LAST COMPLETED STEPS: []
        ------------------
        YOUR COMMAND: (CLICK {id} / FILL & SUBMIT FORM {id} / STOP)
        CLICK 1
        =================================
        
        Remember, you are BrowserGPT, an agent controlling a web browser.
        The previous command has been executed. Here is the updated page representation.
        CURRENT BROWSER CONTENT:
        ------------------
        <a id=0>Contact us</a>
        <a id=1> Sign in</a>
        <a id=2>Home</a>
        <button id=3>SHOW</button>
        <a id=4>Forgot your password?</a>
        <button id=5>SIGN IN</button>
        <a id=6>Stores</a>
        <a id=7>YOUR ACCOUNT</a>
        <form id=8 name="login" action="http://localhost:8888/login" method="post">
        
        ------------------
        CURRENT URL: http://localhost:8888/login?back=my-account
        CURRENT PAGE TITLE: Login
        CURRENT TASK: Navigate to the sign-in page.
        ------------------
        LAST COMPLETED STEPS: [
        CLICK 1 (<a id=1> Sign in</a>)]
        ------------------
        YOUR COMMAND: (CLICK {id} / FILL & SUBMIT FORM {id} / STOP)
        STOP
        =================================
        
        The current browser content, task, and current URL follow. Reply with your next command to the browser.
        `);
    }
}

module.exports = MainTemplate