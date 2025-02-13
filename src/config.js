/**
 * The admin username of the crawled web application.
 * @const
 * @type {string}
 */
const username = 'chikara';
//const username = 'jaekpot@localhost.com';

/**
 * The admin password of the crawled web application.
 * @const
 * @type {string}
 */
const password = 'chikara_password';
//const password = 'jAEkPot';

/**
 * The maximum crawling depth (only counting URLs, not forced execution edges)
 * @type {number}
 */
const maxDepth = Infinity;

/**
 * Limits the number of "similar" pages that are crawled (same URL after removing query string and fragments)
 * @type {number}
 */
const maxSimilarPages = 120;


/**
 * Defines the number of past requests/responses from the LLM that are included in the next API request.
 * A higher number might give more context awareness, but increases token usage.
 * @type {number}
 */
const includedChatHistoryLength = 4;


/**
 * Defines the number of past completed steps that are included in each prompt.
 * @type {number}
 */
const includedCompletedStepsCount = 6;


/**
 * The maximum number of retries that are made if an LLM API call failed (e.g., due to rate limiting).
 * @type {number}
 */
const maxApiRetries = 6;


/**
 * The initial retry delay for failed API requests in milliseconds.
 * @type {number}
 */
const initialRetryDelay = 3000;


/**
 * The maximum time in ms that a GPT API request can take until it times out
 * @type {number}
 */
const apiTimeout = 90000;


/**
 * The maximum number of steps a single task can take (to prevent infinite loops)
 * @type {number}
 */
const maxStepsPerTask = 15;


/**
 * The maximum number of consecutive replies with invalid syntax that is allowed (to prevent infinite loops)
 * @type {number}
 */
const maxInvalidSyntaxReplies = 10;


let config = {
    username,
    password,
    maxDepth,
    maxSimilarPages,
    includedChatHistoryLength,
    includedCompletedStepsCount,
    maxApiRetries,
    initialRetryDelay,
    apiTimeout,
    maxStepsPerTask,
    maxInvalidSyntaxReplies
};

module.exports = config;