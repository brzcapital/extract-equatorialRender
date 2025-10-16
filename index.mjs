import express from "express";
import multer from "multer";
import pdfParse from "pdf-parse-fixed";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.get("/health", (req, res) => res.json({ status: "ok" }));

// ===================
// 1️⃣ Extrai texto da 1ª página do PDF
// ===================
async function extractTextFromPDF(buffer) {
  const data = await pdfParse(buffer);
  const pages = data.text.split(/\f/g);
  return (pages[0] || data.text).trim();
}

// ===================
// 2️⃣ Função GPT inteligente com fallback
// ===================
async function callGPTAnalysis(pdfText, apiKey, attempt = 1) {
  const payload = {
    model: "gpt-4-turbo",
    reasoning: { effort: "medium" },
    input: [
      {
        role: "system",
        content:
          "Você é um extrator confiável de dados de faturas Equatorial Goiás. Sempre retorne JSON válido. Todos os campos obrigatórios devem existir, mesmo que nulos. Nenhuma invenção de valores."
      },
      {
        role: "user",
        content:
          "Texto da fatura:\n" +
          pdfText +
          "\n\nRetorne APENAS o objeto JSON com os campos solicitados, sem texto adicional."
      }
    ],
    text: {
      type: "output_text"
    }
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  const result = await response.json();

  console.log("🧠 GPT RESPONSE RAW:", JSON.stringify(result, null, 2).slice(0, 2500));

  const rawText =
    result.output_text ||
    result.output?.[0]?.content?.[0]?.text ||
    null;

  if (!rawText && attempt === 1) {
    console.log("⚠️ Nenhum texto retornado — reexecutando fallback reduzido...");
    return await callGPTAnalysis(pdfText.slice(0, 5000), apiKey, 2);
  }

  if (!rawText) return null;

  try {
    const cleanText = rawText.trim().replace(/^[^{]*({[\s\S]*})[^}]*$/, "$1");
    return JSON.parse(cleanText);
  } catch (err) {
    console.error("⚠️ Erro ao converter JSON:", err);
    return null;
  }
}

// ===================
// 3️⃣ Rota principal
// ===================
app.post("/extract-hybrid", upload.single("file"), async (req, res) => {
  try {
    const apiKey = req.body.api_key || process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(400).json({ error: "API key ausente." });
    if (!req.file) return res.status(400).json({ error: "Arquivo PDF ausente." });

    const text = await extractTextFromPDF(req.file.buffer);
    const structured = await callGPTAnalysis(text, apiKey);

    if (!structured) {
      return res.status(500).json({
        error: "Falha ao processar a fatura. GPT não retornou conteúdo válido."
      });
    }

    res.json(structured);
  } catch (err) {
    console.error("❌ Erro geral:", err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
