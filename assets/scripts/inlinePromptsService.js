const vscode = require("vscode");
const storageUtils = require("./storageUtils");
const {
    decrypt,
    getUserConfigurations,
    getWebviewPanel,
    createNewFileWithCodeBlock,
    LoadingStateManager,
    FetchControllerManager,
} = require("./ssrUtils");
const { getOpenAIRequestPayload, responseParser } = require("./apiInterface");
const { handleAPIResponse } = require("./contextMenuTestsCommands.utils");
const { INLINE_PROMPT_API_CONTROLLER, UNIT_TEST_PROMPT, E2E_TEST_PROMPT } = require("./constants");

const systemMessages = [
    {
        role: "system",
        content:
            "You are a helpful, empathetic, and friendly CodeBot for Engineers.",
    },
    {
        role: "system",
        content:
            "You can ask me for help with fixing code errors, generating code snippets, writing test cases, explaining code concepts, and more. \n\n in case of code blocks in response please provide the language name in the code block header to get the syntax highlighting",
    },
];

let workspaceState;
let accessTokenKey;
let openAIMessagesForInlinePrompt = [];

// Function to make a request to the OpenAI API
async function makeAPIRequest(input, commandType, promptsArray) {
    const extensionConfig = vscode.workspace.getConfiguration("AICodeCompanion");
    const { apiKey } = extensionConfig;

    const API_ENDPOINT =
    getUserConfigurations().apiProvider[apiKey]["endPointUrl"];

    let data = {};
    let apiRequests = [];

    const encryptedAccessData = storageUtils.getAccessToken(
        workspaceState,
        accessTokenKey
    );
    if (!encryptedAccessData) {
        throw new Error(
            "No Access Token found, please provide access token from your OpenAI platform like OpenAI or PSChat"
        );
    }
    const Authorization_Token = decrypt(encryptedAccessData);

    if (!promptsArray) {
        openAIMessagesForInlinePrompt = [...systemMessages];

        // Add System Context to the openAIMessagesForInlinePrompt Array
        openAIMessagesForInlinePrompt.push({ role: "user", content: input });

        const { payLoad } = getOpenAIRequestPayload(
            openAIMessagesForInlinePrompt,
            Authorization_Token,
            systemMessages,
            true
        );
        apiRequests.push({
            endpoint: API_ENDPOINT,
            payload: payLoad,
            controllerId: `Controller_Inline_${Math.random()}${Date.now()}`,
        });
    } else {
        // Create an array of API requests based on promptsArray
        apiRequests = promptsArray
            .filter((prompt) => {
                const { gitDiff } = prompt;
                return !/^\s*$/.test(gitDiff); // Filter out elements where gitDiff is blank (only whitespace characters)
            })
            .map((prompt, index) => {
                const { gitDiff } = prompt;
                // Create openAIMessagesForInlinePrompt using input and gitDiff
                const openAIMessagesForInlinePrompt = [
                    ...systemMessages,
                    { role: "user", content: `${input}\n\n${gitDiff}` },
                ];
                // Get the payload for the API request
                const { payLoad } = getOpenAIRequestPayload(
                    openAIMessagesForInlinePrompt,
                    Authorization_Token,
                    systemMessages,
                    true
                );
                // Create the API request object
                return {
                    endpoint: API_ENDPOINT,
                    payload: payLoad,
                    controllerId: `Controller_${index + 1}`,
                };
            });
    }

    const fetchControllerManager = new FetchControllerManager();

    // Create an array of promises for each API request
    const apiPromises = apiRequests.map(async (request) => {
        const { endpoint, payload, controllerId } = request;
        let fetchController = fetchControllerManager.createController(controllerId, INLINE_PROMPT_API_CONTROLLER);
        const responsePromise = fetchController.fetchData(endpoint, payload);
        return responsePromise;
    });

    // Use Promise.allSettled() to execute all API requests in parallel
    const settledResponses = await Promise.allSettled(apiPromises);

    // Process the responses as needed
    const responses = await Promise.all(
        settledResponses.map(async (settledResponse, index) => {
            const { endpoint, payload, controllerId } = apiRequests[index];

            try {
                if (settledResponse.status === "fulfilled") {
                    const response = settledResponse.value;
                    // Handle the response for each API request

                    if (response.status !== 200) {
                        if (response.status === 400) {
                            let errorData;
                            try {
                                errorData = await response.json();
                            } catch (error) {
                                console.error("Error parsing response JSON:", error);
                                if (!promptsArray) {
                                    throw new Error("Error parsing response JSON: - not valid JSON from API");
                                }
                            }
                            if (errorData?.error?.code === "context_length_exceeded") {
                                console.error("Inside context_length_exceeded ---------", errorData);
                                if (!promptsArray) {
                                    throw new Error(`Oops!! looks like you crossed the content length due to long chat history \n\n Either clear the history by clicking on above Delete Chat History Button or use an AI Model with higher max-token size by updating the AICodeCompanion extension settings`);
                                }
                            }
                        } else if (response.status === 412) {
                            throw new Error(
                                `API call failed with status code: ${response.status} and error message: ${response.statusText}
                                Seems like your Access token is expired, please provide a new Access Token from your OpenAI platform like OpenAI or PSChat`
                            );
                        }

                        const errorMessage = `API call failed with status code: ${response.status} and error message: ${response.statusText}`;
                        if (!promptsArray) {
                            throw new Error(errorMessage);
                        }
                    } else {
                        const data = await response.json();
                        const { openAIResponseObject } = responseParser(data, commandType, openAIMessagesForInlinePrompt, true);
                        return openAIResponseObject;
                    }
                } else {
                    const reason = settledResponse.reason;
                    console.error(`API call failed for ${endpoint} using ${controllerId}:`, reason);
                    return settledResponse;
                }
            } catch (error) {
                console.error("Error processing API response:", error);
                // Handle the error in a way that allows the loop to continue
                // For example, return a default response object
                let errorMessage = "Failed to process API response";
                if (error && (error?.message.includes("status code: 412") || error?.message.includes("status code: 401"))) {
                    if (error?.message.includes("status code: 401")) {
                        errorMessage += ` - status code: 401`;
                    } else {
                        errorMessage += ` - status code: 412`;
                    }
                }
                return { error: errorMessage };
            }
        })
    );

    //Reset the fetchController to null after the API call is completed
    const inlinePromptControllers = fetchControllerManager.getControllers(INLINE_PROMPT_API_CONTROLLER);
    if (inlinePromptControllers) {
        for (let key in inlinePromptControllers) {
            if (inlinePromptControllers.hasOwnProperty(key)) {
                fetchControllerManager.removeController(key, INLINE_PROMPT_API_CONTROLLER);
            }
        }
        fetchControllerManager.removeControllers(INLINE_PROMPT_API_CONTROLLER);
    }

    let finalErrorMessage;

    if (responses.length <= 1) {
        if (responses[0]?.status === "rejected" && responses[0]?.reason?.aborted) {
            throw new Error("Request aborted by User");
        }

        if (responses[0]?.error && (responses[0]?.error?.includes("status code: 412") || responses[0]?.error?.includes("status code: 401"))) {
            if (responses[0]?.error?.includes("status code: 401")) {
                finalErrorMessage = `Seems like your Access token is not valid, please provide valid Access Token from your OpenAI platform like OpenAI or PSChat`;
            } else {
                finalErrorMessage = `Seems like your Access token is expired, please provide a new Access Token from your OpenAI platform like OpenAI or PSChat`;
            }
        }

        if (!responses[0]) throw new Error("No Response from AI Provider");
    }

    // Filter the responses to only include the ones that have finish_reason as "stop" to merge only valid responses
    const filteredResponse = responses.filter(obj => obj && obj.finish_reason === "stop");

    // Combine the responses into a single object
    const combinedResponse = filteredResponse[0] ? filteredResponse.reduce((merged, obj) => {
        if (obj?.finish_reason === "stop") {
            merged.message.content += `\n\n${obj.message.content}`;
        }
        return merged;
    }) : null;

    if (combinedResponse === null) {
        console.error("No Response from AI Provider");
        if (finalErrorMessage !== undefined) {
            finalErrorMessage = `No Response from AI Provider \n ${finalErrorMessage}`;
            throw new Error(finalErrorMessage);
        }
        throw new Error("No Response from AI Provider");
    }

    return combinedResponse;
}

function handleInlinePromptMessage(message, commentLines, promptsArray) {
    const { userInput, command } = message;
    const webViewPanel = getWebviewPanel();
    const { promptLineStart, promptLineEnd } = commentLines || {};

    const loadingStateManager = new LoadingStateManager();
    loadingStateManager.startLoading(promptLineStart, promptLineEnd);

    // Make API call
    makeAPIRequest(userInput, command, promptsArray)
        .then((apiData) => {
            // API call successful
            if (webViewPanel && webViewPanel?.visible) {
                webViewPanel.webview.postMessage({
                    command: "updateInlinePromptResultSuccess",
                    data: apiData,
                });
            } else {
                if (apiData?.message?.content) {
                    createNewFileWithCodeBlock({
                        text: { code: apiData.message.content, language: "markdown" },
                    });
                } else {
                    vscode.window.showErrorMessage("No Response from AI Provider");
                }
            }
        })
        .catch((error) => {
            handleAPIError(error, webViewPanel);
        })
        .finally(() => {
            loadingStateManager.stopLoading();
        });
}

function handleContextMenuTestCommand(message) {
    const { userInput, command, userCommand, languageId, userSelectedText } = message;
    const webViewPanel = getWebviewPanel();

    if (message.command === "send") {
        // Show loading state in the webview
        if (webViewPanel && webViewPanel?.visible) {
            webViewPanel.webview.postMessage({
                command: "userMessage",
                isAPIInProgress: true,
                userInput: `No default test configuration found, looking for ${(userCommand === "writeUnitTests") ? "Unit" : "End-to-End"} testing library options to write test cases`,
                APIControllerName: INLINE_PROMPT_API_CONTROLLER
            });
        } else {
            vscode.window.showErrorMessage("No default test configuration found, either provide the configuration in '.aicodecompanion.config.js' file or please execute the command again once the AI Code Companion chat window is opened");
            vscode.commands.executeCommand("aicodecompanion.chatView.focus");
            return;
        }

        // Make API call
        makeAPIRequest(userInput, command)
            .then((apiData) => {
                // API call successful
                if (webViewPanel && webViewPanel?.visible) {
                    webViewPanel.webview.postMessage({
                        command: "removeLoadingState",
                        isAPIInProgress: false,
                    });
                }
                handleAPIResponse(apiData, userCommand, languageId, workspaceState, userSelectedText);
            })
            .catch((error) => {
                handleAPIError(error, webViewPanel);
            });
    }
}

function handleAPIError(error, webViewPanel) {
    // API call failed
    const failedResponseObject = {
        command: "updateResultFailed",
        data: error.message,
    };

    if (webViewPanel && webViewPanel?.visible) {
        webViewPanel.webview.postMessage(failedResponseObject);
    } else {
        vscode.window.showErrorMessage(error.message);
    }
}

function executeContextMenuTestCommand(args) {
    const editor = vscode.window.activeTextEditor;
    const document = editor?.document;
    const selectedText = args.text || document?.getText(editor.selection);
    const languageId = document?.languageId;
    const userCommand = args.userCommand;
    const emptyRegex = /^\s*$/;
    if (selectedText.match(emptyRegex)) {
        vscode.window.showInformationMessage(`No selected code found for writing ${(userCommand === "writeUnitTests") ? 'Unit' : 'End-to-End'} Test Cases`);
    } else {
        const userInput = ((userCommand === "writeUnitTests") ? UNIT_TEST_PROMPT : E2E_TEST_PROMPT) + "\n\n Below is the code:\n" + selectedText;
        handleContextMenuTestCommand({ command: "send", userInput, userCommand, languageId, userSelectedText: selectedText });
    }
}

function setWorkspaceStateAndKeyForInLinePrompts(state, accessTokenStorageKey) {
    workspaceState = state;
    accessTokenKey = accessTokenStorageKey;
}

module.exports = {
    handleInlinePromptMessage,
    setWorkspaceStateAndKeyForInLinePrompts,
    handleContextMenuTestCommand,
    executeContextMenuTestCommand
};
