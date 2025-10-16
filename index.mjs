// index.mjs — v4.5-Hybrid-LTS
// Servidor híbrido (parser local + fallback GPT-4o) para faturas Equatorial Goiás

import express from "express";
import multer from "multer";
import pdfParse from "pdf-parse-fixed";
import dotenv from "dotenv";
import fetch from "node-fetch";
import fs from "fs";

dotenv.config();
const app = express();
const upload = multer({ dest: "uploads/" });
const PORT = process.env.PORT || 10000;

// ==========================
// 🔹 Funções utilitárias
// ==========================
function limparTexto(txt) {
  return txt.replace(/\s+/g, " ").trim();
}

function extrairCampo(regex, texto, parseFn = x => x) {
  const match = texto.match(regex);
  return match ? parseFn(match[1]) : null;
}

function toNumber(str) {
  if (!str) return null;
  const num = parseFloat(str.replace(/\./g, "").replace(",", "."));
  return isNaN(num) ? null : num;
}

// ==========================
// 🧩 Parser Local (sem GPT)
// ==========================
async function extrairCamposLocais(pdfBuffer) {
  const data = await pdfParse(pdfBuffer);
  const texto = limparTexto(data.text);

  return {
    unidade_consumidora: extrairCampo(/Unidade Consumidora[:\s]+(\d+)/i, texto),
    total_a_pagar: toNumber(extrairCampo(/Total a Pagar(?:.*?)?R\$\s*([\d.,]+)/i, texto)),
    data_vencimento: extrairCampo(/Vencimento[:\s]+(\d{2}\/\d{2}\/\d{4})/i, texto),
    data_leitura_anterior: extrairCampo(/Leitura Anterior[:\s]+(\d{2}\/\d{2}\/\d{4})/i, texto),
    data_leitura_atual: extrairCampo(/Leitura Atual[:\s]+(\d{2}\/\d{2}\/\d{4})/i, texto),
    data_proxima_leitura: extrairCampo(/Próxima Leitura[:\s]+(\d{2}\/\d{2}\/\d{4})/i, texto),
    data_emissao: extrairCampo(/Emissão[:\s]+(\d{2}\/\d{2}\/\d{4})/i, texto),
    apresentacao: extrairCampo(/Apresentação[:\s]+(\d{2}\/\d{2}\/\d{4})/i, texto),
    mes_ano_referencia: extrairCampo(/Referente a[:\s]+([A-Z]{3}\/\d{2,4})/i, texto),
    leitura_anterior: toNumber(extrairCampo(/Leitura Anterior\s+(\d+)/i, texto)),
    leitura_atual: toNumber(extrairCampo(/Leitura Atual\s+(\d+)/i, texto)),
    beneficio_tarifario_bruto: toNumber(extrairCampo(/Benefício Tarifário.*?R\$\s*([\d.,]+)/i, texto)),
    beneficio_tarifario_liquido: toNumber(extrairCampo(/Benefício Tarifário Líquido.*?R\$\s*([\d.,]+)/i, texto)),
    icms: toNumber(extrairCampo(/ICMS[:\s]+([\d.,]+)/i, texto)),
    pis_pasep: toNumber(extrairCampo(/PIS[\/\s]PASEP[:\s]+([\d.,]+)/i, texto)),
    cofins: toNumber(extrairCampo(/COFINS[:\s]+([\d.,]+)/i, texto)),
    fatura_debito_automatico: /débito automático/i.test(texto) ? "yes" : "no",
    credito_recebido: toNumber(extrairCampo(/Crédito Recebido[:\s]+([\d.,]+)/i, texto)),
    saldo_kwh: toNumber(extrairCampo(/Saldo.*?([\d.,]+)\s*kWh/i, texto)),
    excedente_recebido: toNumber(extrairCampo(/Excedente.*?([\d.,]+)\s*kWh/i, texto)),
    ciclo_geracao: extrairCampo(/Ciclo de Geração[:\s]+([A-Za-z0-9\/]+)/i, texto),
    informacoes_para_o_cliente: extrairCampo(/Informações para o Cliente[:\s]*(.+)$/i, texto, limparTexto),
    uc_geradora: extrairCampo(/UC Geradora[:\s]+(\d+)/i, texto),
    uc_geradora_producao: toNumber(extrairCampo(/Produção[:\s]+([\d.,]+)\s*kWh/i, texto)),
    cadastro_rateio_geracao_uc: extrairCampo(/Rateio UC[:\s]+(\d+)/i, texto),
    cadastro_rateio_geracao_percentual: toNumber(extrairCampo(/Percentual[:\s]+([\d.,]+)/i, texto)),
    injecoes_scee: [],
    consumo_scee_quant: toNumber(extrairCampo(/Consumo SCEE[:\s]+([\d.,]+)/i, texto)),
    consumo_scee_preco_unit_com_tributos: toNumber(extrairCampo(/Preço Unit.*?Tributos[:\s]+([\d.,]+)/i, texto)),
    consumo_scee_tarifa_unitaria: toNumber(extrairCampo(/Tarifa Unitária[:\s]+([\d.,]+)/i, texto)),
    media: toNumber(extrairCampo(/Média[:\s]+([\d.,]+)/i, texto)),
    parc_injet_s_desc_percentual: toNumber(extrairCampo(/Percentual[:\s]+([\d.,]+)/i, texto)) || 0,
    observacoes: extrairCampo(/Observações[:\s]*(.+)$/i, texto, limparTexto)
  };
}

// ==========================
// 🔹 Fallback GPT-4o
// ==========================
async function completarComGPT4(camposParciais, texto, apiKey) {
  const camposNulos = Object.keys(camposParciais).filter(k => !camposParciais[k]);
  if (camposNulos.length === 0) return camposParciais;

  console.log("⚙️ Enviando ao GPT apenas campos faltantes:", camposNulos);

  const payload = {
    model: "gpt-4o",
    input: [
      {
        role: "system",
        content: "Você é um extrator de dados de faturas Equatorial Goiás. Preencha apenas os campos faltantes."
      },
      {
        role: "user",
        content: [
          { type: "input_text", text: `Fatura: ${texto}\n\nCampos faltantes: ${camposNulos.join(", ")}` }
        ]
      }
    ]
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
  try {
    const jsonText = result?.output?.[0]?.content?.[0]?.text;
    const jsonParsed = JSON.parse(jsonText);
    return { ...camposParciais, ...jsonParsed };
  } catch {
    return camposParciais;
  }
}

// ==========================
// 📤 Endpoint principal
// ==========================
app.post("/extract-hybrid", upload.single("file"), async (req, res) => {
  const apiKey = req.body.api_key;
  const file = req.file;

  if (!apiKey) return res.status(400).json({ error: "Faltando api_key" });
  if (!file) return res.status(400).json({ error: "Faltando arquivo PDF" });

  try {
    const buffer = fs.readFileSync(file.path);
    const camposLocais = await extrairCamposLocais(buffer);

    const parsed = await pdfParse(buffer);
    const texto = parsed.text;

    const finalData = await completarComGPT4(camposLocais, texto, apiKey);

    try { fs.unlinkSync(file.path); } catch {}

    res.json(finalData);
  } catch (err) {
    console.error("❌ Erro:", err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================
// 🚀 Health Check
// ==========================
app.get("/health", (req, res) => {
  res.json({ status: "ok", version: "4.5-hybrid-lts" });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

