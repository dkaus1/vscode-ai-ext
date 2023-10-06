module.exports = {
  encryptionKey: "vscode2gpt112f9dbd8a37fe98421801",
  apiProvider: {
    OpenAI: {
      endPointUrl: "https://api.openai.com/v1/chat/completions",
    },
    PSChat: {
      endPointUrl: "https://api.psnext.info/api/chat/",
    },
    MyAPI: {
      endPointUrl: "http://localhost:5000/predictions",
    }
  },
};
