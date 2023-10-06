import {
  parseMarkdown,
  updateMarkdownString,
  postMessageToAICodeCompanion,
  getLastScrollPosition,
} from "./utils";

const $chatMessagesElem = document.getElementById("chat-messages");
let isResponseIncomplete = false;

function removeButtonAndHandler($buttonContainerSelector, eventListenerName) {
  const $buttonContainer = document.querySelector($buttonContainerSelector);
  if (!$buttonContainer) return;

  const $button = $buttonContainer.querySelector("button");

  if ($button) {
    $button.removeEventListener("click", eventListenerName);
  }
  if ($buttonContainer) {
    $buttonContainer.remove();
  }
}

function handleContinueButtonClick() {
  removeButtonAndHandler(".continuation-row", handleContinueButtonClick);
  postMessageToAICodeCompanion(
    "send remaining response",
    "continueResponse_send"
  );
}

function handleTooltipCloseButtonClick() {
  removeButtonAndHandler(".tooltip-container", handleTooltipCloseButtonClick);
}

function getContinuationButton() {
  const continuationButton = document.createElement("button");
  continuationButton.id = "continueResponseGeneration";
  continuationButton.textContent = "Continue Generating";
  continuationButton.addEventListener("click", handleContinueButtonClick);

  const continuationRow = document.createElement("div");
  continuationRow.classList.add("continuation-row");
  continuationRow.appendChild(continuationButton);

  return continuationRow;
}

function renderErrorMessage($container, errorMessage) {
  // Create tooltip container
  const tooltipContainer = document.createElement("div");
  tooltipContainer.classList.add("tooltip-container");

  // Create error message box
  const errorMessageBox = document.createElement("div");
  errorMessageBox.classList.add("error-message-box");

  // Split the errorMessage by \n and wrap each line in a <p> tag
  const lines = errorMessage.split('\n');
  const formattedMessage = lines.map(line => `<p>${line}</p>`).join('');

  errorMessageBox.innerHTML = formattedMessage;
  tooltipContainer.appendChild(errorMessageBox);

  // Create close button
  const closeButton = document.createElement("button");
  closeButton.classList.add("close-button");
  closeButton.textContent = "X";
  closeButton.addEventListener("click", handleTooltipCloseButtonClick);
  tooltipContainer.appendChild(closeButton);

  $container.prepend(tooltipContainer);
}

function handleError(errorDataObject) {
  const errorMessage = errorDataObject.data;
  const isContinuationRequest = errorDataObject.isContinuationRequest || false;

  // Append tooltip container to chat-message div
  const $chatInputContainer = document.getElementById("chat-input-container");
  renderErrorMessage($chatInputContainer, errorMessage);

  // Create continuation button if it's a continuation generating request error
  if (isContinuationRequest) {
    const $chatMessageContainers = document.querySelectorAll(".chat-message");
    const $lastChatMessageContainer =
      $chatMessageContainers[$chatMessageContainers.length - 1];
    $lastChatMessageContainer.appendChild(getContinuationButton());
  }

  /**
   * Dispatch updateChatHistory event with blank array so that the updated openAIMessages array can be saved in storage
   * This is take care a defect where the messages for which the API was failing were getting saved to history despite...
   * ... of cleaning last sent message in error handler in service.js file using pop method
   * This will ensure to update the chat history as the last message was added as part of appendMessage when user query was posted...
   * ... so with error it should be cleaned
   */
  postMessageToAICodeCompanion([], "updateChatHistory");
}

function appendMessage(
  message,
  isUpdateResultSuccess = false,
  isRemainingMessage = false,
  isInlinePromptResponse = false
) {
  const fragment = document.createDocumentFragment();
  let $lastChatMessageContainer;
  let chatDOMContentForHistory = [];

  // let parsedMessage = updateMarkdownString(message);

  if (!isResponseIncomplete) {
    const chatMessageContainer = document.createElement("div");
    chatMessageContainer.classList.add("chat-message-container");

    const userIcon = document.createElement("div");
    userIcon.classList.add(
      isUpdateResultSuccess ? "ai-code-companion-icon" : "user-icon"
    );
    userIcon.textContent = isUpdateResultSuccess
      ? "AI Code Companion:"
      : "You:";
    chatMessageContainer.appendChild(userIcon);

    const chatMessage = document.createElement("div");
    chatMessage.classList.add("chat-message");
    chatMessageContainer.appendChild(chatMessage);

    chatDOMContentForHistory.push({
      role: isUpdateResultSuccess ? "assistent" : "user",
      message: message,
      isRemainingMessage,
      isInlinePromptResponse,
    });

    if (isUpdateResultSuccess) {
      chatMessage.innerHTML = parseMarkdown(message);
    } else {
      const preTag = document.createElement("pre");
      preTag.classList.add("user-input");
      chatMessage.appendChild(preTag);
      chatMessage.querySelector("pre").textContent = message;
    }

    fragment.appendChild(chatMessageContainer);
  } else {
    const chatMessage = document.createElement("div");

    chatDOMContentForHistory.push({
      role: isUpdateResultSuccess ? "assistent" : "user",
      message: message,
      isRemainingMessage,
      isInlinePromptResponse,
    });

    if (isUpdateResultSuccess) {
      debugger;
      chatMessage.innerHTML = parseMarkdown(message);
    } else {
      const preTag = document.createElement("pre");
      preTag.classList.add("user-input");
      chatMessage.appendChild(preTag);
      chatMessage.querySelector("pre").textContent = message;
    }

    fragment.appendChild(chatMessage);
    const $chatMessageContainers = document.querySelectorAll(".chat-message");
    $lastChatMessageContainer =
      $chatMessageContainers[$chatMessageContainers.length - 1];
  }

  if (isRemainingMessage) {
    isResponseIncomplete = true;
    fragment.appendChild(getContinuationButton());
  } else {
    isResponseIncomplete = false;
    // Remove Continue Generating button as user has opted to with another question rather than continuing with the previous one
    removeButtonAndHandler(".continuation-row", handleContinueButtonClick);
  }

  hideSplashScreenContent();

  if ($lastChatMessageContainer) {
    $lastChatMessageContainer.innerHTML = "";
    $lastChatMessageContainer.appendChild(fragment);
  } else {
    $chatMessagesElem.appendChild(fragment);
  }

  handleScroll();

  postMessageToAICodeCompanion(chatDOMContentForHistory, "updateChatHistory");
}

function showLoadingState(disableUserInputsCallback) {
  disableUserInputsCallback(true);
  const loader = document.createElement("div");
  loader.classList.add("loader");

  const fragment = document.createDocumentFragment();

  for (let i = 0; i < 4; i++) {
    const span = document.createElement("span");
    loader.appendChild(span);
  }

  fragment.appendChild(loader);
  $chatMessagesElem.appendChild(fragment);

  handleScroll();
}

function removeLoadingState(disableUserInputsCallback) {
  const loadingState = document.querySelector(".loader");
  if (loadingState) {
    loadingState.remove();
  }
  disableUserInputsCallback(false);
}

function renderChatHistory(chatHistoryData) {
  // Create a document fragment to hold the generated DOM elements
  const fragment = document.createDocumentFragment();

  // Loop through the data array
  for (const item of chatHistoryData) {
    if (item.isRemainingMessage) {
      continue;
    }
    const isAssistent = item.role === "assistent";

    // Create the main chat message container
    const chatMessageContainer = document.createElement("div");
    chatMessageContainer.classList.add("chat-message-container");

    // Create the icon div based on the role
    const iconDiv = document.createElement("div");
    iconDiv.classList.add(isAssistent ? "ai-code-companion-icon" : "user-icon");
    iconDiv.textContent = isAssistent ? "AI Code Companion:" : "You:";
    chatMessageContainer.appendChild(iconDiv);

    // Create the chat message div
    const chatMessage = document.createElement("div");
    chatMessage.classList.add("chat-message");

    let parsedMessage = updateMarkdownString(item.message);

    if (isAssistent) {
      chatMessage.innerHTML = parseMarkdown(parsedMessage);
    } else {
      const preTag = document.createElement("pre");
      preTag.classList.add("user-input");
      chatMessage.appendChild(preTag);
      chatMessage.querySelector("pre").textContent = parsedMessage;
    }

    chatMessageContainer.appendChild(chatMessage);

    // Append the container to the document fragment
    fragment.appendChild(chatMessageContainer);
  }

  if (chatHistoryData[0]) {
    // Render the chat history generated Mark-up
    $chatMessagesElem.appendChild(fragment);
  } else {
    // Render the splash screen content
    showSplashScreenContent();
  }
  const scrollPosition = getLastScrollPosition();
  handleScroll(scrollPosition);
}

function handleScroll(scrollPosition = undefined) {
  // Scroll to the bottom of the chat-messages div
  if (scrollPosition?.y) {
    $chatMessagesElem.scrollTo(scrollPosition.x, scrollPosition.y);
  } else {
    $chatMessagesElem.scrollTop = $chatMessagesElem.scrollHeight;
  }
}

function updateChatInput($elem, message) {
  const inputValue = $elem.value;
  $elem.value = inputValue.match(/^\s*$/)
    ? message
    : `${inputValue} \n ${message}`;
}

function deleteChatHistory() {
  $chatMessagesElem.innerHTML = "";
  showSplashScreenContent();
  postMessageToAICodeCompanion([], "resetChatHistory");
}

function hideSplashScreenContent() {
  const splashContent = document.getElementById("splash-content");
  if (splashContent) {
    splashContent.remove();
  }
}

function showSplashScreenContent() {
  const splashContentHTML = `
    
    <div id="splash-content">
    <div class="loader"></div>
      <div class="splash-heading"><span class="ai-code-companion-icon"></span><h3>Welcome to AI Code Companion!</h3></div>
      <p>Below are just a few examples where I can assist, but feel free to ask me anything related to programming, and I'll do my best to assist you!</p>
      <ul class="features">
        <li>Fix code errors</li>
      
        <li>Generate code snippets</li>
        
        <li>Explain code concepts</li> 
        
        <li>Write test cases</li>

        <li>Comments based inline prompts</li>

        <li>Automated code review for GIT changes</li>
        
        <li>Provide code recommendations</li>
        
        <li>Offer programming guidance</li>
      </ul>
      <h4>Multiple ways to provide inputs:</h4>
      <ul class="steps-to-follow">
        <li>By providing your prompt in the "Type your question/message here (use shift+enter for a new line)..." Input Box</li>
        <li>By selecting the code snippet in the editor and then selecting one of the Context Menu Commands available with <code>AI Code Companion</code></li>
        <li>By providing inline single line or multi line comments in the file itself by using keyboard shortcut <code>Ctrl+Alt/Option+Enter/Return</code> from any line of your comment to ask questions</li>
        <li>By selecting the code snippet in the editor and then provide prompt in the "Type your question/message here (use shift+enter for a new line)..." Input Box</li>
      </ul>
    </div>
  `;
  $chatMessagesElem.innerHTML = splashContentHTML;
}

function handleContextMenuCommands(data) {
  const emptyRegex = /^\s*$/;
  if (data.text.match(emptyRegex)) {
    const commandTextObj = {
      refactorCode: "Refactor",
      explainCode: "Explain",
      documentCode: "Document",
      findProblemsCode: "Find Problems",
      writeUnitTests: "Write Unit Tests for the provided code",
      writeE2ETests: "Write E2E Tests for the provided code"
    };
    handleError({
      data: `Please select some code to ${commandTextObj[data.command]}`,
    });
  } else {
    const promptPreTextObj = {
      refactorCode:
        "Refactor the code for complexity, readability, duplication, performance and other best practices",
      explainCode: "Explain the code",
      documentCode: "Document the code",
      findProblemsCode: "Find problems in the code",
      writeUnitTests: "Write unit tests for the code",
      writeE2ETests: "Write E2E tests for the code"
    };

    if (data.command === "writeUnitTests" && data.unitTests) {
      if (!data?.unitTests?.promptMessage) {
        const additionalLibraries = (data?.unitTests?.additionalLibraries) ? data?.unitTests?.additionalLibraries.join(", ") : "";
        const testingLibrary = (data?.unitTests?.testingLibrary) ? data?.unitTests?.testingLibrary : "";
        promptPreTextObj[data.command] = `Write unit tests for the code using ${testingLibrary} testing library and based on the provided code if needed please utilise additional supporting libraries ${additionalLibraries ? `from ${additionalLibraries}` : ''} to provide test cases for the code`;
      } else {
        promptPreTextObj[data.command] = data?.unitTests?.promptMessage;
      }
    }

    if (data.command === "writeE2ETests" && data.endToEndTests) {
      if (!data?.endToEndTests?.promptMessage) {
        const additionalLibraries = (data?.endToEndTests?.additionalLibraries) ? data?.endToEndTests?.additionalLibraries.join(", ") : "";
        const testingLibrary = (data?.endToEndTests?.testingLibrary) ? data?.endToEndTests?.testingLibrary : "";
        promptPreTextObj[data.command] = `Write end-to-end tests for the code using ${testingLibrary} testing library and based on the provided code if needed please utilise additional supporting libraries ${additionalLibraries ? `from ${additionalLibraries}` : ''} to provide end-to-end test cases for the code`;
      } else {
        promptPreTextObj[data.command] = data?.endToEndTests?.promptMessage;
      }
    }

    const promptMessage = `${promptPreTextObj[data.command]}:`;
    postMessageToAICodeCompanion(promptMessage, "send");
  }
}

function handleFetchTestingLibraries(data) {
  postMessageToAICodeCompanion(data, "executeFetchTestingLibraries");
}

function appendMessageWithoutChatHistory(message, isUserMessage) {
  const fragment = document.createDocumentFragment();
  let chatDOMContentForHistory = [];

  const chatMessageContainer = document.createElement("div");
  chatMessageContainer.classList.add("chat-message-container");

  const userIcon = document.createElement("div");
  userIcon.classList.add(isUserMessage ? "user-icon" : "ai-code-companion-icon");
  userIcon.textContent = isUserMessage ? "You:" : "AI Code Companion:";
  chatMessageContainer.appendChild(userIcon);

  const chatMessage = document.createElement("div");
  chatMessage.classList.add("chat-message");
  chatMessageContainer.appendChild(chatMessage);

  chatDOMContentForHistory.push({
    role: isUserMessage ? "user" : "assistent",
    message: message
  });

  if (isUserMessage) {
    const preTag = document.createElement("pre");
    preTag.classList.add("user-input");
    chatMessage.appendChild(preTag);
    chatMessage.querySelector("pre").textContent = message;
  } else {
    chatMessage.innerHTML = parseMarkdown(message);
  }

  fragment.appendChild(chatMessageContainer);

  hideSplashScreenContent();

  $chatMessagesElem.appendChild(fragment);

  handleScroll();

  postMessageToAICodeCompanion(chatDOMContentForHistory, "updateChatHistory");
}

// Export the view methods
export {
  appendMessage,
  showLoadingState,
  removeLoadingState,
  renderChatHistory,
  handleError,
  updateChatInput,
  deleteChatHistory,
  showSplashScreenContent,
  handleContextMenuCommands,
  handleFetchTestingLibraries,
  appendMessageWithoutChatHistory
};
