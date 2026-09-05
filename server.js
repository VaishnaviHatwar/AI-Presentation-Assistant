import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import pptxgen from "pptxgenjs";

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
For presentations, use clear Slide 1, Slide 2 headings and presentation-friendly bullets.
When the user asks you to CREATE a presentation:
- Follow the requested slide count exactly when one is provided.
- For each normal content slide, provide about 5 to 7 meaningful bullet points.
- Each bullet should contain enough explanation to be useful (roughly 8 to 18 words), not just one or two keywords.
- Keep the title slide lighter, with a title, subtitle, audience/presenter placeholder when useful.
- Add Speaker Notes for every slide; speaker notes should usually be 3 to 5 natural sentences so the presenter has enough material to speak.
- Avoid giant paragraphs on the visible slide. Put extra explanation in Speaker Notes.
- Use exactly this easy-to-parse format:
Slide 1: <title>
- <bullet>
- <bullet>
Speaker Notes: <notes>
Slide 2: <title>
- <bullet>
- <bullet>
Speaker Notes: <notes>
For speaker notes, write natural speaking points.
For analysis, be constructive and specific.
When the user asks to create a presentation, provide clear slide-by-slide content that can be turned into a PowerPoint file. Do not claim that a file has been created unless the application actually creates it.
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
        max_output_tokens: 4500
      }
    };
    if (previousInteractionId) body.previous_interaction_id = previousInteractionId;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

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



function parsePresentation(text, fallbackTitle = "AI Presentation") {
  const lines = text.replace(/\r/g, "").split("\n").map(line => line.trim()).filter(Boolean);
  const slides = [];
  let current = null;

  const startSlide = (title) => {
    current = { title: title.replace(/^[-*#\s]+/, "").trim(), bullets: [], notes: [] };
    slides.push(current);
  };

  for (const line of lines) {
    const heading = line.match(/^(?:#{1,3}\s*)?Slide\s*\d*\s*[:\-–]\s*(.+)$/i);
    if (heading) {
      startSlide(heading[1]);
      continue;
    }

    const genericHeading = line.match(/^#{1,3}\s+(.+)$/);
    if (!current && genericHeading) {
      startSlide(genericHeading[1]);
      continue;
    }

    // Ignore introductory prose before the first explicit slide heading.
    if (!current) continue;

    if (/^(?:speaker notes?|notes?)\s*:/i.test(line)) {
      current.notes.push(line.replace(/^(?:speaker notes?|notes?)\s*:\s*/i, ""));
      continue;
    }

    const bullet = line.replace(/^(?:[-*•]|\d+[.)])\s+/, "").trim();
    if (bullet && !/^---+$/.test(bullet)) current.bullets.push(bullet);
  }

  if (!slides.length) {
    startSlide(fallbackTitle);
    const fallbackLines = lines.filter(line => !/^---+$/.test(line));
    slides[0].bullets = fallbackLines.slice(0, 7);
  }

  return slides.slice(0, 12).map((slide, index) => ({
    title: slide.title || `Slide ${index + 1}`,
    bullets: slide.bullets.slice(0, 7),
    notes: slide.notes.join(" ")
  }));
}

function addTextBox(slide, text, opts) {
  slide.addText(text, {
    fontFace: "Aptos",
    margin: 0,
    breakLine: false,
    ...opts
  });
}

function createPptx(content, requestedTitle) {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "PresentationAI";
  pptx.subject = "AI-generated presentation";
  pptx.title = requestedTitle || "PresentationAI Presentation";
  pptx.company = "PresentationAI";
  pptx.lang = "en-US";
  pptx.theme = {
    headFontFace: "Aptos Display",
    bodyFontFace: "Aptos",
    lang: "en-US"
  };
  pptx.defineSlideMaster({
    title: "MASTER",
    background: { color: "F7F1E7" },
    objects: [
      { rect: { x: 0, y: 7.15, w: 13.333, h: 0.35, fill: { color: "D7C6AE" }, line: { color: "D7C6AE" } } },
      { text: { text: "PresentationAI", options: { x: 10.9, y: 7.2, w: 1.9, h: 0.15, fontFace: "Aptos", fontSize: 8, color: "6B6258", align: "right", margin: 0 } } }
    ],
    slideNumber: { x: 0.55, y: 7.2, color: "6B6258", fontSize: 8 }
  });

  const slides = parsePresentation(content, requestedTitle || "Presentation");
  slides.forEach((item, index) => {
    const slide = pptx.addSlide("MASTER");
    if (index === 0) {
      addTextBox(slide, item.title, { x: 0.75, y: 1.55, w: 11.8, h: 1.0, fontFace: "Aptos Display", fontSize: 34, bold: true, color: "2F2A25", valign: "mid" });
      if (item.bullets.length) addTextBox(slide, item.bullets.join("\n"), { x: 0.8, y: 3.0, w: 10.8, h: 2.1, fontSize: 20, color: "4D463F", breakLine: false, valign: "top", bullet: { type: "ul" }, paraSpaceAfterPt: 10 });
      addTextBox(slide, "Generated with PresentationAI", { x: 0.8, y: 5.9, w: 5.0, h: 0.35, fontSize: 12, italic: true, color: "7A7065" });
    } else {
      addTextBox(slide, item.title, { x: 0.75, y: 0.65, w: 11.6, h: 0.7, fontFace: "Aptos Display", fontSize: 28, bold: true, color: "2F2A25" });
      const bullets = item.bullets.length ? item.bullets : ["Content generated by PresentationAI."];
      addTextBox(slide, bullets.join("\n"), { x: 0.9, y: 1.65, w: 11.2, h: 4.75, fontSize: 20, color: "4D463F", valign: "top", bullet: { type: "ul" }, paraSpaceAfterPt: 12, breakLine: false });
    }
    if (item.notes) slide.addNotes(item.notes);
  });
  return pptx;
}

app.post("/api/generate-ppt", async (req, res) => {
  try {
    const { content, title } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: "No presentation content was provided." });

    const pptx = createPptx(content.trim(), title?.trim() || "PresentationAI Presentation");
    const buffer = await pptx.write({ outputType: "nodebuffer" });
    const safeName = (title?.trim() || "PresentationAI-Presentation")
      .replace(/[^a-z0-9\-_ ]/gi, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 70) || "PresentationAI-Presentation";

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}.pptx"`);
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create the PowerPoint file. Please try again." });
  }
});

app.listen(PORT, () => console.log(`PresentationAI: http://localhost:${PORT}`));