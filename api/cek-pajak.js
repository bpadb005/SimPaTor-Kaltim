const cheerio = require("cheerio");

const SIMPATOR_URL = "http://simpator.kaltimprov.go.id/cari.php";

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function value($, id) {
  return clean($(`#${id}`).attr("value") || "");
}

function parseResponse(html) {
  const $ = cheerio.load(html);

  const data = {
    nopol: value($, "nopol"),
    kodeBayar: value($, "kode"),
    namaPemilik: value($, "nama"),
    alamatPemilik: value($, "alamat"),
    merek: value($, "merk"),
    tipe: value($, "tipe"),
    tahunRakitan: value($, "thn"),
    kepemilikan: value($, "milik"),
    nomorRangka: value($, "noka"),
    nomorMesin: value($, "nosin"),
    masaPajak: value($, "tg_pkb"),
    masaBerlakuStnk: value($, "tg_stnk"),
    biaya: {
      pkbPokok: value($, "pkb_pok"),
      pkbDenda: value($, "pkb_den"),
      swdklljPokok: value($, "swd_pok"),
      swdklljDenda: value($, "swd_den"),
      pnbpStnk: value($, "pnbp"),
      pnbpPlat: value($, "tnkb"),
      total: value($, "total")
    }
  };

  if (!(data.nopol || data.merek || data.tipe || data.masaPajak || data.biaya.total)) {
    throw new Error("Data kendaraan tidak ditemukan atau respons SimPaTor berubah.");
  }

  return data;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, message: "Method tidak diizinkan." });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const nomor = clean(body.nomor);
    const seri = clean(body.seri).toUpperCase();

    if (!/^\d{1,4}$/.test(nomor)) {
      res.status(400).json({ ok: false, message: "Nomor polisi harus 1-4 digit." });
      return;
    }

    if (!/^[A-Z]{1,3}$/.test(seri)) {
      res.status(400).json({ ok: false, message: "Seri belakang harus 1-3 huruf." });
      return;
    }

    const form = new URLSearchParams({
      kt: "KT",
      nomor,
      seri,
      pkb: "Process"
    });

    const upstream = await fetch(SIMPATOR_URL, {
      method: "POST",
      headers: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": "http://simpator.kaltimprov.go.id",
        "Referer": SIMPATOR_URL,
        "User-Agent": "Mozilla/5.0 (compatible; KaltimPajakChecker/1.0)"
      },
      body: form.toString(),
      redirect: "follow"
    });

    if (!upstream.ok) {
      throw new Error(`SimPaTor mengembalikan HTTP ${upstream.status}.`);
    }

    const html = await upstream.text();
    const data = parseResponse(html);

    res.status(200).json({
      ok: true,
      source: "SimPaTor Bapenda Kaltim",
      checkedAt: new Date().toISOString(),
      data
    });
  } catch (error) {
    console.error(error);
    res.status(502).json({
      ok: false,
      message: error.message || "Gagal mengambil data dari SimPaTor."
    });
  }
};