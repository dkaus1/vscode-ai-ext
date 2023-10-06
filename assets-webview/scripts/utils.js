const vscode = acquireVsCodeApi();
const { marked } = require("marked");
import { mangle } from "marked-mangle";
import { gfmHeadingId } from "marked-gfm-heading-id";
const he = require("he");

function postMessageToAICodeCompanion(message, command = "send") {
  vscode.postMessage({ command: command, text: message });
}

function updateMarkdownString(markdown) {
  const codeBlockRegex = /```/g;
  const codeBlockCount = (markdown.match(codeBlockRegex) || []).length;

  if (codeBlockCount % 2 === 1) {
    markdown += "\n```";
  }

  return markdown;
}

function getCodeblockHeader(language) {
  return `
          <div class='codeblock-header-wrapper'>
            <div class="code-header language-header">${language}</div>
            <div class="codeblock-button-wrapper">
              <button aria-label="Copy Code" title="Copy Code" class="code-header-button copy-button">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22"><path d="M16,20H8a3,3,0,0,1-3-3V7A1,1,0,0,0,3,7V17a5,5,0,0,0,5,5h8a1,1,0,0,0,0-2Zm-6-7a1,1,0,0,0,1,1h5a1,1,0,0,0,0-2H11A1,1,0,0,0,10,13ZM21,8.94a1.31,1.31,0,0,0-.06-.27l0-.09a1.07,1.07,0,0,0-.19-.28h0l-6-6h0a1.07,1.07,0,0,0-.28-.19.32.32,0,0,0-.09,0A.88.88,0,0,0,14.05,2H10A3,3,0,0,0,7,5V15a3,3,0,0,0,3,3h8a3,3,0,0,0,3-3V9S21,9,21,8.94ZM15,5.41,17.59,8H16a1,1,0,0,1-1-1ZM19,15a1,1,0,0,1-1,1H10a1,1,0,0,1-1-1V5a1,1,0,0,1,1-1h3V7a3,3,0,0,0,.18,1H11a1,1,0,0,0,0,2h8Z"/></svg>
              </button>
              <button aria-label="Create new file with code" title="Create new file with code" class="code-header-button create-file-button">
                <svg  xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22"><path d="M20,18H19V17a1,1,0,0,0-2,0v1H16a1,1,0,0,0,0,2h1v1a1,1,0,0,0,2,0V20h1a1,1,0,0,0,0-2Zm-7,2H6a1,1,0,0,1-1-1V5A1,1,0,0,1,6,4h5V7a3,3,0,0,0,3,3h3v3a1,1,0,0,0,2,0V9s0,0,0-.06a1.31,1.31,0,0,0-.06-.27l0-.09a1.07,1.07,0,0,0-.19-.28h0l-6-6h0a1.07,1.07,0,0,0-.28-.19.29.29,0,0,0-.1,0A1.1,1.1,0,0,0,12.06,2H6A3,3,0,0,0,3,5V19a3,3,0,0,0,3,3h7a1,1,0,0,0,0-2ZM13,5.41,15.59,8H14a1,1,0,0,1-1-1ZM8,8a1,1,0,0,0,0,2H9A1,1,0,0,0,9,8Zm5,8H8a1,1,0,0,0,0,2h5a1,1,0,0,0,0-2Zm1-4H8a1,1,0,0,0,0,2h6a1,1,0,0,0,0-2Z"/></svg>
              </button>
              <button aria-label="Insert code at current cursor in file" title="Insert code at current cursor in file" class="code-header-button insert-code-button">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22"><path d="M20.7639 12H10.0556M3 8.00003H5.5M4 12H5.5M4.5 16H5.5M9.96153 12.4896L9.07002 15.4486C8.73252 16.5688 8.56376 17.1289 8.70734 17.4633C8.83199 17.7537 9.08656 17.9681 9.39391 18.0415C9.74792 18.1261 10.2711 17.8645 11.3175 17.3413L19.1378 13.4311C20.059 12.9705 20.5197 12.7402 20.6675 12.4285C20.7961 12.1573 20.7961 11.8427 20.6675 11.5715C20.5197 11.2598 20.059 11.0295 19.1378 10.5689L11.3068 6.65342C10.2633 6.13168 9.74156 5.87081 9.38789 5.95502C9.0808 6.02815 8.82627 6.24198 8.70128 6.53184C8.55731 6.86569 8.72427 7.42461 9.05819 8.54246L9.96261 11.5701C10.0137 11.7411 10.0392 11.8266 10.0493 11.9137C10.0583 11.991 10.0582 12.069 10.049 12.1463C10.0387 12.2334 10.013 12.3188 9.96153 12.4896Z" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </div>
          </div>
          `;
}

function parseMarkdown(markdown) {
  const codeRegex =
    /<pre><code(?: class="language-(.*?)")?>([\s\S]*?)<\/code><\/pre>/g;

  // Added the mangle and gfmHeadingId plugins to the marked renderer to support depricated Marked library features
  marked.use(mangle(), gfmHeadingId());

  let parsedMessage = marked(markdown);

  parsedMessage = parsedMessage.replace(codeRegex, (match, language, code) => {
    code = he.decode(code); // Decode HTML entities
    if (language && Prism.languages[language]) {
      const highlightedCode = Prism.highlight(
        code,
        Prism.languages[language],
        language
      );
      const header = getCodeblockHeader(language);
      const codeBlock = `<pre class="language-${language}"><code>${highlightedCode}</code></pre>`;
      return `<div class="code-block-wrapper">${header}${codeBlock}</div>`;
    } else {
      const header = getCodeblockHeader(language || "Code");
      const highlightedCode = Prism.highlight(
        code,
        Prism.languages.clike,
        "clike"
      );
      const codeBlock = `<pre class="language-clike"><code>${highlightedCode}</code></pre>`;
      return `<div class="code-block-wrapper">${header}${codeBlock}</div>`;
    }
  });

  return parsedMessage;
}

function copyToClipboard(code) {
  const el = document.createElement("textarea");
  el.value = code;
  document.body.appendChild(el);
  el.select();
  document.execCommand("copy");
  document.body.removeChild(el);
}

function getTargetAndCode(event, buttonClass) {
  if (!event?.target) {
    console.error(`AI Code Companion : No event or event target found`);
    return null;
  }

  let target = event.target;
  while (target && !target.classList.contains(buttonClass)) {
    if (target.parentElement) {
      target = target.parentElement;
    } else {
      return null;
    }
  }

  if (target?.classList.contains(buttonClass)) {
    const preElement = target
      .closest(".code-block-wrapper")
      .querySelector('pre[class*="language-"]');
    const code = preElement.textContent;

    return { target, code };
  }

  return null;
}

function copyClickHandler(event) {
  const result = getTargetAndCode(event, "copy-button");
  if (result) {
    copyToClipboard(result.code);
  }
}

function createNewFileHandler(event) {
  const result = getTargetAndCode(event, "create-file-button");
  if (result) {
    const language = result.target
      .closest(".code-block-wrapper")
      .querySelector('.language-header').textContent;

    postMessageToAICodeCompanion({ code: result.code, language }, "createNewFileWithCodeBlock");
  }
}

function insertCodeHandler(event) {
  const result = getTargetAndCode(event, "insert-code-button");
  if (result) {
    postMessageToAICodeCompanion({ code: result.code }, "insertCodeBlock");
  }
}

function getLastScrollPosition() {
  let scrollPosition = window?.localStorage?.getItem('scrollPosition');
  if (scrollPosition) {
    try {
      scrollPosition = JSON.parse(scrollPosition);
    } catch (error) {
      console.error("Inside main.js - error while parsing the scrollPosition and scrollPosition form localStorage is - ", scrollPosition);
    }
  }

  return scrollPosition;
}

function debounce(func, wait) {
  let timeout;
  return function (...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

// Scroll position logging function
function storeScrollPoition(event) {
  var scrollPosition = {
    x: event?.target?.scrollLeft,
    y: event?.target?.scrollTop
  };
  window?.localStorage?.setItem('scrollPosition', JSON.stringify(scrollPosition));
}

var debouncedLogScrollPosition = debounce(storeScrollPoition, 300);


// Export the utility methods
export {
  updateMarkdownString,
  parseMarkdown,
  copyClickHandler,
  postMessageToAICodeCompanion,
  createNewFileHandler,
  insertCodeHandler,
  debouncedLogScrollPosition,
  getLastScrollPosition
};
