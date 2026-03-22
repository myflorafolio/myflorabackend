import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.get("/", (_req, res) => {
  res.send("My Flora Folio backend is live 🌿");
});

app.post("/ask", async (req, res) => {
  try {
    const { message } = req.body;

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: message || "Hello",
    });

    const reply =
      response.output_text ||
      response.output?.[0]?.content?.[0]?.text ||
      "No reply";

    res.json({ reply });
  } catch (error) {
    console.error("ASK ERROR:", error);
    res.status(500).json({
      error: "Ask failed",
      details: error?.message || String(error),
    });
  }
});

app.post("/identify", async (req, res) => {
  try {
    console.log("IDENTIFY BODY KEYS:", Object.keys(req.body || {}));

    const imageBase64 =
      req.body.imageBase64 ||
      req.body.image ||
      req.body.base64 ||
      req.body.photo ||
      req.body.imageData;

    if (!imageBase64) {
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
            {
              type: "input_text",
              text:
                'Identify this plant from the image and respond ONLY as valid JSON with these exact keys: "name", "scientificName", "careSummary". Example: {"name":"Monstera deliciosa","scientificName":"Monstera deliciosa","careSummary":"Bright indirect light. Water when top inch dries. Likes humidity."}',
            },
            {
              type: "input_image",
              image_url: `data:image/jpeg;base64,${cleanBase64}`,
            },
          ],
        },
      ],
    });

    const raw =
      response.output_text ||
      response.output?.[0]?.content?.[0]?.text ||
      "";

    console.log("RAW IDENTIFY RESPONSE:", raw);

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {
        name: raw || "Unknown plant",
        scientificName: "",
        careSummary: "",
      };
    }

    const name =
      parsed.name ||
      parsed.commonName ||
      parsed.plantName ||
      "Unknown plant";

    const scientificName = parsed.scientificName || "";
    const careSummary =
      parsed.careSummary ||
      parsed.summary ||
      parsed.care ||
      "";

    res.json({
      name,
      commonName: name,
      plantName: name,
      title: name,

      scientificName,

      careSummary,
      summary: careSummary,
      care: careSummary,
      details: careSummary,

      reply: `${name}${scientificName ? ` (${scientificName})` : ""}${careSummary ? ` - ${careSummary}` : ""}`,
      result: `${name}${scientificName ? ` (${scientificName})` : ""}${careSummary ? ` - ${careSummary}` : ""}`,

      raw,
    });
  } catch (error) {
    console.error("IDENTIFY ERROR:", error);
    res.status(500).json({
      error: "Identify failed",
      details: error?.message || String(error),
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
