// ===============================
// Servidor de extração Equatorial
// Estável para Render (sem pdf-parse)
// ===============================

import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Rota básica (teste no navegador)
app.get("/", (req, res) => {
  res.send("✅ Servidor ativo! Use POST /extract com { pdf_url }");
});

// ✅ Função simples que baixa o PDF (só para teste)
async function baixarPdfComoTexto(pdfUrl) {
  const response = await fetch(pdfUrl);
  const buffer = await response.arrayBuffer();
  // ainda não converte PDF, apenas retorna bytes
  return `PDF baixado com ${buffer.byteLength} bytes de dados`;
}

// ✅ Endpoint de teste: POST /extract
app.post("/extract", async (req, res) => {
  try {
    const { pdf_url } = req.body;
    if (!pdf_url) {
      return res.status(400).json({ erro: "Faltando campo pdf_url" });
    }

    const resultado = await baixarPdfComoTexto(pdf_url);
    res.json({
      status: "ok",
      mensagem: resultado
    });
  } catch (error) {
    console.error("Erro:", error);
    res.status(500).json({ erro: "Falha ao processar PDF" });
  }
});

// ✅ Inicialização
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
