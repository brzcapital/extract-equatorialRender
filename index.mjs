import express from "express";
import multer from "multer";
import cors from "cors";
import fs from "fs";

// ✅ Importação corrigida do pdf-parse (evita erro ./test/data/05-versions-space.pdf)
import pkg from "pdf-parse/lib/pdf-parse.js";
const pdfParse = pkg.default || pkg;

const app = express();
app.use(cors());
app.use(express.json());
const upload = multer({ dest: "uploads/" });

// ============================================================
// 🔍 Função principal de extração — Regras consolidadas
// ============================================================
function extrairCampos(texto) {
  const getMatch = (regex, group = 1) => {
    const m = texto.match(regex);
    return m ? m[group].trim() : null;
  };

  const getNumber = (regex) => {
    const val = getMatch(regex);
    if (!val) return 0;
    return parseFloat(val.replace(",", ".").replace(/[^\d.-]/g, "")) || 0;
  };

  const getDate = (regex) => {
    const val = getMatch(regex);
    if (!val) return null;
    const [d, m, y] = val.split("/");
    return y ? `${y}-${m}-${d}` : null;
  };

  const beneficioBruto = getNumber(/Benef[íi]cio Tarif[áa]rio Bruto[\s:]+([\d.,]+)/i);
  let beneficioLiquido = getNumber(/Benef[íi]cio Tarif[áa]rio L[íi]quido[\s:]+(-?[\d.,]+)/i);
  if (beneficioLiquido > 0) beneficioLiquido = beneficioLiquido * -1;

  const injecoes = [];
  const injecaoRegex = /UC\s+(\d{6,12})[^\d]+([\d.,]+)\s*kWh[^\d]+([\d.,]+)[^\d]+([\d.,]+)/gi;
  let inj;
  while ((inj = injecaoRegex.exec(texto)) !== null) {
    injecoes.push({
      uc: inj[1],
      quant_kwh: parseFloat(inj[2].replace(",", ".")),
      preco_unit_com_tributos: parseFloat(inj[3].replace(",", ".")),
      tarifa_unitaria: parseFloat(inj[4].replace(",", "."))
    });
  }

  const infoClienteMatch = texto.match(/INFORMAÇÕES PARA O CLIENTE([\s\S]*?)(A EQUATORIAL|EQUATORIAL ENERGIA)/i);
  const infoCliente = infoClienteMatch ? infoClienteMatch[1].trim() : "";

  const observacoesMatch = texto.match(/OBSERVAÇÕES[:\s]*([\s\S]*?)$/i);
  const observacoes = observacoesMatch ? observacoesMatch[1].trim() : "";

  return {
    unidade_consumidora: getMatch(/N[º°] UC[:\s]*(\d{6,12})/i),
    total_a_pagar: getNumber(/TOTAL A PAGAR[\sR$]*([\d.,]+)/i),
    data_vencimento: getDate(/VENCIMENTO[:\s]*(\d{2}\/\d{2}\/\d{4})/i),
    data_leitura_anterior: getDate(/Leitura Anterior[:\s]*(\d{2}\/\d{2}\/\d{4})/i),
    data_leitura_atual: getDate(/Leitura Atual[:\s]*(\d{2}\/\d{2}\/\d{4})/i),
    data_proxima_leitura: getDate(/Pr[oó]xima Leitura[:\s]*(\d{2}\/\d{2}\/\d{4})/i),
    data_emissao: getDate(/Emiss[aã]o[:\s]*(\d{2}\/\d{2}\/\d{4})/i),
    apresentacao: getDate(/Apresenta[cç][aã]o[:\s]*(\d{2}\/\d{2}\/\d{4})/i),
    mes_ano_referencia: getMatch(/Refer[eê]ncia[:\s]*([A-Z]{3}\/\d{2,4})/i),
    leitura_anterior: getNumber(/Leitura Anterior[:\s]*([\d.,]+)/i),
    leitura_atual: getNumber(/Leitura Atual[:\s]*([\d.,]+)/i),
    beneficio_tarifario_bruto: beneficioBruto,
    beneficio_tarifario_liquido: beneficioLiquido,
    icms: getNumber(/ICMS[:\s]*([\d.,]+)/i),
    pis_pasep: getNumber(/PIS[\s\/-]*PASEP[:\s]*([\d.,]+)/i),
    cofins: getNumber(/COFINS[:\s]*([\d.,]+)/i),
    fatura_debito_automatico: texto.includes("DÉBITO AUTOMÁTICO") ? "yes" : "no",
    credito_recebido: getNumber(/Cr[eé]dito Recebido[:\s]*([\d.,]+)/i),
    saldo_kwh: getNumber(/Saldo[\s\S]*?kWh[:\s]*([\d.,]+)/i),
    excedente_recebido: getNumber(/Excedente Recebido[:\s]*([\d.,]+)/i),
    ciclo_geracao: getMatch(/\((\d{1,2}\/\d{4})\)/i),
    informacoes_para_o_cliente: infoCliente,
    uc_geradora: getMatch(/GERA[CÇ][AÃ]O DO CICLO\s*UC[:\s]*(\d{6,12})/i),
    uc_geradora_producao: getNumber(/UC\s*\d{6,12}\s*[:\-]\s*([\d.,]+)/i),
    cadastro_rateio_geracao_uc: getMatch(/Rateio Gera[cç][aã]o UC[:\s]*(\d+)/i),
    cadastro_rateio_geracao_percentual: getNumber(/Rateio Gera[cç][aã]o UC[\s\S]*?([\d.,]+)%/i),
    injecoes_scee: injecoes,
    consumo_scee_quant: getNumber(/Consumo SCEE[:\s]*([\d.,]+)/i),
    consumo_scee_preco_unit_com_tributos: getNumber(/Consumo SCEE[\s\S]*?Pre[cç]o Unit[^\d]+([\d.,]+)/i),
    consumo_scee_tarifa_unitaria: getNumber(/Consumo SCEE[\s\S]*?(?:Tarifa|Unit)[^\d]+([\d.,]+)/i),
    media: getNumber(/M[eé]dia[:\s]*([\d.,]+)/i),
    parc_injet_s_desc_percentual: getNumber(/Parc[^\d]+([\d.,]+)%/i),
    observacoes: observacoes
  };
}

// ============================================================
// 🧾 Endpoint principal
// ============================================================
app.post("/extract-pdf", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Nenhum arquivo PDF foi enviado." });
    }

    const pdfBuffer = fs.readFileSync(req.file.path);
    const data = await pdfParse(pdfBuffer);
    const texto = data.text.replace(/\s+/g, " ").trim();
    const resultado = extrairCampos(texto);

    fs.unlinkSync(req.file.path);
    res.json(resultado);
  } catch (err) {
    console.error("Erro ao processar PDF:", err);
    res.status(500).json({ error: "Erro ao processar PDF", detalhes: err.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));
