const WEB_VIEW_API_CONTROLLER = 'webViewAPIController';
const INLINE_PROMPT_API_CONTROLLER = 'inlinePromptAPIController';
const UNIT_TEST_PROMPT = `Please provide list of unit testing libraries(Not end-to-end testing libraries) for the code and below is the requirement for the response format:
 - Please indentify the language of the code and provide the list of libraries for that language only
 - if no options available for the language for which the code is provided then please don't provide any list of libraries in asked format 
 - provide the options in the list separated by commas
 - Also please wrap this list in set of 4 colons like if the code is for Javascript then response should be:
"Here is the list of libraries that you can use to write Unit test cases: ::::'jest', 'library1', 'library2', 'etc'::::
 - sort the options in the list on the bases of popularity 
 - Also see if code needs any additional supporting testing libraries then add them in the list like with jest we might need some DOM assertion options or something else which will be required for regular use cases
 - No example code is needed in the response and keep it very short only with options list in above requested format`;

const E2E_TEST_PROMPT = `Please provide list of end-to-end testing libraries for the code and below is the requirement for the response format:
 - Please indentify the language of the code and provide the list of libraries for that language only
 - if no options available for the language for which the code is provided then please don't provide any list of libraries in asked format 
 - provide the options in the list separated by commas
 - Also please wrap this list in set of 4 colons like if the code is for Javascript then response should be:
"Here is the list of libraries that you can use to write end-to-end test cases: ::::'cypress', 'library1', 'library2', 'etc'::::
 - sort the options in the list on the bases of popularity 
 - Also see if code needs any additional supporting testing libraries then add them in the list like with cypress we might need some other libraries for regular use cases
 - No example code is needed in the response and keep it very short only with options list in above requested format`;

const TESTING_LIBRARY_STORAGE_KEY = 'testingLibraries';
const UNIT_TEST_KEY = 'unitTests';
const E2E_TEST_KEY = 'endToEndTests';
const LIGHT_THEME_NAME = "light";
const DARK_THEME_NAME = "dark";
const CONTRAST_THEME_NAME = "high-contrast";

module.exports = {
    WEB_VIEW_API_CONTROLLER,
    INLINE_PROMPT_API_CONTROLLER,
    UNIT_TEST_PROMPT,
    E2E_TEST_PROMPT,
    TESTING_LIBRARY_STORAGE_KEY,
    UNIT_TEST_KEY,
    E2E_TEST_KEY,
    LIGHT_THEME_NAME,
    DARK_THEME_NAME,
    CONTRAST_THEME_NAME
};
