const VERSION = "SKANER PRODUKTÓW v1001";
const API_BASE = "https://world.openfoodfacts.org/api/v2/product/";
const API_FIELDS = [
  "code",
  "product_name",
  "brands",
  "image_front_small_url",
  "nutriments",
  "ingredients_text_pl",
  "ingredients_text",
  "allergens",
  "allergens_tags",
  "nutriscore_grade"
].join(",");

const startScanBtn = document.getElementById("startScanBtn");
const stopScanBtn = document.getElementById("stopScanBtn");
const searchBtn = document.getElementById("searchBtn");
const barcodeInput = document.getElementById("barcodeInput");
const statusEl = document.getElementById("status");
const readerWrap = document.getElementById("readerWrap");
const resultCard = document.getElementById("resultCard");
const productImage = document.getElementById("productImage");
const productName = document.getElementById("productName");
const productBrand = document.getElementById("productBrand");
const productCode = document.getElementById("productCode");
const nutritionGrid = document.getElementById("nutritionGrid");
const ingredientsText = document.getElementById("ingredientsText");
const allergensText = document.getElementById("allergensText");
const ratingBox = document.getElementById("ratingBox");
const historyList = document.getElementById("historyList");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");
const connectionBadge = document.getElementById("connectionBadge");
const switchCameraBtn = document.getElementById("switchCameraBtn");
const torchBtn = document.getElementById("torchBtn");
const barcodeFile = document.getElementById("barcodeFile");

let html5QrCode = null;
let isScanning = false;
let availableCameras = [];
let currentCameraIndex = 0;
let currentTrack = null;
let torchEnabled = false;

const nutritionMap = [
  ["Energia", "energy-kcal_100g", "kcal"],
  ["Tłuszcz", "fat_100g", "g"],
  ["Kwasy nasycone", "saturated-fat_100g", "g"],
  ["Węglowodany", "carbohydrates_100g", "g"],
  ["Cukry", "sugars_100g", "g"],
  ["Błonnik", "fiber_100g", "g"],
  ["Białko", "proteins_100g", "g"],
  ["Sól", "salt_100g", "g"]
];

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#d64545" : "#66746b";
}

function sanitizeBarcode(value) {
  return String(value || "").replace(/[^0-9]/g, "").trim();
}

function formatValue(value, unit) {
  if (value === undefined || value === null || value === "") return "brak";
  const number = Number(value);
  if (Number.isFinite(number)) {
    return `${String(Math.round(number * 100) / 100).replace(".", ",")} ${unit}`;
  }
  return `${value} ${unit}`;
}

function updateConnectionBadge() {
  if (navigator.onLine) {
    connectionBadge.textContent = "ONLINE";
    connectionBadge.classList.remove("offline");
  } else {
    connectionBadge.textContent = "OFFLINE";
    connectionBadge.classList.add("offline");
  }
}

async function fetchProduct(barcode) {
  const cleanCode = sanitizeBarcode(barcode);
  if (!cleanCode || cleanCode.length < 8) {
    setStatus("Wpisz poprawny kod kreskowy. Kod powinien mieć minimum 8 cyfr.", true);
    return;
  }

  barcodeInput.value = cleanCode;
  setStatus("Szukam produktu w Open Food Facts...");

  try {
    const url = `${API_BASE}${encodeURIComponent(cleanCode)}.json?fields=${encodeURIComponent(API_FIELDS)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Błąd API: ${response.status}`);

    const data = await response.json();
    if (!data || data.status !== 1 || !data.product) {
      resultCard.classList.add("hidden");
      setStatus("Nie znaleziono produktu. W kolejnej wersji dodamy ręczne dopisywanie do własnej bazy.", true);
      return;
    }

    showProduct(data.product, cleanCode);
    saveToHistory(data.product, cleanCode);
    renderHistory();
    setStatus("Produkt znaleziony.");
  } catch (error) {
    console.error(error);
    setStatus("Nie udało się pobrać danych. Sprawdź internet albo spróbuj później.", true);
  }
}

function showProduct(product, barcode) {
  const name = product.product_name || "Produkt bez nazwy";
  const brand = product.brands || "Marka nieznana";

  productName.textContent = name;
  productBrand.textContent = brand;
  productCode.textContent = `Kod: ${barcode}`;

  if (product.image_front_small_url) {
    productImage.src = product.image_front_small_url;
    productImage.classList.remove("hidden");
  } else {
    productImage.classList.add("hidden");
  }

  nutritionGrid.innerHTML = "";
  const nutriments = product.nutriments || {};
  nutritionMap.forEach(([label, key, unit]) => {
    const item = document.createElement("div");
    item.className = "nutrition-item";
    item.innerHTML = `<span>${label}</span><strong>${formatValue(nutriments[key], unit)}</strong>`;
    nutritionGrid.appendChild(item);
  });

  ingredientsText.textContent = product.ingredients_text_pl || product.ingredients_text || "Brak danych.";
  allergensText.textContent = formatAllergens(product);
  renderRating(product);
  resultCard.classList.remove("hidden");
}

function formatAllergens(product) {
  if (product.allergens) return product.allergens.replaceAll("en:", "").replaceAll(",", ", ");
  if (Array.isArray(product.allergens_tags) && product.allergens_tags.length) {
    return product.allergens_tags.map(a => a.replace("en:", "")).join(", ");
  }
  return "Brak danych.";
}

function renderRating(product) {
  const n = product.nutriments || {};
  const sugar = Number(n["sugars_100g"]);
  const salt = Number(n["salt_100g"]);
  const saturated = Number(n["saturated-fat_100g"]);
  const fiber = Number(n["fiber_100g"]);
  const protein = Number(n["proteins_100g"]);

  let points = 5;
  const notes = [];

  if (Number.isFinite(sugar)) {
    if (sugar > 15) { points -= 2; notes.push("dużo cukru"); }
    else if (sugar > 7) { points -= 1; notes.push("średnio cukru"); }
    else { points += 1; notes.push("mało cukru"); }
  }

  if (Number.isFinite(salt)) {
    if (salt > 1.5) { points -= 2; notes.push("dużo soli"); }
    else if (salt > 0.7) { points -= 1; notes.push("średnio soli"); }
    else { points += 1; notes.push("mało soli"); }
  }

  if (Number.isFinite(saturated) && saturated > 5) {
    points -= 1;
    notes.push("więcej tłuszczów nasyconych");
  }

  if (Number.isFinite(fiber) && fiber >= 3) {
    points += 1;
    notes.push("dobry błonnik");
  }

  if (Number.isFinite(protein) && protein >= 10) {
    points += 1;
    notes.push("sporo białka");
  }

  points = Math.max(1, Math.min(10, points));

  let label = "Średni wybór";
  let className = "rating-mid";
  if (points >= 8) { label = "Dobry wybór"; className = "rating-good"; }
  if (points <= 4) { label = "Słaby wybór"; className = "rating-bad"; }

  ratingBox.className = `rating-box ${className}`;
  ratingBox.textContent = `Ocena uproszczona: ${points}/10 — ${label}${notes.length ? " — " + notes.join(", ") : ""}`;
}

async function startScanner() {
  if (isScanning) return;
  if (typeof Html5Qrcode === "undefined") {
    setStatus("Nie udało się załadować skanera. Sprawdź internet albo wpisz kod ręcznie.", true);
    return;
  }

  readerWrap.classList.remove("hidden");
  startScanBtn.classList.add("hidden");
  stopScanBtn.classList.remove("hidden");
  switchCameraBtn.classList.add("hidden");
  torchBtn.classList.add("hidden");
  setStatus("Uruchamiam aparat...");

  try {
    availableCameras = await Html5Qrcode.getCameras();
  } catch (error) {
    console.warn("Nie udało się pobrać listy kamer", error);
    availableCameras = [];
  }

  const cameraConfig = getCameraConfig();
  html5QrCode = new Html5Qrcode("reader", {
    formatsToSupport: [
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.CODE_39
    ],
    verbose: false,
    experimentalFeatures: {
      useBarCodeDetectorIfSupported: true
    }
  });

  const config = {
    fps: 18,
    qrbox: calculateQrbox,
    aspectRatio: 1.7777778,
    disableFlip: true,
    rememberLastUsedCamera: true,
    videoConstraints: {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      focusMode: "continuous"
    }
  };

  try {
    await html5QrCode.start(
      cameraConfig,
      config,
      async (decodedText) => {
        const code = sanitizeBarcode(decodedText);
        if (code) {
          await stopScanner(false);
          await fetchProduct(code);
        }
      },
      () => {}
    );
    isScanning = true;
    switchCameraBtn.classList.toggle("hidden", availableCameras.length < 2);
    setStatus("Skaner działa. Powoli przybliż/oddal kod, aż będzie ostry i dobrze oświetlony.");
    prepareTorchButton();
  } catch (error) {
    console.error(error);
    await stopScanner(false);
    setStatus("Nie udało się uruchomić aparatu. Użyj HTTPS i pozwól stronie na dostęp do kamery albo wpisz kod ręcznie.", true);
  }
}

function getCameraConfig() {
  if (availableCameras.length) {
    currentCameraIndex = Math.min(currentCameraIndex, availableCameras.length - 1);
    return availableCameras[currentCameraIndex].id;
  }
  return { facingMode: "environment" };
}

function calculateQrbox(viewfinderWidth, viewfinderHeight) {
  const width = Math.floor(Math.min(viewfinderWidth * 0.92, 620));
  const height = Math.floor(Math.min(viewfinderHeight * 0.42, 260));
  return { width: Math.max(width, 260), height: Math.max(height, 120) };
}

async function switchCamera() {
  if (availableCameras.length < 2) return;
  currentCameraIndex = (currentCameraIndex + 1) % availableCameras.length;
  await stopScanner(false);
  await startScanner();
}

async function prepareTorchButton() {
  torchEnabled = false;
  torchBtn.textContent = "Latarka";
  torchBtn.classList.add("hidden");
  try {
    const stream = html5QrCode?.getRunningTrackSettings ? null : null;
    const video = document.querySelector("#reader video");
    currentTrack = video?.srcObject?.getVideoTracks?.()[0] || null;
    const capabilities = currentTrack?.getCapabilities?.();
    if (capabilities && capabilities.torch) {
      torchBtn.classList.remove("hidden");
    }
  } catch (error) {
    console.warn("Latarka niedostępna", error);
  }
}

async function toggleTorch() {
  if (!currentTrack) return;
  try {
    torchEnabled = !torchEnabled;
    await currentTrack.applyConstraints({ advanced: [{ torch: torchEnabled }] });
    torchBtn.textContent = torchEnabled ? "Zgaś latarkę" : "Latarka";
  } catch (error) {
    console.warn(error);
    setStatus("Ta kamera nie pozwala sterować latarką.", true);
  }
}

async function scanImageFile(file) {
  if (!file) return;
  if (typeof Html5Qrcode === "undefined") {
    setStatus("Nie udało się załadować czytnika. Wpisz kod ręcznie.", true);
    return;
  }
  if (isScanning) await stopScanner(false);
  setStatus("Odczytuję kod ze zdjęcia...");
  const scanner = new Html5Qrcode("reader");
  readerWrap.classList.remove("hidden");
  try {
    const decodedText = await scanner.scanFile(file, true);
    const code = sanitizeBarcode(decodedText);
    if (!code) throw new Error("Brak kodu na zdjęciu");
    await scanner.clear();
    await fetchProduct(code);
  } catch (error) {
    console.error(error);
    try { await scanner.clear(); } catch {}
    setStatus("Nie udało się odczytać kodu ze zdjęcia. Zrób zdjęcie ostrzej i bliżej kodu albo wpisz kod ręcznie.", true);
  }
}

async function stopScanner(message = true) {
  if (html5QrCode && isScanning) {
    try {
      await html5QrCode.stop();
      await html5QrCode.clear();
    } catch (error) {
      console.warn(error);
    }
  }
  html5QrCode = null;
  currentTrack = null;
  torchEnabled = false;
  isScanning = false;
  readerWrap.classList.add("hidden");
  startScanBtn.classList.remove("hidden");
  stopScanBtn.classList.add("hidden");
  switchCameraBtn.classList.add("hidden");
  torchBtn.classList.add("hidden");
  if (message) setStatus("Skaner zatrzymany.");
}

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem("productScannerHistory") || "[]");
  } catch {
    return [];
  }
}

function saveToHistory(product, barcode) {
  const history = getHistory().filter(item => item.code !== barcode);
  history.unshift({
    code: barcode,
    name: product.product_name || "Produkt bez nazwy",
    brand: product.brands || "",
    date: new Date().toISOString()
  });
  localStorage.setItem("productScannerHistory", JSON.stringify(history.slice(0, 10)));
}

function renderHistory() {
  const history = getHistory();
  if (!history.length) {
    historyList.className = "history-list empty";
    historyList.textContent = "Brak historii.";
    return;
  }

  historyList.className = "history-list";
  historyList.innerHTML = "";
  history.forEach(item => {
    const row = document.createElement("div");
    row.className = "history-item";
    const left = document.createElement("div");
    left.innerHTML = `<strong>${escapeHtml(item.name)}</strong><br><span class="muted">${escapeHtml(item.brand || "")}${item.brand ? " · " : ""}${escapeHtml(item.code)}</span>`;
    const btn = document.createElement("button");
    btn.className = "small-btn";
    btn.textContent = "Pokaż";
    btn.addEventListener("click", () => fetchProduct(item.code));
    row.appendChild(left);
    row.appendChild(btn);
    historyList.appendChild(row);
  });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = String(text || "");
  return div.innerHTML;
}

startScanBtn.addEventListener("click", startScanner);
stopScanBtn.addEventListener("click", () => stopScanner(true));
switchCameraBtn.addEventListener("click", switchCamera);
torchBtn.addEventListener("click", toggleTorch);
barcodeFile.addEventListener("change", (event) => scanImageFile(event.target.files?.[0]));
searchBtn.addEventListener("click", () => fetchProduct(barcodeInput.value));
barcodeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") fetchProduct(barcodeInput.value);
});
clearHistoryBtn.addEventListener("click", () => {
  localStorage.removeItem("productScannerHistory");
  renderHistory();
});

window.addEventListener("online", updateConnectionBadge);
window.addEventListener("offline", updateConnectionBadge);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(console.warn);
  });
}

updateConnectionBadge();
renderHistory();
