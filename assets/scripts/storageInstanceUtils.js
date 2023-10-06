const vscode = require("vscode");

function getWorkspaceStateAndKey(context) {
  // Get the current workspace folder
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  // Create the workspace state or global state object
  const workspaceState = workspaceFolder
    ? context.workspaceState
    : context.globalState;

  // Define the chat history key
  const chatHistoryKey = workspaceFolder
    ? `${workspaceFolder.uri.toString()}.ai-code-companion-history`
    : "global.ai-code-companion-history";

  // Define the Key for storing Access Key
  const accessTokenKey = workspaceFolder
    ? `${workspaceFolder.uri.toString()}.ai-code-companion-accesstoc`
    : "global.ai-code-companion-accesstoc";

  return {
    workspaceState,
    chatHistoryKey,
    accessTokenKey,
  };
}

module.exports = {
  getWorkspaceStateAndKey,
};
