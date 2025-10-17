import express from "express";
import multer from "multer";
import pdfParse from "pdf-parse-fixed";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.get("/health", (req, res) => res.json({ status: "ok" }));

async function extractTextFromPDF(buffer) {
  const data = await pdfParse(buffer);
  const text = (data.text || "").trim();
  return text;
}

async function callOpenAIChatStrictJSON(pdfText, apiKey) {
  const payload = {
    model: "gpt-4o-2024-08-06",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Você é um extrator de dados de faturas Equatorial Goiás. Retorne SOMENTE um JSON válido (um objeto) com todos os campos solicitados, preenchendo com null ou 0 se não existir. Nunca adicione explicações."
      },
      {
        role: "user",
        content:
          "Extraia do texto da fatura os seguintes campos: unidade_consumidora, total_a_pagar, data_vencimento, data_leitura_anterior, data_leitura_atual, data_proxima_leitura, data_emissao, apresentacao, mes_ano_referencia, leitura_anterior, leitura_atual, beneficio_tarifario_bruto, beneficio_tarifario_liquido, icms, pis_pasep, cofins, fatura_debito_automatico, credito_recebido, saldo_kwh, excedente_recebido, ciclo_geracao, informacoes_para_o_cliente, uc_geradora, uc_geradora_producao, cadastro_rateio_geracao_uc, cadastro_rateio_geracao_percentual, injecoes_scee (lista com: uc, quant_kwh, preco_unit_com_tributos, tarifa_unitaria), consumo_scee_quant, consumo_scee_preco_unit_com_tributos, consumo_scee_tarifa_unitaria, media, parc_injet_s_desc_percentual, observacoes.\n\nTexto da fatura:\n" +
          pdfText
      }
    ]
  };

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const json = await resp.json();
  console.log("🧠 OpenAI RAW:", JSON.stringify(json, null, 2).slice(0, 2000));

  let content = null;
  if (json?.choices?.[0]?.message?.content) {
    content = json.choices[0].message.content;
  }
  if (!content && json?.choices?.[0]?.message?.content?.[0]?.text) {
    content = json.choices[0].message.content[0].text;
  }
  if (!content && json?.output_text) {
    content = json.output_text;
  }

  if (!content || typeof content !== "string") {
    console.warn("⚠️ Nenhum conteúdo textual retornado pelo GPT.");
    return null;
  }

  try {
    const cleaned = content.trim().replace(/^[^{]*({[\s\S]*})[^}]*$/, "$1");
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("⚠️ Erro ao converter resposta em JSON:", err);
    return null;
  }
}

app.post("/extract-hybrid", upload.single("file"), async (req, res) => {
  try {
    const apiKey = req.body.api_key || process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(400).json({ error: "API key ausente." });
    if (!req.file) return res.status(400).json({ error: "Arquivo PDF ausente." });

    const text = await extractTextFromPDF(req.file.buffer);
    if (!text || text.length < 50) {
      return res.status(422).json({ error: "Texto insuficiente extraído do PDF." });
    }

    const result = await callOpenAIChatStrictJSON(text, apiKey);
    if (!result) {
      return res.status(500).json({
        error: "Falha ao processar a fatura. GPT não retornou conteúdo válido.",
      });
    }

    res.json(result);
  } catch (err) {
    console.error("❌ Erro geral:", err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
