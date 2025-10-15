// ======== DEPENDÊNCIAS PRINCIPAIS ========
import express from "express";
import fetch from "node-fetch";

// Importação segura do pdf-parse (evita bug no Render)
import pkg from "pdf-parse/lib/pdf-parse.js";
const pdfParse = pkg.default || pkg;

// ======== CONFIGURAÇÃO DO SERVIDOR ========
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ======== ENDPOINT PRINCIPAL ========
// Recebe uma URL de PDF e retorna o texto da 1ª página
app.post("/extract", async (req, res) => {
  try {
    const { pdf_url } = req.body;

    if (!pdf_url) {
      return res.status(400).json({ error: "Missing parameter: pdf_url" });
    }

    console.log(`🔹 Baixando PDF de: ${pdf_url}`);

    // Faz o download do PDF
    const response = await fetch(pdf_url);
    if (!response.ok) {
      return res.status(400).json({ error: `Erro ao baixar PDF: ${response.statusText}` });
    }

    const pdfBuffer = await response.arrayBuffer();

    // Extrai texto do PDF
    const data = await pdfParse(Buffer.from(pdfBuffer));

    // Extrai apenas a primeira página
    const primeiraPagina = data.text.split(/\f/)[0]; // \f = quebra de página

    console.log("✅ Extração concluída com sucesso.");

    // Retorna texto limpo da primeira página
    return res.json({
      status: "ok",
      pdf_url,
      primeira_pagina_texto: primeiraPagina.trim().slice(0, 15000) // limite de segurança
    });
  } catch (error) {
    console.error("❌ Erro ao processar PDF:", error);
    return res.status(500).json({ error: error.message });
  }
});

// ======== ENDPOINT DE TESTE ========
app.get("/", (req, res) => {
  res.send("✅ Servidor ativo! Use POST /extract com { pdf_url }");
});

// ======== INICIA O SERVIDOR ========
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
