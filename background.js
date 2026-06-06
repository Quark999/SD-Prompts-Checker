chrome.runtime.onInstalled.addListener(() => {
  createContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
  createContextMenu();
});

function createContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "check-png",
      title: "SD Prompts Checker",
      contexts: ["image"],
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "check-png" || info.mediaType !== "image" || !tab?.id) {
    return;
  }

  try {
    await ensureContentScript(tab.id);
    await chrome.tabs.sendMessage(tab.id, {
      command: "check_png_chunk_data",
      url: info.srcUrl,
    });
  } catch (error) {
    console.error("SD Prompts Checker failed to start:", error);
  }
});

async function ensureContentScript(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });

  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ["content.css"],
  });
}
