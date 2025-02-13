const BaseTemplate = require('./base-template');
const dedent = require('dedent-js');
const chalk = require('chalk');

// Define chalk color
const formPromptColor = chalk.hex('#8731E8');

class FormTemplate extends BaseTemplate {
    /*
    Example form representation for usage in prompts:
    <form name="create_account" action="[object Object]" method="post">
        <input id=0 type="radio" name="gender" placeholder="" value="m"></input>
        <input id=1 type="radio" name="gender" placeholder="" value="f"></input>
        <input id=2 type="text" name="firstname" placeholder=""></input>
        <input id=3 type="text" name="lastname" placeholder=""></input>
        <input id=4 type="text" name="dob" placeholder=""></input>
        <input id=5 type="text" name="email_address" placeholder=""></input>
        <input id=6 type="text" name="company" placeholder=""></input>
        <input id=7 type="text" name="street_address" placeholder=""></input>
        <input id=8 type="text" name="suburb" placeholder=""></input>
        <input id=9 type="text" name="postcode" placeholder=""></input>
        <input id=10 type="text" name="city" placeholder=""></input>
        <input id=11 type="text" name="state" placeholder=""></input>
        <input id=12 type="text" name="telephone" placeholder=""></input>
        <input id=13 type="text" name="fax" placeholder=""></input>
        <input id=14 type="checkbox" name="newsletter" placeholder="" value="1"></input>
        <input id=15 type="password" name="password" placeholder=""></input>
        <input id=16 type="password" name="confirmation" placeholder=""></input>
    </form>
     */

    getExplanatoryMessage() {
        return dedent(`You are FormGPT, which is an agent for automatically filling out forms on a web page.
        As an input, you are given a form in HTML representation. Your task is to fill out the form with fitting values.
            
        You can issue this command multiple times (each command in a new line):
            TYPE X "text" - type the provided text into the input with id X.

        Here is an example:
            
        EXAMPLE:
        =================================
        FORM TO FILL OUT:
        ------------------
        <form name="personal_info" action="update_info.php" method="post">
            <input id=0 type="text" name="firstname" placeholder=""></input>
            <input id=1 type="text" name="lastname" placeholder=""></input>
            <input id=2 type="text" name="email_address" placeholder=""></input>
            <input id=3 type="text" name="state" placeholder=""></input>
        </form>
        ------------------
        YOUR LIST OF COMMANDS: (TYPE {id} "text")
        TYPE 0 "John"
        TYPE 1 "Doe"
        TYPE 2 "john.doe@example.com"
        TYPE 3 "Germany"
        
        
        The actual form follows now. Please provide your list of commands as an answer.
        
        `);
    }


    generatePrompt(formRepresentation) {
        let prompt = dedent(`
        FORM TO FILL OUT:
        ------------------
        ${formRepresentation}
        ------------------
        YOUR LIST OF COMMANDS: (TYPE {id} "text")`);

        console.log(formPromptColor(prompt));
        return prompt;
    }
}

module.exports = FormTemplate