<div align="center">
  <img align="center" width="90" src="figures/yurascanner_logo.png">

   # YuraScanner: A Task-driven Web Application Scanner
</div>

This repository contains the code of YuraScanner --- an LLM-powered web application scanner, first presented at NDSS 2025: [YuraScanner: Leveraging LLMs for Task-driven Web App Scanning](https://dx.doi.org/10.14722/ndss.2025.240388). With our tool, we apply the concept of large language models (LLMs) to the domain of black box web application scanning.


## Ethical Discussion
In our [paper](https://dx.doi.org/10.14722/ndss.2025.240388), we acknowledged the risk that YuraScanner might be misused to achieve goals other than the ones intended in the paper, exacerbating issues such as fake account creation and scraping. Accordingly, we set up a vetting process to access the tool. However, upon further examination, we found that existing bot prevention countermeasures such as CAPTCHA, MFA, and others are sufficient to prevent the misuse of our tool. Given this new understanding, we have reassessed our risk-benefit evaluation and decided to proceed with the public release of the tool to facilitate further research.

We encourage users to exercise discretion and responsible behavior when using YuraScanner.

## Overview
<div align="center">
  <img align="center" width="900" src="figures/overview.png">
</div>

As illustrated by the figure above, the execution of YuraScanner can be divided into three phases:

1. **Task Extraction:** If the corresponding command-line flag is specified (see [Usage](#usage)), YuraScanner performs a shallow crawl of depth one to extract the text content of clickable page elements. The list of strings is then processed by an LLM, which proposes possible actions for the given elements.
2. **Task Execution:** YuraScanner iterates over the tasks that were generated in the previous step (or provided manually). For each task, an LLM is used to predict the next action that has to be taken for fulfilling the task. A more detailed description is given in the [Crawler section](#task-driven-crawler-component).
3. **Vulnerability Scanning:** During the previous step, YuraScanner collected a list of forms found on each page. For the vulnerability detection phase, the tool iterates over each form and tries to find reflected and stored XSS vulnerabilities by injecting a list of pre-defined payloads. The attack component is modeled after the XSS detection engine of [Black Widow](https://github.com/SecuringWeb/BlackWidow).


## Task-Driven Crawler Component
<div align="center">
  <img align="center" width="600" src="figures/agent_architecture.png">
</div>

### Sensors
The [Sensors class](src/sensors-actuators/sensors.js) is responsible for converting the page *p* into an abstract
representation *abs(p)* which can be understood by the Bridge. To this end, the `updateAbstractPage()` method collects
all clickable elements and forms ("actions") on the page and converts them into a string representation. This representation features an 
HTML-like syntax, but replaces the actual `id` attribute with a custom incremental integer ID. This ID is used to store
and later retrieve the associated element from the [Actions Mapping](src/sensors-actuators/actions-mapping.js).

### Bridge
The [LLMBridge class](src/bridge/llm-bridge.js) in our implementation corresponds to the bridge module in the
figure. Given a prompt containing an abstract representation of the page and the current task, it queries an LLM for the
next action *abs(a)*. It also keeps the history of previous interactions with the LLM to provide sufficient context for
choosing the next action.

For the experiments in our paper, we primarily used OpenAI GPT. However, the `model` and `baseURL` attributes of the OpenAI package can be modified
by specifying the `--model` and `--model-endpoint` command-line options. This allows for the deployment of other LLM APIs which are compatible to the OpenAI API. An example for this is the
[FastChat API](https://github.com/lm-sys/FastChat).

### Actuators
The method `parseAbstractAction()` inside the [Actuators class](src/sensors-actuators/actuators.js) takes the abstract
action *abs(a)* that was issued by the Bridge as an input (e.g., "CLICK 3") and executes the action inside the browser
instance. As shown in the figure, it uses the Actions Mapping to translate the numeric ID to the associated page element.

## Setup
1. [Install Node.js](https://nodejs.org/en/download/package-manager). YuraScanner has been confirmed to work with Node.js 18. 


2. Clone the repository, `cd` into the directory and install the tool and its dependencies using npm:
    ```bash
    npm install -g
    ```
    The command `yurascanner` can now be used globally from the command line.


3. Next, create an `.env` file in the root folder of the repository. It has to contain the following line:
    ```dotenv
    OPENAI_API_KEY={Your API key here}
    ```
   **⚠️ Please note that your account will be billed for the API requests that YuraScanner performs!**

## Usage
A typical command for running YuraScanner on the admin dashboard of a locally hosted web application may look like this:

```bash
yurascanner http://localhost/admin/ --username admin --password password --gpt4 --autotask --headless --screenshot -t 60
```

We explain the specified options in the following:
* `--username` and `--password` can be used to specify the (admin) credentials for the application. The automated login function of YuraScanner then tries to find and submit a login form on the given starting page. The session is automatically re-authenticated by logging in again (if necessary) after each finished task.
* `--gpt4` specifies that OpenAI GPT-4 should be used instead of the default GPT-3.5 Turbo. GPT-4 is more expensive, but also performs significantly better than GPT-3.5 Turbo. Hence, it is recommended to use this flag.
* `--autotask` tells YuraScanner to automatically generate a list of tasks for the web application using an LLM. Alternatively, a custom task file can be specified via `--taskfile <path>`. 
* `--headless` has to be used when executing on a server without a GUI.
* `--screenshot` saves an image of the current browser window after each step. For easier reference, the current task is embedded as text inside each screenshot.
* `-t`: Timeout in minutes.

A complete list of the supported command-line options can be obtained via: 
```bash
yurascanner --help
```

## Cite
```
@inproceedings{yurascanner,
  title = {{YuraScanner}: Leveraging LLMs for Task-driven Web App Scanning},
  author = {Aleksei Stafeev and Tim Recktenwald and Gianluca De Stefano and Soheil Khodayari and Giancarlo Pellegrino},
  booktitle = {32nd Annual Network and Distributed System Security Symposium, {NDSS}, 2025, San Diego, California, USA, February 24-28, 2025},
  year = {2025},
  doi = {10.14722/ndss.2025.240388},
  url = {https://dx.doi.org/10.14722/ndss.2025.240388},
  publisher = {The Internet Society},
}
```
