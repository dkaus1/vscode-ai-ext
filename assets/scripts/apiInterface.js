const vscode = require("vscode");

let PSChatMessageID = "";
let continuationCommandType_Count = 0;
let tokenUsage = [];

function setTokenUsage(tokenUsageArr) {
  if (tokenUsageArr) tokenUsage = [...tokenUsageArr];
}

function getTokenUsage() {
  return tokenUsage;
}

function getPSChatMessageID() {
  return PSChatMessageID;
}

function setPSChatMessageID(messageID) {
  PSChatMessageID = messageID;
}

function resetContinuationCommandType_Count() {
  continuationCommandType_Count = 0;
}

function trimOpenAIMessages(messages, extensionConfig) {
  if (tokenUsage.length > 0) {
    let messagesArr = [...messages];
    const maxTokensAllowed = extensionConfig.modelMaxTokensLength;
    const bufferTokensCount =
      extensionConfig.maxTokens <= 1000
        ? extensionConfig.maxTokens + 1000 - extensionConfig.maxTokens
        : extensionConfig.maxTokens;

    const tokenUsageLength = tokenUsage.length;
    const currentTokensUsageCount =
      tokenUsage[tokenUsageLength - 1].total_tokens;
    const tokenSizeToBeRemoved =
      extensionConfig.maxTokens > 500
        ? extensionConfig.maxTokens * 2.5
        : extensionConfig.maxTokens * 4;

    let hasMessagesGotDeleted = false;

    if (
      tokenUsageLength > 1 &&
      currentTokensUsageCount + bufferTokensCount > maxTokensAllowed
    ) {
      let deletedTokensCount = 0;
      for (let i = 0; i < tokenUsageLength; i++) {
        deletedTokensCount += tokenUsage[i + 1]
          ? tokenUsage[i + 1].total_tokens - tokenUsage[i].total_tokens
          : 0;
        if (deletedTokensCount < tokenSizeToBeRemoved) {
          messagesArr.splice(2, 2);
          hasMessagesGotDeleted = true;
        } else {
          break;
        }
      }
    }
    if (hasMessagesGotDeleted) {
      tokenUsage = [];
    }

    return messagesArr;
  }

  return messages;
}

function getOpenAIRequestPayload(
  messages,
  Authorization_Token,
  systemMessages,
  isInlinePrompt = false,
) {
  const extensionConfig = vscode.workspace.getConfiguration("AICodeCompanion");
  const { apiKey, modelName, maxTokens, temperature, top_p } = extensionConfig;

  let payload = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey === 'OpenAI' || apiKey === 'PSChat') && {Authorization: `Bearer ${Authorization_Token}`},
    },
  };

  switch (apiKey) {
    case "OpenAI":
      let bodyObject = {
        model: modelName,
        messages: messages,
        temperature: temperature,
        max_tokens: maxTokens,
        top_p: top_p,
      };
      if (isInlinePrompt) {
        delete bodyObject.max_tokens;
      }
      payload.body = JSON.stringify(bodyObject);
      break;
    case "PSChat":
      let PSChatMessageIDFinal = PSChatMessageID;
      let parameters = {
        temperature: temperature,
        max_tokens: maxTokens,
        top_p: top_p,
      };

      if (isInlinePrompt) {
        PSChatMessageIDFinal = "";
        delete parameters.max_tokens;
      }

      payload.body = JSON.stringify({
        message: messages[messages.length - 1]?.content,
        id: PSChatMessageIDFinal,
        options: {
          assistant: `${systemMessages[0].content} \n\n ${systemMessages[1].content}`,
          model: modelName,
          parameters: parameters,
          source: "aicodecompanion",
          stopautocontinue: 1,
        },
      });
      break;
    default:
      payload.body =  JSON.stringify({
        "question": messages[messages.length - 1]?.content,
			  "system_prompt": "You are a helpful AI code assistant. Please provide code snippet"
        })
      
      break;
  }

  return {
    payLoad: payload,
  };
}

function handleOpenAIErrors(data) {
  if (!data.choices) {
    console.error("apiInterface.js Inside !response.ok ---------", data);
    throw new Error(
      `Failed to fetch API and no Choices returned.\n\n ${data.error.message}`
    );
  }

  if (
    data?.choices?.[0]?.message?.content
      ?.toLowerCase()
      .includes("internal server error")
  ) {
    console.error(
      "apiInterface.js Inside Internal Server Error ---------",
      data.choices[0].message
    );
    throw new Error("Internal Server Error from API");
  }
}

function handlePSChatErrors(data) {
  if (data?.error?.code === "context_length_exceeded") {
    console.error(
      "apiInterface.js Inside context_length_exceeded ---------",
      data
    );
    throw new Error(`Oops!! looks like you crossed the content length due to long chat history \n\n Either 
        clear the history by clicking on above Delete Chat History Button or use an AI Model with higher max-token size
        by updating the AI Code Companion extension settings`);
  }

  if (data.messages.length === 0) {
    console.error("apiInterface.js Inside !response.ok ---------", data);
    throw new Error("Failed to fetch API and no Choices returned.");
  }

  if (
    data?.messages?.[data.messages.length - 1]?.content
      .toLowerCase()
      .includes("internal server error")
  ) {
    console.error(
      "apiInterface.js Inside Internal Server Error ---------",
      data.choices[0].message
    );
    throw new Error("Internal Server Error from API");
  }

  if (
    data?.messages?.[
      data.messages.length - 1
    ]?.options?.finish_reason.toLowerCase() === "error"
  ) {
    console.error(
      "apiInterface.js Inside Error block when finish_reason has value as 'error' and the message object is ---------",
      data?.messages?.[data.messages.length - 1]
    );
    throw new Error(
      `Error from PSChat API and the error message is \n\n ${data?.messages?.[data.messages.length - 1]?.content
      }`
    );
  }
}

function handleContinuationResponse(commandType, openAIMessages) {
  let responseMessage = "";

  if (commandType === "continueResponse_send") {
    continuationCommandType_Count++;
  } else {
    continuationCommandType_Count = 0;
  }

  if (continuationCommandType_Count > 0) {
    let messagesToBePulled = continuationCommandType_Count;
    for (let i = openAIMessages.length - 1; i >= 0; i--) {
      if (
        openAIMessages[i].role === "assistant" &&
        openAIMessages[i].content !== ""
      ) {
        responseMessage = openAIMessages[i].content + responseMessage;
        messagesToBePulled--;
      }
      if (messagesToBePulled === 0) {
        break;
      }
    }
  }
  return responseMessage;
}

function responseParser(data, commandType, openAIMessages, isInlinePrompt = false) {
  const extensionConfig = vscode.workspace.getConfiguration("AICodeCompanion");
  const { apiKey } = extensionConfig;
  let responseMessage = "";
  let openAIResponseMessageObj;
  let openAIResponseObject;
  let currentTokensUsage;

  switch (apiKey) {
    case "OpenAI":
      handleOpenAIErrors(data);

      if (!isInlinePrompt) {
        responseMessage = handleContinuationResponse(commandType, openAIMessages);
      }

      responseMessage += data.choices[0].message.content;

      // Response from API to be added to the openAIMessages array for maintaining historical context
      openAIResponseMessageObj = data.choices[0].message;
      openAIResponseObject = data.choices[0];
      currentTokensUsage = data?.usage;

      break;
    case "PSChat":
      const dataObject = Object.assign({}, data?.data, {
        message: data?.message,
      });

      handlePSChatErrors(dataObject);

      // Update the PSChatMessageID for the next API call
      if (!isInlinePrompt) {
        setPSChatMessageID(dataObject.id);
        responseMessage = handleContinuationResponse(commandType, openAIMessages);
      }

      const messages = dataObject.messages;
      openAIResponseObject = messages[messages.length - 1];

      responseMessage += openAIResponseObject.content;

      // Response from API to be added to the openAIMessages array for maintaining historical context
      openAIResponseMessageObj = {
        role: openAIResponseObject.role,
        content: openAIResponseObject.content,
      };

      /**
       * Create the openAIResponseObject to have the same structure as the OpenAI API response object...
       * ... so that finish_reason can be used in the same way as in case of OpenAI API response in main.js file
       * This is required because the finish_reason key is available in the options object available in the...
       * ... last message object in case of PSChat API response
       */
      openAIResponseObject = Object.assign(
        {},
        { message: openAIResponseMessageObj },
        { ...openAIResponseObject.options }
      );

      break;
    default:
      openAIResponseMessageObj = {
        role: 'assistant',
        content: data,
      }
      responseMessage +=  data;
      openAIResponseObject = {
        message : {
          role: 'assistant',
          content: data,
          }
        }
      break;
  }

  if (currentTokensUsage && !isInlinePrompt) tokenUsage.push(currentTokensUsage);

  return { responseMessage, openAIResponseMessageObj, openAIResponseObject };
}

module.exports = {
  setTokenUsage,
  getTokenUsage,
  getPSChatMessageID,
  setPSChatMessageID,
  resetContinuationCommandType_Count,
  trimOpenAIMessages,
  getOpenAIRequestPayload,
  responseParser,
};
