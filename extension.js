const vscode = require("vscode");
const service = require("./assets/scripts/service");
const storageUtils = require("./assets/scripts/storageUtils");
const {
  getWorkspaceStateAndKey,
} = require("./assets/scripts/storageInstanceUtils");
const {
  registerCommands,
  getContextMenuPendingCommand,
  resetContextMenuPendingCommand,
} = require("./assets/scripts/registerCommands");
const {
  setWorkspaceStateAndKeyForInLinePrompts,
  executeContextMenuTestCommand,
} = require("./assets/scripts/inlinePromptsService");

const {
  setWebviewPanel,
  getSelectedText,
  createNewFileWithCodeBlock,
  insertCodeBlock,
  getWebviewPanel,
} = require("./assets/scripts/ssrUtils");
const {
  getTokenUsage,
  getPSChatMessageID,
} = require("./assets/scripts/apiInterface");

const { WEB_VIEW_API_CONTROLLER, LIGHT_THEME_NAME, DARK_THEME_NAME, CONTRAST_THEME_NAME } = require("./assets/scripts/constants");
let previousApiKey;

let chatProviderInstance;

function activate(context) {
  // Get workspace state and chat history key
  const { workspaceState, chatHistoryKey, accessTokenKey } =
    getWorkspaceStateAndKey(context);

  service.setWorkspaceStateAndKey(
    workspaceState,
    chatHistoryKey,
    accessTokenKey
  );
  setWorkspaceStateAndKeyForInLinePrompts(workspaceState, accessTokenKey);

  // Listen for configuration changes
  vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration("AICodeCompanion")) {
      const extensionConfigOptions = [
        "apiKey",
        "modelName",
        "maxTokens",
        "modelMaxTokensLength",
        "temperature",
        "top_p",
      ];

      const extensionConfig =
        vscode.workspace.getConfiguration("AICodeCompanion");
      for (const option of extensionConfigOptions) {
        if (event.affectsConfiguration(`AICodeCompanion.${option}`)) {
          if (option === "apiKey") {
            const newApiKey = extensionConfig.get("apiKey");
            if (newApiKey !== previousApiKey) {
              service.resetopenAIMessages();
            }
            previousApiKey = newApiKey;
          }

          vscode.window.showInformationMessage(
            `AI Code Companion setting updated for ${option}`
          );
        }
      }
    }

    if (event.affectsConfiguration('workbench.colorTheme')) {
      const theme = vscode.workspace.getConfiguration('workbench').get('colorTheme')?.toLowerCase();
      let currentTheme;
      if (theme?.includes(LIGHT_THEME_NAME)) {
        currentTheme = LIGHT_THEME_NAME;
      } else if (theme?.includes(DARK_THEME_NAME)) {
        currentTheme = DARK_THEME_NAME;
      } else {
        currentTheme = CONTRAST_THEME_NAME;
      }
      const webViewPanel = getWebviewPanel();
      if (webViewPanel && chatProviderInstance) {
        webViewPanel.webview.html = chatProviderInstance._getHtmlForWebview(webViewPanel.webview, currentTheme);
      }
    }
  });

  // storageUtils.clearChatHistory(workspaceState, chatHistoryKey);

  service.setChatHistoryObject(
    storageUtils.loadChatHistory(workspaceState, chatHistoryKey)
  );

  const provider = new chatProvider(
    context.extensionUri,
    workspaceState,
    chatHistoryKey
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(chatProvider.viewType, provider)
  );

  // Register commands
  registerCommands(context, workspaceState, storageUtils, accessTokenKey);

  vscode.window.showInformationMessage(
    `AI Code Companion is all set to assist you!!!`
  );
}

class chatProvider {
  constructor(_extensionUri, workspaceState, chatHistoryKey) {
    this._extensionUri = _extensionUri;
    this._workspaceState = workspaceState;
    this._chatHistoryKey = chatHistoryKey;
  }
  resolveWebviewView(webviewView, context, _token) {
    chatProviderInstance = this;
    this._view = webviewView;
    setWebviewPanel(webviewView);
    webviewView.webview.options = {
      // Allow scripts in the webview
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };
    // Get the current theme
    const currentThemeKind = vscode.window.activeColorTheme.kind;
    let currentTheme;

    // Check the kind of theme
    if (currentThemeKind === vscode.ColorThemeKind.Light) {
      currentTheme = LIGHT_THEME_NAME;
    } else if (currentThemeKind === vscode.ColorThemeKind.Dark) {
      currentTheme = DARK_THEME_NAME;
    } else if (currentThemeKind === vscode.ColorThemeKind.HighContrast) {
      currentTheme = CONTRAST_THEME_NAME;
    }

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview, currentTheme);
    webviewView.webview.onDidReceiveMessage((data) => {
      this._processMessage(data);
    });
  }

  _processMessage(message) {
    if (
      message.command === "send" ||
      message.command === "continueResponse_send"
    ) {
      resetContextMenuPendingCommand();

      // Add selected code if there is any at at the end of the user provided text message
      const selectedText = getSelectedText();
      message.text =
        message.command === "continueResponse_send" ||
          selectedText === null ||
          /^\s*$/.test(selectedText)
          ? message.text
          : `${message.text} \n\n${selectedText}`;
      service.handleWebviewMessage.call(this, message);
    } else if (message.command === "updateChatHistory") {
      const messageObjFromChat = message.text;
      // Save the chat history data to the persistent storage by extending the storage with new data
      const userChatHistoryData = storageUtils.loadChatHistory(
        this._workspaceState,
        this._chatHistoryKey
      );
      const userChatDOMHistoryMessages =
        userChatHistoryData.userChatDOMHistoryMessages
          ? userChatHistoryData.userChatDOMHistoryMessages
          : [];

      userChatHistoryData.openAIMessages = service.getopenAIMessages();

      userChatHistoryData.tokenUsage = getTokenUsage();

      userChatHistoryData.psChatMessageID = getPSChatMessageID();

      userChatHistoryData.userChatDOMHistoryMessages = [
        ...userChatDOMHistoryMessages,
        ...messageObjFromChat,
      ];

      storageUtils.saveChatHistory(
        this._workspaceState,
        this._chatHistoryKey,
        userChatHistoryData
      );
    } else if (message.command === "fetchChatHistory") {
      /** This getContextMenuPendingCommand is called here to handle the case when user clicked on the context menu command and...
       * ... AICodeCompanion is not in focus, in this case, the context menu command will be executed only when AICodeCompanion is ready with history data
       * It is also important to reset it to null after calling getContextMenuPendingCommand, otherwise it can have stale data
       */
      const contextMenuPendingCommand = getContextMenuPendingCommand();
      resetContextMenuPendingCommand();

      // Post the chat history data from the persistent storage to the webview
      this._view.webview.postMessage({
        command: "renderChatHistory",
        data: storageUtils.loadChatHistory(
          this._workspaceState,
          this._chatHistoryKey
        ),
        contextMenuPendingCommand,
      });
    } else if (message.command === "resetChatHistory") {
      storageUtils.clearChatHistory(this._workspaceState, this._chatHistoryKey);
      service.resetopenAIMessages();
    } else if (message.command === "createNewFileWithCodeBlock") {
      createNewFileWithCodeBlock(message);
    } else if (message.command === "insertCodeBlock") {
      insertCodeBlock(message);
    } else if (message.command === "abortAPIRequest") {
      const messageObjFromChat = message.text;
      const controllerName = messageObjFromChat?.controllerName
        ? messageObjFromChat.controllerName
        : WEB_VIEW_API_CONTROLLER;
      vscode.commands.executeCommand("aicodecompanion.abortPromptRequest", {
        message: messageObjFromChat.message,
        controllerName: controllerName,
      });
    } else if (message.command === "executeFetchTestingLibraries") {
      resetContextMenuPendingCommand();
      executeContextMenuTestCommand(message.text);
    }
  }

  _getHtmlForWebview(webview, currentTheme = DARK_THEME_NAME) {
    // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "dist", "bundle.js")
    );
    const scriptPrismUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "assets-webview/scripts",
        "prism.js"
      )
    );
    // Do the same for the stylesheet.
    const styleResetUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "assets-webview/styles",
        "reset.css"
      )
    );
    const styleVSCodeUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "assets-webview/styles",
        "vscode.css"
      )
    );
    const styleMainUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "assets-webview/styles",
        "main.css"
      )
    );
    const stylePrismUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "assets-webview/styles",
        "prism.css"
      )
    );
    const stylePrismThemeUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "assets-webview/styles",
        (currentTheme === "dark" || currentTheme === "high-contrast") ? "PrismJS-themes-VSC-Dark-Plus.css" : "prism-one-light.css"
      )
    );
    const stylePrismOverwriteUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "assets-webview/styles",
        "prism-light-theme-overwrites.css"
      )
    );

    //User Icon SVG URI
    const iconUserUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "assets-webview",
        "icons",
        "user-icon.svg"
      )
    );
    const iconChatUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "assets-webview",
        "icons",
        "icon-chat-blue.svg"
      )
    );
    // Use a nonce to only allow a specific script to be run.
    const nonce = getNonce();
    return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">

				<!--
					Use a content security policy to only allow loading styles from our extension directory,
					and only allow scripts that have a specific nonce.
					(See the 'webview-sample' extension sample for img-src content security policy examples)
				-->
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}' 'unsafe-eval'; img-src ${webview.cspSource} 'self' https://*.vscode-cdn.net; font-src ${webview.cspSource} 'self' data: https:;">


				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style nonce="${nonce}">
            .user-icon {
                background-image: url('${iconUserUri}');
            }
            .ai-code-companion-icon {
                background-image: url('${iconChatUri}');
            }
        </style>
				<link href="${styleResetUri}" rel="stylesheet">
				<link href="${styleVSCodeUri}" rel="stylesheet">
				<link href="${styleMainUri}" rel="stylesheet">
        <link href="${stylePrismUri}" rel="stylesheet">
        <link href="${stylePrismOverwriteUri}" rel="stylesheet">
        <link href="${stylePrismThemeUri}" rel="stylesheet">

				<title>Cat Colors</title>
			</head>
			<body>
                <div id="chat-container">
                    <div id="chat-messages"></div>
                    <div id="chat-input-container">
                        <textarea id="chat-input" name="userInput" rows="3" placeholder="Type your question/message here (use shift+enter for a new line)..." required></textarea>
                        <button id="send-button">Send</button>
                        <button id="cancel-button" class="hide">Cancel</button>
                    </div>
                </div>
                
                <script nonce="${nonce}" src="${scriptPrismUri}"></script>
				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
  }
}
chatProvider.viewType = "aicodecompanion.chatView";
function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function deactivate() {
  // Clean up resources here
}

module.exports = {
  activate,
  deactivate,
};
