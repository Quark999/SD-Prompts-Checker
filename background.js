chrome.runtime.onInstalled.addListener(() => setupMenu());
chrome.runtime.onStartup.addListener(() => setupMenu());

function setupMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "check-png",
      title: "SD Prompts Checker",
      contexts: ["image"],
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "check-png" || info.mediaType !== "image" || !tab?.id) return;

  await injectDisplay(tab.id);

  try {
    const result = await readImageMetadata(info.srcUrl);
    await chrome.tabs.sendMessage(tab.id, { command: "show_png_prompt_result", result });
  } catch (error) {
    await chrome.tabs.sendMessage(tab.id, {
      command: "show_png_prompt_error",
      error: error?.message || String(error),
    });
  }
});

async function injectDisplay(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] });
}

async function readImageMetadata(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not fetch image: HTTP " + response.status);

  return parsePng(new Uint8Array(await response.arrayBuffer()));
}

async function parsePng(bytes) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < sig.length; i++) {
    if (bytes[i] !== sig[i]) throw new Error("Selected image is not a PNG");
  }

  let pos = 8;
  let width = null;
  let height = null;
  const chunks = [];

  while (pos + 8 <= bytes.length) {
    const len = u32(bytes, pos);
    pos += 4;
    const type = ascii(bytes.subarray(pos, pos + 4));
    pos += 4;

    if (pos + len > bytes.length) throw new Error("Broken PNG chunk: " + type);
    const data = bytes.subarray(pos, pos + len);

    if (type === "IHDR" && data.length >= 8) {
      width = u32(data, 0);
      height = u32(data, 4);
    } else if (type === "tEXt") {
      const item = parseText(data);
      if (item) chunks.push(item);
    } else if (type === "zTXt") {
      const item = await parseZtxt(data);
      if (item) chunks.push(item);
    } else if (type === "iTXt") {
      const item = await parseItxt(data);
      if (item) chunks.push(item);
    }

    pos += len + 4;
    if (type === "IEND") break;
  }

  const parameters = chunks.find((c) => c.keyword.toLowerCase() === "parameters");
  const sdLike = chunks.find((c) => /negative prompt:|steps:|sampler:|cfg scale:|seed:/i.test(c.text));
  const prompt = (parameters || sdLike || chunks[0] || { text: "" }).text;

  return { width, height, chunks, prompt };
}

function parseText(data) {
  const split = data.indexOf(0);
  if (split < 0) return null;
  return { type: "tEXt", keyword: latin1(data.subarray(0, split)), text: readText(data.subarray(split + 1)) };
}

async function parseZtxt(data) {
  const split = data.indexOf(0);
  if (split < 0 || split + 2 > data.length) return null;
  const keyword = latin1(data.subarray(0, split));
  const method = data[split + 1];
  const text = method === 0 ? await inflate(data.subarray(split + 2)) : "Unsupported PNG compression method: " + method;
  return { type: "zTXt", keyword, text };
}

async function parseItxt(data) {
  let pos = 0;
  const keywordEnd = zeroAt(data, pos);
  if (keywordEnd < 0 || keywordEnd + 2 >= data.length) return null;
  const keyword = latin1(data.subarray(0, keywordEnd));
  pos = keywordEnd + 1;
  const compressed = data[pos++] === 1;
  const method = data[pos++];
  const languageEnd = zeroAt(data, pos);
  if (languageEnd < 0) return null;
  pos = languageEnd + 1;
  const translatedEnd = zeroAt(data, pos);
  if (translatedEnd < 0) return null;
  pos = translatedEnd + 1;
  const text = compressed ? (method === 0 ? await inflate(data.subarray(pos)) : "Unsupported PNG compression method: " + method) : utf8(data.subarray(pos));
  return { type: "iTXt", keyword, text };
}

async function inflate(data) {
  if (!("DecompressionStream" in self)) return "Compressed PNG text found, but this browser cannot decompress it.";
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate"));
  const buffer = await new Response(stream).arrayBuffer();
  return readText(new Uint8Array(buffer));
}

function u32(bytes, pos) {
  return (((bytes[pos] << 24) >>> 0) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3]) >>> 0;
}

function ascii(bytes) {
  return Array.from(bytes, (b) => String.fromCharCode(b)).join("");
}

function zeroAt(bytes, start) {
  for (let i = start; i < bytes.length; i++) if (bytes[i] === 0) return i;
  return -1;
}

function latin1(bytes) {
  return new TextDecoder("latin1").decode(bytes);
}

function utf8(bytes) {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function readText(bytes) {
  const text = utf8(bytes);
  return text.includes("\uFFFD") ? latin1(bytes) : text;
}
