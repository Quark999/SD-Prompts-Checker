chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "check-png",
    title: "SD Prompts Checker",
    contexts: ["image"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "check-png" || info.mediaType !== "image" || !tab?.id) {
    return;
  }

  chrome.tabs.sendMessage(tab.id, {
    command: "check_png_chunk_data",
    url: info.srcUrl,
  });
});
