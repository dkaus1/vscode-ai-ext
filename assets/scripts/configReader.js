const fs = require("fs");
const path = require("path");
const aicodecompanionconfig = require("./aicodecompanion.config");

function readConfig(rootPath, getLatest = false) {
  // Define the path to the config file
  const configFilePath = path.join(rootPath, ".aicodecompanion.config.js");

  // Check if the config file exists
  if (fs.existsSync(configFilePath)) {
    if (getLatest) {
      // Delete the cached module, if it exists
      delete require.cache[require.resolve(configFilePath)];
    }

    // Import the config file
    const config = require(configFilePath);

    // Access the config object
    if (Object.keys(config).length > 0 && config?.apiProvider) {
      aicodecompanionconfig.apiProvider = config.apiProvider;
    }

    if (Object.keys(config).length > 0 && config?.encryptionKey) {
      aicodecompanionconfig.encryptionKey = config.encryptionKey;
    }

    if (Object.keys(config).length > 0 && config?.testingLibraries) {
      aicodecompanionconfig.testingLibraries = config.testingLibraries;
    } else {
      delete aicodecompanionconfig.testingLibraries;
    }

    return aicodecompanionconfig;
  } else {
    return aicodecompanionconfig;
  }
}

module.exports = {
  readConfig,
};
