// index.mjs
import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import fetch from "node-fetch";
import fs from "fs";

dotenv.config();

const app = express();
const upload = multer({ dest: "uploads/" });
const PORT = process.env.PORT || 10000;

// ✅ rota principal
app.get("/", (req, res) => {
  res.send("✅ API Equatorial Render está online e pronta para extrair faturas!");
});

// ✅ rota principal de extração
app.post("/extract-pdf", upload.single("file"), async (req, res) => {
  try {
    const apiKey = req.body.api_key;
    const file = req.file;

    if (!apiKey) {
      return res.status(400).json({ error: "Faltando o campo 'api_key' no corpo da requisição." });
    }

    if (!file) {
      return res.status(400).json({ error: "Nenhum arquivo PDF foi enviado." });
    }

    // ✅ Lê o conteúdo binário do arquivo PDF
    const fileData = fs.readFileSync(file.path);
    const base64Data = Buffer.from(fileData).toString("base64");

    // ===== ENVIO CORRIGIDO PARA OPENAI =====
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-5",
        input: [
          {
            role: "system",
            content:
              "Você é um extrator especialista em faturas da Equatorial Goiás. " +
              "Extraia os dados com exatidão e retorne um único JSON contendo todos os campos abaixo, mesmo que vazios. " +
              "Use ponto decimal em números, datas no formato ISO (yyyy-mm-dd), e mantenha o formato JSON válido."
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Leia o PDF em base64 e extraia os dados da fatura Equatorial: ${base64Data}`
              }
            ]
          }
        ],
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "fatura_equatorial",
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
      })
    });

    const result = await response.json();

    if (result.error) {
      console.error("Erro da OpenAI:", result.error);
      return res.status(500).json({ error: result.error });
    }

    // ✅ limpa arquivo temporário
    fs.unlinkSync(file.path);

    // ✅ retorna JSON estruturado final
    res.json(result.output[0].content[0].json ?? result);

  } catch (error) {
    console.error("Erro no servidor:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
