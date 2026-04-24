chrome.runtime.onMessage.addListener((message) => {
  if (message.command === "check_png_chunk_data") {
    readPngPrompt(message.url);
  }
});

async function readPngPrompt(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Image request failed: " + response.status);

    const bytes = new Uint8Array(await response.arrayBuffer());
    const result = await parsePng(bytes);
    showResult(result);
  } catch (err) {
    showError(err);
  }
}

async function parsePng(bytes) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < signature.length; i++) {
    if (bytes[i] !== signature[i]) throw new Error("Selected image is not a PNG");
  }

  let offset = 8;
  let width = null;
  let height = null;
  const chunks = [];

  while (offset + 8 <= bytes.length) {
    const length = u32(bytes, offset);
    offset += 4;

    const type = ascii(bytes.subarray(offset, offset + 4));
    offset += 4;

    const data = bytes.subarray(offset, offset + length);

    if (type === "IHDR" && data.length >= 8) {
      width = u32(data, 0);
      height = u32(data, 4);
    } else if (type === "tEXt") {
      const item = parseText(data);
      if (item) chunks.push(item);
    } else if (type === "zTXt") {
      const item = await parseCompressedText(data);
      if (item) chunks.push(item);
    } else if (type === "iTXt") {
      const item = await parseInternationalText(data);
      if (item) chunks.push(item);
    }

    offset += length + 4;
    if (type === "IEND") break;
  }

  const parameters = chunks.find((c) => c.keyword.toLowerCase() === "parameters");
  const detected = chunks.find((c) => /negative prompt:|steps:|sampler:|cfg scale:|seed:/i.test(c.text));
  const prompt = (parameters || detected || chunks[0] || { text: "" }).text;

  return { width, height, chunks, prompt };
}

function parseText(data) {
  const split = data.indexOf(0);
  if (split < 0) return null;
  return {
    type: "tEXt",
    keyword: latin1(data.subarray(0, split)),
    text: readableText(data.subarray(split + 1))
  };
}

async function parseCompressedText(data) {
  const split = data.indexOf(0);
  if (split < 0 || split + 2 > data.length) return null;

  const keyword = latin1(data.subarray(0, split));
  const method = data[split + 1];
  if (method !== 0) return { type: "zTXt", keyword, text: "Unsupported PNG compression method: " + method };

  return {
    type: "zTXt",
    keyword,
    text: await inflate(data.subarray(split + 2))
  };
}

async function parseInternationalText(data) {
  let pos = 0;
  const keywordEnd = nextZero(data, pos);
  if (keywordEnd < 0 || keywordEnd + 2 >= data.length) return null;

  const keyword = latin1(data.subarray(0, keywordEnd));
  pos = keywordEnd + 1;
  const compressed = data[pos++] === 1;
  const method = data[pos++];

  const languageEnd = nextZero(data, pos);
  if (languageEnd < 0) return null;
  pos = languageEnd + 1;

  const translatedEnd = nextZero(data, pos);
  if (translatedEnd < 0) return null;
  pos = translatedEnd + 1;

  let text;
  if (compressed) {
    text = method === 0 ? await inflate(data.subarray(pos)) : "Unsupported PNG compression method: " + method;
  } else {
    text = utf8(data.subarray(pos));
  }

  return { type: "iTXt", keyword, text };
}

async function inflate(data) {
  if (!("DecompressionStream" in window)) {
    return "Compressed PNG text found, but this browser cannot decompress it.";
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate"));
  const buffer = await new Response(stream).arrayBuffer();
  return readableText(new Uint8Array(buffer));
}

function u32(bytes, offset) {
  return (((bytes[offset] << 24) >>> 0) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function ascii(bytes) {
  let out = "";
  for (const b of bytes) out += String.fromCharCode(b);
  return out;
}

function nextZero(bytes, start) {
  for (let i = start; i < bytes.length; i++) if (bytes[i] === 0) return i;
  return -1;
}

function latin1(bytes) {
  return new TextDecoder("latin1").decode(bytes);
}

function utf8(bytes) {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function readableText(bytes) {
  const text = utf8(bytes);
  return text.includes("\uFFFD") ? latin1(bytes) : text;
}

function showResult(result) {
  clearPanel();
  const box = panel();
  add(box, "h1", "SD Prompts Checker");
  add(box, "h2", "Prompt");
  add(box, "pre", result.prompt || "No Stable Diffusion prompt metadata found.");
  add(box, "div", "Image Width: " + (result.width || "Unknown") + " px");
  add(box, "div", "Image Height: " + (result.height || "Unknown") + " px");
  if (result.chunks.length) {
    add(box, "h2", "PNG text chunks");
    for (const chunk of result.chunks) add(box, "div", chunk.type + ": " + chunk.keyword);
  }
  document.body.appendChild(box);
}

function showError(err) {
  clearPanel();
  const box = panel();
  add(box, "h1", "SD Prompts Checker");
  add(box, "pre", err && err.message ? err.message : String(err));
  document.body.appendChild(box);
}

function panel() {
  const box = document.createElement("div");
  box.id = "container-stablediffusion";
  return box;
}

function add(parent, tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  parent.appendChild(node);
}

function clearPanel() {
  const existing = document.getElementById("container-stablediffusion");
  if (existing) existing.remove();
}
