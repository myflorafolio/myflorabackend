import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();

// 🔥 IMPORTANT: allow large images
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ✅ Health check
app.get("/", (_req, res) => {
  res.send("My Flora Folio backend is live 🌿");
});

// ✅ TEXT AI
app.post("/ask", async (req, res) => {
  try {
    const { message } = req.body;

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: message,
    });

    const reply =
      response.output_text ||
      response.output?.[0]?.content?.[0]?.text ||
      "No reply";

    res.json({ reply });
  } catch (error) {
    console.error("ASK ERROR:", error);
    res.status(500).json({ error: "Ask failed" });
  }
});

// ✅ PLANT IDENTIFICATION
app.post("/identify", async (req, res) => {
  try {
    console.log("IDENTIFY BODY KEYS:", Object.keys(req.body || {}));

    // 🔥 accept multiple possible field names from app
    const imageBase64 =
      req.body.imageBase64 ||
      req.body.image ||
      req.body.base64 ||
      req.body.photo ||
      req.body.imageData;

    const prompt =
      req.body.prompt ||
      "Identify this plant from the image. Start with the plant name, then give a short care summary.";

    if (!imageBase64) {
      console.log("❌ No image found in request");
      return res.status(400).json({ error: "Missing image data" });
    }

    const cleanBase64 = imageBase64.replace(
      /^data:image\/[a-zA-Z]+;base64,/,
      ""
    );

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            {
              type: "input_image",
              image_url: `data:image/jpeg;base64,${cleanBase64}`,
            },
          ],
        },
      ],
    });

    const reply =
      response.output_text ||
      response.output?.[0]?.content?.[0]?.text ||
      "I could not identify this plant.";

    console.log("🌿 IDENTIFY RESULT:", reply);

    // 🔥 send multiple keys so app can read it no matter what
    res.json({
      name: reply,
      reply: reply,
      result: reply,
      raw: reply,
    });

  } catch (error) {
    console.error("❌ IDENTIFY ERROR:", error);
    res.status(500).json({
      error: "Identify failed",
      details: error?.message || String(error),
    });
  }
});

// ✅ START SERVER
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
