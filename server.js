import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
const app = express();
const PORT = 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const SYSTEM = `You are PresentationAI, an AI Presentation Assistant.
Help users CREATE, IMPROVE and PRACTICE presentations.
You can: create slide-by-slide content; adapt it to audience, duration and slide count; write speaker notes; analyze supplied presentation content for missing sections, repetition, excessive text and weak flow and give a score out of 100 when possible; generate likely teacher/audience questions; practice answers interactively; shorten, expand, rewrite or reorganize content.
Follow the user's natural-language instruction. Do not force a fixed workflow.
For presentations, use clear Slide 1, Slide 2 headings and concise bullets.
For speaker notes, write natural speaking points.
For analysis, be constructive and specific.
Do not claim to create an actual .pptx file.
Keep responses useful and reasonably concise.`;

function getText(data) {
  return (data.steps || [])
    .filter(s => s.type === "model_output")
    .flatMap(s => s.content || [])
    .filter(c => c.type === "text" && c.text)
    .map(c => c.text)
    .join("\n")
    .trim();
}

app.post("/api/chat", async (req, res) => {
  try {
    const { message, previousInteractionId } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: "Please enter a message." });
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY is missing. Add it to .env and restart the server." });
    }

    const body = {
      model: "gemini-3.6-flash",
      input: message.trim(),
      system_instruction: SYSTEM,
      store: true,
      generation_config: {
        thinking_level: "minimal",
        max_output_tokens: 1200
      }
    };
    if (previousInteractionId) body.previous_interaction_id = previousInteractionId;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const r = await fetch("https://generativelanguage.googleapis.com/v1/interactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timeout);

    const raw = await r.text();
    let data;
    try { data = JSON.parse(raw); } catch {
      return res.status(502).json({ error: `Gemini returned an unexpected response (${r.status}). Please try again.` });
    }
    if (!r.ok) return res.status(r.status).json({ error: data?.error?.message || "Gemini API request failed." });

    const text = getText(data);
    if (!text) return res.status(500).json({ error: "No text response was returned by Gemini." });

    res.json({ text, interactionId: data.id });
  } catch (err) {
    console.error(err);
    const message = err?.name === "AbortError"
      ? "The AI took too long to respond. Please try again."
      : "Could not connect to the AI. Check the terminal.";
    res.status(500).json({ error: message });
  }
});

app.listen(PORT, () => console.log(`PresentationAI: http://localhost:${PORT}`));