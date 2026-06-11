const VERSION = "v1002";
const OFF_BASE = "https://world.openfoodfacts.org/api/v2/product/";
const FIELDS = [
  "code",
  "product_name",
  "generic_name",
  "brands",
  "quantity",
  "nutriments",
  "ingredients_text",
  "allergens",
  "allergens_tags",
  "image_front_small_url"
].join(",");

const $ = (id) => document.getElementById(id);
const barcodeInput = $("barcodeInput");
const checkBtn = $("checkBtn");
const resultCard = $("resultCard");
const productName = $("productName");
const productMeta = $("productMeta");
const scoreBadge = $("scoreBadge");
const nutritionGrid = $("nutritionGrid");
const ingredientsText = $("ingredientsText");
const allergensText = $("allergensText");
const notFoundBox = $("notFoundBox");
const manualProductCard = $("manualProductCard");
const historyList = $("historyList");
const clearHistoryBtn = $("clearHistoryBtn");

const startScanBtn = $("startScanBtn");
const stopScanBtn = $("stopScanBtn");
const switchCameraBtn = $("switchCameraBtn");

const ocrImageInput = $("ocrImageInput");
const readDigitsBtn = $("readDigitsBtn");
const ocrStatus = $("ocrStatus");
const ocrPreviewWrap = $("ocrPreviewWrap");
const ocrPreview = $("ocrPreview");

const saveManualBtn = $("saveManualBtn");

let html5QrCode = null;
let cameras = [];
let currentCameraIndex = 0;
let lastCode = "";
let selectedOcrImage = null;

function cleanCode(value) {
  return String(value || "").replace(/\D/g, "").trim();
}

function findBarcodeCandidate(text) {
  const digitsOnly = String(text || "").replace(/\D/g, "");
  const groups = String(text || "").match(/\d[\d\s\-]{6,20}\d/g) || [];
  const candidates = [];
  for (const group of groups) {
    const cleaned = cleanCode(group);
    if (cleaned.length >= 8 && cleaned.length <= 14) candidates.push(cleaned);
  }
  for (let len of [13, 14, 12, 8]) {
    if (digitsOnly.length >= len) {
      for (let i = 0; i <= digitsOnly.length - len; i++) {
        candidates.push(digitsOnly.slice(i, i + len));
      }
    }
  }
  return candidates.find((c) => c.length >= 8 && c.length <= 14) || "";
}

function getLocalProducts() {
  try { return JSON.parse(localStorage.getItem("localProducts") || "{}"); }
  catch { return {}; }
}

function setLocalProducts(data) {
  localStorage.setItem("localProducts", JSON.stringify(data));
}

function getHistory() {
  try { return JSON.parse(localStorage.getItem("scanHistory") || "[]"); }
  catch { return []; }
}

function setHistory(items) {
  localStorage.setItem("scanHistory", JSON.stringify(items.slice(0, 20)));
}

function addHistory(product) {
  const code = product.code || lastCode;
  const item = {
    code,
    name: product.product_name || product.name || "Produkt bez nazwy",
    brand: product.brands || product.brand || "",
    date: new Date().toLocaleString("pl-PL")
  };
  const rest = getHistory().filter((x) => x.code !== code);
  setHistory([item, ...rest]);
  renderHistory();
}

function renderHistory() {
  const items = getHistory();
  historyList.innerHTML = "";
  if (!items.length) {
    historyList.innerHTML = `<p class="hint">Brak ostatnich skanów.</p>`;
    return;
  }
  for (const item of items) {
    const el = document.createElement("div");
    el.className = "history-item";
    el.innerHTML = `<strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.brand || "")} • ${escapeHtml(item.code)} • ${escapeHtml(item.date)}</span>`;
    el.addEventListener("click", () => {
      barcodeInput.value = item.code;
      lookupProduct(item.code);
    });
    historyList.appendChild(el);
  }
}

function escapeHtml(text) {
  return String(text || "").replace(/[&<>'"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#039;","\"":"&quot;"}[c]));
}

function n(nutriments, key) {
  const value = nutriments?.[key];
  if (value === undefined || value === null || value === "") return null;
  return Number(value);
}

function fmt(value, unit = "g") {
  if (value === null || Number.isNaN(value)) return "brak";
  return `${String(Math.round(value * 100) / 100).replace(".", ",")} ${unit}`;
}

function scoreProduct(nutriments) {
  let score = 10;
  const kcal = n(nutriments, "energy-kcal_100g");
  const sugars = n(nutriments, "sugars_100g");
  const salt = n(nutriments, "salt_100g");
  const satFat = n(nutriments, "saturated-fat_100g");
  const fiber = n(nutriments, "fiber_100g");
  const protein = n(nutriments, "proteins_100g");

  if (kcal !== null && kcal > 450) score -= 2;
  else if (kcal !== null && kcal > 300) score -= 1;
  if (sugars !== null && sugars > 22.5) score -= 2;
  else if (sugars !== null && sugars > 10) score -= 1;
  if (salt !== null && salt > 1.5) score -= 2;
  else if (salt !== null && salt > 0.8) score -= 1;
  if (satFat !== null && satFat > 5) score -= 1;
  if (fiber !== null && fiber >= 3) score += 1;
  if (protein !== null && protein >= 10) score += 1;
  return Math.max(1, Math.min(10, score));
}

function normalizeProductFromManual(code) {
  return {
    code,
    product_name: $("manualName").value.trim() || "Produkt własny",
    brands: $("manualBrand").value.trim(),
    ingredients_text: $("manualIngredients").value.trim(),
    allergens: "",
    nutriments: {
      "energy-kcal_100g": parseNumber($("manualKcal").value),
      "fat_100g": parseNumber($("manualFat").value),
      "carbohydrates_100g": parseNumber($("manualCarbs").value),
      "sugars_100g": parseNumber($("manualSugars").value),
      "fiber_100g": parseNumber($("manualFiber").value),
      "proteins_100g": parseNumber($("manualProtein").value),
      "salt_100g": parseNumber($("manualSalt").value)
    },
    source: "local"
  };
}

function parseNumber(value) {
  const cleaned = String(value || "").replace(",", ".").replace(/[^0-9.\-]/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function renderProduct(product, source = "online") {
  resultCard.classList.remove("hidden");
  manualProductCard.classList.add("hidden");
  notFoundBox.classList.add("hidden");

  const nutriments = product.nutriments || {};
  const score = scoreProduct(nutriments);
  productName.textContent = product.product_name || product.generic_name || "Produkt bez nazwy";
  productMeta.textContent = `${product.brands || "brak marki"} • kod: ${product.code || lastCode} • ${source === "local" ? "baza lokalna" : "Open Food Facts"}`;
  scoreBadge.textContent = `${score}/10`;
  scoreBadge.style.borderColor = score >= 7 ? "#bbf7d0" : score >= 4 ? "#fde68a" : "#fecaca";
  scoreBadge.style.background = score >= 7 ? "#f0fdf4" : score >= 4 ? "#fffbeb" : "#fef2f2";

  const items = [
    ["Kalorie", fmt(n(nutriments, "energy-kcal_100g"), "kcal")],
    ["Tłuszcz", fmt(n(nutriments, "fat_100g"))],
    ["Kwasy nasycone", fmt(n(nutriments, "saturated-fat_100g"))],
    ["Węglowodany", fmt(n(nutriments, "carbohydrates_100g"))],
    ["Cukry", fmt(n(nutriments, "sugars_100g"))],
    ["Błonnik", fmt(n(nutriments, "fiber_100g"))],
    ["Białko", fmt(n(nutriments, "proteins_100g"))],
    ["Sól", fmt(n(nutriments, "salt_100g"))]
  ];

  nutritionGrid.innerHTML = items.map(([label, value]) => `<div class="nutrition-item"><span>${label}</span><strong>${value}</strong></div>`).join("");
  ingredientsText.textContent = product.ingredients_text || "brak danych";
  allergensText.textContent = product.allergens || (product.allergens_tags || []).join(", ") || "brak danych";
  addHistory(product);
  resultCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderNotFound(code) {
  resultCard.classList.remove("hidden");
  notFoundBox.classList.remove("hidden");
  manualProductCard.classList.remove("hidden");
  productName.textContent = "Nie znaleziono produktu";
  productMeta.textContent = `kod: ${code}`;
  scoreBadge.textContent = "-";
  nutritionGrid.innerHTML = "";
  ingredientsText.textContent = "brak danych";
  allergensText.textContent = "brak danych";
  resultCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function lookupProduct(rawCode) {
  const code = cleanCode(rawCode);
  if (!code || code.length < 8) {
    alert("Wpisz lub odczytaj poprawny kod EAN. Kod ma zwykle 8–14 cyfr.");
    return;
  }
  lastCode = code;
  barcodeInput.value = code;
  checkBtn.disabled = true;
  checkBtn.textContent = "Sprawdzam...";

  try {
    const local = getLocalProducts();
    if (local[code]) {
      renderProduct(local[code], "local");
      return;
    }

    const url = `${OFF_BASE}${encodeURIComponent(code)}.json?fields=${FIELDS}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Błąd pobierania danych");
    const data = await res.json();
    if (data.status === 1 && data.product) {
      renderProduct({ ...data.product, code }, "online");
    } else {
      renderNotFound(code);
    }
  } catch (err) {
    console.error(err);
    alert("Nie udało się pobrać danych. Sprawdź internet albo wpisz produkt ręcznie.");
  } finally {
    checkBtn.disabled = false;
    checkBtn.textContent = "Sprawdź";
  }
}

async function startScanner() {
  if (!window.Html5Qrcode) {
    alert("Biblioteka skanera nie załadowała się. Spróbuj odświeżyć stronę.");
    return;
  }
  try {
    if (!html5QrCode) html5QrCode = new Html5Qrcode("reader", { verbose: false });
    cameras = await Html5Qrcode.getCameras();
    if (!cameras.length) {
      alert("Nie znaleziono kamery.");
      return;
    }
    const cameraId = cameras[currentCameraIndex]?.id || cameras[0].id;
    startScanBtn.disabled = true;
    stopScanBtn.disabled = false;
    switchCameraBtn.disabled = cameras.length < 2;

    await html5QrCode.start(
      cameraId,
      {
        fps: 18,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const width = Math.floor(viewfinderWidth * 0.9);
          const height = Math.floor(Math.min(viewfinderHeight * 0.45, 240));
          return { width, height };
        },
        aspectRatio: 1.777,
        disableFlip: false,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39
        ]
      },
      async (decodedText) => {
        const code = cleanCode(decodedText);
        if (code.length >= 8) {
          await stopScanner();
          lookupProduct(code);
        }
      },
      () => {}
    );
  } catch (err) {
    console.error(err);
    alert("Nie udało się uruchomić kamery. Na komputerze użyj wpisania kodu albo zdjęcia cyfr.");
    startScanBtn.disabled = false;
    stopScanBtn.disabled = true;
  }
}

async function stopScanner() {
  try {
    if (html5QrCode && html5QrCode.isScanning) await html5QrCode.stop();
  } catch (err) { console.warn(err); }
  startScanBtn.disabled = false;
  stopScanBtn.disabled = true;
  switchCameraBtn.disabled = true;
}

async function switchCamera() {
  if (!cameras.length) return;
  await stopScanner();
  currentCameraIndex = (currentCameraIndex + 1) % cameras.length;
  await startScanner();
}

async function readDigitsFromImage() {
  if (!selectedOcrImage) return;
  if (!window.Tesseract) {
    alert("Biblioteka OCR nie załadowała się. Odśwież stronę i spróbuj ponownie.");
    return;
  }
  readDigitsBtn.disabled = true;
  ocrStatus.textContent = "Odczytuję cyfry... To może potrwać kilka sekund.";
  try {
    const result = await Tesseract.recognize(selectedOcrImage, "eng", {
      logger: (m) => {
        if (m.status === "recognizing text") {
          ocrStatus.textContent = `Odczytuję cyfry... ${Math.round((m.progress || 0) * 100)}%`;
        }
      }
    });
    const text = result?.data?.text || "";
    const code = findBarcodeCandidate(text);
    if (code) {
      ocrStatus.textContent = `Odczytano kod: ${code}`;
      barcodeInput.value = code;
      lookupProduct(code);
    } else {
      ocrStatus.textContent = "Nie udało się odczytać kodu. Przytnij zdjęcie bliżej samych cyfr albo wpisz kod ręcznie.";
    }
  } catch (err) {
    console.error(err);
    ocrStatus.textContent = "Błąd OCR. Spróbuj zrobić ostrzejsze zdjęcie cyfr.";
  } finally {
    readDigitsBtn.disabled = false;
  }
}

checkBtn.addEventListener("click", () => lookupProduct(barcodeInput.value));
barcodeInput.addEventListener("keydown", (e) => { if (e.key === "Enter") lookupProduct(barcodeInput.value); });
startScanBtn.addEventListener("click", startScanner);
stopScanBtn.addEventListener("click", stopScanner);
switchCameraBtn.addEventListener("click", switchCamera);

ocrImageInput.addEventListener("change", () => {
  const file = ocrImageInput.files?.[0];
  selectedOcrImage = file || null;
  readDigitsBtn.disabled = !file;
  ocrStatus.textContent = file ? "Zdjęcie gotowe. Kliknij: Odczytaj cyfry ze zdjęcia." : "";
  if (file) {
    const url = URL.createObjectURL(file);
    ocrPreview.src = url;
    ocrPreviewWrap.classList.remove("hidden");
  } else {
    ocrPreviewWrap.classList.add("hidden");
  }
});
readDigitsBtn.addEventListener("click", readDigitsFromImage);

saveManualBtn.addEventListener("click", () => {
  const code = cleanCode(barcodeInput.value || lastCode);
  if (!code) {
    alert("Najpierw wpisz kod produktu.");
    return;
  }
  const product = normalizeProductFromManual(code);
  const local = getLocalProducts();
  local[code] = product;
  setLocalProducts(local);
  renderProduct(product, "local");
  alert("Produkt zapisany lokalnie w tej przeglądarce.");
});

clearHistoryBtn.addEventListener("click", () => {
  if (confirm("Wyczyścić historię skanów?")) {
    setHistory([]);
    renderHistory();
  }
});

// Service worker wyłączony w wersji czyszczącej, żeby przeglądarka nie trzymała starych plików.
renderHistory();
