const vscode = require("vscode");
const storageUtils = require("./storageUtils");
const { decrypt, getUserConfigurations, FetchControllerManager } = require("./ssrUtils");
const { WEB_VIEW_API_CONTROLLER } = require("./constants");
const {
  setTokenUsage,
  setPSChatMessageID,
  resetContinuationCommandType_Count,
  trimOpenAIMessages,
  getOpenAIRequestPayload,
  responseParser,
} = require("./apiInterface");

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
let openAIMessages;
let workspaceState;
let chatHistoryKey;
let accessTokenKey;
let chatHistoryObject;

function getopenAIMessages() {
  return openAIMessages;
}

function resetopenAIMessages() {
  setPSChatMessageID("");
  resetContinuationCommandType_Count();
  openAIMessages = [...systemMessages];
  chatHistoryObject = undefined;
  setTokenUsage([]);
}

// Function to make a request to the OpenAI API
async function makeAPIRequest(input, commandType) {
  const extensionConfig = vscode.workspace.getConfiguration("AICodeCompanion");
  const { apiKey } = extensionConfig;
  console.log(">>>",getUserConfigurations().apiProvider);
  console.log(">>>",getUserConfigurations().apiProvider[apiKey]);
  console.log(">>>",getUserConfigurations().apiProvider[apiKey]["endPointUrl"]);
  const API_ENDPOINT =
    getUserConfigurations().apiProvider[apiKey]["endPointUrl"];

  let data = {};
  openAIMessages.push({ role: "user", content: input });

  const encryptedAccessData = storageUtils.getAccessToken(
    workspaceState,
    accessTokenKey
  );
  if (!encryptedAccessData && apiKey !== 'MyAPI') {
    throw new Error(
      "No Access Token found, please provide access token from your OpenAI platform like OpenAI or PSChat"
    );
  }
  const Authorization_Token =encryptedAccessData ? decrypt(encryptedAccessData) : null;

  const { payLoad } = getOpenAIRequestPayload(
    openAIMessages,
    Authorization_Token,
    systemMessages,
  );

  // Make API call
  const fetchControllerManager = new FetchControllerManager();
  let fetchController = fetchControllerManager.createController("webView_controller", WEB_VIEW_API_CONTROLLER);

  const response = await fetchController.fetchData(API_ENDPOINT, payLoad);
  console.log(response);
  // Reset the fetchController to null after the API call is completed
  fetchController = null;
  fetchControllerManager.removeController("webView_controller", WEB_VIEW_API_CONTROLLER);

  if (response.status !== 200) {
    if (response.status === 400) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (error) {
        console.error("Error parsing response JSON:", error);
        throw new Error(
          "Error parsing response JSON: - not valid JSON from API"
        );
      }
      if (errorData?.error?.code === "context_length_exceeded") {
        console.error(
          "service.js Inside context_length_exceeded ---------",
          errorData
        );
        throw new Error(`Oops!! looks like you crossed the content length due to long chat history \n\n Either 
          clear the history by clicking on above Delete Chat History Button or use an AI Model with higher max-token size
          by updating the AICodeCompanion extension settings`);
      }
    } else if (response.status === 412) {
      throw new Error(
        `API call failed with status code: ${response.status} and error message: ${response.statusText}
        Seems like your Access token is expired, please provide a new Access Token from your OpenAI platform like OpenAI or PSChat`
      );
    }

    throw new Error(
      `API call failed with status code: ${response.status} and error message: ${response.statusText}`
    );
  }

  try {
    const contentType = response.headers.get('Content-Type');
    data = await contentType && contentType.includes('application/json') ? response.json() : response.text();
  } catch (error) {
    console.error("Error parsing response JSON:", error);
    throw new Error("Error parsing response JSON: - not valid JSON from API");
  }

  const { responseMessage, openAIResponseMessageObj, openAIResponseObject } =
    responseParser(data, commandType, openAIMessages);

  // Extend the openAIMessages array with the response message from the API to maintain the chat history context
  if (openAIResponseMessageObj) openAIMessages.push(openAIResponseMessageObj);

  /**
   * Trim openAIMessages in case the tokens usage is about to reach to a defined limit
   * this is critical to allow a continuous chat history experience to users
   */
  const trimmedMessages = trimOpenAIMessages(openAIMessages, extensionConfig);

  openAIMessages = [...trimmedMessages];

  let responseObject = {};
  if (commandType === "continueResponse_send") {
    Object.assign(responseObject, openAIResponseObject, {
      mergedContentForContinuation: responseMessage,
    });
  } else {
    Object.assign(responseObject, openAIResponseObject);
  }

  return contentType.includes('application/json') ? responseObject : openAIResponseObject; 
}

// Function to handle the message received from the webview
function handleWebviewMessage(message) {
  const isContinuationRequest = message.command === "continueResponse_send";
  if (message.command === "send" || isContinuationRequest) {
    const userInput = message.text;

    // Show loading state in the webview
    this._view.webview.postMessage({
      command: "showLoadingState",
      isAPIInProgress: true,
      userInput:
        message.command === "continueResponse_send" ? undefined : userInput,
    });

    // Make API call
    makeAPIRequest(userInput, message.command)
      .then((apiData) => {
        // API call successful
        this._view.webview.postMessage({
          command: "updateResultSuccess",
          data: apiData,
        });
      })
      .catch((error) => {
        // API call failed
        const failedResponseObject = {
          command: "updateResultFailed",
          data: error.message,
        };
        // Remove the previous query from user as there was an error, keeping the same message multiple times was causing issue when we were sending Continue Generation request
        openAIMessages.pop();
        if (isContinuationRequest) {
          Object.assign(failedResponseObject, { isContinuationRequest });
        }

        this._view.webview.postMessage(failedResponseObject);
      });
  }
}

function setWorkspaceStateAndKey(state, key, accessTokenStorageKey) {
  workspaceState = state;
  chatHistoryKey = key;
  accessTokenKey = accessTokenStorageKey;
}

function setChatHistoryObject(chatHistoryObj) {
  chatHistoryObject = chatHistoryObj;
  openAIMessages =
    Object.keys(chatHistoryObject).length === 0 &&
      chatHistoryObject.constructor === Object
      ? [...systemMessages]
      : chatHistoryObject.openAIMessages;
  const tokenUsage =
    Object.keys(chatHistoryObject).length === 0 &&
      chatHistoryObject.constructor === Object
      ? []
      : chatHistoryObject?.tokenUsage;
  const psChatMessageID =
    Object.keys(chatHistoryObject).length === 0 &&
      chatHistoryObject.constructor === Object
      ? ""
      : chatHistoryObject?.psChatMessageID;
  setTokenUsage(tokenUsage);
  setPSChatMessageID(psChatMessageID);
}

module.exports = {
  handleWebviewMessage,
  getopenAIMessages,
  resetopenAIMessages,
  setWorkspaceStateAndKey,
  setChatHistoryObject
};
