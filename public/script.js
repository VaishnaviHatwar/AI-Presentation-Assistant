const chat = document.getElementById("chat-messages");
const form = document.getElementById("chat-form");
const input = document.getElementById("message");
const send = document.getElementById("send");
let previousInteractionId = null;

function addMessage(text, role) {
  document.querySelector(".welcome")?.remove();
  const row = document.createElement("div");
  row.className = `message-row ${role}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  if (role === "ai") {
    const safe = String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    bubble.innerHTML = safe
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/^###\s?(.*)$/gm, "<strong>$1</strong>")
      .replace(/^##\s?(.*)$/gm, "<strong>$1</strong>")
      .replace(/^#\s?(.*)$/gm, "<strong>$1</strong>");
  } else {
    bubble.textContent = text;
  }
  row.appendChild(bubble);
  chat.appendChild(row);
  chat.scrollTop = chat.scrollHeight;
}

function typing() {
  document.getElementById("typing-row")?.remove();
  const row = document.createElement("div");
  row.id = "typing-row";
  row.className = "message-row ai";
  row.innerHTML = '<div class="bubble typing"><i></i><i></i><i></i></div>';
  chat.appendChild(row);
  chat.scrollTop = chat.scrollHeight;
}

async function sendMessage(message) {
  addMessage(message, "user");
  typing();
  input.value = "";
  input.style.height = "auto";
  send.disabled = true;

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, previousInteractionId })
    });
    const data = await response.json();
    document.getElementById("typing-row")?.remove();

    if (!response.ok) {
      addMessage(data.error || "Something went wrong.", "ai");
      return;
    }

    previousInteractionId = data.interactionId || previousInteractionId;
    addMessage(data.text, "ai");
  } catch (error) {
    document.getElementById("typing-row")?.remove();
    addMessage("I couldn't connect to the server. Make sure npm start is running.", "ai");
  } finally {
    send.disabled = false;
    input.focus();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (message && !send.disabled) sendMessage(message);
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 150) + "px";
});

document.querySelectorAll(".examples button").forEach((button) => {
  button.addEventListener("click", () => {
    input.value = button.dataset.prompt || "";
    input.focus();
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 150) + "px";
  });
});
