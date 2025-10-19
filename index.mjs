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

import express from "express";
import multer from "multer";
import dayjs from "dayjs";
import fs from "fs";
import path from "path";
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

/* ------------------------- Funções utilitárias -------------------------- */
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

/* ----------------------------- Extração PDF ----------------------------- */
async function extrairFatura(pdfBuffer) {
  if (!pdfParse) throw new Error("Falha ao carregar módulo pdf-parse");
  const parsed = await pdfParse(pdfBuffer);
  const text = clean(parsed.text);

  /* ============ BLOCO CABEÇALHO (VALOR TOTAL + DATAS) ============ */
  const mCabec = text.match(/(\d{1,3}(?:\.\d{3})*,\d{2})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})/);
  const total_a_pagar = mCabec ? num(mCabec[1]) : null;
  const data_vencimento = mCabec ? mCabec[2] : null;
  const data_leitura_anterior = mCabec ? mCabec[3] : null;
  const data_leitura_atual = mCabec ? mCabec[4] : null;

  // próxima leitura = data extra “solta” que não aparece nas anteriores
  let data_proxima_leitura = null;
  const datasAll = Array.from(text.matchAll(/\b\d{2}\/\d{2}\/\d{4}\b/g)).map(m => m[0]);
  const cand = datasAll.find(
    d => ![data_leitura_anterior, data_leitura_atual, data_vencimento].includes(d)
  );
  if (cand) data_proxima_leitura = cand;

  /* ============ UC PRINCIPAL ============ */
  const mUCMain = text.match(/(?:JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\/\d{4}\s+(\d{6,12})/i);
  const unidade_consumidora = mUCMain ? mUCMain[1] : null;

  /* ============ EMISSÃO / APRESENTAÇÃO ============ */
  const mEmissao = text.match(/EMISS[ÃA]O\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i);
  const data_emissao = mEmissao ? mEmissao[1] : null;
  const mApres = text.match(/DATA\s+DE\s+APRESENTA[ÇC][AÃ]O\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i);
  const apresentacao = mApres ? mApres[1] : null;

  /* ============ REFERÊNCIA (MÊS/ANO) ============ */
  const mRef = text.match(/(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\/\d{4}/i);
  const mes_ano_referencia = mRef ? mRef[0].toUpperCase() : null;

  /* ============ LEITURAS DO MEDIDOR ============ */
  let leitura_anterior = null, leitura_atual = null;
  const mLeitLinha = text.match(/ENERGIA\s+ATIVA\s*-\s*KWH\s+(\d+)\s+(\d+)[^\d]+(\d+)/i);
  if (mLeitLinha) {
    const atual = parseInt(mLeitLinha[1]);
    const consumo = parseInt(mLeitLinha[2]);
    const possAnt = parseInt(mLeitLinha[3]);
    if (String(possAnt).length > 6 || Math.abs(atual - possAnt) !== consumo) {
      const bloco = text.slice(mLeitLinha.index, mLeitLinha.index + 160);
      const candidatos = Array.from(bloco.matchAll(/\b\d{4,6}\b/g)).map(m => parseInt(m[0]));
      const antValido = candidatos.find(n => Math.abs(atual - n) === consumo);
      if (antValido) leitura_anterior = antValido;
      leitura_atual = atual;
    } else {
      leitura_anterior = possAnt;
      leitura_atual = atual;
    }
  }

  /* ============ CONSUMO SCEE ============ */
  let consumo_scee_preco_unit_com_tributos = null,
      consumo_scee_quant = null,
      consumo_scee_tarifa_unitaria = null;
  const mCons = text.match(/CONSUMO\s+SCEE\s+kWh\s+([0-9],\d{6})\s+([\d.]+,\d{2})\s+[0-9]{1,2},\d{2}\s+([\d.]+,\d{2})/i)
             || text.match(/CONSUMO\s+SCEE\s+kWh\s+([0-9],\d{6})\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})/i);
  if (mCons) {
    consumo_scee_preco_unit_com_tributos = num(mCons[1]);
    consumo_scee_quant = num(mCons[2]);
    consumo_scee_tarifa_unitaria = num(mCons[4] || mCons[3]);
  }

  /* ============ INJEÇÕES SCEE ============ */
  const injecoes_scee = [];
  for (const m of text.matchAll(
    /INJE[ÇC][AÃ]O\s+SCEE[^U]*(?:UC\s+(\d+)).*?kWh\s+([0-9]{1,4},\d{1,2})\s+([0-9],\d{6}).*?(-?\d+,\d{2}).*?(-?\d+,\d{2})/gi
  )) {
    const uc = m[1];
    const quant = num(m[2]);
    const preco = num(m[3]);
    const tarifa = Math.abs(num(m[5]));
    injecoes_scee.push({
      uc,
      quant_kwh: safe(quant),
      preco_unit_com_tributos: safe(preco),
      tarifa_unitaria: safe(tarifa),
    });
  }

  /* ============ BLOCO INFORMAÇÕES SCEE ============ */
  const blocoSCEE = text.match(/INFORMAÇÕES\s+DO\s+SCEE:[\s\S]+?CADASTRO\s+RATEIO[\s\S]+?(?=\n|$)/i);
  let geracao_ciclo = null,
      uc_geradora = null,
      uc_geradora_producao = null,
      excedente_recebido = null,
      credito_recebido = null,
      saldo_kwh_total = null,
      cadastro_rateio_geracao_uc = null,
      cadastro_rateio_geracao_percentual = null;
  if (blocoSCEE) {
    const bloco = blocoSCEE[0];
    geracao_ciclo = (bloco.match(/GERA[ÇC][AÃ]O\s+CICLO\s*\(([^)]+)\)/i) || [])[1] || null;
    uc_geradora = (bloco.match(/UC\s+(\d{8,12})/i) || [])[1] || null;
    uc_geradora_producao = num((bloco.match(/UC\s+\d+\s*:\s*([\d.]+,\d{2})/) || [])[1]);
    excedente_recebido = num((bloco.match(/EXCEDENTE\s+RECEBIDO.*?([\d.]+,\d{2})/) || [])[1]);
    credito_recebido = num((bloco.match(/CR[ÉE]DITO\s+RECEBIDO.*?([\d.]+,\d{2})/) || [])[1]);
    saldo_kwh_total = num((bloco.match(/SALDO\s+KWH[:\s]+([\d.]+,\d{2})/) || [])[1]);
    cadastro_rateio_geracao_uc = (bloco.match(/CADASTRO\s+RATEIO\s+GERA[ÇC][AÃ]O.*?UC\s+(\d+)/i) || [])[1] || null;
    cadastro_rateio_geracao_percentual = (bloco.match(/=\s*([\d,.]+%)/) || [])[1] || null;
  }

  /* ============ TARIFA UNITÁRIA SEM TRIBUTOS ============ */
  const mTarifaSemTrib = text.match(/(\d,\d{6})(?=\s*[-\d, ]*SCEE)/i);
  const valor_tarifa_unitaria_sem_tributos = mTarifaSemTrib ? num(mTarifaSemTrib[1]) : null;

  /* ============ BENEFÍCIOS / TRIBUTOS ============ */
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

  /* ============ INFORMAÇÕES CLIENTE / OBSERVAÇÕES ============ */
  const infoCliente = (text.match(/INFORMA[ÇC][AÃ]OES\s+PARA\s+O\s+CLIENTE[:\-]?\s*(.*?)(?=CADASTRO|NOTA|$)/i) || [])[1] || null;
  const observacoes = (text.match(/NOTA\s+FISCAL.*?(Processo.*?R\$.*?\.)/i) || [])[1] || null;

  /* ============ MÉDIA DE CONSUMO ============ */
  const historicos = Array.from(text.matchAll(/\b(\d{3,4}),00\b/g)).map(m => num(m[1] + ",00"));
  const media = historicos.length ? safe(historicos.reduce((a, b) => a + b, 0) / historicos.length) : null;

  /* ============ RETORNO FINAL JSON ============ */
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




