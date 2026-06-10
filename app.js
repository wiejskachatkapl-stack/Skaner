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
let currentProductForAnalysis = null;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#cc4455" : "#5f6d64";
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
      setStatus("Nie znaleziono produktu w bazie.", true);
      return;
    }

    const storedProduct = buildStoredProduct(data.product, cleanCode);
    currentProductForAnalysis = storedProduct;
    showProduct(storedProduct);
    saveToHistory(storedProduct);
    saveToCatalog(storedProduct);
    renderHistory();
    setStatus("Produkt znaleziony i zapisany do spiżarni.");
  } catch (error) {
    console.error(error);
    setStatus("Nie udało się pobrać danych. Sprawdź internet albo spróbuj później.", true);
  }
}

function showProduct(item) {
  productName.textContent = item.name;
  productBrand.textContent = item.brand;
  productCode.textContent = `Kod: ${item.code}`;

  if (item.image) {
    productImage.src = item.image;
    productImage.onerror = () => { productImage.src = PLACEHOLDER_IMAGE; };
    productImage.classList.remove("hidden");
  } else {
    productImage.src = PLACEHOLDER_IMAGE;
    productImage.classList.remove("hidden");
  }

  nutritionGrid.innerHTML = "";
  const nutriments = item.nutriments || {};
  nutritionMap.forEach(([label, key, unit]) => {
    const card = document.createElement("div");
    card.className = "nutrition-item";
    card.innerHTML = `<span>${label}</span><strong>${formatValue(nutriments[key], unit)}</strong>`;
    nutritionGrid.appendChild(card);
  });

  ingredientsText.textContent = item.ingredients || "Brak danych.";
  allergensText.textContent = item.allergens || "Brak danych.";
  ratingBox.className = `rating-box rating-click ${item.rating.className}`;
  ratingBox.setAttribute("role", "button");
  ratingBox.setAttribute("tabindex", "0");
  ratingBox.title = "Kliknij, aby zobaczyć szczegółową ocenę";
  ratingBox.textContent = `Ocena uproszczona: ${item.rating.points}/10 — ${item.rating.label}. Kliknij po szczegóły.`;
  resultCard.classList.remove("hidden");
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
    experimentalFeatures: { useBarCodeDetectorIfSupported: true }
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
      getCameraConfig(),
      config,
      async decodedText => {
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
    setStatus("Skaner działa. Kamera uruchomiona mechanizmem z wcześniejszej stabilnej wersji.");
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

function renderHistory() {
  const history = getHistory();
  if (!history.length) {
    historyList.className = "history-list empty";
    historyList.textContent = "Brak historii.";
    return;
  }

  historyList.className = "history-list";
  historyList.innerHTML = history.map(item => `
    <div class="history-item">
      <div class="history-thumb"><img src="${escapeHtml(item.image || PLACEHOLDER_IMAGE)}" alt="${escapeHtml(item.name)}" onerror="this.src='${PLACEHOLDER_IMAGE}'" /></div>
      <div class="history-info">
        <strong>${escapeHtml(item.name)}</strong>
        <span class="muted">${escapeHtml(item.brand || '')} · ${escapeHtml(item.code)}</span>
        <small class="muted">Ocena: ${escapeHtml(ratingText(item.rating || { points: 5, label: 'Średni wybór' }))}</small>
      </div>
      <button class="small-btn history-show" data-code="${escapeHtml(item.code)}">Pokaż</button>
    </div>
  `).join("");

  historyList.querySelectorAll(".history-show").forEach(btn => {
    btn.addEventListener("click", () => fetchProduct(btn.dataset.code));
  });
}

startScanBtn.addEventListener("click", startScanner);
stopScanBtn.addEventListener("click", () => stopScanner(true));
switchCameraBtn.addEventListener("click", switchCamera);
torchBtn.addEventListener("click", toggleTorch);
barcodeFile.addEventListener("change", event => scanImageFile(event.target.files?.[0]));
searchBtn.addEventListener("click", () => fetchProduct(barcodeInput.value));
barcodeInput.addEventListener("keydown", event => {
  if (event.key === "Enter") fetchProduct(barcodeInput.value);
});
clearHistoryBtn.addEventListener("click", () => {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
});

ratingBox.addEventListener("click", () => {
  if (currentProductForAnalysis) openAnalysisModal(currentProductForAnalysis);
});
ratingBox.addEventListener("keydown", event => {
  if ((event.key === "Enter" || event.key === " ") && currentProductForAnalysis) {
    event.preventDefault();
    openAnalysisModal(currentProductForAnalysis);
  }
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
