import express from "express";
import multer from "multer";
import fetch from "node-fetch";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const upload = multer({ dest: "uploads/" });

app.post("/extract-pdf", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Nenhum arquivo enviado" });
    }

    // Envia o PDF para a API GPT-5 com o modelo de extração
    const formData = new FormData();
    formData.append("file", fs.createReadStream(req.file.path));

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-5",
        input: [
          {
            role: "system",
            content: `Você é um extrator especializado em faturas Equatorial Goiás. 
Leia o PDF e retorne um único objeto JSON com TODAS as chaves definidas no modelo “faturaequatorial”. 
Não invente valores; se faltar algum dado, retorne null. 
As regras são obrigatórias:
- beneficio_tarifario_liquido é sempre negativo;
- custo com tributos é maior que sem tributos;
- data_apresentacao é a data localizada no campo "Apresentação" (inferior da fatura);
- data_proxima_leitura é a última data exibida na tabela de leituras;
- informacoes_para_o_cliente deve trazer o bloco textual completo dessa seção;
- todos os campos devem aparecer no JSON, mesmo se vazios.`,
          },
          { role: "user", content: [{ type: "input_text", text: "Ler PDF enviado" }] },
        ],
        file_ids: [],
        temperature: 0.0,
        response_format: { type: "json_object" },
      }),
    });

    const result = await response.json();
    res.json(result);
  } catch (error) {
    console.error("Erro ao processar PDF:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(10000, () => {
  console.log("🚀 Servidor rodando na porta 10000");
});
