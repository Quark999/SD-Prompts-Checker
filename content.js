chrome.runtime.onMessage.addListener((message) => {
  if (message.command === "show_png_prompt_result") {
    showResult(message.result);
  }

  if (message.command === "show_png_prompt_error") {
    showError(message.error);
  }
});

function showResult(result) {
  clearPanel();

  const box = panel();
  add(box, "h1", "SD Prompts Checker");
  add(box, "h2", "Prompt");
  add(box, "pre", result.prompt || "No Stable Diffusion prompt metadata found.");
  add(box, "div", "Image Width: " + (result.width || "Unknown") + " px");
  add(box, "div", "Image Height: " + (result.height || "Unknown") + " px");

  if (result.chunks && result.chunks.length) {
    add(box, "h2", "PNG text chunks");
    for (const chunk of result.chunks) {
      add(box, "div", chunk.type + ": " + chunk.keyword);
    }
  }

  document.body.appendChild(box);
}

function showError(error) {
  clearPanel();

  const box = panel();
  add(box, "h1", "SD Prompts Checker");
  add(box, "pre", error || "Unknown error");
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
