# Change Log

All notable changes to the "AI Code Companion" extension will be documented in this file.

### [1.4.0]

#### New Features:

- Added new context menu commands for developers to write test cases with just a single button click, ensured developers get full freedom to pick the libraries options their own rather than writing test cases with some generic library. For details refer to the features section for writing test cases.
- Provided support for Light Theme as the code blocks were not clear for few languages in light theme.
- Extended support for inline prompts using comments for other programming languages.

#### Experience Improvements:

- Fixed an issue where the multi line comment was not working if it was not having a "\*" at starting of line

### [1.3.1]

#### Updated Readme:

- Updated Readme for adding details about Youtube Video published for how to install and few use cases around how you can use the `AI Code Companion`

### [1.3.0]

#### New Features:

- Added ability to review the code for all GIT Changes, please refer to updated features section for more details

#### Experience Improvements:

- Fixed the timeout issue
- Fixed a defect where inline code comments were not adding loading state if the comment was starting with line zero in the file
- Updated the Splash screen with important inoformation
- Updated the readme with feedback from users
- Fixed a defect where Inline Comments prompts were not working when the file was huge

### [1.2.0]

#### New Features:

- Added capability to use Inline Comments (both single and multi line comments) for asking AI Provider. Use keyboard shortcut `Ctrl+Alt+Enter/Return` from any line of your comment to ask questions. For progress bar/loading state please refer above features section
- Added capability to create new files from codeblocks
- Added capability to insert the code from codeblocks to working file
- Added capability to cancel the API requests, please refer above features section for more details

#### Experience Improvements:

- Ability to maintain the chatbox scroll position, in previous version it always used to scroll at the end of messages
- Ability to add line breaks in the Prompt Inputbox to change existing message, in previous version `Shift+Enter/Return` was always forcing cursor at the end of message but user should be able to edit the message to add line breaks anywhere and cursor will remain in focus too with line breaks.
- Increased the height for Inputbox
- Fixed the Send Button alignment for smaller viewports,send button gets shifted to next lien for smaller viewpport. In previous version button was getting cropped
- Fixed few defects

## [1.1.0]

- Added support for older versions of VS Code, starting with 1.74.0.

## [1.0.0]

- Initial release of the extension
