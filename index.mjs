import zipfile
import io

# Conteúdo do index.mjs corrigido
index_mjs_content = """\
// index.mjs — v3.6 (compatível com text.format.schema)
import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import fetch from "node-fetch";
import fs from "fs";

dotenv.config();

const app = express();
const upload = multer({ dest: "uploads/" });
const PORT = process.env.PORT || 10000;

// 🔹 Rota de teste (health check)
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Servidor Equatorial Render v3.6 ativo ✅" });
});

// 🔹 Rota padrão (home)
app.get("/", (req, res) => {
  res.send("✅ API Equatorial Render v3.6 está online e funcional!");
});

// ======================================================
// 📦 Função principal de comunicação com OpenAI
// ======================================================
async function extractWithModel(model, base64Data, apiKey) {
  const payload = {
    model,
    input: [
      {
        role: "system",
        content:
          "Você é um extrator especialista em faturas da Equatorial Goiás. Extraia todos os campos exigidos no JSON."
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
            fatura_debito_automatico: { type: ["string", "null"] },
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
                }
              }
            },
            consumo_scee_quant: { type: ["number", "null"] },
            consumo_scee_preco_unit_com_tributos: { type: ["number", "null"] },
            consumo_scee_tarifa_unitaria: { type: ["number", "null"] },
            media: { type: ["number", "null"] },
            parc_injet_s_desc_percentual: { type: ["number", "null"] },
            observacoes: { type: ["string", "null"] }
          },
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

// ======================================================
// 🧠 Rota principal — upload PDF
// ======================================================
app.post("/extract-pdf", upload.single("file"), async (req, res) => {
  const apiKey = req.body.api_key;
  const file = req.file;
  const userModel = req.body.model || "gpt-4o";

  if (!apiKey) return res.status(400).json({ error: "Faltando 'api_key'." });
  if (!file) return res.status(400).json({ error: "Nenhum arquivo PDF enviado." });

  try {
    const fileData = fs.readFileSync(file.path);
    const base64Data = Buffer.from(fileData).toString("base64");

    let result;
    try {
      result = await extractWithModel(userModel, base64Data, apiKey);
    } catch (err1) {
      console.warn(`⚠️ Falha com ${userModel}: ${err1.message}. Tentando fallback GPT-5...`);
      result = await extractWithModel("gpt-5", base64Data, apiKey);
    }

    fs.unlinkSync(file.path);
    res.json(result.output?.[0]?.content?.[0]?.json ?? result);
  } catch (error) {
    console.error("❌ Erro geral:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
"""

# Conteúdo do package.json
package_json_content = """{
  "name": "extract-equatorialRender",
  "version": "1.0.0",
  "description": "API de extração de faturas Equatorial Goiás com GPT-5",
  "main": "index.mjs",
  "type": "module",
  "scripts": {
    "start": "node index.mjs"
  },
  "dependencies": {
    "express": "^4.19.2",
    "multer": "^1.4.5-lts.1",
    "dotenv": "^16.4.5",
    "node-fetch": "^3.3.2"
  }
}
"""

# Criar o arquivo ZIP em memória
zip_buffer = io.BytesIO()
with zipfile.ZipFile(zip_buffer, "w") as zf:
    zf.writestr("index.mjs", index_mjs_content)
    zf.writestr("package.json", package_json_content)

zip_buffer.seek(0)
zip_buffer.name = "extract-equatorialRender-v3.6.zip"
zip_buffer

