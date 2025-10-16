import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import pkg from "pdf-parse/lib/pdf-parse.js";
const pdf = pkg.default || pkg;
import cors from "cors";

const app = express();
const upload = multer({ dest: "uploads/" });
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// Função auxiliar para normalizar texto
function limparTexto(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/R\$/g, "")
    .replace(/,/g, ".")
    .trim();
}

// Função principal de extração estruturada
async function extrairCampos(texto) {
  const result = {
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
    observacoes: ""
  };

  try {
    const t = limparTexto(texto);

    result.unidade_consumidora = t.match(/Unidade\s+Consumidora\s+(\d+)/i)?.[1] || null;
    result.total_a_pagar = parseFloat(t.match(/Total\s+a\s+Pagar\s+([\d.,]+)/i)?.[1] || null);
    result.data_vencimento = t.match(/Vencimento\s+(\d{2}\/\d{2}\/\d{4})/i)?.[1] || null;
    result.data_leitura_anterior = t.match(/Leitura\s+Anterior\s+(\d{2}\/\d{2}\/\d{4})/i)?.[1] || null;
    result.data_leitura_atual = t.match(/Leitura\s+Atual\s+(\d{2}\/\d{2}\/\d{4})/i)?.[1] || null;
    result.data_proxima_leitura = t.match(/Pr[oó]xima\s+Leitura\s+(\d{2}\/\d{2}\/\d{4})/i)?.[1] || null;
    result.data_emissao = t.match(/Emiss[aã]o\s+(\d{2}\/\d{2}\/\d{4})/i)?.[1] || null;
    result.apresentacao = t.match(/Apresenta[cç][aã]o\s+(\d{2}\/\d{2}\/\d{4})/i)?.[1] || null;
    result.mes_ano_referencia = t.match(/Refer[eê]ncia\s+(\w+\/\d{4})/i)?.[1] || null;

    result.leitura_anterior = parseFloat(t.match(/Leitura\s+Anterior\s+(\d+)/i)?.[1] || null);
    result.leitura_atual = parseFloat(t.match(/Leitura\s+Atual\s+(\d+)/i)?.[1] || null);

    result.beneficio_tarifario_bruto = parseFloat(t.match(/Benef[ií]cio\s+Bruto\s+([\d.,]+)/i)?.[1] || null);
    result.beneficio_tarifario_liquido = -Math.abs(
      parseFloat(t.match(/Benef[ií]cio\s+L[ií]quido\s+([\d.,]+)/i)?.[1] || 0)
    );

    result.icms = parseFloat(t.match(/ICMS\s+([\d.,]+)/i)?.[1] || 0);
    result.pis_pasep = parseFloat(t.match(/PIS\/PASEP\s+([\d.,]+)/i)?.[1] || 0);
    result.cofins = parseFloat(t.match(/COFINS\s+([\d.,]+)/i)?.[1] || 0);

    result.fatura_debito_automatico = /Débito\s+Automático/i.test(t) ? "yes" : "no";
    result.credito_recebido = parseFloat(t.match(/Cr[eé]dito\s+Recebido\s+([\d.,]+)/i)?.[1] || 0);
    result.saldo_kwh = parseFloat(t.match(/Saldo\s+de\s+Energia\s+([\d.,]+)/i)?.[1] || 0);
    result.excedente_recebido = parseFloat(t.match(/Excedente\s+Recebido\s+([\d.,]+)/i)?.[1] || 0);

    result.ciclo_geracao = t.match(/Ciclo\s+de\s+Gera[cç][aã]o\s+\(?(\d+\/\d+)\)?/i)?.[1] || null;
    result.informacoes_para_o_cliente = t.match(/Informa[cç][oõ]es\s+para\s+o\s+Cliente[:\-]?\s*(.*?)\s*(?:UC\s+Geradora|CADASTRO)/i)?.[1] || "";

    result.uc_geradora = t.match(/UC\s+Geradora\s+(\d+)/i)?.[1] || null;
    result.uc_geradora_producao = parseFloat(t.match(/UC\s+Geradora\s+\d+\s*[:\-]\s*([\d.,]+)/i)?.[1] || 0);
    result.cadastro_rateio_geracao_uc = t.match(/Cadastro\s+de\s+Rateio\s+de\s+Gera[cç][aã]o\s+UC\s+(\d+)/i)?.[1] || null;
    result.cadastro_rateio_geracao_percentual = parseFloat(
      t.match(/Cadastro\s+de\s+Rateio\s+de\s+Gera[cç][aã]o\s+Percentual\s+([\d.,]+)/i)?.[1] || 0
    );

    result.media = parseFloat(t.match(/M[eé]dia\s+([\d.,]+)/i)?.[1] || null);
    result.parc_injet_s_desc_percentual = parseFloat(
      t.match(/Parc\.?\s*Injet\s*.*?([\d.,]+)%/i)?.[1] || null
    );

    return result;
  } catch (err) {
    console.error("Erro na extração:", err);
    return result;
  }
}

// Endpoint simples para teste de leitura
app.post("/extract-text", upload.single("pdf"), async (req, res) => {
  try {
    const dataBuffer = fs.readFileSync(req.file.path);
    const pdfData = await pdf(dataBuffer);
    res.json({
      status: "ok",
      tamanho_texto: pdfData.text.length,
      amostra: pdfData.text.substring(0, 300)
    });
    fs.unlinkSync(req.file.path);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint principal – JSON estruturado completo
app.post("/extract-structured", upload.single("pdf"), async (req, res) => {
  try {
    const dataBuffer = fs.readFileSync(req.file.path);
    const pdfData = await pdf(dataBuffer);
    const structured = await extrairCampos(pdfData.text);
    res.json(structured);
    fs.unlinkSync(req.file.path);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});


