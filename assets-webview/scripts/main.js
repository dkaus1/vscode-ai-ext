import {
  appendMessage,
  showLoadingState,
  removeLoadingState,
  handleError,
  renderChatHistory,
  updateChatInput,
  deleteChatHistory,
  showSplashScreenContent,
  handleContextMenuCommands,
  handleFetchTestingLibraries,
  appendMessageWithoutChatHistory
} from "./view-utils.js";
import {
  copyClickHandler,
  postMessageToAICodeCompanion,
  createNewFileHandler,
  insertCodeHandler,
  debouncedLogScrollPosition
} from "./utils.js";

const $chatInputElem = document.getElementById("chat-input");
const $sendButtonElem = document.getElementById("send-button");
const $cancelButtonElem = document.getElementById("cancel-button");
const $chatMessagesElem = document.getElementById("chat-messages");
/**
 * This variable is critical to avoid context Menu command doesn't execute two times when user...
 * cliks on the context menu command and AICodeCompanion is not in focus
 */
let hasPendingCommandExecuted = false;
let disableUserInput = false;
let fetchTestingLibrariesAPIController = null;

function disableUserInputs(isLoading) {
  if (isLoading) {
    disableUserInput = true;
    $sendButtonElem.disabled = true;
    $sendButtonElem.classList.add("hide");
    $cancelButtonElem.classList.remove("hide");
    $sendButtonElem.innerHTML = "Busy...";
  } else {
    disableUserInput = false;
    $sendButtonElem.disabled = false;
    $sendButtonElem.classList.remove("hide");
    $cancelButtonElem.classList.add("hide");
    $sendButtonElem.innerHTML = "Send";
  }
}

function handlePendingCommand(pendingCommand) {
  if (pendingCommand && !hasPendingCommandExecuted) {
    if (pendingCommand.command === "fetchTestingLibraries") {
      handleFetchTestingLibraries(pendingCommand);
    } else {
      if (pendingCommand.command !== "askAICodeCompanion") {
        handleContextMenuCommands(pendingCommand);
      } else if (pendingCommand.command === "askAICodeCompanion") {
        updateChatInput($chatInputElem, pendingCommand.text);
      }
    }
    hasPendingCommandExecuted = true;
  }
}

function inputKeyDownHandler(event) {
  if (event.key === "Enter" && event.shiftKey) {
    event.preventDefault();
    // Get the current cursor position
    const cursorPosition = $chatInputElem.selectionStart;
    // Insert a newline character at the cursor position
    $chatInputElem.value =
      $chatInputElem.value.substring(0, cursorPosition) +
      "\n" +
      $chatInputElem.value.substring(cursorPosition);
    // Move the cursor to right after the inserted newline character
    $chatInputElem.selectionStart = $chatInputElem.selectionEnd =
      cursorPosition + 1;
    // Scroll the text area to the cursor position
    $chatInputElem.scrollTop = $chatInputElem.scrollHeight;
  } else if (!disableUserInput && event.key === "Enter") {
    event.preventDefault();

    const inputValue = $chatInputElem.value.trim();

    if (!inputValue.match(/^\s*$/)) {
      postMessageToAICodeCompanion(inputValue);
      $chatInputElem.value = "";
    }
  }
}

function sendButtonClickHandler() {
  const inputValue = $chatInputElem.value;
  if (!inputValue.match(/^\s*$/)) {
    postMessageToAICodeCompanion(inputValue);
    $chatInputElem.value = "";
  }
}

function cancelButtonClickHandler() {
  let messageObj = { message: "Request was aborted by User" };
  if (fetchTestingLibrariesAPIController) {
    messageObj = { ...messageObj, controllerName: fetchTestingLibrariesAPIController };
    fetchTestingLibrariesAPIController = null;
  }
  postMessageToAICodeCompanion(
    messageObj,
    "abortAPIRequest"
  );
}

$chatInputElem.addEventListener("keydown", inputKeyDownHandler);

$sendButtonElem.addEventListener("click", sendButtonClickHandler);

$cancelButtonElem.addEventListener("click", cancelButtonClickHandler);

window.addEventListener("message", (event) => {
  
  const data = event.data;
  console.log('m here in message addEventListener >>>>>>>>>>>', data.command)
  switch (data.command) {
    case "userMessage":
      if (data.userInput !== undefined) {
        appendMessageWithoutChatHistory(data.userInput, (data?.isUserMessage) ? data.isUserMessage : false);
      }
      if (data?.isAPIInProgress) {
        fetchTestingLibrariesAPIController = (data?.APIControllerName) ? data.APIControllerName : null;
        showLoadingState(disableUserInputs);
      }
      break;
    case "showLoadingState":
      if (data.isAPIInProgress) {
        if (data.userInput !== undefined) {
          appendMessage(data.userInput);
        }
        showLoadingState(disableUserInputs);
      }
      break;
    case "removeLoadingState":
      if (!data?.isAPIInProgress) {
        removeLoadingState(disableUserInputs);
      }
      break;
    case "updateResultSuccess":
      // Remove the loading state
      removeLoadingState(disableUserInputs);
      // Append the API response to the chat
      const responseObject = data.data;
      const finish_reason = responseObject.finish_reason;
      const isRemainingMessage =
        finish_reason === "incomplete" || finish_reason === "length"
          ? true
          : false;
      const responseMessage = responseObject.mergedContentForContinuation
        ? responseObject.mergedContentForContinuation.trim()
        : responseObject.message.content.trim();

      appendMessage(responseMessage, true, isRemainingMessage, false);
      break;
    case "renderChatHistory":
      const chatHistoryData = data.data;
      if (chatHistoryData?.userChatDOMHistoryMessages) {
        renderChatHistory(chatHistoryData.userChatDOMHistoryMessages);
      } else {
        showSplashScreenContent();
      }

      /**
       * This handlePendingCommand is called here to handle the case when user clicked on the context menu command and...
       * ... AICodeCompanion is not in focus, in this case, the context menu command will be executed only when AICodeCompanion is ready with history data
       * If if we don't call this here, then the handleContextMenuCommands doesn't work as the AICodeCompanion elements are not present
       */
      handlePendingCommand(data.contextMenuPendingCommand);
      break;
    case "updateResultFailed":
      removeLoadingState(disableUserInputs);
      handleError(data);
      break;
    case "refactorCode":
    case "explainCode":
    case "documentCode":
    case "findProblemsCode":
    case "writeUnitTests":
    case "writeE2ETests":
      if (document.querySelector("#chat-messages")) {
        handleContextMenuCommands(data);
        hasPendingCommandExecuted = true;
      }
      break;
    case "askAICodeCompanion":
      if ($chatInputElem && !data.text.match(/^\s*$/)) {
        updateChatInput($chatInputElem, data.text);
        hasPendingCommandExecuted = true;
      }
      break;
    case "clearChatHistory":
      deleteChatHistory();
      break;
    case "updateInlinePromptResultSuccess":
      // Append the API response to the chat
      const response = data.data;
      const message = response.message.content.trim();
      appendMessage(message, true, false, true);
      break;
    case "fetchTestingLibraries":
      if (document.querySelector("#chat-messages")) {
        handleFetchTestingLibraries(data);
        hasPendingCommandExecuted = true;
      }
      break;
    default:
      break;
  }
});

function handleDOMReady() {
  postMessageToAICodeCompanion("", "fetchChatHistory");

  if ($chatMessagesElem) {
    $chatMessagesElem.addEventListener('scroll', debouncedLogScrollPosition);
  }

  document.addEventListener("click", copyClickHandler);
  document.addEventListener("click", createNewFileHandler);
  document.addEventListener("click", insertCodeHandler);
}

function handleWindowUnload() {
  document.removeEventListener("click", copyClickHandler);
  document.removeEventListener("click", createNewFileHandler);
  document.removeEventListener("click", insertCodeHandler);
  $chatInputElem.removeEventListener("keydown", inputKeyDownHandler);
  $sendButtonElem.removeEventListener("click", sendButtonClickHandler);
  $cancelButtonElem.removeEventListener("click", cancelButtonClickHandler);
}

document.addEventListener("DOMContentLoaded", handleDOMReady);
window.addEventListener("unload", handleWindowUnload);
