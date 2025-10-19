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

import express from "express";
import multer from "multer";
import pdfParse from "pdf-parse";
import dayjs from "dayjs";

// ---------- Extração (lógica principal) ----------
async function extrairFatura(pdfBuffer) {
  const parsed = await pdfParse(pdfBuffer);
  const text = parsed.text.replace(/\s+/g, " ").trim();

  // Helpers
  const num = (s) => (s ? parseFloat(s.replace(/\./g, "").replace(",", ".")) : null);
  const safe = (v) => (v !== undefined ? v : null);

  // Datas de leitura (sequência tripla)
  const datasLeit = Array.from(text.matchAll(/\b\d{2}\/\d{2}\/\d{4}\b/g)).map(m => m[0]);
  const data_leitura_anterior = datasLeit[0] || null;
  const data_leitura_atual = datasLeit[1] || null;
  const data_proxima_leitura = datasLeit[2] || null;

  // Data de apresentação (logo após ANEEL ... 3407/24)
  let apresentacao = null;
  const mApres = text.match(/ANEEL[^\d]*(\d{2}\/\d{2}\/\d{4})\s+\d{4}\/\d{2}/i);
  if (mApres) apresentacao = mApres[1];

  // Leituras (linha ENERGIA ATIVA - KWH <ant> <...> <atu>)
  let leitura_anterior = null;
  let leitura_atual = null;
  const mLeit = text.match(/ENERGIA\s+ATIVA\s*-\s*KWH\s+(\d+)\s+\d+\s+(\d+)/i);
  if (mLeit) {
    leitura_anterior = parseInt(mLeit[1], 10);
    leitura_atual = parseInt(mLeit[2], 10);
  }

  // Injeções SCEE (captura valores "como impressos": valor total sem sinal)
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
      tarifa_unitaria: safe(totalImpresso) // sem sinal negativo, exatamente como desejado
    });

    // Validador interno (não altera saída)
    const calculado = +( (quant ?? 0) * (preco ?? 0) ).toFixed(2);
    if (totalImpresso != null && Math.abs(calculado - totalImpresso) > 1) {
      console.warn(`⚠️ Divergência INJEÇÃO UC ${uc}: calculado=${calculado} vs impresso=${totalImpresso}`);
    }
  }

  // Consumo SCEE (tarifa unitária base)
  const mConsTar = text.match(/CONSUMO\s+SCEE\s+kWh\s+([\d.,]+)/i);
  const consumo_scee_tarifa_unitaria = mConsTar ? num(mConsTar[1]) : null;

  // Consumo SCEE quantidade
  const mConsQtdLine = text.match(/CONSUMO\s+SCEE\s+kWh\s+[\d.,]+\s+([\d.,]+)/i);
  const consumo_scee_quant = mConsQtdLine ? num(mConsQtdLine[1]) : null;

  // Preço unit c/ tributos do consumo SCEE (quando aparece explicitamente)
  const consumo_scee_preco_unit_com_tributos = mConsTar ? num(mConsTar[1]) : null;

  // Média (histórico com “,00”)
  const historicos = Array.from(text.matchAll(/\b(\d{3,4}),00\b/g)).map(m => num(m[1] + ",00"));
  const media = historicos.length
    ? +(historicos.reduce((a, b) => a + b, 0) / historicos.length).toFixed(2)
    : null;

  // Campos simples
  const mUC = text.match(/\b(\d{8,11})\b(?=.*EQUATORIAL)/);
  const unidade_consumidora = mUC ? mUC[1] : null;

  const mVenc = text.match(/\b(\d{2}\/\d{2}\/\d{4})\b(?=.*R\$)/);
  const data_vencimento = mVenc ? mVenc[1] : null;

  const mTotal = text.match(/R\$[*]*\s*([\d.,]+)/);
  const total_a_pagar = mTotal ? num(mTotal[1]) : null;

  const mEmissao = text.match(/DATA\s+DE\s+EMISSÃO:\s*(\d{2}\/\d{2}\/\d{4})/i);
  const data_emissao = mEmissao ? mEmissao[1] : null;

  const mRef = text.match(/\b([A-Z]{3}\/\d{4})\b/); // ex.: SET/2025
  const mes_ano_referencia = mRef ? mRef[1] : null;

  // Blocos informativos
  const infoCliente = (() => {
    const m = text.match(/O FATURAMENTO DAS INSTALAÇÕES.*?A EQUATORIAL ENERGIA AGRADECE PELA PONTUALIDADE.*?(?= ENERGIA ATIVA| NOTA FISCAL|$)/i);
    return m ? m[0].trim() : null;
  })();

  // SCEE infos (UC geradora, produção, excedente, crédito, saldo)
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

  // Tributos (quando aparecem como 0, manter 0; se não achar, null)
  const icms = /ICMS\s+\d+%0\s+0/i.test(text) ? 0 : null;
  const pis_pasep = /PIS\/PASEP\s+[\d.,]+%0\s+0/i.test(text) ? 0 : null;
  const cofins = /COFINS\s+[\d.,]+%0\s+0/i.test(text) ? 0 : null;

  // Benefícios tarifários
  const mBenB = text.match(/BENEFÍCIO\s+TARIFÁRIO\s+BRUTO\s+SCEE\s+([\d.]+,\d{2})/i);
  const beneficio_tarifario_bruto = mBenB ? num(mBenB[1]) : null;
  const mBenL = text.match(/BENEFÍCIO\s+TARIFÁRIO\s+LÍQUIDO\s+SCEE\s+(-?[\d.]+,\d{2})/i);
  const beneficio_tarifario_liquido = mBenL ? num(mBenL[1]) : null;

  // Parc injet s/desc %
  const mParc = text.match(/PARC\s+INJET\s+S\/DESC\s+-\s+([0-9]{1,2},\d{2}%)/i);
  const parc_injet_s_desc_percentual = mParc ? mParc[1] : null;

  // Observações/nota fiscal
  const mObs = text.match(/Nota fiscal emitida conforme .*?R\$.*?\d+[.,]\d{2}\./i);
  const observacoes = mObs ? mObs[0] : null;

  // Débito automático (heurística: presença do convite não implica aderido)
  const fatura_debito_automatico = false;

  // -------- JSON FINAL (todas as chaves) --------
  return {
    unidade_consumidora: safe(unidade_consumidora),
    total_a_pagar: safe(total_a_pagar),
    data_vencimento: safe(data_vencimento),
    data_leitura_anterior: safe(data_leitura_anterior),
    data_leitura_atual: safe(data_leitura_atual),
    data_proxima_leitura: safe(data_proxima_leitura),
    data_emissao: safe(data_emissao),
    apresentacao: safe(apresentacao),
    mes_ano_referencia: safe(mes_ano_referencia),
    leitura_anterior: safe(leitura_anterior),
    leitura_atual: safe(leitura_atual),
    beneficio_tarifario_bruto: safe(beneficio_tarifario_bruto),
    beneficio_tarifario_liquido: safe(beneficio_tarifario_liquido),
    icms: safe(icms),
    pis_pasep: safe(pis_pasep),
    cofins: safe(cofins),
    fatura_debito_automatico: safe(fatura_debito_automatico),
    credito_recebido: safe(credito_recebido),
    saldo_kwh: safe(saldo_kwh),
    excedente_recebido: safe(excedente_recebido),
    ciclo_geracao: safe(ciclo_geracao),
    informacoes_para_o_cliente: safe(infoCliente),
    uc_geradora: safe(uc_geradora),
    uc_geradora_producao: safe(uc_geradora_producao),
    cadastro_rateio_geracao_uc: safe(cadastro_rateio_geracao_uc),
    cadastro_rateio_geracao_percentual: safe(cadastro_rateio_geracao_percentual),
    injecoes_scee: injecoes_scee, // sempre array
    consumo_scee_quant: safe(consumo_scee_quant),
    consumo_scee_preco_unit_com_tributos: safe(consumo_scee_preco_unit_com_tributos),
    consumo_scee_tarifa_unitaria: safe(consumo_scee_tarifa_unitaria),
    media: safe(media),
    parc_injet_s_desc_percentual: safe(parc_injet_s_desc_percentual),
    observacoes: safe(observacoes)
  };
}

// ---------- Servidor HTTP ----------
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/extract", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Envie o PDF no campo 'file' (multipart/form-data)." });
    const result = await extrairFatura(req.file.buffer);
    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Falha ao extrair a fatura.", detail: String(err?.message || err) });
  }
});

// Porta do Render (ou 3000 local)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Extractor up on :${PORT}`);
});

// Execução local via CLI (opcional)
// node index.mjs /caminho/arquivo.pdf
if (process.argv[2]) {
  import("fs").then(async ({ readFileSync }) => {
    const buf = readFileSync(process.argv[2]);
    const out = await extrairFatura(buf);
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  });
}
