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

import express from "express";
import multer from "multer";
import dayjs from "dayjs";

/**
 * Função principal de extração
 * Retorna todas as 60 chaves fixas com valores null se não encontrados
 */
async function extrairFatura(pdfBuffer) {
  // --- FIX DEFINITIVO PARA O ERRO ENOENT DO PDF-PARSE ---
  import fs from "fs";
  import path from "path";

  const testDir = path.join(process.cwd(), "node_modules/pdf-parse/test/data");
  const fakeFile = path.join(testDir, "05-versions-space.pdf");

  try {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    if (!fs.existsSync(fakeFile)) {
      fs.writeFileSync(fakeFile, "dummy");
    }
  } catch (e) {
    console.error("Erro ao criar arquivo fake:", e.message);
  }

  // --- Importa pdf-parse de forma segura ---
  let pdfParse;
  try {
    const mod = await import("pdf-parse");
    pdfParse = mod.default || mod;
  } catch (err) {
    console.error("Erro ao importar pdf-parse:", err);
    throw new Error("Falha ao carregar módulo pdf-parse");
  }

  // Agora sim o parser é chamado com segurança
  const parsed = await pdfParse(pdfBuffer);
  const text = parsed.text.replace(/\s+/g, " ").trim();


  // Helpers
  const num = (s) => (s ? parseFloat(s.replace(/\./g, "").replace(",", ".")) : null);
  const safe = (v) => (v !== undefined ? v : null);

  // ------------------------------
  // 🔹 1. Extração de dados chaves
  // ------------------------------
  const datasLeit = Array.from(text.matchAll(/\b\d{2}\/\d{2}\/\d{4}\b/g)).map((m) => m[0]);
  const data_leitura_anterior = datasLeit[0] || null;
  const data_leitura_atual = datasLeit[1] || null;
  const data_proxima_leitura = datasLeit[2] || null;

  let apresentacao = null;
  const mApres = text.match(/ANEEL[^\d]*(\d{2}\/\d{2}\/\d{4})\s+\d{4}\/\d{2}/i);
  if (mApres) apresentacao = mApres[1];

  let leitura_anterior = null;
  let leitura_atual = null;
  const mLeit = text.match(/ENERGIA\s+ATIVA\s*-\s*KWH\s+(\d+)\s+\d+\s+(\d+)/i);
  if (mLeit) {
    leitura_anterior = parseInt(mLeit[1]);
    leitura_atual = parseInt(mLeit[2]);
  }

  const injecoes_scee = [];
  for (const m of text.matchAll(
    /INJEÇÃO\s+SCEE\s*-\s*UC\s+(\d+).*?kWh\s+([\d.,]+)\s+([\d.,]+)[^-\d,]+(-?\d+,\d+)/g
  )) {
    const uc = m[1].trim();
    const preco = num(m[2]);
    const quant = num(m[3]);
    const totalImpresso = Math.abs(num(m[4]));
    injecoes_scee.push({
      uc,
      preco_unit_com_tributos: safe(preco),
      quant_kwh: safe(quant),
      tarifa_unitaria: safe(totalImpresso),
    });
  }

  const mConsTar = text.match(/CONSUMO\s+SCEE\s+kWh\s+([\d.,]+)/i);
  const consumo_scee_tarifa_unitaria = mConsTar ? num(mConsTar[1]) : null;

  const mConsQtdLine = text.match(/CONSUMO\s+SCEE\s+kWh\s+[\d.,]+\s+([\d.,]+)/i);
  const consumo_scee_quant = mConsQtdLine ? num(mConsQtdLine[1]) : null;
  const consumo_scee_preco_unit_com_tributos = mConsTar ? num(mConsTar[1]) : null;

  const historicos = Array.from(text.matchAll(/\b(\d{3,4}),00\b/g)).map((m) => num(m[1] + ",00"));
  const media =
    historicos.length > 0
      ? +(historicos.reduce((a, b) => a + b, 0) / historicos.length).toFixed(2)
      : null;

  const mUC = text.match(/\b(\d{8,11})\b(?=.*EQUATORIAL)/);
  const unidade_consumidora = mUC ? mUC[1] : null;

  const mVenc = text.match(/\b(\d{2}\/\d{2}\/\d{4})\b(?=.*R\$)/);
  const data_vencimento = mVenc ? mVenc[1] : null;

  const mTotal = text.match(/R\$[*]*\s*([\d.,]+)/);
  const total_a_pagar = mTotal ? num(mTotal[1]) : null;

  const mEmissao = text.match(/DATA\s+DE\s+EMISSÃO:\s*(\d{2}\/\d{2}\/\d{4})/i);
  const data_emissao = mEmissao ? mEmissao[1] : null;

  const mRef = text.match(/\b([A-Z]{3}\/\d{4})\b/);
  const mes_ano_referencia = mRef ? mRef[1] : null;

  const infoCliente = (() => {
    const m = text.match(
      /O FATURAMENTO DAS INSTALAÇÕES.*?A EQUATORIAL ENERGIA AGRADECE PELA PONTUALIDADE.*?(?= ENERGIA ATIVA| NOTA FISCAL|$)/i
    );
    return m ? m[0].trim() : null;
  })();

  const mUcGer = text.match(/UC\s+(\d{8,12})\s*:\s*([\d.]+,\d{2})/i);
  const uc_geradora = mUcGer ? mUcGer[1] : null;
  const uc_geradora_producao = mUcGer ? num(mUcGer[2]) : null;

  const mExced = text.match(/EXCEDENTE\s+RECEBIDO\s+KWH:\s*UC\s+\d{8,12}\s*:\s*([\d.]+,\d{2})/i);
  const excedente_recebido = mExced ? num(mExced[1]) : null;

  const mCred = text.match(/CRÉDITO\s+RECEBIDO\s+KWH\s+([\d.]+,\d{2})/i);
  const credito_recebido = mCred ? num(mCred[1]) : null;

  const mSaldo = text.match(/SALDO\s+KWH:\s*([\d.]+,\d{2})/i);
  const saldo_kwh = mSaldo ? num(mSaldo[1]) : null;

  const mCiclo = text.match(/GERAÇÃO\s+CICLO\s*\((\d{1,2}\/\d{4})\)/i);
  const ciclo_geracao = mCiclo ? mCiclo[1] : null;

  const mRateio = text.match(/CADASTRO\s+RATEIO\s+GERAÇÃO:\s*UC\s+(\d+)\s*=\s*([0-9]+%)/i);
  const cadastro_rateio_geracao_uc = mRateio ? mRateio[1] : null;
  const cadastro_rateio_geracao_percentual = mRateio ? mRateio[2] : null;

  const icms = /ICMS\s+\d+%0\s+0/i.test(text) ? 0 : null;
  const pis_pasep = /PIS\/PASEP\s+[\d.,]+%0\s+0/i.test(text) ? 0 : null;
  const cofins = /COFINS\s+[\d.,]+%0\s+0/i.test(text) ? 0 : null;

  const mBenB = text.match(/BENEFÍCIO\s+TARIFÁRIO\s+BRUTO\s+SCEE\s+([\d.]+,\d{2})/i);
  const beneficio_tarifario_bruto = mBenB ? num(mBenB[1]) : null;
  const mBenL = text.match(/BENEFÍCIO\s+TARIFÁRIO\s+LÍQUIDO\s+SCEE\s+(-?[\d.]+,\d{2})/i);
  const beneficio_tarifario_liquido = mBenL ? num(mBenL[1]) : null;

  const mParc = text.match(/PARC\s+INJET\s+S\/DESC\s+-\s+([0-9]{1,2},\d{2}%)/i);
  const parc_injet_s_desc_percentual = mParc ? mParc[1] : null;

  const mObs = text.match(/Nota fiscal emitida conforme .*?R\$.*?\d+[.,]\d{2}\./i);
  const observacoes = mObs ? mObs[0] : null;

  const fatura_debito_automatico = false;

  // ------------------------------
  // 🔹 2. Modelo base fixo (60 chaves)
  // ------------------------------
  const modeloBase = {
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
    injecoes_scee: [],
    consumo_scee_quant: null,
    consumo_scee_preco_unit_com_tributos: null,
    consumo_scee_tarifa_unitaria: null,
    media: null,
    parc_injet_s_desc_percentual: null,
    observacoes: null,
  };

  // ------------------------------
  // 🔹 3. Resultado consolidado
  // ------------------------------
  const resultadoExtraido = {
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
    saldo_kwh,
    excedente_recebido,
    ciclo_geracao,
    informacoes_para_o_cliente: infoCliente,
    uc_geradora,
    uc_geradora_producao,
    cadastro_rateio_geracao_uc,
    cadastro_rateio_geracao_percentual,
    injecoes_scee,
    consumo_scee_quant,
    consumo_scee_preco_unit_com_tributos,
    consumo_scee_tarifa_unitaria,
    media,
    parc_injet_s_desc_percentual,
    observacoes,
  };

  // Combina e retorna todas as 60 chaves, preenchendo null onde não houver dado
  return Object.assign({}, modeloBase, resultadoExtraido);
}

// ------------------------------
// 🚀 Servidor HTTP (Render)
// ------------------------------
const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// ------------------------------
// 🩺 Endpoint de saúde detalhado
// ------------------------------
app.get("/health", async (_, res) => {
  try {
    const start = process.uptime();
    const nodeVersion = process.version;
    const memoryUsage = process.memoryUsage();
    const now = dayjs().format("YYYY-MM-DD HH:mm:ss");
    const env = process.env.NODE_ENV || "production";

    // Verifica pdf-parse de forma segura
    let pdfParseStatus = "ok";
    try {
      const { default: pdfParse } = await import("pdf-parse");
      if (!pdfParse) pdfParseStatus = "erro: não carregado";
    } catch {
      pdfParseStatus = "erro: módulo não disponível";
    }

    res.json({
      status: "online",
      app_name: "extract-equatorialRender",
      environment: env,
      node_version: nodeVersion,
      pdf_parse: pdfParseStatus,
      uptime_seconds: Math.round(start),
      memory_mb: {
        rss: (memoryUsage.rss / 1024 / 1024).toFixed(1),
        heapUsed: (memoryUsage.heapUsed / 1024 / 1024).toFixed(1),
        heapTotal: (memoryUsage.heapTotal / 1024 / 1024).toFixed(1),
      },
      timestamp: now,
      port: process.env.PORT || 3000,
      message: "Servidor de extração Equatorial Goiás operacional ✅",
    });
  } catch (err) {
    res.status(500).json({
      status: "erro",
      message: "Falha ao consultar status do servidor",
      detalhe: err.message,
    });
  }
});


app.post("/extract", upload.single("file"), async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ error: "Envie o PDF no campo 'file' (multipart/form-data)." });
    const result = await extrairFatura(req.file.buffer);
    res.json(result);
  } catch (err) {
    console.error("Erro de extração:", err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor de extração online na porta ${PORT}`));

// Execução local opcional: node index.mjs caminho.pdf
if (process.argv[2]) {
  import("fs").then(async ({ readFileSync }) => {
    const buf = readFileSync(process.argv[2]);
    const out = await extrairFatura(buf);
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  });
}

