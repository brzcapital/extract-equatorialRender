// ========================================
// EXTRACT-EQUATORIAL v2
// Lê o texto real de um PDF remoto via pdf2json
// Estável no Render
// ========================================

import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import PDFParser from "pdf2json";

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Rota GET básica para teste rápido
app.get("/", (req, res) => {
  res.send("✅ Servidor ativo! Use POST /extract-text com { pdf_url }");
});

// ✅ Função para baixar e converter PDF em texto
async function extrairTextoDoPDF(pdfUrl) {
  const response = await fetch(pdfUrl);
  if (!response.ok) throw new Error("Falha ao baixar PDF");

  const buffer = Buffer.from(await response.arrayBuffer());
  const pdfParser = new PDFParser();

  return new Promise((resolve, reject) => {
    pdfParser.on("pdfParser_dataError", (err) => reject(err.parserError));
    pdfParser.on("pdfParser_dataReady", (pdfData) => {
      try {
        // Extrai todo o texto das páginas
        const allText = pdfData.Pages.map((page) =>
          page.Texts.map((t) =>
            decodeURIComponent(t.R.map((r) => r.T).join(""))
          ).join(" ")
        ).join("\n");
        resolve(allText);
      } catch (e) {
        reject(e);
      }
    });
    pdfParser.parseBuffer(buffer);
  });
}

// ✅ Rota principal: POST /extract-text
app.post("/extract-text", async (req, res) => {
  try {
    const { pdf_url } = req.body;
    if (!pdf_url) {
      return res.status(400).json({ erro: "Faltando campo pdf_url" });
    }

    console.log("🔗 Recebido PDF URL:", pdf_url);

    const texto = await extrairTextoDoPDF(pdf_url);

    res.json({
      status: "ok",
      tamanho_texto: texto.length,
      amostra: texto.slice(0, 500) + "...",
    });
  } catch (error) {
    console.error("❌ Erro ao extrair texto:", error);
    res.status(500).json({ erro: "Falha ao extrair texto do PDF" });
  }
});

// ✅ Inicializa o servidor
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
