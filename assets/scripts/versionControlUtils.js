const vscode = require("vscode");
const fs = require('fs').promises;
const path = require("path");
const { exec } = require("child_process");
const { handleInlinePromptMessage } = require("./inlinePromptsService");

async function readFileData(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return data;
    } catch (err) {
        console.error('Error reading file:', err);
        throw err;
    }
}

function executeShellCommand(command, cwd) {
    return new Promise((resolve, reject) => {
        exec(command, { cwd }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(error.message));
            } else {
                resolve(stdout.trim());
            }
        });
    });
}

async function getChangedFiles(rootPath, gitRoot) {
    const gitDiffOutput = await executeShellCommand(
        "git diff --name-status --diff-filter=ACDMRTUXB",
        rootPath
    );

    if (!gitDiffOutput) {
        return [];
    }

    const changedFiles = (gitDiffOutput.match(/^(.)(.*)$/gm) || []).map((line) => {
        if (!line) {
            return;
        }
        const [, status, filePath] = line.match(/^(.)(.*)$/);
        return {
            status,
            filePath: path.join(gitRoot, filePath.trim()),
        };
    });
    return changedFiles;
}

async function getUntrackedFiles(rootPath, gitRoot) {
    const gitStatusOutput = await executeShellCommand(
        "git status --porcelain",
        rootPath
    );

    if (!gitStatusOutput) {
        return [];
    }

    const untrackedFiles = (gitStatusOutput.match(/^\?\?(.*)$/gm) || []).map(
        (line) => {
            if (!line) {
                return;
            }
            const [, filePath] = line.match(/^\?\?(.*)$/);
            return {
                status: "??",
                filePath: path.join(gitRoot, filePath.trim()),
            };
        }
    );
    return untrackedFiles;
}


async function getGitDiff(filePath, rootPath) {
    const gitDiffOutput = await executeShellCommand(
        `git diff --unified=10 ${filePath}`,
        rootPath
    );
    return gitDiffOutput;
}

function fetchGitChangesNotes(gitDiffFilesWithChanges) {
    const promptDescription = `Please review the following changes in the respective 
    file and provide your code review comments with respect to any regression, functional,
    performance, security, accessibility and maintainability or other quality best practices.
    The review comments can be summerized in the form of bullet points. Please provide your comments
    for each file separately for easy review and review comments should start with file name prepended
    by string 'Review Comments for ' where file name should always be wrapped with backticks to highlight them as inline code`;

    //const prompt = `${promptDescription}:\n\n${gitDiffFilesWithChanges[1].gitDiff}`;
    handleInlinePromptMessage({ command: "send", userInput: promptDescription }, {}, gitDiffFilesWithChanges);
}


async function findGitChangedFiles() {
    let rootPath;
    // Get the workspace folders
    const workspaceFolders = vscode.workspace.workspaceFolders;

    // Check if workspace folders are available
    if (workspaceFolders && workspaceFolders.length > 0) {
        rootPath = workspaceFolders[0].uri.fsPath;
    } else {
        rootPath = "";
    }

    if (!rootPath) {
        vscode.window.showErrorMessage(
            "No workspace folder found to create Notes for Git Changes"
        );
        throw new Error(
            "No workspace folder found to create Notes for Git Changes"
        );
    }

    try {
        const gitRoot = await executeShellCommand(
            "git rev-parse --show-toplevel",
            rootPath
        );

        const changedFiles = await getChangedFiles(rootPath, gitRoot);
        const untrackedFiles = await getUntrackedFiles(rootPath, gitRoot);

        const allFiles = [...changedFiles, ...untrackedFiles];

        if (!allFiles || allFiles.length === 0) {
            vscode.window.showInformationMessage(
                "No changes found in the GIT repository"
            );
            return;
        }

        let gitDiffFilesWithChanges = [];
        let gitDiff;
        for (const file of allFiles) {
            gitDiff = "";

            if (file.status === "??") {
                try {
                    gitDiff = await readFileData(file.filePath);
                    const fileName = path.basename(file.filePath);
                    gitDiff = `New file with name "${fileName}" in added in GIT \n\n ${gitDiff}`
                } catch (error) {
                    console.error("Inside versionControlUtils.js - Error while reading the newly added file in GIT is --- ", error);
                }
            } else if (file.status === "M") {
                gitDiff = await getGitDiff(file.filePath, rootPath);
            }

            gitDiffFilesWithChanges.push({
                filePath: file.filePath,
                status: file.status,
                gitDiff: gitDiff,
            });
        }

        fetchGitChangesNotes([...gitDiffFilesWithChanges]);
    } catch (error) {
        if (error.message.toLowerCase().includes('not a git repository'.toLowerCase())) {
            vscode.window.showErrorMessage(
                'Either GIT is not found or GIT Repository is not initialized in the current workspace'
            );
        } else {
            vscode.window.showErrorMessage(
                `Failed to get changed files: ${error.message}`
            );
        }
    }
}

// Export the utility methods
module.exports = {
    findGitChangedFiles,
};
