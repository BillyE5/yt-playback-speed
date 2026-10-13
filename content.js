// YouTube 超高速播放控制
// 在影片播放器附近顯示一個小面板,可切換預設倍速、微調倍速,並記住上次選擇的速度。

(function () {
  const PRESETS = [1, 1.5, 2, 2.5, 3, 3.5, 4];
  const MIN_SPEED = 0.25;
  const MAX_SPEED = 16; // 瀏覽器實際上限,可自行調整
  const STEP = 0.25;
  const STORAGE_KEY = "ytSpeedExt_lastSpeed";
  const POS_KEY = "ytSpeedExt_panelPos";

  let currentVideo = null;
  let panelEl = null;
  let savedPos = null; // 拖曳後的面板位置 {left, top};null 表示嵌在頂端列

  function getStored(cb) {
    try {
      chrome.storage.local.get([STORAGE_KEY, POS_KEY], (res) =>
        cb(res[STORAGE_KEY] || 1, res[POS_KEY] || null)
      );
    } catch (e) {
      cb(1, null);
    }
  }

  function setStored(key, value) {
    try {
      if (value === null) chrome.storage.local.remove(key);
      else chrome.storage.local.set({ [key]: value });
    } catch (e) {
      /* ignore */
    }
  }

  function clamp(speed) {
    return Math.min(Math.max(speed, MIN_SPEED), MAX_SPEED);
  }

  function applySpeed(video, speed) {
    if (!video) return;
    video.playbackRate = speed;
  }

  function updateLabel(speed) {
    if (!panelEl) return;
    const label = panelEl.querySelector(".yts-label");
    if (label) label.textContent = speed.toFixed(2).replace(/\.00$/, "") + "x";
    panelEl.querySelectorAll("button[data-speed]").forEach((btn) => {
      btn.classList.toggle("yts-active", parseFloat(btn.dataset.speed) === speed);
    });
  }

  function setSpeed(video, speed) {
    speed = clamp(Math.round(speed / STEP) * STEP);
    applySpeed(video, speed);
    setStored(STORAGE_KEY, speed);
    updateLabel(speed);
  }

  function changeSpeed(video, delta) {
    setSpeed(video, video.playbackRate + delta);
  }

  function buildPanel(video) {
    if (panelEl) panelEl.remove();

    panelEl = document.createElement("div");
    panelEl.id = "yts-panel";

    const minus = document.createElement("button");
    minus.textContent = "−";
    minus.title = "減慢 0.25x (Alt+,)";
    minus.addEventListener("click", () => changeSpeed(video, -STEP));
    panelEl.appendChild(minus);

    const label = document.createElement("span");
    label.className = "yts-label";
    panelEl.appendChild(label);

    const plus = document.createElement("button");
    plus.textContent = "+";
    plus.title = "加快 0.25x (Alt+.)";
    plus.addEventListener("click", () => changeSpeed(video, STEP));
    panelEl.appendChild(plus);

    const presetWrap = document.createElement("div");
    presetWrap.className = "yts-presets";
    PRESETS.forEach((s) => {
      const btn = document.createElement("button");
      btn.textContent = s + "x";
      btn.dataset.speed = s;
      btn.addEventListener("click", () => setSpeed(video, s));
      presetWrap.appendChild(btn);
    });
    panelEl.appendChild(presetWrap);

    if (savedPos) floatAt(panelEl, savedPos.left, savedPos.top);
    else mountPanel();
    makeDraggable(panelEl);
    updateLabel(video.playbackRate);
  }

  // 預設嵌進 YouTube 頂端列(搜尋框與右側按鈕之間),拖曳後改為浮動
  function mountPanel() {
    if (!panelEl.classList.contains("yts-floating")) {
      const end = document.querySelector("ytd-masthead #end");
      if (end) {
        if (panelEl.parentElement !== end) end.prepend(panelEl);
        panelEl.classList.add("yts-docked");
        return;
      }
    }
    if (!document.body.contains(panelEl)) document.body.appendChild(panelEl);
  }

  // 改為浮動並放到指定位置,確保不會跑出視窗外
  function floatAt(el, left, top) {
    el.classList.remove("yts-docked");
    el.classList.add("yts-floating");
    if (!document.body.contains(el) || el.parentElement !== document.body) document.body.appendChild(el);
    const maxLeft = Math.max(0, window.innerWidth - el.offsetWidth);
    const maxTop = Math.max(0, window.innerHeight - el.offsetHeight);
    el.style.left = Math.min(Math.max(left, 0), maxLeft) + "px";
    el.style.top = Math.min(Math.max(top, 0), maxTop) + "px";
    el.style.right = "auto";
  }

  function undock(el) {
    if (!el.classList.contains("yts-docked")) return;
    const rect = el.getBoundingClientRect();
    floatAt(el, rect.left, rect.top);
  }

  // 雙擊面板空白處:放回頂端列,並清除記住的位置
  function redock(el) {
    el.classList.remove("yts-floating");
    el.style.left = el.style.top = el.style.right = "";
    savedPos = null;
    setStored(POS_KEY, null);
    mountPanel();
  }

  function makeDraggable(el) {
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;
    el.addEventListener("mousedown", (e) => {
      if (e.target.tagName === "BUTTON") return;
      undock(el);
      dragging = true;
      const rect = el.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      e.preventDefault();
    });
    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      el.style.left = e.clientX - offsetX + "px";
      el.style.top = e.clientY - offsetY + "px";
      el.style.right = "auto";
    });
    document.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      savedPos = { left: parseFloat(el.style.left), top: parseFloat(el.style.top) };
      setStored(POS_KEY, savedPos);
    });
    el.addEventListener("dblclick", (e) => {
      if (e.target.tagName === "BUTTON") return;
      redock(el);
    });
  }

  function attachToVideo(video) {
    if (!video || video === currentVideo) return;
    currentVideo = video;
    getStored((speed, pos) => {
      savedPos = pos;
      applySpeed(video, speed);
      buildPanel(video);
    });

    // 速度被其他來源改動時(例如 YouTube 原生選單),同步更新面板顯示
    video.addEventListener("ratechange", () => {
      updateLabel(video.playbackRate);
    });
  }

  function scan() {
    const video = document.querySelector("video");
    if (video && video !== currentVideo) attachToVideo(video);
    if (video && panelEl) mountPanel();
  }

  document.addEventListener("keydown", (e) => {
    if (!currentVideo) return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || document.activeElement.isContentEditable) return;

    if (e.altKey && e.key === ".") {
      changeSpeed(currentVideo, STEP);
      e.preventDefault();
    } else if (e.altKey && e.key === ",") {
      changeSpeed(currentVideo, -STEP);
      e.preventDefault();
    }
  });

  // 視窗縮小時,把浮動面板拉回可見範圍
  window.addEventListener("resize", () => {
    if (panelEl && savedPos) floatAt(panelEl, savedPos.left, savedPos.top);
  });

  const observer = new MutationObserver(() => scan());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  scan();
  setInterval(scan, 1000);
})();
