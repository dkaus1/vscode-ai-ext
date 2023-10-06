const vscode = require("vscode");
const { encrypt, getWebviewPanel, FetchControllerManager, getLatestUserConfigurations } = require("./ssrUtils");
const { findGitChangedFiles } = require("./versionControlUtils");
const { executePrompt } = require("./inlinePromptsUtils");
const { getTestingLibraryOption, clearTestingLibraryOptions } = require("./storageUtils");
const { WEB_VIEW_API_CONTROLLER, INLINE_PROMPT_API_CONTROLLER, UNIT_TEST_KEY, E2E_TEST_KEY, TESTING_LIBRARY_STORAGE_KEY } = require("./constants");

let contextMenuPendingCommand = null;

function getContextMenuPendingCommand() {
  return contextMenuPendingCommand;
}

function resetContextMenuPendingCommand() {
  contextMenuPendingCommand = null;
}

function postMessageToWebViewPanel(message) {
  const webViewPanel = getWebviewPanel();
  if (webViewPanel) {
    webViewPanel.webview.postMessage(message);
  }
}

function createPostMessageObj(command, text, unitTests, endToEndTests) {
  let postMessageObj = { command, text };

  if (command === "writeUnitTests" && unitTests) {
    postMessageObj = { ...postMessageObj, unitTests };
  }

  if (command === "writeE2ETests" && endToEndTests) {
    postMessageObj = { ...postMessageObj, endToEndTests };
  }

  return postMessageObj;
}

function createUnitE2ETestsObject(command, workspaceState, editor) {
  let { languageId } = editor.document;
  let { testingLibraries } = getLatestUserConfigurations();
  let unitTests, endToEndTests;
  const javascriptFamily = ["typescript", "javascriptreact", "typescriptreact", "jsx", "tsx"];

  if (testingLibraries) {
    if (javascriptFamily.includes(languageId)) {
      if (!testingLibraries[languageId]) {
        languageId = "javascript";
      }
    }
    unitTests = (testingLibraries[languageId] && testingLibraries[languageId][UNIT_TEST_KEY])
      ? testingLibraries[languageId][UNIT_TEST_KEY]
      : null;

    endToEndTests = (testingLibraries[languageId] && testingLibraries[languageId][E2E_TEST_KEY])
      ? testingLibraries[languageId][E2E_TEST_KEY]
      : null;
  }

  if (command === "writeUnitTests" || command === "writeE2ETests") {
    const testType = command === "writeUnitTests" ? UNIT_TEST_KEY : E2E_TEST_KEY;

    const testingLibraryOptions = getTestingLibraryOption(workspaceState, TESTING_LIBRARY_STORAGE_KEY, languageId, testType);

    if (testingLibraryOptions && testingLibraryOptions[0]) {
      const testingOptionObj = {
        language: languageId,
        testingLibrary: testingLibraryOptions.join(","),
      };

      if (command === "writeUnitTests" && !unitTests) {
        unitTests = testingOptionObj;
      }

      if (command === "writeE2ETests" && !endToEndTests) {
        endToEndTests = testingOptionObj;
      }
    }
  }

  return { unitTests, endToEndTests };
}

function contextMenuCommandsHandler(args) {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    console.log("Inside regisCommands.js - No active editor found");
    vscode.window.showErrorMessage("No active editor found with selected code");
    return;
  }

  const selectedText = editor.document?.getText(editor.selection);
  const isEmptySelection = !selectedText || /^\s*$/.test(selectedText);

  if (isEmptySelection && args.command !== "askAICodeCompanion") {
    vscode.window.showErrorMessage("No selected code found for processing the command");
    return;
  }

  const { unitTests, endToEndTests } = createUnitE2ETestsObject(args.command, args.workspaceState, editor);

  if ((args.command === "writeUnitTests" && !unitTests) || (args.command === "writeE2ETests" && !endToEndTests)) {
    contextMenuPendingCommand = { command: "fetchTestingLibraries", text: selectedText, userCommand: args.command };
    postMessageToWebViewPanel(contextMenuPendingCommand);
  } else {
    contextMenuPendingCommand = createPostMessageObj(args.command, selectedText, unitTests, endToEndTests);
    postMessageToWebViewPanel(contextMenuPendingCommand);
  }
}


function openAICodeCompanion() {
  vscode.commands.executeCommand("aicodecompanion.chatView.focus");
}

function registerCommands(
  context,
  workspaceState,
  storageUtils,
  accessTokenKey
) {
  // Register a command to set the access key
  const setAccessKeyDisposable = vscode.commands.registerCommand(
    "aicodecompanion.setAccessKey",
    async () => {
      const accessKey = await vscode.window.showInputBox({
        prompt: "Enter your access key",
        password: true,
      });

      if (accessKey) {
        // Encrypt the access key and store it in the workspace state or extension's global state
        const encryptedAccessKey = encrypt(accessKey);

        storageUtils.saveAccessToken(
          workspaceState,
          accessTokenKey,
          encryptedAccessKey
        );
        vscode.window.showInformationMessage("Access key has been saved");
      }
    }
  );

  // Register a command to remove the access key
  const removeAccessKeyDisposable = vscode.commands.registerCommand(
    "aicodecompanion.removeAccessKey",
    () => {
      // Remove the access key from the extension's global state
      storageUtils.removeAccessToken(workspaceState, accessTokenKey);
      vscode.window.showInformationMessage("Access key has been removed");
    }
  );

  const refactorCodeDisposable = vscode.commands.registerCommand(
    "aicodecompanion.refactorCode",
    () => {
      openAICodeCompanion();
      contextMenuCommandsHandler({ command: "refactorCode", workspaceState });
    }
  );
  const documentCodeDisposable = vscode.commands.registerCommand(
    "aicodecompanion.documentCode",
    () => {
      openAICodeCompanion();
      contextMenuCommandsHandler({ command: "documentCode", workspaceState });
    }
  );
  const explainCodeDisposable = vscode.commands.registerCommand(
    "aicodecompanion.explainCode",
    () => {
      openAICodeCompanion();
      contextMenuCommandsHandler({ command: "explainCode", workspaceState });
    }
  );
  const findProblemsCodeDisposable = vscode.commands.registerCommand(
    "aicodecompanion.findProblemsCode",
    () => {
      openAICodeCompanion();
      contextMenuCommandsHandler({ command: "findProblemsCode", workspaceState });
    }
  );

  const showAICodeCompanionDisposable = vscode.commands.registerCommand(
    "aicodecompanion.openAICodeCompanion",
    () => {
      openAICodeCompanion();
      contextMenuCommandsHandler({ command: "askAICodeCompanion", workspaceState });
    }
  );

  const writeUnitTestsCodeDisposable = vscode.commands.registerCommand(
    "aicodecompanion.writeUnitTests",
    () => {
      openAICodeCompanion();
      contextMenuCommandsHandler({ command: "writeUnitTests", workspaceState });
    }
  );

  const writeE2ETestsCodeDisposable = vscode.commands.registerCommand(
    "aicodecompanion.writeE2ETests",
    () => {
      openAICodeCompanion();
      contextMenuCommandsHandler({ command: "writeE2ETests", workspaceState });
    }
  );

  const askAICodeCompanionDisposable = vscode.commands.registerCommand(
    "aicodecompanion.askAICodeCompanion",
    () => {
      openAICodeCompanion();
      vscode.commands.executeCommand("aicodecompanion.openAICodeCompanion");
    }
  );

  const openSettingsDisposable = vscode.commands.registerCommand(
    "aicodecompanion.openAICodeCompanionSettings",
    () => {
      // Open the settings UI for extension
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "aicodecompanion"
      );
    }
  );

  const deleteChatHistoryDisposable = vscode.commands.registerCommand(
    "aicodecompanion.deleteChatHistory",
    async () => {
      // Delete the chat history data from the persistent storage
      const webViewPanel = getWebviewPanel();
      if (webViewPanel) {
        const userConfirmation = await vscode.window.showInformationMessage(
          "Are you sure you want to delete Chat History because deleting complete chat history will remove the chat context too?",
          { modal: true },
          "Yes"
        );

        if (userConfirmation === "Yes") {
          webViewPanel.webview.postMessage({
            command: "clearChatHistory",
          });
          vscode.window.showInformationMessage("Chat history has been deleted");
        }
      }
    }
  );

  const executePromptCommandDisposable = vscode.commands.registerCommand(
    "aicodecompanion.executePromptCommand",
    () => {
      executePrompt();
    }
  );

  const abortPromptRequestDisposable = vscode.commands.registerCommand(
    "aicodecompanion.abortPromptRequest",
    ({ message = "Request aborted by User", controllerName } = {}) => {
      const fetchControllerManager = new FetchControllerManager();
      if (controllerName) {
        const fetchControllers = fetchControllerManager.getControllers(controllerName);
        if (fetchControllers) {
          for (let key in fetchControllers) {
            if (fetchControllers.hasOwnProperty(key)) {
              fetchControllers[key].abort(message);
            }
          }
          fetchControllerManager.removeControllers(controllerName);
        }
        return;
      }

      const webViewControllers = fetchControllerManager.getControllers(WEB_VIEW_API_CONTROLLER);
      const inlinePromptControllers = fetchControllerManager.getControllers(INLINE_PROMPT_API_CONTROLLER);

      if (webViewControllers) {
        for (let key in webViewControllers) {
          if (webViewControllers.hasOwnProperty(key)) {
            webViewControllers[key].abort(message);
          }
        }
        fetchControllerManager.removeControllers(WEB_VIEW_API_CONTROLLER);
      }
      if (inlinePromptControllers) {
        for (let key in inlinePromptControllers) {
          if (inlinePromptControllers.hasOwnProperty(key)) {
            inlinePromptControllers[key].abort(message);
          }
        }
        fetchControllerManager.removeControllers(INLINE_PROMPT_API_CONTROLLER);
      }
    }
  );

  const createGitChangesNotesDisposable = vscode.commands.registerCommand("aicodecompanion.createGitChangesNotes", () => {
    findGitChangedFiles();
  });

  const resetTestingLibrariesOptionsDisposable = vscode.commands.registerCommand("aicodecompanion.resetTestingLibrariesOptions", () => {
    clearTestingLibraryOptions(workspaceState, TESTING_LIBRARY_STORAGE_KEY);
    vscode.window.showInformationMessage("Testing libraries options has been reset");
  });

  context.subscriptions.push(
    setAccessKeyDisposable,
    removeAccessKeyDisposable,
    refactorCodeDisposable,
    documentCodeDisposable,
    explainCodeDisposable,
    findProblemsCodeDisposable,
    showAICodeCompanionDisposable,
    writeUnitTestsCodeDisposable,
    writeE2ETestsCodeDisposable,
    askAICodeCompanionDisposable,
    openSettingsDisposable,
    deleteChatHistoryDisposable,
    executePromptCommandDisposable,
    abortPromptRequestDisposable,
    createGitChangesNotesDisposable,
    resetTestingLibrariesOptionsDisposable
  );
}

module.exports = {
  registerCommands,
  getContextMenuPendingCommand,
  resetContextMenuPendingCommand,
};
