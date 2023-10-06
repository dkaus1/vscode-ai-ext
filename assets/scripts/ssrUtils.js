const crypto = require("crypto");
const vscode = require("vscode");
const fetch = require("node-fetch");
const { AbortController } = require("node-abort-controller");
const { readConfig } = require("./configReader");
const { INLINE_PROMPT_API_CONTROLLER } = require("./constants");

let webviewPanel;
let rootPath;
// Get the workspace folders
const workspaceFolders = vscode.workspace.workspaceFolders;

// Check if workspace folders are available
if (workspaceFolders && workspaceFolders.length > 0) {
  // Get the first workspace folder (assuming single-root workspace)
  rootPath = workspaceFolders[0].uri.fsPath;
} else {
  rootPath = "";
}

const AICodeCompanionUserConfig = readConfig(rootPath);
const algorithm = "aes-256-cbc";
const hexKey = AICodeCompanionUserConfig.encryptionKey;
const encryptionKey = Buffer.from(hexKey, "utf8");

function getUserConfigurations() {
  return AICodeCompanionUserConfig;
}

function getLatestUserConfigurations() {
  const latestConfig = readConfig(rootPath, true);
  return latestConfig;
}

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, encryptionKey, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  return {
    iv: iv.toString("hex"),
    encryptedText: encrypted,
  };
}

function decrypt(encryptedData) {
  const { iv, encryptedText } = encryptedData;
  const decipher = crypto.createDecipheriv(
    algorithm,
    encryptionKey,
    Buffer.from(iv, "hex")
  );

  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

function getWebviewPanel() {
  return webviewPanel;
}

function setWebviewPanel(panel) {
  webviewPanel = panel;
}

function getSelectedText() {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const selectedText = editor.document?.getText(editor.selection);
    if (selectedText) {
      return selectedText;
    }
  }

  return null;
}

async function openNewFileWithCode(code, language) {
  try {
    // Open a new untitled file with the code
    const regex = /(jsx|react|js|javascript)/gi;
    if (regex.test(language)) {
      language = "javascript";
    } else if (language.toLowerCase() === "typescript") {
      language = "typescript";
    } else {
      language = language.toLowerCase();
    }
    let doc = await vscode.workspace.openTextDocument({
      language: language,
      content: `AI Code Companion \n ${code}`,
    });

    // Show the new file in the editor
    await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
  } catch (error) {
    console.error(
      "AI Code Companion : Failed to open new file with code:",
      error
    );
  }
}

async function createNewFileWithCodeBlock(message) {
  const {
    text: { code, language },
  } = message;
  try {
    await openNewFileWithCode(code, language);
  } catch (error) {
    console.error(
      "AI Code Companion : Failed to create new file with code block:",
      error
    );
  }
}

async function insertCodeBlock(message) {
  // Check if message or message.text is undefined or null
  if (!message?.text) {
    console.error("AI Code Companion : Invalid message");
    return;
  }

  const {
    text: { code },
  } = message;
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    try {
      await editor.edit((editBuilder) => {
        editBuilder.replace(editor.selection, code);
      });
    } catch (error) {
      console.error("AI Code Companion : Failed to insert code block:", error);
    }
  }
}

/*
class LoadingStateManager {
  constructor() {
    this.intervalId = null;
    this.myStatusBarItem = null;
    this.editor = vscode.window.activeTextEditor;
    this.decorationTypes = [];
  }

  startLoading(startLine, endLine) {
    // Create a new status bar item
    this.myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.myStatusBarItem.text = `$(extension-icon) Fetching $(sync~spin)`;
    this.myStatusBarItem.tooltip = "AI Code Companion is Fetching Data";
    this.myStatusBarItem.accessibilityInformation = { label: "AI Code Companion is Fetching Data" };
    this.myStatusBarItem.show();

    // Add the loading decoration to the lines and change it every 500 ms
    if (!this.editor) {
      return; // No open text editor
    }

    let isYellow = true;
    const range = new vscode.Range(new vscode.Position(startLine, 0), new vscode.Position(endLine + 1, 0));
    this.intervalId = setInterval(() => {
      let decorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: isYellow ? 'yellow' : 'orange'
      });
      this.decorationTypes.push(decorationType);
      this.editor.setDecorations(decorationType, [range]);
      isYellow = !isYellow;
    }, 1000);
  }

  stopLoading() {
    // Hide the status bar item and clean up
    if (this.myStatusBarItem) {
      this.myStatusBarItem.hide();
      this.myStatusBarItem.dispose();
    }

    if (!this.editor) {
      return; // No open text editor
    }
    // Remove the loading decoration and stop the animation
    clearInterval(this.intervalId);
    this.decorationTypes.forEach(decorationType => {
      this.editor.setDecorations(decorationType, []);
      decorationType.dispose();
    });
    this.decorationTypes = [];
  }
} */

class LoadingStateManager {
  constructor() {
    this.intervalId = null;
    this.myStatusBarItem = null;
    this.editor = vscode.window.activeTextEditor;
    this.decorationType = vscode.window.createTextEditorDecorationType({
      after: {
        contentText: "⌛",
        margin: "0 0 0 1rem",
      },
    });
    this.newLinePos = null;
  }

  startLoading(startLine, endLine) {
    // Create a new status bar item
    this.myStatusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      50
    );
    this.myStatusBarItem.text = `$(extension-icon) Fetching $(sync~spin)`;
    this.myStatusBarItem.tooltip = "AI Code Companion is Fetching Data";
    this.myStatusBarItem.accessibilityInformation = {
      label: "AI Code Companion is Fetching Data",
    };
    this.myStatusBarItem.show();

    // Add click event listener
    this.cancelCommand = vscode.commands.registerCommand(
      "aicodecompanion.showCancelRequestMessage",
      () => {
        vscode.window
          .showInformationMessage(
            "Do you want to cancel the request?",
            "Cancel Request"
          )
          .then((selection) => {
            if (selection === "Cancel Request") {
              vscode.commands.executeCommand(
                "aicodecompanion.abortPromptRequest",
                {
                  message: "Request was aborted by User",
                  controllerName: INLINE_PROMPT_API_CONTROLLER,
                }
              );
            }
          });
      }
    );
    this.myStatusBarItem.command = "aicodecompanion.showCancelRequestMessage";
    if (!this.editor || startLine === undefined || startLine < 0) {
      return; // No open text editor
    }

    const range = new vscode.Range(
      new vscode.Position(startLine, 0),
      new vscode.Position(endLine + 1, 0)
    );
    this.newLinePos = new vscode.Position(endLine + 1, 0);
    this.editor.edit((editBuilder) => {
      editBuilder.insert(this.newLinePos, "\n");
    });
    this.editor.setDecorations(this.decorationType, [range]);
  }

  stopLoading() {
    // Hide the status bar item and clean up
    if (this.myStatusBarItem) {
      this.myStatusBarItem.hide();
      this.myStatusBarItem.dispose();
      this.myStatusBarItem = null;
    }

    // Unregister the cancel command
    if (this.cancelCommand) {
      this.cancelCommand.dispose();
      this.cancelCommand = null;
    }

    if (!this.editor) {
      return; // No open text editor
    }
    this.editor.setDecorations(this.decorationType, []);
    this.decorationType.dispose();

    if (this.newLinePos) {
      const range = new vscode.Range(
        this.newLinePos,
        this.newLinePos.translate(1, 0)
      );
      this.editor.edit((editBuilder) => {
        editBuilder.delete(range);
      });
      this.newLinePos = null;
    }
  }
}

class FetchController {
  constructor() {
    this.controller = new AbortController();
    this.signal = this.controller.signal;
    this.signal.addEventListener("abort", this.abortEventListener);
    const timeout = setTimeout(() => {
      this.controller.abort("Request timed out, please try again.");
      clearTimeout(timeout);
    }, 120000);
  }

  abortEventListener = (event) => {
    this.abortMessage = this.signal.reason;
    this.aborted = this.signal.aborted;
  };

  abort(message) {
    this.controller.abort(message);
    this.signal.removeEventListener("abort", this.abortEventListener);
  }

  async fetchData(url, options = {}) {
    try {
      const response = await fetch(url, { ...options, signal: this.signal });
      return response;
    } catch (error) {
      if (error.name === "AbortError") {
        const newError = new Error(this.abortMessage);
        newError.aborted = this.aborted;
        throw newError;
      }

      throw error;
    }
  }
}

class FetchControllerManager {
  constructor() {
    if (FetchControllerManager.instance) {
      return FetchControllerManager.instance;
    }

    this.controllers = {};
    FetchControllerManager.instance = this;
  }

  createController(id, controllerName) {
    const controller = new FetchController();
    if (!this.controllers[controllerName]) {
      this.controllers[controllerName] = {};
    }
    this.controllers[controllerName][id] = controller;
    return controller;
  }

  getController(id, controllerName) {
    return this.controllers[controllerName][id];
  }

  getControllers(controllerName) {
    return this.controllers[controllerName];
  }

  removeController(id, controllerName) {
    delete this.controllers[controllerName][id];
  }

  removeControllers(controllerName) {
    this.controllers[controllerName] = {};
  }
}

// Export the utility methods
module.exports = {
  encrypt,
  decrypt,
  getWebviewPanel,
  setWebviewPanel,
  getUserConfigurations,
  getLatestUserConfigurations,
  getSelectedText,
  createNewFileWithCodeBlock,
  insertCodeBlock,
  LoadingStateManager,
  FetchControllerManager,
};
