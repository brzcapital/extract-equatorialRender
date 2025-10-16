// index.mjs — v3.8-LTS
// Servidor de Extração Estruturada - Equatorial Goiás (Bubble-ready)

import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import fetch from "node-fetch";
import fs from "fs";

dotenv.config();
const app = express();
const upload = multer({ dest: "uploads/" });
const PORT = process.env.PORT || 10000;

// =====================================================
// ✅ Health Check
// =====================================================
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Servidor Equatorial Render v3.8-LTS ativo ✅" });
});

// =====================================================
// 🏠 Página inicial
// =====================================================
app.get("/", (req, res) => {
  res.send("✅ API Equatorial Render v3.8-LTS está online e funcional!");
});

// =====================================================
// 🔧 Util: extrair JSON do objeto de resposta da OpenAI
// =====================================================
function pickJsonFromResponse(openaiResult) {
  try {
    const out = openaiResult?.output?.[0]?.content?.[0];
    if (!out) return null;
    // Novo formato: objeto JSON direto
    if (out.type === "json" && out.json) return out.json;
    // Formato antigo: string JSON em output_text
    if (out.type === "output_text" && typeof out.text === "string") {
      try { return JSON.parse(out.text); } catch { /* cai pro retorno bruto abaixo */ }
    }
    // Algumas versões retornam array de conteúdos
    const contentArr = openaiResult?.output?.[0]?.content;
    if (Array.isArray(contentArr)) {
      const jsonItem = contentArr.find(c => c.type === "json" && c.json);
      if (jsonItem) return jsonItem.json;
      const textItem = contentArr.find(c => c.type === "output_text" && typeof c.text === "string");
      if (textItem) { try { return JSON.parse(textItem.text); } catch {} }
    }
  } catch {}
  return null;
}

// =====================================================
// 🧠 Função principal - Comunicação com a OpenAI (Responses API)
// =====================================================
async function extractWithModel(model, base64Data, apiKey) {
  const payload = {
    model,
    input: [
      {
        role: "system",
        content:
          "Você é um extrator especialista em faturas da Equatorial Goiás. " +
          "Extraia todos os campos exigidos no JSON final, sem inventar valores. " +
          "Use ponto decimal em números, datas no formato ISO (yyyy-mm-dd) quando forem datas, " +
          "e retorne null quando um campo não existir explicitamente."
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Leia o PDF (em base64) e extraia os dados estruturados da fatura Equatorial: ${base64Data}`
          }
        ]
      }
    ],
    temperature: 0,
    text: {
      format: {
        // ✅ Estrutura nova da API (Out/2025): exige 'name' e 'schema'
        type: "json_schema",
        name: "extrator_equatorial",
        schema: {
          type: "object",
          additionalProperties: false,
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
            fatura_debito_automatico: { type: ["string", "null"] }, // "yes"/"no"
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
                additionalProperties: false,
                properties: {
                  uc: { type: ["string", "null"] },
                  quant_kwh: { type: ["number", "null"] },
                  preco_unit_com_tributos: { type: ["number", "null"] },
                  tarifa_unitaria: { type: ["number", "null"] }
                },
                // ✅ EXIGÊNCIA NOVA DA API: listar todas as chaves em 'required'
                required: ["uc", "quant_kwh", "preco_unit_com_tributos", "tarifa_unitaria"]
              }
            },
            consumo_scee_quant: { type: ["number", "null"] },
            consumo_scee_preco_unit_com_tributos: { type: ["number", "null"] },
            consumo_scee_tarifa_unitaria: { type: ["number", "null"] },
            media: { type: ["number", "null"] },
            parc_injet_s_desc_percentual: { type: ["number", "null"] },
            observacoes: { type: ["string", "null"] }
          },
          // Mantemos todos como "required" para forçar retorno (preenchendo null quando faltar)
          required: [
            "unidade_consumidora",
            "total_a_pagar",
            "data_vencimento",
            "data_leitura_anterior",
            "data_leitura_atual",
            "data_proxima_leitura",
            "data_emissao",
            "apresentacao",
            "mes_ano_referencia",
            "leitura_anterior",
            "leitura_atual",
            "beneficio_tarifario_bruto",
            "beneficio_tarifario_liquido",
            "icms",
            "pis_pasep",
            "cofins",
            "fatura_debito_automatico",
            "credito_recebido",
            "saldo_kwh",
            "excedente_recebido",
            "ciclo_geracao",
            "informacoes_para_o_cliente",
            "uc_geradora",
            "uc_geradora_producao",
            "cadastro_rateio_geracao_uc",
            "cadastro_rateio_geracao_percentual",
            "injecoes_scee",
            "consumo_scee_quant",
            "consumo_scee_preco_unit_com_tributos",
            "consumo_scee_tarifa_unitaria",
            "media",
            "parc_injet_s_desc_percentual",
            "observacoes"
          ]
        }
      }
    }
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const result = await response.json();
  if (result.error) throw new Error(result.error.message || "Erro desconhecido da OpenAI");
  return result;
}

// =====================================================
// 📤 Endpoint principal - Upload PDF (Bubble/Postman)
// =====================================================
app.post("/extract-pdf", upload.single("file"), async (req, res) => {
  const apiKey = req.body.api_key;
  const file = req.file;
  const userModel = req.body.model || "gpt-4o"; // padrão econômico

  if (!apiKey) return res.status(400).json({ error: "Faltando 'api_key'." });
  if (!file) return res.status(400).json({ error: "Nenhum arquivo PDF enviado." });

  try {
    const base64Data = fs.readFileSync(file.path, "base64");

    let result;
    try {
      result = await extractWithModel(userModel, base64Data, apiKey);
    } catch (err1) {
      console.warn(`⚠️ Falha com ${userModel}: ${err1.message}. Tentando fallback GPT-5...`);
      result = await extractWithModel("gpt-5", base64Data, apiKey);
    } finally {
      // remove o arquivo temporário, independente de sucesso/erro
      try { fs.unlinkSync(file.path); } catch {}
    }

    // Tenta extrair o JSON padronizado
    const json = pickJsonFromResponse(result);
    if (json) return res.json(json);

    // Se não conseguir, retorna o objeto bruto para debugging
    return res.json(result);
  } catch (error) {
    console.error("❌ Erro geral:", error);
    try { fs.unlinkSync(file.path); } catch {}
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// 🚀 Inicialização do servidor
// =====================================================
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
