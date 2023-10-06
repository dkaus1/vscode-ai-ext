const vscode = require("vscode");
const { setTestingLibraryOptions } = require("./storageUtils");
const { getWebviewPanel } = require("./ssrUtils");
const { TESTING_LIBRARY_STORAGE_KEY, UNIT_TEST_KEY, E2E_TEST_KEY } = require("./constants");

function getTestingLibraryNames(string) {
    const match = string.match(/::::(.*?)::::/);
    if (match) {
        const regex = /'([^']*)'( \([^)]*\))?/g;
        let libraries = [];
        let library;
        while ((library = regex.exec(match[1])) !== null) {
            libraries.push(library[0].trim().replace(/'/g, ""));
        }
        return libraries;
    } else {
        return [];
    }
}

function handleSelectedLibraryOptions(
    selectedLibraryOptions,
    workspaceState,
    languageId,
    command,
    userSelectedText
) {
    if (selectedLibraryOptions && selectedLibraryOptions[0]) {
        // Save the testing libraries selected by the user to workspace storage
        setTestingLibraryOptions(
            workspaceState,
            TESTING_LIBRARY_STORAGE_KEY,
            selectedLibraryOptions,
            languageId,
            (command === "writeUnitTests" ? UNIT_TEST_KEY : E2E_TEST_KEY)
        );

        const testingOptionObj = {
            language: languageId,
            testingLibrary: selectedLibraryOptions.join(","),
        };
        let postMessageObj = { command, text: userSelectedText };

        if (command === "writeUnitTests") {
            postMessageObj = { ...postMessageObj, unitTests: testingOptionObj };
        }

        if (command === "writeE2ETests") {
            postMessageObj = { ...postMessageObj, endToEndTests: testingOptionObj };
        }

        const webViewPanel = getWebviewPanel();
        if (webViewPanel) {
            webViewPanel.webview.postMessage(postMessageObj);
        }
    } else {
        const webViewPanel = getWebviewPanel();
        if (webViewPanel) {
            webViewPanel.webview.postMessage({
                command: "userMessage",
                userInput: "No testing libraries selected, hence the action was canceled",
            });
        }
    }
}

function handleAPIResponse(
    response,
    command,
    languageId,
    workspaceState,
    userSelectedText
) {

    if (response?.finish_reason === "stop") {
        const responseText = response?.message?.content;
        if (responseText) {
            const libraryNames = getTestingLibraryNames(responseText);
            if (libraryNames && libraryNames[0]) {
                vscode.window
                    .showQuickPick(libraryNames, {
                        canPickMany: true,
                        placeHolder: "Filter out the libraries you want to use",
                        ignoreFocusOut: true,
                        title: "Select testing libraries to be used for writing tests",
                    })
                    .then((selectedLibraryOptions) =>
                        handleSelectedLibraryOptions(
                            selectedLibraryOptions,
                            workspaceState,
                            languageId,
                            command,
                            userSelectedText
                        )
                    );
            } else {
                const webViewPanel = getWebviewPanel();
                if (webViewPanel) {
                    webViewPanel.webview.postMessage({
                        command: "userMessage",
                        userInput: responseText,
                    });
                }
            }
        }
    }
}

// Export the utility methods
module.exports = {
    handleAPIResponse,
};
