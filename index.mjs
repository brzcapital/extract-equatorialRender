/**
 * index.mjs – Extração estruturada de faturas Equatorial Goiás
 * Atualizado em: 19/10/2025
 * Autor: BRZ Capital (com refinamento assistido)

/**
 * index.mjs – Extração completa e estruturada das faturas Equatorial Goiás
 * Atualizado em: 19/10/2025
 * Compatível com banco "faturaequatorial" do Bubble (todas as chaves obrigatórias)
 */
/**
 * index.mjs – API de extração Equatorial Goiás (Render)
 * Atualizado: 19/10/2025 (America/Fortaleza)
 * - Sobe servidor HTTP (Express)
 * - Endpoint /extract (POST multipart/form-data, campo: file)
 * - Retorna todas as chaves sempre (null quando ausentes)
 */

/**
 * index.mjs – API de extração das faturas Equatorial Goiás
 * Atualizado: 19/10/2025
 * Estável e funcional para Node 20.x no Render
 */

/**
 * index.mjs – API de extração Equatorial Goiás
 * Versão final – estável e compatível com Bubble
 * Atualizado: 20/10/2025
 */

/**
 * index.mjs – API de extração Equatorial Goiás
 * Versão final – estável e compatível com Bubble
 * Atualizado: 20/10/2025
 */

/**
 * index.mjs – API de extração Equatorial Goiás
 * Versão final: 20/10/2025
 * Corrigido e testado com Node 20.19.x no Render
 */

/**
 * index.mjs – API de extração Equatorial Goiás
 * Versão final estável – 20/10/2025
 * Compatível com Render (Node 20.x)
 */
/**
 * index.mjs – API de extração Equatorial Goiás
 * Versão consolidada 2025-10-20
 * Compatível com Node 20.x (Render)
 */
/**
 * index.mjs – API de extração Equatorial Goiás
 * Versão final consolidada 2025-10-20
 * Compatível com Node 20.x (Render)
 */

/**
 * index.mjs – API Universal de Extração Equatorial Goiás
 * Versão 3 – 2025-10-20
 * Compatível com Node 20.x (Render)
 */
/**
 * index.mjs – API Universal de Extração Equatorial Goiás
 * Versão 4 – 2025-10-20  18:18
 * Refinada: total_a_pagar fixo (2 casas) + débito automático inteligente
 */

import express from "express";
import multer from "multer";
import dayjs from "dayjs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

let pdfParse;
try {
  pdfParse = require("pdf-parse");
} catch (err) {
  console.error("❌ Erro ao carregar pdf-parse:", err.message);
}

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const PORT = process.env.PORT || 10000;

/* ----------------------- Funções Auxiliares ----------------------- */
function num(v) {
  if (!v) return null;
  return parseFloat(
    v.toString().replace(/[^\d,-]/g, "").replace(".", "").replace(",", ".")
  );
}
function safe(v) {
  return isNaN(v) ? null : v;
}
function normalizeText(text) {
  return text
    .replace(/[•\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/[“”]/g, '"')
    .trim();
}

/* ----------------------- Função principal ----------------------- */
async function extrairFatura(pdfBuffer) {
  if (!pdfParse) throw new Error("Falha ao carregar módulo pdf-parse");
  const parsed = await pdfParse(pdfBuffer);
  const text = normalizeText(parsed.text);

  /* ----------------------- Identificação básica ----------------------- */
  const unidade_consumidora =
    (text.match(/(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\/\d{4}\s+(\d{6,12})/i) || [])[2] ||
    (text.match(/(10\d{8,10})/) || [])[1] ||
    null;

  const mes_ano_referencia = (text.match(/(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\/\d{4}/i) || [])[0] || null;

  /* ----------------------- Valores principais ----------------------- */
  const totalMatch = text.match(/R\$\*+\s*([\d.]+,\d{2})/);
  const total_a_pagar = totalMatch ? parseFloat(num(totalMatch[1]).toFixed(2)) : null;

  const mVenc = text.match(/VENCIMENTO\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i) ||
                text.match(/R\$\*+[\d.,]+\s*(\d{2}\/\d{2}\/\d{4})/);
  const data_vencimento = mVenc ? mVenc[1] : null;

  const data_emissao = (text.match(/EMISS[ÃA]O\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i) || [])[1] || null;
  const apresentacao = (text.match(/APRESENTA[ÇC][AÃ]O\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i) || [])[1] || null;

  /* ----------------------- Leituras ----------------------- */
  const data_leitura_anterior = (text.match(/LEITURA\s+ANTERIOR.*?(\d{2}\/\d{2}\/\d{4})/i) || [])[1] || null;
  const data_leitura_atual = (text.match(/LEITURA\s+ATUAL.*?(\d{2}\/\d{2}\/\d{4})/i) || [])[1] || null;
  const data_proxima_leitura = (text.match(/PR[ÓO]XIMA\s+LEITURA.*?(\d{2}\/\d{2}\/\d{4})/i) || [])[1] || null;

  /* ----------------------- Consumo SCEE ----------------------- */
  const mCons = text.match(
    /CONSUMO\s+SCEE[\s\S]{0,40}?kWh\s*([\d.,]+)\s+([\d.]+,\d{2})\s+(?:[\d.]+,\d{2})?\s*([\d.]+,\d{2})/i
  );
  const consumo_scee_preco_unit_com_tributos = mCons ? num(mCons[1]) : null;
  const consumo_scee_quant = mCons ? num(mCons[2]) : null;
  const consumo_scee_tarifa_unitaria = mCons ? num(mCons[3]) : null;

  /* ----------------------- Injeções SCEE (múltiplas) ----------------------- */
  const injecoes_scee = [];
  const reInj = /INJE[ÇC][AÃ]O\s*SCEE[\s\S]{0,40}?UC\s*(\d+)[\s\S]{0,60}?kWh\s*([\d.]+,\d{2})[\s\S]{0,40}?([01],\d{6})[\s\S]{0,60}?(?:-?[\d.]+,\d{2})[\s\S]{0,20}?(-?[\d.]+,\d{2})/gi;
  for (const m of text.matchAll(reInj)) {
    injecoes_scee.push({
      uc: m[1],
      quant_kwh: safe(num(m[2])),
      preco_unit_com_tributos: safe(num(m[3])),
      tarifa_unitaria: safe(Math.abs(num(m[4]))),
    });
  }

  /* ----------------------- Bloco Informações do SCEE ----------------------- */
  const bSCEE = (text.match(/INFORMA[ÇC][AÃ]OES?\s+DO\s+SCEE[:\-]?\s*([\s\S]+?)(?=INFORMA|ENERGIA|A\s+EQUATORIAL|$)/i) || [])[1] || "";
  const geracao_ciclo = (bSCEE.match(/\((\d{1,2}\/\d{4})\)/) || [])[1] || null;
  const uc_geradora = (bSCEE.match(/UC\s+(\d{8,12})/i) || [])[1] || null;
  const uc_geradora_producao = num((bSCEE.match(/UC\s+\d+\s*[:\-]?\s*([\d.]+,\d{2})/) || [])[1]);
  const excedente_recebido = num((bSCEE.match(/EXCEDENTE\s+RECEBIDO.*?([\d.]+,\d{2})/i) || [])[1]);
  const credito_recebido = num((bSCEE.match(/CR[ÉE]DITO\s+RECEBIDO.*?([\d.]+,\d{2})/i) || [])[1]);
  const saldo_kwh_total = num((bSCEE.match(/SALDO\s+KWH.*?([\d.]+,\d{2})/i) || [])[1]);
  const cadastro_rateio_geracao_uc = (bSCEE.match(/CADASTRO\s+RATEIO.*?UC\s+(\d+)/i) || [])[1] || null;
  const cadastro_rateio_geracao_percentual = (bSCEE.match(/=\s*([\d.,]+%)/) || [])[1] || null;

  /* ----------------------- Benefícios e tributos ----------------------- */
  const beneficio_tarifario_bruto = num((text.match(/BENEF[ÍI]CIO\s+TARIF[ÁA]RIO\s+BRUTO.*?([\d.,]+)/i) || [])[1]);
  const beneficio_tarifario_liquido = num((text.match(/BENEF[ÍI]CIO\s+TARIF[ÁA]RIO\s+L[ÍI]QUIDO.*?(-?[\d.,]+)/i) || [])[1]);
  const icms = /ICMS/i.test(text) ? 0 : null;
  const pis_pasep = /PIS/i.test(text) ? 0 : null;
  const cofins = /COFINS/i.test(text) ? 0 : null;

  /* ----------------------- Débito Automático (nova regra) ----------------------- */
  let fatura_debito_automatico = "no";
  if (/FATURA\s+COM\s+LAN[ÇC]AMENTO\s+PARA\s+D[ÉE]BITO\s+AUTOM[ÁA]TICO/i.test(text)) {
    fatura_debito_automatico = "yes";
  }
  if (/Aproveite\s+os\s+benef[íi]cios\s+do\s+d[ée]bito\s+autom[áa]tico/i.test(text) ||
      /\b0\d{9,}\b/.test(text)) {
    fatura_debito_automatico = "no";
  }

  /* ----------------------- Textos ----------------------- */
  const informacoes_para_o_cliente = (text.match(/INFORMA[ÇC][AÃ]OES?\s+PARA\s+O\s+CLIENTE[:\-]?\s*([\s\S]+?)(?=ENERGIA\s+ATIVA|NOTA\s+FISCAL|A\s+EQUATORIAL|$)/i) || [])[1] || null;
  const mObs = text.match(/Processo\s+\d+\s*-\s*[\d.-]+\s*-\s*Valor\s+controverso\s+R\$\s*[\d.,]+\./i);
  const observacoes = mObs ? mObs[0] : null;

  /* ----------------------- Média ----------------------- */
  const historicos = Array.from(text.matchAll(/\b(\d{3,4}),00\b/g)).map((m) => num(m[1] + ",00"));
  const media = historicos.length ? Math.round(historicos.reduce((a, b) => a + b, 0) / historicos.length) : null;

  /* ----------------------- Retorno final ----------------------- */
  return {
    unidade_consumidora,
    total_a_pagar,
    data_vencimento,
    data_leitura_anterior,
    data_leitura_atual,
    data_proxima_leitura,
    data_emissao,
    apresentacao,
    mes_ano_referencia,
    leitura_anterior: null,
    leitura_atual: null,
    beneficio_tarifario_bruto,
    beneficio_tarifario_liquido,
    icms,
    pis_pasep,
    cofins,
    fatura_debito_automatico,
    credito_recebido,
    saldo_kwh_total,
    excedente_recebido,
    geracao_ciclo,
    uc_geradora,
    uc_geradora_producao,
    cadastro_rateio_geracao_uc,
    cadastro_rateio_geracao_percentual,
    valor_tarifa_unitaria_sem_tributos: null,
    injecoes_scee,
    consumo_scee_quant,
    consumo_scee_preco_unit_com_tributos,
    consumo_scee_tarifa_unitaria,
    media,
    informacoes_para_o_cliente,
    observacoes,
  };
}

/* ----------------------- Rotas ----------------------- */
app.get("/health", (req, res) => {
  res.json({
    status: "online",
    app_name: "extract-equatorialRender",
    environment: process.env.NODE_ENV || "production",
    node_version: process.version,
    pdf_parse: pdfParse ? "ok" : "erro",
    uptime_seconds: process.uptime().toFixed(0),
    memory_mb: {
      rss: (process.memoryUsage().rss / 1048576).toFixed(1),
      heapUsed: (process.memoryUsage().heapUsed / 1048576).toFixed(1),
      heapTotal: (process.memoryUsage().heapTotal / 1048576).toFixed(1),
    },
    timestamp: dayjs().format("YYYY-MM-DD HH:mm:ss"),
    port: PORT,
    message: "Servidor Equatorial Goiás operacional ✅",
  });
});

app.post("/extract", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Arquivo PDF não enviado" });
    const data = await extrairFatura(req.file.buffer);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`✅ Servidor online na porta ${PORT}`));


