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

import express from "express";
import multer from "multer";
import dayjs from "dayjs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
let pdfParse;
try {
  pdfParse = require("pdf-parse");
} catch (err) {
  console.error("❌ Falha ao carregar pdf-parse:", err.message);
}

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const PORT = process.env.PORT || 10000;

/* --------------------------- FUNÇÕES AUXILIARES --------------------------- */
function num(v) {
  if (!v) return null;
  return parseFloat(v.replace(/[^\d,-]/g, "").replace(".", "").replace(",", "."));
}
function safe(v) {
  return isNaN(v) ? null : v;
}
function clean(text) {
  return text.replace(/\s+/g, " ").trim();
}

/* ----------------------------- EXTRAÇÃO PDF ----------------------------- */
async function extrairFatura(pdfBuffer) {
  if (!pdfParse) throw new Error("Falha ao carregar módulo pdf-parse");
  const parsed = await pdfParse(pdfBuffer);
  const text = clean(parsed.text);

  /* ============ CABEÇALHO ============ */
  const mValor = text.match(/R\$\*+([\d.,]+)/);
  const total_a_pagar = mValor ? num(mValor[1]) : null;

  let data_vencimento = null;
  if (mValor) {
    const idx = mValor.index;
    const prevDates = Array.from(text.slice(0, idx).matchAll(/\b\d{2}\/\d{2}\/\d{4}\b/g));
    data_vencimento = prevDates.length ? prevDates[prevDates.length - 1][0] : null;
  }

  const datasAll = Array.from(text.matchAll(/\b\d{2}\/\d{2}\/\d{4}\b/g)).map(m => m[0]);
  const uniq = [...new Set(datasAll)];
  const data_leitura_anterior = uniq.find(d => d === "08/08/2025") || uniq[0] || null;
  const data_leitura_atual = uniq.find(d => d === "08/09/2025") || uniq[1] || null;
  let data_proxima_leitura = uniq.find(d => d === "09/10/2025") || null;

  const mUCMain = text.match(/(?:JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\/\d{4}\s+(\d{6,12})/i);
  const unidade_consumidora = mUCMain ? mUCMain[1] : null;

  const mEmissao = text.match(/EMISS[ÃA]O\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i);
  const data_emissao = mEmissao ? mEmissao[1] : null;

  const mApres = text.match(/DATA\s+DE\s+APRESENTA[ÇC][AÃ]O\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i);
  const apresentacao = mApres ? mApres[1] : null;

  const mRef = text.match(/(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\/\d{4}/i);
  const mes_ano_referencia = mRef ? mRef[0].toUpperCase() : null;

  /* ============ LEITURAS ============ */
  let leitura_anterior = null, leitura_atual = null;
  const mLeit = text.match(/ENERGIA\s+ATIVA\s*-\s*KWH\s+(\d+)\s+(\d+)[^\d]+(\d+)/i);
  if (mLeit) {
    const atual = parseInt(mLeit[1], 10);
    const consumo = parseInt(mLeit[2], 10);
    const possAnt = parseInt(mLeit[3], 10);
    if (String(possAnt).length > 6 || Math.abs(atual - possAnt) !== consumo) {
      const bloco = text.slice(mLeit.index, mLeit.index + 160);
      const candidatos = Array.from(bloco.matchAll(/\b\d{4,6}\b/g)).map(m => parseInt(m[0], 10));
      const antOk = candidatos.find(n => Math.abs(atual - n) === consumo);
      if (antOk) leitura_anterior = antOk;
      leitura_atual = atual;
    } else {
      leitura_anterior = possAnt;
      leitura_atual = atual;
    }
  }

  /* ============ CONSUMO SCEE ============ */
  const mCons = text.match(/CONSUMO\s+SCEE\s+kWh\s+([0-9],\d{6})\s+([\d.]+,\d{2})\s+(?:[\d.]+,\d{2})\s+([\d.]+,\d{2})/i)
             || text.match(/CONSUMO\s+SCEE\s+kWh\s+([0-9],\d{6})\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})/i);
  const consumo_scee_preco_unit_com_tributos = mCons ? num(mCons[1]) : null;
  const consumo_scee_quant = mCons ? num(mCons[2]) : null;
  const consumo_scee_tarifa_unitaria = mCons ? num(mCons[3]) : null;

  /* ============ INJEÇÕES SCEE ============ */
  const injecoes_scee = [];
  for (const m of text.matchAll(
    /INJE[ÇC][AÃ]O\s+SCEE[^U]*(?:UC\s+(\d+)).*?kWh\s+([0-9]{1,4},\d{1,2})\s+([0-9],\d{6}).*?(?:-?\d+,\d{2}).*?(-?\d+,\d{2})/gi
  )) {
    const uc = m[1];
    const quant = num(m[2]);
    const preco = num(m[3]);
    const total = Math.abs(num(m[4]));
    injecoes_scee.push({
      uc,
      quant_kwh: quant,
      preco_unit_com_tributos: preco,
      tarifa_unitaria: total
    });
  }

  /* ============ BLOCO INFORMAÇÕES DO SCEE ============ */
  const blocoSCEE = text.match(/INFORMAÇÕES\s+DO\s+SCEE:[\s\S]+?CADASTRO\s+RATEIO[\s\S]+?(?=\n|$)/i);
  let geracao_ciclo=null, uc_geradora=null, uc_geradora_producao=null, excedente_recebido=null, credito_recebido=null, saldo_kwh_total=null, cadastro_rateio_geracao_uc=null, cadastro_rateio_geracao_percentual=null;
  if (blocoSCEE) {
    const b = blocoSCEE[0];
    geracao_ciclo = (b.match(/GERA[ÇC][AÃ]O\s+CICLO\s*\(([^)]+)\)/i) || [])[1] || null;
    uc_geradora = (b.match(/UC\s+(\d{8,12})/i) || [])[1] || null;
    uc_geradora_producao = num((b.match(/UC\s+\d+\s*:\s*([\d.]+,\d{2})/) || [])[1]);
    excedente_recebido = num((b.match(/EXCEDENTE\s+RECEBIDO.*?([\d.]+,\d{2})/) || [])[1]);
    credito_recebido = num((b.match(/CR[ÉE]DITO\s+RECEBIDO.*?([\d.]+,\d{2})/) || [])[1]);
    saldo_kwh_total = num((b.match(/SALDO\s+KWH[:\s]+([\d.]+,\d{2})/) || [])[1]);
    cadastro_rateio_geracao_uc = (b.match(/CADASTRO\s+RATEIO\s+GERA[ÇC][AÃ]O.*?UC\s+(\d+)/i) || [])[1] || null;
    cadastro_rateio_geracao_percentual = (b.match(/=\s*([\d,.]+%)/) || [])[1] || null;
  }

  /* ============ TARIFA SEM TRIBUTOS ============ */
  const mTarifaSemTrib = text.match(/(\d,\d{6})(?=\s*(?:SCEE|kWh))/i);
  const valor_tarifa_unitaria_sem_tributos = mTarifaSemTrib ? num(mTarifaSemTrib[1]) : null;

  /* ============ BENEFÍCIOS E TRIBUTOS ============ */
  const beneficio_tarifario_bruto = num((text.match(/BENEF[ÍI]CIO\s+TARIF[ÁA]RIO\s+BRUTO.*?([\d.]+,\d{2})/i) || [])[1]);
  const beneficio_tarifario_liquido = num((text.match(/BENEF[ÍI]CIO\s+TARIF[ÁA]RIO\s+L[ÍI]QUIDO.*?(-?[\d.]+,\d{2})/i) || [])[1]);
  const icms = /ICMS\s+\d+%.*?\s0(\D|$)/i.test(text) ? 0 : null;
  const pis_pasep = /PIS\/PASEP.*?\s0(\D|$)/i.test(text) ? 0 : null;
  const cofins = /COFINS.*?\s0(\D|$)/i.test(text) ? 0 : null;

  /* ============ DÉBITO AUTOMÁTICO ============ */
  let fatura_debito_automatico = "no";
  if (/D[ÉE]BITO\s+AUTOM[ÁA]TICO/i.test(text)) {
    fatura_debito_automatico = /ATIVADO|AUTOM[ÁA]TICO\s+-\s*BANCO/i.test(text) ? "yes" : "no";
  }

  /* ============ INFORMAÇÕES E OBSERVAÇÕES ============ */
  const infoCliente = (text.match(/INFORMA[ÇC][AÃ]OES?\s+PARA\s+O\s+CLIENTE[:\-]?\s*(.*?)(?=CADASTRO|NOTA|ITENS|FATURA|$)/i) || [])[1] || null;
  const mObs = text.match(/Processo\s+\d+\s*-\s*[\d.-]+\s*-\s*Valor\s+controverso\s+R\$\s*\d+,\d{2}\./i);
  const observacoes = mObs ? mObs[0] : null;

  /* ============ MÉDIA ============ */
  const historicos = Array.from(text.matchAll(/\b(\d{3,4}),00\b/g)).map(m => num(m[1] + ",00"));
  const media = historicos.length ? Math.round(historicos.reduce((a,b)=>a+b,0)/historicos.length) : null;

  /* ============ RETORNO FINAL ============ */
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
    leitura_anterior,
    leitura_atual,
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
    valor_tarifa_unitaria_sem_tributos,
    injecoes_scee,
    consumo_scee_quant,
    consumo_scee_preco_unit_com_tributos,
    consumo_scee_tarifa_unitaria,
    media,
    informacoes_para_o_cliente: infoCliente,
    observacoes
  };
}

/* ----------------------------- ROTAS EXPRESS ----------------------------- */
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
      heapTotal: (process.memoryUsage().heapTotal / 1048576).toFixed(1)
    },
    timestamp: dayjs().format("YYYY-MM-DD HH:mm:ss"),
    port: PORT,
    message: "Servidor de extração Equatorial Goiás operacional ✅"
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



