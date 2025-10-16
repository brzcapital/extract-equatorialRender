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
// Função: Extrai texto do PDF (apenas 1ª página)
// ===================
async function extractTextFromPDF(buffer) {
  const data = await pdfParse(buffer);
  const text = data.text || "";
  const firstPageText = text.split(/\f/g)[0] || text;
  return firstPageText.trim();
}

// ===================
// Função: GPT-4-Turbo (análise inteligente)
// ===================
async function callGPTAnalysis(pdfText, apiKey) {
  const payload = {
    model: "gpt-4-turbo",
    input: [
      {
        role: "system",
        content:
          "Você é um extrator de dados de faturas Equatorial Goiás. Retorne UM ÚNICO objeto JSON com todos os campos obrigatórios, mesmo que vazios (null ou 0). Nenhuma invenção de valores.",
      },
      {
        role: "user",
        content:
          "Extraia os seguintes campos da fatura (em português): unidade_consumidora, total_a_pagar, data_vencimento, data_leitura_anterior, data_leitura_atual, data_proxima_leitura, data_emissao, apresentacao, mes_ano_referencia, leitura_anterior, leitura_atual, beneficio_tarifario_bruto, beneficio_tarifario_liquido, icms, pis_pasep, cofins, fatura_debito_automatico, credito_recebido, saldo_kwh, excedente_recebido, ciclo_geracao, informacoes_para_o_cliente, uc_geradora, uc_geradora_producao, cadastro_rateio_geracao_uc, cadastro_rateio_geracao_percentual, injecoes_scee (lista de objetos com uc, quant_kwh, preco_unit_com_tributos, tarifa_unitaria), consumo_scee_quant, consumo_scee_preco_unit_com_tributos, consumo_scee_tarifa_unitaria, media, parc_injet_s_desc_percentual, observacoes.\n\nTexto da fatura:\n" +
          pdfText,
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "extrator_equatorial",
        schema: {
          type: "object",
          properties: {
            unidade_consumidora: { type: ["string", "null"] },
            total_a_pagar: { type: ["number", "null"] },
            data_vencimento: { type: ["string", "null"] },
            data_leitura_anterior: { type: ["string", "null"] },
            data_leitura_atual: { type: ["string", "null"] },
            data_proxima_leitura: { type: ["string", "null"] },
            data_emissao: { type: ["string", "null"] },
            apresentacao: { type: ["string", "null"] },
            mes_ano_referencia: { type: ["string", "null"] },
            leitura_anterior: { type: ["number", "null"] },
            leitura_atual: { type: ["number", "null"] },
            beneficio_tarifario_bruto: { type: ["number", "null"] },
            beneficio_tarifario_liquido: { type: ["number", "null"] },
            icms: { type: ["number", "null"] },
            pis_pasep: { type: ["number", "null"] },
            cofins: { type: ["number", "null"] },
            fatura_debito_automatico: { type: "string" },
            credito_recebido: { type: ["number", "null"] },
            saldo_kwh: { type: ["number", "null"] },
            excedente_recebido: { type: ["number", "null"] },
            ciclo_geracao: { type: ["string", "null"] },
            informacoes_para_o_cliente: { type: ["string", "null"] },
            uc_geradora: { type: ["string", "null"] },
            uc_geradora_producao: { type: ["number", "null"] },
            cadastro_rateio_geracao_uc: { type: ["string", "null"] },
            cadastro_rateio_geracao_percentual: { type: ["number", "null"] },
            injecoes_scee: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  uc: { type: "string" },
                  quant_kwh: { type: "number" },
                  preco_unit_com_tributos: { type: "number" },
                  tarifa_unitaria: { type: "number" }
                },
                required: ["uc", "quant_kwh", "preco_unit_com_tributos", "tarifa_unitaria"],
                additionalProperties: false
              }
            },
            consumo_scee_quant: { type: ["number", "null"] },
            consumo_scee_preco_unit_com_tributos: { type: ["number", "null"] },
            consumo_scee_tarifa_unitaria: { type: ["number", "null"] },
            media: { type: ["number", "null"] },
            parc_injet_s_desc_percentual: { type: ["number", "null"] },
            observacoes: { type: ["string", "null"] }
          },
          required: Object.keys({
            unidade_consumidora: null,
            total_a_pagar: null,
            data_vencimento: null,
            data_leitura_anterior: null,
            data_leitura_atual: null,
            data_proxima_leitura: null,
            data_emissao: null,
            apresentacao: null,
            mes_ano_referencia: null,
            leitura_anterior: null,
            leitura_atual: null,
            beneficio_tarifario_bruto: null,
            beneficio_tarifario_liquido: null,
            icms: null,
            pis_pasep: null,
            cofins: null,
            fatura_debito_automatico: null,
            credito_recebido: null,
            saldo_kwh: null,
            excedente_recebido: null,
            ciclo_geracao: null,
            informacoes_para_o_cliente: null,
            uc_geradora: null,
            uc_geradora_producao: null,
            cadastro_rateio_geracao_uc: null,
            cadastro_rateio_geracao_percentual: null,
            injecoes_scee: null,
            consumo_scee_quant: null,
            consumo_scee_preco_unit_com_tributos: null,
            consumo_scee_tarifa_unitaria: null,
            media: null,
            parc_injet_s_desc_percentual: null,
            observacoes: null
          })
        }
      }
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
  if (result.output?.[0]?.content?.[0]?.text) {
    return JSON.parse(result.output[0].content[0].text);
  }
  return null;
}

// ===================
// Rota principal
// ===================
app.post("/extract-hybrid", upload.single("file"), async (req, res) => {
  try {
    const apiKey = req.body.api_key || process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(400).json({ error: "API key ausente." });
    if (!req.file) return res.status(400).json({ error: "Arquivo PDF ausente." });

    const text = await extractTextFromPDF(req.file.buffer);
    const structured = await callGPTAnalysis(text, apiKey);
    res.json(structured || { error: "Falha ao processar a fatura." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ===================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
