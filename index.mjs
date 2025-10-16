// ============================
// EXTRACT-EQUATORIAL (Render)
// ============================

import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.js";

const app = express();
app.use(cors());
app.use(express.json());

// ============================
// 🔹 Função auxiliar para extrair texto
// ============================
async function extractTextFromPDF(buffer) {
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  let textContent = "";

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const strings = content.items.map((item) => item.str);
    textContent += strings.join(" ") + "\n";
  }

  return textContent.trim();
}

// =======================================
// 🔹 TESTE BÁSICO
// =======================================
app.post("/extract-text", async (req, res) => {
  try {
    const { pdf_url } = req.body;
    if (!pdf_url) return res.status(400).json({ error: "Campo 'pdf_url' é obrigatório" });

    const response = await fetch(pdf_url);
    if (!response.ok) throw new Error("Falha ao baixar o PDF");

    const buffer = Buffer.from(await response.arrayBuffer());
    const text = await extractTextFromPDF(buffer);

    res.json({
      status: "ok",
      tamanho_texto: text.length,
      amostra: text.slice(0, 500)
    });
  } catch (error) {
    console.error("❌ Erro ao processar PDF:", error.message);
    res.status(500).json({ error: "Falha ao extrair texto do PDF", detalhes: error.message });
  }
});

// =======================================
// 🔹 EXTRAÇÃO ESTRUTURADA (BÁSICA)
// =======================================
app.post("/extract-structured", async (req, res) => {
  try {
    const { pdf_url } = req.body;
    if (!pdf_url) return res.status(400).json({ error: "Campo 'pdf_url' é obrigatório" });

    const response = await fetch(pdf_url);
    if (!response.ok) throw new Error("Falha ao baixar o PDF");

    const buffer = Buffer.from(await response.arrayBuffer());
    const text = await extractTextFromPDF(buffer);
    const cleanText = text.replace(/\s+/g, " ").trim();

    // Campos simples
    const resultado = {
      unidade_consumidora: cleanText.match(/UC\s*(\d{6,})/)?.[1] || null,
      total_a_pagar: parseFloat(
        cleanText.match(/TOTAL\s*A\s*PAGAR\s*R\$\s*([\d.,]+)/i)?.[1]?.replace(",", ".") || 0
      ),
      data_vencimento: cleanText.match(/VENCIMENTO[:\s]+(\d{2}\/\d{2}\/\d{4})/)?.[1] || null,
      data_emissao: cleanText.match(/EMISS[AÃ]O[:\s]+(\d{2}\/\d{2}\/\d{4})/)?.[1] || null,
      mes_ano_referencia: cleanText.match(/REFER[ÊE]NCIA[:\s]+([A-Z]{3}\/\d{4})/)?.[1] || null
    };

    res.json({
      status: "ok",
      campos_extraidos: resultado
    });
  } catch (error) {
    console.error("❌ Erro na extração estruturada:", error.message);
    res.status(500).json({ error: "Falha na extração estruturada", detalhes: error.message });
  }
});

// =======================================
// 🔹 SERVER LISTEN
// =======================================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
