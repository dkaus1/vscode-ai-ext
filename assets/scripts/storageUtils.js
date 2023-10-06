function saveChatHistory(workspaceState, chatHistoryKey, chatHistory) {
  const existingChatHistory = loadChatHistory(workspaceState, chatHistoryKey);
  const mergedChatHistory = { ...existingChatHistory, ...chatHistory };
  workspaceState.update(chatHistoryKey, mergedChatHistory);
}

function loadChatHistory(workspaceState, chatHistoryKey) {
  const chatHistory = workspaceState.get(chatHistoryKey);
  return chatHistory || {};
}

function clearChatHistory(workspaceState, chatHistoryKey) {
  workspaceState.update(chatHistoryKey, {});
}

function saveAccessToken(workspaceState, accessTokenKey, key) {
  workspaceState.update(accessTokenKey, key);
}

function removeAccessToken(workspaceState, accessTokenKey) {
  workspaceState.update(accessTokenKey, undefined);
}

function getAccessToken(workspaceState, accessTokenKey) {
  const accessToken = workspaceState.get(accessTokenKey);
  return accessToken || undefined;
}

function setTestingLibraryOptions(workspaceState, testingLibraryOptionsKey, testingLibraryOptions, languageId = "default", testCaseType) {
  // Retrieve the existing options object from the workspaceState
  let options = workspaceState.get(testingLibraryOptionsKey) || {};

  // Add the new testingLibraryOptions to the options object
  if (!options[languageId]) {
    options[languageId] = {};
  }
  options[languageId][testCaseType] = testingLibraryOptions;

  // Save the updated options object to the workspaceState
  workspaceState.update(testingLibraryOptionsKey, options);
}

function getTestingLibraryOption(workspaceState, testingLibraryOptionsKey, languageId = "default", testCaseType) {
  // Retrieve the options object from the workspaceState
  let options = workspaceState.get(testingLibraryOptionsKey) || {};

  // Return the testingLibraryOptions for the specified languageId and testCaseType, or undefined if no options are found
  return options[languageId]?.[testCaseType];
}

function getTestingLibraryOptions(workspaceState, testingLibraryOptionsKey) {
  // Retrieve the options object from the workspaceState
  let options = workspaceState.get(testingLibraryOptionsKey) || {};
  return options;
}

function clearTestingLibraryOptions(workspaceState, testingLibraryOptionsKey) {
  workspaceState.update(testingLibraryOptionsKey, {});
}

module.exports = {
  saveChatHistory,
  loadChatHistory,
  clearChatHistory,
  saveAccessToken,
  removeAccessToken,
  getAccessToken,
  setTestingLibraryOptions,
  getTestingLibraryOption,
  getTestingLibraryOptions,
  clearTestingLibraryOptions
};
