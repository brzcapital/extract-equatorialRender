import express from "express";
import fetch from "node-fetch";
import pdf from "pdf-parse";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// 🔹 Endpoint 1 - Teste simples
app.post("/extract-text", async (req, res) => {
  try {
    const { pdf_url } = req.body;
    if (!pdf_url) return res.status(400).json({ error: "Campo 'pdf_url' é obrigatório" });

    const response = await fetch(pdf_url);
    const buffer = await response.arrayBuffer();
    const data = await pdf(Buffer.from(buffer));

    res.json({
      status: "ok",
      tamanho_texto: data.text.length,
      amostra: data.text.slice(0, 500)
    });
  } catch (error) {
    console.error("Erro ao processar PDF:", error);
    res.status(500).json({ error: "Falha ao extrair texto do PDF" });
  }
});

// 🔹 Endpoint 2 - Extração estruturada
app.post("/extract-structured", async (req, res) => {
  try {
    const { pdf_url } = req.body;
    if (!pdf_url) return res.status(400).json({ error: "Campo 'pdf_url' é obrigatório" });

    const response = await fetch(pdf_url);
    const buffer = await response.arrayBuffer();
    const data = await pdf(Buffer.from(buffer));
    const text = data.text.replace(/\s+/g, " ").trim();

    // 🔸 Aqui entram as regras de extração (simplificadas por enquanto)
    const resultado = {
      unidade_consumidora: text.match(/UC\s*(\d{8,})/)?.[1] || null,
      total_a_pagar: parseFloat(text.match(/TOTAL\s*A\s*PAGAR\s*R\$\s*([\d.,]+)/i)?.[1]?.replace(",", ".") || 0),
      data_vencimento: text.match(/VENCIMENTO\s*:? (\d{2}\/\d{2}\/\d{4})/)?.[1] || null,
      data_emissao: text.match(/EMISSÃO\s*:? (\d{2}\/\d{2}\/\d{4})/)?.[1] || null,
      mes_ano_referencia: text.match(/REFERÊNCIA\s*:? ([A-Z]{3}\/\d{4})/)?.[1] || null
    };

    res.json({
      status: "ok",
      campos_extraidos: resultado
    });
  } catch (error) {
    console.error("Erro na extração estruturada:", error);
    res.status(500).json({ error: "Falha na extração estruturada" });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
