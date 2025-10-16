// ============================
// EXTRACT-EQUATORIAL (Render)
// ============================

import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import fs from "fs";
import pdf from "pdf-parse";

const app = express();
app.use(cors());
app.use(express.json());

// PATCH para evitar bug do pdf-parse com arquivo interno inexistente
const originalReadFileSync = fs.readFileSync;
fs.readFileSync = function (path, options) {
  if (path.includes("test/data/05-versions-space.pdf")) {
    return Buffer.from(""); // ignora arquivo de teste interno
  }
  return originalReadFileSync.apply(this, arguments);
};

// =======================================
// 🔹 TESTE BÁSICO DE FUNCIONAMENTO
// =======================================
app.post("/extract-text", async (req, res) => {
  try {
    const { pdf_url } = req.body;

    if (!pdf_url) {
      return res.status(400).json({ error: "Campo 'pdf_url' é obrigatório" });
    }

    const response = await fetch(pdf_url);
    if (!response.ok) throw new Error("Falha ao baixar o PDF");

    const buffer = await response.arrayBuffer();
    const data = await pdf(Buffer.from(buffer));

    res.json({
      status: "ok",
      tamanho_texto: data.text.length,
      amostra: data.text.slice(0, 300)
    });
  } catch (error) {
    console.error("❌ Erro ao processar PDF:", error.message);
    res.status(500).json({ error: "Falha ao extrair texto do PDF", detalhes: error.message });
  }
});

// =======================================
// 🔹 EXTRAÇÃO ESTRUTURADA (SIMPLIFICADA)
// =======================================
app.post("/extract-structured", async (req, res) => {
  try {
    const { pdf_url } = req.body;
    if (!pdf_url) return res.status(400).json({ error: "Campo 'pdf_url' é obrigatório" });

    const response = await fetch(pdf_url);
    if (!response.ok) throw new Error("Falha ao baixar o PDF");

    const buffer = await response.arrayBuffer();
    const data = await pdf(Buffer.from(buffer));
    const text = data.text.replace(/\s+/g, " ").trim();

    // Regras simples — serão refinadas depois
    const resultado = {
      unidade_consumidora: text.match(/UC\s*(\d{6,})/)?.[1] || null,
      total_a_pagar: parseFloat(
        text.match(/TOTAL\s*A\s*PAGAR\s*R\$\s*([\d.,]+)/i)?.[1]?.replace(",", ".") || 0
      ),
      data_vencimento: text.match(/VENCIMENTO[:\s]+(\d{2}\/\d{2}\/\d{4})/)?.[1] || null,
      data_emissao: text.match(/EMISS[AÃ]O[:\s]+(\d{2}\/\d{2}\/\d{4})/)?.[1] || null,
      mes_ano_referencia: text.match(/REFER[ÊE]NCIA[:\s]+([A-Z]{3}\/\d{4})/)?.[1] || null
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
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
