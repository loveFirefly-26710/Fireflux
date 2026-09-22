(() => {
  "use strict";

  if (window.__fireflyLive2DLoading || window.FireflyLive2D) return;
  window.__fireflyLive2DLoading = true;

  const currentScript = document.currentScript;
  const scriptBase = currentScript?.src
    ? new URL("./", currentScript.src).href
    : new URL("./", location.href).href;

  const defaults = {
    baseUrl: scriptBase,
    model: "model/Firefly.model3.json",
    core: "load/live2dcubismcore.min.js",
    pixi: "load/pixi.min.js",
    live2d: "load/cubism4.min.js",
    css: "firefly.css",
    icon: "assets/firefly-icon.jpg",
    side: "left",
    width: 420,
    height: 620,
    scale: 0.94,
    offsetX: -20,
    offsetY: 12,
    zIndex: 52,
    minWidth: 1025,
    allowTouch: false,
    touchWidth: 260,
    touchHeight: 360,
    touchScale: 0.9,
    touchOffsetX: -12,
    touchOffsetY: 8,
    touchControlsHideDelay: 3200,
    storageKey: "alist-firefly-live2d-hidden",
    welcome: "开拓者，我回来啦~",
    pageTitleMessage: true,
    pageTitleTemplate: "又在看 {title} 呀~",
    pageTitleMessageDelay: 3400,
    pageTitleChangeDelay: 700,
    titleMaxLength: 28,
    returnMessage: "欢迎回来~",
    returnMessageMinHidden: 1000,
    linkHoverMessage: true,
    linkHoverTemplate: "想去看看{label}吗？",
    linkHoverDelay: 1400,
    linkHoverDuration: 2800,
    linkHoverCooldown: 8000,
    linkLabelMaxLength: 22,
    linkLongPressDelay: 650,
    linkLongPressMoveTolerance: 12,
    copyMessage: "复制好啦，希望能帮到你~",
    copyMessageDuration: 2300,
    bottomMessage: "已经看到页面底部啦，辛苦了~",
    bottomMessageThreshold: 0.92,
    idleMessages: [
      "在忙什么呢？也要记得休息呀~",
      "累了的话，就稍微休息一下吧。",
      "我会一直陪着你的，开拓者。",
    ],
    idleMessageDelay: 90000,
    idleMessageInterval: 120000,
    fallbackClick: true,
    touchTapMoveTolerance: 14,
    touchTapMaxDuration: 600,
    expressionDuration: 4200,
    dialogGap: 24,
    buttonHintDuration: 2600,
    controlsHideDelay: 180,
    /**
     * 管理器嵌入模式（embed.html 用，原项目页面不设）：
     * ① 画面尺寸跟随容器实时变化 —— 容器（iframe）大小由管理器的「模型大小」/侧栏宽度决定，
     *    定死加载时的尺寸会让容器缩小时模型被裁掉一角；
     * ② 右侧留一条 controlsGutter 宽的带子放交互按钮（容器 = 模型 + 这条带子），
     *    按钮竖排贴着容器右缘、底边对齐桌子（见 positionControls）；
     * ③ 外链交给父页面用系统浏览器打开（Electron 里 window.open 只会弹一个裸窗口）
     */
    embed: false,
    /** 嵌入模式下右侧留给交互按钮的带子宽度（px）：容器宽度 = 模型宽度 + 它 */
    controlsGutter: 0,
    homeUrl: "/",
    profileUrl: "https://bbs.mihoyo.com/sr/wiki/content/2674/detail?bbs_presentation_style=no_header",
    profileHint: "我叫流萤，想要更多了解我吗？",
    debug: false,
  };

  const cfg = Object.assign({}, defaults, window.FireflyLive2DConfig || {});
  cfg.baseUrl = new URL(cfg.baseUrl, scriptBase).href;
  const asset = (path) => new URL(path, cfg.baseUrl).href;
  const log = (...args) => cfg.debug && console.log("[Firefly Live2D]", ...args);

  const matchesMedia = (query) => {
    try {
      return !!window.matchMedia?.(query).matches;
    } catch (_) {
      return false;
    }
  };

  const isCoarsePointer = () => matchesMedia("(pointer: coarse)");
  const isPureTouchDevice = () =>
    matchesMedia("(hover: none) and (pointer: coarse)");
  const isTouchMode = () => Boolean(cfg.allowTouch && isCoarsePointer());
  const canDisplay = () =>
    isTouchMode() || (window.innerWidth >= Number(cfg.minWidth || 0) && !isCoarsePointer());

  const finiteNumber = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const desktopLayout = Object.freeze({
    width: Math.max(1, finiteNumber(cfg.width, defaults.width)),
    height: Math.max(1, finiteNumber(cfg.height, defaults.height)),
    scale: Math.max(0.01, finiteNumber(cfg.scale, defaults.scale)),
    offsetX: finiteNumber(cfg.offsetX, defaults.offsetX),
    offsetY: finiteNumber(cfg.offsetY, defaults.offsetY),
    touch: false,
  });

  const createLayout = () => {
    // 嵌入模式（管理器）：容器多大就用多大。容器的尺寸由管理器的「模型大小」和侧栏宽度决定，
    // 沿用在 embed.html 里定死的初始尺寸会让模型按旧尺寸绘制 —— 表现就是容器缩小后模型被裁掉一角
    if (cfg.embed && !isTouchMode()) {
      return {
        width: Math.max(1, Math.round(finiteNumber(
          window.visualViewport?.width,
          window.innerWidth || desktopLayout.width,
        ))),
        height: Math.max(1, Math.round(finiteNumber(
          window.visualViewport?.height,
          window.innerHeight || desktopLayout.height,
        ))),
        scale: desktopLayout.scale,
        offsetX: desktopLayout.offsetX,
        offsetY: desktopLayout.offsetY,
        touch: false,
      };
    }
    if (!isTouchMode()) return { ...desktopLayout };

    const viewportWidth = Math.max(1, finiteNumber(
      window.visualViewport?.width,
      window.innerWidth || desktopLayout.width,
    ));
    const viewportHeight = Math.max(1, finiteNumber(
      window.visualViewport?.height,
      window.innerHeight || desktopLayout.height,
    ));

    return {
      width: Math.min(
        viewportWidth,
        Math.max(1, finiteNumber(cfg.touchWidth, defaults.touchWidth)),
      ),
      height: Math.min(
        viewportHeight,
        Math.max(1, finiteNumber(cfg.touchHeight, defaults.touchHeight)),
      ),
      scale: Math.max(0.01, finiteNumber(cfg.touchScale, defaults.touchScale)),
      offsetX: finiteNumber(cfg.touchOffsetX, defaults.touchOffsetX),
      offsetY: finiteNumber(cfg.touchOffsetY, defaults.touchOffsetY),
      touch: true,
    };
  };

  let layout = createLayout();

  if (!canDisplay()) {
    window.__fireflyLive2DLoading = false;
    return;
  }

  function loadStyle(url) {
    if ([...document.styleSheets].some((sheet) => sheet.href === url)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    document.head.appendChild(link);
  }

  function loadScript(url, readyCheck) {
    if (readyCheck?.()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = [...document.scripts].find((script) => script.src === url);
      if (existing) {
        if (readyCheck?.()) return resolve();
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener(
          "error",
          () => reject(new Error(`加载失败：${url}`)),
          { once: true },
        );
        return;
      }

      const script = document.createElement("script");
      script.src = url;
      script.async = false;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`加载失败：${url}`));
      document.head.appendChild(script);
    });
  }

  function createElements() {
    const root = document.createElement("div");
    root.className = `ff-live2d-root${cfg.side === "left" ? " ff-left" : ""}${layout.touch ? " ff-touch" : ""}`;
    root.style.setProperty("--ff-width", `${layout.width}px`);
    root.style.setProperty("--ff-height", `${layout.height}px`);
    root.style.zIndex = String(cfg.zIndex);

    const canvas = document.createElement("canvas");
    canvas.className = "ff-live2d-canvas";
    canvas.setAttribute("aria-label", "流萤 Live2D 看板娘");

    const dialog = document.createElement("div");
    dialog.className = "ff-live2d-dialog";

    const controls = document.createElement("div");
    controls.className = "ff-live2d-controls";

    const homeButton = document.createElement("button");
    homeButton.className = "ff-live2d-button";
    homeButton.type = "button";
    homeButton.setAttribute("aria-label", "返回首页");
    homeButton.textContent = "🔙";

    const randomButton = document.createElement("button");
    randomButton.className = "ff-live2d-button";
    randomButton.type = "button";
    randomButton.setAttribute("aria-label", "随机动作或表情");
    randomButton.textContent = "😊";

    const profileButton = document.createElement("button");
    profileButton.className = "ff-live2d-button";
    profileButton.type = "button";
    profileButton.setAttribute("aria-label", "了解流萤");
    profileButton.textContent = "🔗";

    const closeButton = document.createElement("button");
    closeButton.className = "ff-live2d-button";
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "隐藏流萤");
    closeButton.textContent = "❌";

    controls.append(homeButton, randomButton, profileButton, closeButton);
    root.append(canvas, dialog, controls);
    document.body.appendChild(root);

    const showButton = document.createElement("button");
    showButton.className = `ff-live2d-show${cfg.side === "left" ? " ff-left" : ""}${layout.touch ? " ff-touch" : ""}`;
    showButton.type = "button";
    showButton.title = "显示流萤";
    showButton.setAttribute("aria-label", "显示流萤");
    showButton.style.zIndex = String(cfg.zIndex);

    const showIcon = document.createElement("img");
    showIcon.src = asset(cfg.icon);
    showIcon.alt = "流萤";
    showIcon.draggable = false;
    showButton.appendChild(showIcon);
    document.body.appendChild(showButton);

    return {
      root,
      canvas,
      dialog,
      controls,
      homeButton,
      randomButton,
      profileButton,
      closeButton,
      showButton,
    };
  }

  async function boot() {
    loadStyle(asset(cfg.css));

    await loadScript(asset("load/frame-pacer.js"), () => !!window.FireflyFramePacer);
    await loadScript(asset(cfg.core), () => !!window.Live2DCubismCore);
    await loadScript(asset(cfg.pixi), () => !!window.PIXI);
    await loadScript(asset(cfg.live2d), () => !!window.PIXI?.live2d?.Live2DModel);

    const {
      root,
      canvas,
      dialog,
      controls,
      homeButton,
      randomButton,
      profileButton,
      closeButton,
      showButton,
    } = createElements();

    let dialogTimer = 0;
    let dialogVisibleUntil = 0;
    let expressionTimer = 0;
    let model = null;
    let modelNaturalWidth = 0;
    let modelNaturalHeight = 0;
    /** 模型实际内容范围（本地坐标 {x,y,w,h}，与 modelNaturalWidth/Height 同一坐标系），加载后量一次 */
    let artBox = null;
    let lastHitAt = 0;
    let hitSerial = 0;
    let clickSerial = 0; // 画布收到的 click 次数（诊断）
    let pointerDownSerial = 0; // 画布收到的 pointerdown 次数（诊断）
    let lastExpressionName = "";
    let destroyed = false;
    let actionSerial = 0;
    let lastRandomIndex = -1;
    let controlsHideTimer = 0;
    let pointerOverModel = false;
    let pointerOverControls = false;
    let currentActionAudio = null;
    let dialogResizeObserver = null;
    let pageInteractionCleanup = () => {};
    const motionSoundFiles = new Map();

    const app = new PIXI.Application({
      view: canvas,
      width: layout.width,
      height: layout.height,
      transparent: true,
      antialias: cfg.antialias !== false,
      autoDensity: true,
      // 软件渲染（SwiftShader）下每个像素都是 CPU 光栅化：渲染分辨率由管理器通过
      // URL 的 res 参数控制（默认 1x；调低可省 CPU，代价是模型边缘变柔和）
      resolution: Math.min(2, Math.max(0.4, Number(cfg.resolution) || 1)),
      // 关键：不用 PIXI 自带的自动渲染循环
      autoStart: false,
    });

    // CPU 渲染下不能让 Pixi 的 InteractionManager 自己挂一条 system ticker rAF；
    // 事件仍然收集，但由下面的自建帧节拍器逐帧调用 interaction.update()。
    const interactionManager = app.renderer?.plugins?.interaction;
    if (interactionManager) interactionManager.useSystemTicker = false;

    // 硬件和软件模式都跟随显示节拍；软件模式在每个显示帧上限 60 帧，静止时都不排帧。
    let hardwareRendering = cfg.hardware === true;
    let targetFps = Math.min(60, Math.max(1, Number(cfg.maxFPS) || 60));
    let renderPaused = false;
    window.__ffRenderFrames = 0;

    // 手动推进共享 Ticker 与 InteractionManager —— 这是「鼠标追踪 + 命中动作 + 表情」能用的前提：
    // InteractionManager 的 system ticker 已关闭，事件处理和模型动作都在当前帧统一推进。此前直接 stop() 掉共享 Ticker 等于把这些全关了
    // （症状：鼠标挪动时流萤不看人、部分动作点不出来、表情全部无效）。
    // 这里不重启它的 rAF 循环（那会 60fps 空转吃 CPU），只按我们的节拍手动 update：
    // 功能恢复；软件模式由帧调度器限制到 60 帧，硬件模式接受每个显示回调
    const tickSharedTicker = () => {
      try {
        const shared = PIXI.Ticker && PIXI.Ticker.shared;
        if (shared && !shared.started && typeof shared.update === "function") {
          shared.update(performance.now());
        }
        const interaction = app.renderer?.plugins?.interaction;
        if (interaction && typeof interaction.update === "function") {
          interaction.update();
        }
      } catch (error) {
        log("shared ticker update failed", error);
      }
    };
    let paceMode = "live"; // live=按帧率持续渲染；static=静止肖像（停在最后一帧，零开销）
    // 互动「尾随保活」：点了看板娘、动作还在播时不能立刻停帧 ——
    // 否则动作演到一半画面冻住，看起来就像「点了没反应，得去点别的页面才刷新」
    const MOTION_TAIL_MS = 6000;
    let lastInteractAt = -Infinity;

    // ===== 光标跟随：直接用库自带的缓动（= 原项目的灵敏度）=====
    // 早先这里换过一版「快速跟随」（指数逼近 + 线性追赶），实测 62~153ms 到位，
    // 但相对原项目明显更灵敏、视线跟得太急，观感反而发飘 —— 按用户要求回到原项目手感：
    // 目标交给库的 FocusController 自己缓动（带速度上限的物理弹簧，横跨整个范围约 0.3~0.5 秒，
    // 与帧率无关），加载器只负责把指针坐标喂给它、并记录「目标变化 → 视线到位」的耗时。
    const GAZE_SETTLE = 0.015; // 认为「到位」的误差阈值（库自己收敛到 0.01 就停）
    let gazeSetAt = 0; // 目标最近一次变化的时间
    let gazeRespMs = -1; // 目标变化 → 视线到位（诊断读数）
    /**
     * 设置视线目标：入参是画布内的像素坐标，直接交给库的 model.focus(x, y)
     * （非立即模式），由库自己的弹簧缓动 —— 与原项目页面内跟随走的是同一条路径
     */
    const focusGaze = (px, py) => {
      if (!model || typeof model.focus !== "function") return;
      try {
        model.focus(px, py);
        startPacer(); // 静止后也能响应 iframe 内的指针移动，帧率由当前模式控制
        gazeSetAt = performance.now();
        gazeRespMs = -1;
      } catch (error) {
        log("focus gaze failed", error);
      }
    };
    /**
     * 视线是否已经贴住目标：既给「静止肖像」定格判定用，也顺手记录「到位耗时」。
     * 每个渲染帧都调一次 —— 只在静止判定里调的话，读数会把管理器那 1.5 秒的
     * 「指针停下」宽限期算进去（实测读出 1.6 秒，而实际缓动只有 0.3 秒）
     */
    const gazeSettled = () => {
      const fc = model && model.internalModel && model.internalModel.focusController;
      if (!fc) return true;
      const settled =
        Math.abs(fc.targetX - fc.x) < GAZE_SETTLE && Math.abs(fc.targetY - fc.y) < GAZE_SETTLE;
      if (settled && gazeRespMs < 0 && gazeSetAt) {
        gazeRespMs = Math.round(performance.now() - gazeSetAt);
      }
      return settled;
    };
    const tick = (dt, now) => {
      if (destroyed || renderPaused) return false;
      // 调度器提供毫秒增量；恢复时重置时钟，避免动作突然跳变。
      window.__ffRenderFrames += 1;
      tickSharedTicker();
      let t0 = performance.now();
      let gazeOk = true;
      if (model && model.internalModel) {
        try {
          model.update(dt, now);
        } catch (error) {
          log("model update failed", error);
        }
        gazeOk = gazeSettled(); // 每帧采样：记录视线到位耗时，也决定静止肖像能不能定格
      }
      let t1 = performance.now();
      try {
        app.renderer.render(app.stage);
      } catch (error) {
        log("render failed", error);
      }
      let t2 = performance.now();
      // 诊断用：模型更新耗时 / 渲染耗时（滑动平均）
      window.__ffUpdateMs = Math.round(((window.__ffUpdateMs || 0) * 9 + (t1 - t0)) / 10);
      window.__ffRenderMs = Math.round(((window.__ffRenderMs || 0) * 9 + (t2 - t1)) / 10);
      const keepAlive = now - lastInteractAt < MOTION_TAIL_MS;
      return paceMode === "live" || keepAlive || !gazeOk;
    };
    const pacer = window.FireflyFramePacer({ hardware: hardwareRendering, fps: targetFps, onFrame: tick });
    const startPacer = () => {
      if (!destroyed && !renderPaused) pacer.start();
    };
    startPacer();

    // 关闭 PIXI 共享 Ticker：它是 60fps 的 rAF 循环，只要在运行就会让软件合成器
    // 每秒合成 60 个整窗帧（实测约 1.5 个 CPU 核，且与看板娘渲染帧率无关）。
    // 模型的更新已由上面的自建节拍器接管，不再需要它。
    // 注意：不调用 Live2DModel.registerTicker —— 注册后库会把自己的更新挂到共享
    // Ticker 上，等于又把 60fps 的 rAF 循环装回去
    const stopSharedTicker = () => {
      try {
        const shared = PIXI.Ticker && PIXI.Ticker.shared;
        if (shared) {
          shared.autoStart = false; // 防止库后续 add() 监听时自动把 rAF 循环装回去
          if (shared.stop) shared.stop();
        }
      } catch (error) {
        log("stop shared ticker failed", error);
      }
    };
    stopSharedTicker();

    // 与看板娘互动（点击/命中/按钮）时通知管理器：切回流畅渲染
    const notifyInteract = () => {
      lastInteractAt = performance.now();
      try {
        window.parent.postMessage({ type: "ff-interact" }, "*");
      } catch (error) {
        log("interact notify failed", error);
      }
    };

    /**
     * 打开「了解流萤」的资料页。嵌入模式（管理器）里交给父页面去开：Electron 里
     * window.open 只会弹一个没有地址栏的裸窗口，交给主进程用系统浏览器打开更正常
     * （父页面收到 ff-open-url 后调 open:external）
     */
    const openProfileLink = () => {
      const target = new URL(cfg.profileUrl, window.location.href).href;
      if (cfg.embed) {
        try {
          window.parent.postMessage({ type: "ff-open-url", url: target }, "*");
          return null;
        } catch (error) {
          log("post profile url failed", error);
        }
      }
      const opened = window.open(target, "_blank", "noopener,noreferrer");
      if (opened) opened.opener = null;
      return opened;
    };

    const expressionName = {
      normal: "expression00.exp3",
      upset: "expression3.exp3",
      disdain: "expression4.exp3",
      angry: "expression5.exp3",
      puzzled: "expression6.exp3",
      crying: "expression7.exp3",
      sweating: "expression8.exp3",
      stunned: "expression9.exp3",
      giggle: "expression10.exp3",
    };

    // 墨镜和猫耳分别由 Param / Param40 控制。它们必须独立于
    // ExpressionManager 保存，否则切换表情或播放动作时会相互覆盖。
    const accessories = {
      sunglasses: false,
      catEars: true,
    };

    const accessoryParameters = {
      sunglasses: "Param",
      catEars: "Param40",
    };

    const applyAccessories = () => {
      const coreModel = model?.internalModel?.coreModel;
      if (!coreModel) return;
      coreModel.setParameterValueById(
        accessoryParameters.sunglasses,
        accessories.sunglasses ? 1 : 0,
      );
      coreModel.setParameterValueById(
        accessoryParameters.catEars,
        accessories.catEars ? 1 : 0,
      );
    };

    const getModelBounds = () => {
      if (!model) return null;
      try {
        const bounds = model.getBounds();
        if (
          Number.isFinite(bounds.x) &&
          Number.isFinite(bounds.y) &&
          Number.isFinite(bounds.width) &&
          Number.isFinite(bounds.height)
        ) {
          return bounds;
        }
      } catch (error) {
        log("getBounds failed", error);
      }
      return null;
    };

    const positionControls = () => {
      /**
       * 管理器嵌入模式：容器右侧有一条 controlsGutter 宽的带子（容器 = 模型 + 带子），
       * 竖排按钮贴着容器右缘、底边跟桌子齐平 —— 就是原项目那个「按钮在桌子右边」的位置。
       * 显示态 CSS 还会 translateX(2px) 往右推 2px，这里先减掉，最终右边距 4px。
       * 只用 layout，不需要模型 bounds，所以放在 bounds 判空之前
       */
      if (cfg.embed) {
        // 按钮跟着容器高度缩放：模型调小时容器整体变矮，固定 34px 的竖排会超出容器被裁掉
        // （上下各留 4px、按钮间隔 4px；34px/23px 是原项目尺寸，也是这里按比例缩放的上限）
        const size = Math.round(Math.min(34, Math.max(12, (layout.height - 8 - 12) / 4)));
        const icon = Math.round(size * 0.68);
        for (const button of [homeButton, randomButton, profileButton, closeButton]) {
          button.style.width = `${size}px`;
          button.style.height = `${size}px`;
          button.style.font = `${icon}px/${size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
        }
        controls.style.gap = "4px";
        // 显示态 CSS 还会 translateX(2px) 往右推 2px，这里先减掉，最终右边距 4px
        controls.style.left = `${Math.max(0, Math.round(layout.width - size - 6))}px`;
        controls.style.top = `${Math.max(4, Math.round(layout.height - (size * 4 + 12) - 4))}px`;
        return;
      }

      const bounds = getModelBounds();
      if (!bounds) return;

      // 控件靠近模型右侧，不再悬在模型上方。
      const controlWidth = controls.offsetWidth || 34;
      const controlHeight = controls.offsetHeight || 151;
      const desiredLeft = bounds.x + bounds.width + 2;
      const left = Math.max(
        4,
        Math.min(layout.width - controlWidth - 4, desiredLeft),
      );
      const minimumTop = layout.touch ? 4 : 70;
      const top = Math.max(
        minimumTop,
        Math.min(layout.height - controlHeight - 4, bounds.y + bounds.height * 0.30),
      );
      controls.style.left = `${Math.round(left)}px`;
      controls.style.top = `${Math.round(top)}px`;
    };

    const setControlsVisible = (visible) => {
      clearTimeout(controlsHideTimer);
      root.classList.toggle("ff-controls-visible", visible);
    };

    const scheduleControlsHide = (delay = cfg.controlsHideDelay) => {
      clearTimeout(controlsHideTimer);
      controlsHideTimer = window.setTimeout(() => {
        if (!pointerOverModel && !pointerOverControls) {
          setControlsVisible(false);
        }
      }, Math.max(0, finiteNumber(delay, cfg.controlsHideDelay)));
    };

    const pointerIsOverModel = (event) => {
      const bounds = getModelBounds();
      const rect = canvas.getBoundingClientRect();
      if (!bounds || !rect.width || !rect.height) return false;

      const x = (event.clientX - rect.left) * (layout.width / rect.width);
      const y = (event.clientY - rect.top) * (layout.height / rect.height);
      return (
        x >= bounds.x &&
        x <= bounds.x + bounds.width &&
        y >= bounds.y &&
        y <= bounds.y + bounds.height
      );
    };

    const getHitAreaCanvasBounds = (names) => {
      const internalModel = model?.internalModel;
      if (
        !internalModel?.hitAreas ||
        typeof internalModel.getDrawableBounds !== "function" ||
        typeof model?.toGlobal !== "function"
      ) return null;

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let found = false;

      for (const name of names) {
        const hitArea = internalModel.hitAreas[name];
        if (!hitArea || hitArea.index < 0) continue;

        let bounds;
        try {
          bounds = internalModel.getDrawableBounds(hitArea.index, {});
        } catch (error) {
          log(`getDrawableBounds failed: ${name}`, error);
          continue;
        }

        const corners = [
          [bounds.x, bounds.y],
          [bounds.x + bounds.width, bounds.y],
          [bounds.x, bounds.y + bounds.height],
          [bounds.x + bounds.width, bounds.y + bounds.height],
        ];

        for (const [x, y] of corners) {
          const point = new PIXI.Point(x, y);
          internalModel.localTransform.apply(point, point);
          const global = model.toGlobal(point);
          if (!Number.isFinite(global.x) || !Number.isFinite(global.y)) continue;
          minX = Math.min(minX, global.x);
          minY = Math.min(minY, global.y);
          maxX = Math.max(maxX, global.x);
          maxY = Math.max(maxY, global.y);
          found = true;
        }
      }

      if (!found) return null;
      return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      };
    };

    const getVisibleArtworkCanvasBounds = (horizontalRange = null) => {
      const internalModel = model?.internalModel;
      const coreModel = internalModel?.coreModel;
      const drawableCount = coreModel?.getDrawableCount?.();
      if (
        !Number.isFinite(drawableCount) ||
        drawableCount <= 0 ||
        typeof internalModel?.getDrawableBounds !== "function" ||
        typeof model?.toGlobal !== "function"
      ) return null;

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let found = false;

      for (let index = 0; index < drawableCount; index += 1) {
        try {
          const opacity = coreModel.getDrawableOpacity?.(index);
          if (Number.isFinite(opacity) && opacity <= 0.01) continue;

          const visible = coreModel.getDrawableDynamicFlagIsVisible?.(index);
          if (visible === false) continue;

          const bounds = internalModel.getDrawableBounds(index, {});
          if (
            !bounds ||
            !Number.isFinite(bounds.x) ||
            !Number.isFinite(bounds.y) ||
            !Number.isFinite(bounds.width) ||
            !Number.isFinite(bounds.height) ||
            bounds.width <= 0 ||
            bounds.height <= 0
          ) continue;

          const corners = [
            [bounds.x, bounds.y],
            [bounds.x + bounds.width, bounds.y],
            [bounds.x, bounds.y + bounds.height],
            [bounds.x + bounds.width, bounds.y + bounds.height],
          ];

          let drawableMinX = Infinity;
          let drawableMinY = Infinity;
          let drawableMaxX = -Infinity;
          let drawableMaxY = -Infinity;

          for (const [x, y] of corners) {
            const point = new PIXI.Point(x, y);
            internalModel.localTransform.apply(point, point);
            const global = model.toGlobal(point);
            if (!Number.isFinite(global.x) || !Number.isFinite(global.y)) continue;
            drawableMinX = Math.min(drawableMinX, global.x);
            drawableMinY = Math.min(drawableMinY, global.y);
            drawableMaxX = Math.max(drawableMaxX, global.x);
            drawableMaxY = Math.max(drawableMaxY, global.y);
          }

          if (!Number.isFinite(drawableMinX) || !Number.isFinite(drawableMinY)) continue;
          if (
            horizontalRange &&
            (drawableMaxX < horizontalRange.minX || drawableMinX > horizontalRange.maxX)
          ) continue;

          minX = Math.min(minX, drawableMinX);
          minY = Math.min(minY, drawableMinY);
          maxX = Math.max(maxX, drawableMaxX);
          maxY = Math.max(maxY, drawableMaxY);
          found = true;
        } catch (error) {
          log(`get visible drawable bounds failed: ${index}`, error);
        }
      }

      if (!found) return null;
      return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      };
    };

    const positionDialog = () => {
      const modelBounds = getModelBounds();
      if (!modelBounds || !dialog.classList.contains("ff-visible")) return;

      // 三个点击区域适合确定头部的横向中心，但“刘海”Drawable 的上边缘
      // 实际位于额头附近，并不是角色发顶。旧版把它误当作头顶，所以消息框
      // 会向下压进约 20～30px 的头发区域。
      const headBounds = getHitAreaCanvasBounds([
        "刘海",
        "左侧后发",
        "右侧后发",
      ]) || modelBounds;

      // 在头部横向范围内遍历当前真正可见的 Drawable，取得实际发顶/猫耳
      // 的最高点。这样既不会被透明画布留白抬得过高，也不会再以额头为锚点。
      const headHorizontalPadding = Math.max(20, headBounds.width * 0.16);
      const visibleHeadArtwork = getVisibleArtworkCanvasBounds({
        minX: headBounds.x - headHorizontalPadding,
        maxX: headBounds.x + headBounds.width + headHorizontalPadding,
      });
      const headTop = visibleHeadArtwork
        ? Math.min(headBounds.y, visibleHeadArtwork.y)
        : Math.min(headBounds.y, modelBounds.y);

      const width = dialog.offsetWidth || 220;
      const height = dialog.offsetHeight || 42;
      const centerX = headBounds.x + headBounds.width * 0.5;
      const left = Math.max(6, Math.min(layout.width - width - 6, centerX - width / 2));

      // 始终保留 6px 基础安全距离，同时让 dialogGap 从 0 开始逐像素生效。
      const configuredGap = Number.isFinite(Number(cfg.dialogGap))
        ? Math.max(0, Number(cfg.dialogGap))
        : 0;
      const safeGap = 6 + configuredGap;
      const desiredTop = headTop - height - safeGap;

      // 允许消息框向根容器上方溢出；只有接近浏览器顶部时才做视口限制。
      const rootRect = root.getBoundingClientRect();
      const minTop = 6 - rootRect.top;
      const maxTop = window.innerHeight - rootRect.top - height - 6;
      const top = maxTop >= minTop
        ? Math.max(minTop, Math.min(maxTop, desiredTop))
        : desiredTop;

      dialog.style.left = `${Math.round(left)}px`;
      dialog.style.top = `${Math.round(top)}px`;
    };

    /**
     * 消息框（看板娘说的话）。嵌入模式（管理器）里交给父页面画：iframe 里的内容出不了容器，
     * 而容器上沿就是模型头顶，画在里面只能压在头发上；父页面把消息框画在容器上方，
     * 正好落在流萤头顶之上，「调整模式」提示条再叠在它上面
     */
    const showDialog = (message) => {
      if (cfg.embed) {
        try {
          window.parent.postMessage({ type: "ff-say", text: message }, "*");
        } catch (error) {
          log("post say failed", error);
        }
        return;
      }
      dialog.textContent = message;
      dialog.classList.add("ff-visible");
      requestAnimationFrame(positionDialog);
    };

    const hideDialog = () => {
      if (cfg.embed) {
        try {
          window.parent.postMessage({ type: "ff-say", text: "" }, "*");
        } catch (error) {
          log("post say failed", error);
        }
        return;
      }
      dialog.classList.remove("ff-visible");
    };

    const say = (text, duration = 3000) => {
      const message = String(text || "").trim();
      if (!message) return false;

      const parsedDuration = Number(duration);
      const visibleDuration = Number.isFinite(parsedDuration)
        ? Math.max(300, parsedDuration)
        : 3000;

      dialogVisibleUntil = Date.now() + visibleDuration;
      showDialog(message);
      clearTimeout(dialogTimer);
      dialogTimer = window.setTimeout(() => {
        hideDialog();
        dialogVisibleUntil = 0;
      }, visibleDuration);
      return true;
    };

    const bindPageInteractions = () => {
      const cleanups = [];
      const timers = new Set();
      let titleObserver = null;
      let linkHoverTimer = 0;
      let linkLongPressTimer = 0;
      let linkLongPressAnchor = null;
      let linkLongPressPointerId = null;
      let linkLongPressStartX = 0;
      let linkLongPressStartY = 0;
      let linkLongPressTriggered = false;
      let suppressLinkClickAnchor = null;
      let suppressLinkClickUntil = 0;
      let titleMessageTimer = 0;
      let idleTimer = 0;
      let scrollFrame = 0;
      let activeLink = null;
      let hiddenAt = document.hidden ? Date.now() : 0;
      let lastCopyMessageAt = 0;
      let lastIdleIndex = -1;
      let bottomMessageShown = false;
      let lastKnownTitle = "";
      const linkShownAt = new WeakMap();

      const addTimer = (callback, delay) => {
        const timer = window.setTimeout(() => {
          timers.delete(timer);
          callback();
        }, Math.max(0, Number(delay) || 0));
        timers.add(timer);
        return timer;
      };

      const clearManagedTimer = (timer) => {
        if (!timer) return;
        clearTimeout(timer);
        timers.delete(timer);
      };

      const listen = (target, type, handler, options) => {
        target.addEventListener(type, handler, options);
        cleanups.push(() => target.removeEventListener(type, handler, options));
      };

      const normalizeText = (value) => String(value || "")
        .replace(/[\u200B-\u200D\uFEFF]/g, "")
        .replace(/\s+/g, " ")
        .trim();

      const truncateText = (value, maxLength) => {
        const text = normalizeText(value);
        const parsed = Number(maxLength);
        const limit = Number.isFinite(parsed) ? Math.max(4, parsed) : 24;
        return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
      };

      const applyTemplate = (template, values) => {
        let result = String(template || "");
        for (const [key, value] of Object.entries(values)) {
          result = result.split(`{${key}}`).join(value);
        }
        return result;
      };

      const canSpeak = () => (
        !destroyed &&
        !document.hidden &&
        root.classList.contains("ff-ready") &&
        !root.classList.contains("ff-hidden")
      );

      const dialogIsBusy = () => (
        // 用「消息框还剩多久」判断，而不是看元素有没有 ff-visible：
        // 嵌入模式下消息框由父页面画，本地元素永远不显示
        dialogVisibleUntil > Date.now() + 80
      );

      const getPageTitle = () => {
        const title = normalizeText(document.title);
        const fallback = normalizeText(
          document.querySelector("h1")?.textContent ||
          document.querySelector('[role="heading"][aria-level="1"]')?.textContent,
        );
        return truncateText(title || fallback, cfg.titleMaxLength);
      };

      const speakTitle = (title, delay = 0) => {
        clearManagedTimer(titleMessageTimer);
        if (!cfg.pageTitleMessage || !title) return;

        const attempt = () => {
          if (!canSpeak()) return;
          if (dialogIsBusy()) {
            titleMessageTimer = addTimer(
              attempt,
              Math.min(4000, Math.max(180, dialogVisibleUntil - Date.now() + 120)),
            );
            return;
          }
          say(applyTemplate(cfg.pageTitleTemplate, { title }), 3000);
        };
        titleMessageTimer = addTimer(attempt, delay);
      };

      const labelFromHashTarget = (anchor) => {
        let url;
        try {
          url = new URL(anchor.href, window.location.href);
        } catch (_) {
          return "";
        }
        if (!url.hash || url.origin !== location.origin || url.pathname !== location.pathname) {
          return "";
        }
        let id = url.hash.slice(1);
        try { id = decodeURIComponent(id); } catch (_) { /* 保留原值 */ }
        const target = document.getElementById(id);
        if (!target) return "";
        return normalizeText(
          target.getAttribute("aria-label") ||
          target.querySelector("h1, h2, h3, [role='heading']")?.textContent ||
          target.textContent,
        );
      };

      const getLinkLabel = (anchor) => {
        const explicit = normalizeText(
          anchor.dataset.fireflyLabel ||
          anchor.getAttribute("aria-label") ||
          anchor.getAttribute("title"),
        );
        const visibleText = normalizeText(anchor.innerText || anchor.textContent);
        const imageAlt = normalizeText(anchor.querySelector("img[alt]")?.alt);
        const hashLabel = labelFromHashTarget(anchor);

        let urlLabel = "";
        try {
          const url = new URL(anchor.href, window.location.href);
          if (url.protocol === "mailto:") urlLabel = "邮件";
          else if (url.protocol === "tel:") urlLabel = "联系电话";
          else if (url.origin !== location.origin) urlLabel = url.hostname.replace(/^www\./i, "");
          else urlLabel = normalizeText(url.pathname.split("/").filter(Boolean).pop());
        } catch (_) {
          urlLabel = "";
        }

        return truncateText(
          explicit || visibleText || imageAlt || hashLabel || urlLabel || "这个链接",
          cfg.linkLabelMaxLength,
        );
      };

      const getEligibleLink = (target) => {
        const element = target instanceof Element ? target : target?.parentElement;
        const anchor = element?.closest?.("a[href]");
        if (!anchor || root.contains(anchor) || showButton.contains(anchor)) return null;
        const rawHref = normalizeText(anchor.getAttribute("href"));
        if (!rawHref || /^javascript:/i.test(rawHref)) return null;
        return anchor;
      };

      const cancelLinkHover = (anchor = null) => {
        if (anchor && activeLink !== anchor) return;
        activeLink = null;
        clearManagedTimer(linkHoverTimer);
        linkHoverTimer = 0;
      };

      const beginLinkHover = (anchor, delay = cfg.linkHoverDelay) => {
        if (!cfg.linkHoverMessage || !anchor || activeLink === anchor) return;
        cancelLinkHover();
        activeLink = anchor;

        const attempt = () => {
          if (activeLink !== anchor || !canSpeak()) return;
          const lastShown = linkShownAt.get(anchor) || 0;
          if (Date.now() - lastShown < Math.max(0, Number(cfg.linkHoverCooldown) || 0)) return;
          if (dialogIsBusy()) {
            linkHoverTimer = addTimer(
              attempt,
              Math.min(3000, Math.max(160, dialogVisibleUntil - Date.now() + 100)),
            );
            return;
          }

          const label = getLinkLabel(anchor);
          const message = applyTemplate(cfg.linkHoverTemplate, { label });
          if (say(message, cfg.linkHoverDuration)) linkShownAt.set(anchor, Date.now());
        };

        linkHoverTimer = addTimer(attempt, delay);
      };

      const clearLinkLongPress = (cancelMessage = true) => {
        clearManagedTimer(linkLongPressTimer);
        linkLongPressTimer = 0;
        linkLongPressAnchor?.classList?.remove("ff-live2d-longpress-link");
        if (cancelMessage && !linkLongPressTriggered && linkLongPressAnchor) {
          cancelLinkHover(linkLongPressAnchor);
        }
        linkLongPressAnchor = null;
        linkLongPressPointerId = null;
        linkLongPressTriggered = false;
      };

      const triggerLinkLongPress = () => {
        const anchor = linkLongPressAnchor;
        if (!anchor) return false;
        if (linkLongPressTriggered) return true;
        if (!canSpeak()) return false;

        const lastShown = linkShownAt.get(anchor) || 0;
        if (
          Date.now() - lastShown <
          Math.max(0, finiteNumber(cfg.linkHoverCooldown, defaults.linkHoverCooldown))
        ) return false;

        linkLongPressTriggered = true;
        suppressLinkClickAnchor = anchor;
        suppressLinkClickUntil = Date.now() + 1200;
        cancelLinkHover(anchor);
        beginLinkHover(anchor, 0);
        return true;
      };

      const onLinkPointerDown = (event) => {
        if (event.pointerType !== "touch" || !isPureTouchDevice()) return;
        const anchor = getEligibleLink(event.target);
        if (!cfg.linkHoverMessage || !anchor) return;

        clearLinkLongPress();
        cancelLinkHover();
        linkLongPressAnchor = anchor;
        linkLongPressPointerId = event.pointerId;
        linkLongPressStartX = event.clientX;
        linkLongPressStartY = event.clientY;
        anchor.classList.add("ff-live2d-longpress-link");
        linkLongPressTimer = addTimer(
          triggerLinkLongPress,
          Math.max(250, finiteNumber(cfg.linkLongPressDelay, defaults.linkLongPressDelay)),
        );
      };

      const onLinkPointerMove = (event) => {
        if (event.pointerId !== linkLongPressPointerId || !linkLongPressAnchor) return;
        const tolerance = Math.max(2, finiteNumber(
          cfg.linkLongPressMoveTolerance,
          defaults.linkLongPressMoveTolerance,
        ));
        if (Math.hypot(
          event.clientX - linkLongPressStartX,
          event.clientY - linkLongPressStartY,
        ) > tolerance) {
          clearLinkLongPress();
        }
      };

      const onLinkPointerEnd = (event) => {
        if (event.pointerId !== linkLongPressPointerId) return;
        const wasTriggered = linkLongPressTriggered;
        if (wasTriggered) suppressLinkClickUntil = Date.now() + 800;
        clearLinkLongPress(!wasTriggered);
      };

      const onLinkContextMenu = (event) => {
        const anchor = getEligibleLink(event.target);
        if (!anchor || anchor !== linkLongPressAnchor || !isPureTouchDevice()) return;
        if (triggerLinkLongPress()) event.preventDefault();
      };

      const onLinkClick = (event) => {
        const anchor = getEligibleLink(event.target);
        if (
          !anchor ||
          anchor !== suppressLinkClickAnchor ||
          Date.now() > suppressLinkClickUntil
        ) return;

        suppressLinkClickAnchor = null;
        suppressLinkClickUntil = 0;
        event.preventDefault();
        event.stopImmediatePropagation();
      };

      const resetIdleTimer = (delay = cfg.idleMessageDelay) => {
        clearManagedTimer(idleTimer);
        idleTimer = 0;
        const messages = Array.isArray(cfg.idleMessages)
          ? cfg.idleMessages.map(normalizeText).filter(Boolean)
          : [];
        if (!messages.length || Number(delay) <= 0) return;

        idleTimer = addTimer(() => {
          if (!canSpeak()) {
            resetIdleTimer(cfg.idleMessageDelay);
            return;
          }
          if (dialogIsBusy()) {
            resetIdleTimer(5000);
            return;
          }
          let index = Math.floor(Math.random() * messages.length);
          if (messages.length > 1 && index === lastIdleIndex) {
            index = (index + 1 + Math.floor(Math.random() * (messages.length - 1))) % messages.length;
          }
          lastIdleIndex = index;
          say(messages[index], 3200);
          resetIdleTimer(cfg.idleMessageInterval);
        }, delay);
      };

      const onVisibilityChange = () => {
        clearLinkLongPress();
        cancelLinkHover();
        if (document.hidden) {
          hiddenAt = Date.now();
          clearManagedTimer(idleTimer);
          idleTimer = 0;
          return;
        }

        const hiddenDuration = hiddenAt ? Date.now() - hiddenAt : 0;
        hiddenAt = 0;
        if (
          cfg.returnMessage &&
          hiddenDuration >= Math.max(0, Number(cfg.returnMessageMinHidden) || 0) &&
          canSpeak()
        ) {
          say(cfg.returnMessage, 2800);
        }
        resetIdleTimer();
      };

      const onPointerOver = (event) => {
        if (event.pointerType === "touch") return;
        const anchor = getEligibleLink(event.target);
        if (!anchor) return;
        if (event.relatedTarget instanceof Node && anchor.contains(event.relatedTarget)) return;
        beginLinkHover(anchor);
      };

      const onPointerOut = (event) => {
        if (event.pointerType === "touch") return;
        const anchor = getEligibleLink(event.target);
        if (!anchor || activeLink !== anchor) return;
        if (event.relatedTarget instanceof Node && anchor.contains(event.relatedTarget)) return;
        cancelLinkHover(anchor);
      };

      const onFocusIn = (event) => beginLinkHover(getEligibleLink(event.target));
      const onFocusOut = (event) => {
        const anchor = getEligibleLink(event.target);
        if (anchor) cancelLinkHover(anchor);
      };

      const onCopy = () => {
        if (!cfg.copyMessage || !canSpeak()) return;
        const now = Date.now();
        if (now - lastCopyMessageAt < 4000) return;
        lastCopyMessageAt = now;
        say(cfg.copyMessage, cfg.copyMessageDuration);
      };

      const checkBottom = () => {
        scrollFrame = 0;
        if (bottomMessageShown || !cfg.bottomMessage || !canSpeak()) return;
        const doc = document.documentElement;
        const pageHeight = Math.max(doc.scrollHeight, document.body?.scrollHeight || 0);
        if (pageHeight <= window.innerHeight * 1.35 || window.scrollY < 160) return;
        const progress = (window.scrollY + window.innerHeight) / pageHeight;
        const threshold = Math.min(1, Math.max(0.5, Number(cfg.bottomMessageThreshold) || 0.92));
        if (progress < threshold || dialogIsBusy()) return;
        bottomMessageShown = say(cfg.bottomMessage, 3000);
      };

      const onScroll = () => {
        resetIdleTimer();
        if (!scrollFrame) scrollFrame = requestAnimationFrame(checkBottom);
      };

      const onActivity = () => resetIdleTimer();

      listen(document, "visibilitychange", onVisibilityChange);
      listen(document, "pointerover", onPointerOver, true);
      listen(document, "pointerout", onPointerOut, true);
      listen(document, "pointerdown", onLinkPointerDown, true);
      listen(document, "pointermove", onLinkPointerMove, { passive: true, capture: true });
      listen(document, "pointerup", onLinkPointerEnd, true);
      listen(document, "pointercancel", onLinkPointerEnd, true);
      listen(document, "contextmenu", onLinkContextMenu, true);
      listen(document, "click", onLinkClick, true);
      listen(document, "focusin", onFocusIn, true);
      listen(document, "focusout", onFocusOut, true);
      listen(document, "copy", onCopy, true);
      listen(window, "scroll", onScroll, { passive: true });
      listen(document, "pointerdown", onActivity, { passive: true, capture: true });
      listen(document, "keydown", onActivity, true);
      listen(window, "wheel", onActivity, { passive: true });

      if (document.head && "MutationObserver" in window) {
        lastKnownTitle = getPageTitle();
        titleObserver = new MutationObserver(() => {
          const currentTitle = getPageTitle();
          if (!currentTitle || currentTitle === lastKnownTitle) return;
          lastKnownTitle = currentTitle;
          speakTitle(currentTitle, cfg.pageTitleChangeDelay);
        });
        titleObserver.observe(document.head, {
          subtree: true,
          childList: true,
          characterData: true,
        });
      } else {
        lastKnownTitle = getPageTitle();
      }

      if (lastKnownTitle) speakTitle(lastKnownTitle, cfg.pageTitleMessageDelay);
      resetIdleTimer();

      return () => {
        clearLinkLongPress();
        cancelLinkHover();
        clearManagedTimer(titleMessageTimer);
        clearManagedTimer(idleTimer);
        timers.forEach((timer) => clearTimeout(timer));
        timers.clear();
        titleObserver?.disconnect?.();
        if (scrollFrame) cancelAnimationFrame(scrollFrame);
        cleanups.splice(0).forEach((cleanup) => cleanup());
      };
    };

    if ("ResizeObserver" in window) {
      dialogResizeObserver = new ResizeObserver(() => {
        if (dialog.classList.contains("ff-visible")) positionDialog();
      });
      dialogResizeObserver.observe(dialog);
    }

    const bindButtonHint = (button, text) => {
      const showHint = () => say(text, cfg.buttonHintDuration);
      button.addEventListener("mouseenter", showHint);
      button.addEventListener("focus", showHint);
    };

    bindButtonHint(homeButton, "点击这里返回首页！");
    bindButtonHint(randomButton, "点击这里，看看我会做什么吧！");
    bindButtonHint(profileButton, cfg.profileHint);
    bindButtonHint(closeButton, "点击这里暂时隐藏我。");

    // 按钮默认隐藏：鼠标进入模型边界时显示；从模型移动到按钮区时
    // 保持显示，离开两者后延迟收起，避免跨越间隙时闪烁。
    canvas.addEventListener("pointermove", (event) => {
      const inside = pointerIsOverModel(event);
      if (inside) {
        pointerOverModel = true;
        setControlsVisible(true);
      } else if (pointerOverModel) {
        pointerOverModel = false;
        scheduleControlsHide();
      }
    }, { passive: true });

    // 光标跟随（iframe 内）：指针在看板娘这一格里移动时也更新视线目标。
    // 鼠标划过 iframe 时父窗口收不到事件（跨文档不冒泡），这一段只能由 iframe 自己收，
    // 剩下的窗口区域由管理器转发（ff-pointer → FireflyLive2D.focus），两条通道写同一个目标
    let hoverSentAt = -Infinity;
    document.addEventListener("pointermove", (event) => {
      const now = performance.now();
      if (cfg.embed && now - hoverSentAt >= 200) {
        hoverSentAt = now;
        window.parent.postMessage({ type: "ff-hover" }, "*");
      }
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      focusGaze(
        (event.clientX - rect.left) * (layout.width / rect.width),
        (event.clientY - rect.top) * (layout.height / rect.height),
      );
    }, { passive: true });

    canvas.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "touch" || !layout.touch || !pointerIsOverModel(event)) return;
      pointerOverModel = true;
      setControlsVisible(true);
    }, { passive: true });

    canvas.addEventListener("pointerup", (event) => {
      if (event.pointerType !== "touch" || !layout.touch) return;
      pointerOverModel = false;
      scheduleControlsHide(cfg.touchControlsHideDelay);
    }, { passive: true });

    canvas.addEventListener("pointercancel", (event) => {
      if (event.pointerType !== "touch" || !layout.touch) return;
      pointerOverModel = false;
      scheduleControlsHide(cfg.touchControlsHideDelay);
    }, { passive: true });

    canvas.addEventListener("pointerleave", (event) => {
      pointerOverModel = false;
      scheduleControlsHide(
        event.pointerType === "touch" && layout.touch
          ? cfg.touchControlsHideDelay
          : cfg.controlsHideDelay,
      );
    });

    controls.addEventListener("mouseenter", () => {
      pointerOverControls = true;
      setControlsVisible(true);
    });

    controls.addEventListener("mouseleave", () => {
      pointerOverControls = false;
      scheduleControlsHide();
    });

    controls.addEventListener("focusin", () => {
      pointerOverControls = true;
      setControlsVisible(true);
    });

    controls.addEventListener("focusout", () => {
      pointerOverControls = false;
      scheduleControlsHide();
    });

    /**
     * 量出模型实际内容范围（所有 drawable 的并集），坐标只到「模型画布」（不做 toGlobal）。
     * 为什么需要：模型原始画布常含大片透明边距（本模型 4464×3285，内容只占下面一条），
     * 按整张画布自适应会让容器（iframe）比模型高好几倍、上方留一片空框，
     * 那片区域会吃掉鼠标事件，以后往那儿加按钮就点不到了。
     */
    const measureArtBox = () => {
      const im = model && model.internalModel;
      if (!im || !im.coreModel || typeof im.getDrawableBounds !== "function") return null;
      const count = im.coreModel.getDrawableCount ? im.coreModel.getDrawableCount() : 0;
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (let i = 0; i < count; i++) {
        let b;
        try {
          b = im.getDrawableBounds(i, {});
        } catch (error) {
          continue;
        }
        if (!b || !Number.isFinite(b.x) || !Number.isFinite(b.width)) continue;
        for (const [px, py] of [
          [b.x, b.y],
          [b.x + b.width, b.y],
          [b.x, b.y + b.height],
          [b.x + b.width, b.y + b.height],
        ]) {
          const p = new PIXI.Point(px, py);
          im.localTransform.apply(p, p);
          if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
          x0 = Math.min(x0, p.x);
          y0 = Math.min(y0, p.y);
          x1 = Math.max(x1, p.x);
          y1 = Math.max(y1, p.y);
        }
      }
      if (!Number.isFinite(x0) || !(x1 > x0) || !(y1 > y0)) return null;
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    };

    /** 把「容器宽高比 = 模型内容宽高比」告诉父窗口，让槽位高度正好等于模型高度 */
    const reportArtRatio = () => {
      if (!artBox) return;
      try {
        window.parent.postMessage({ type: "ff-art", ratio: artBox.w / artBox.h }, "*");
      } catch (error) {
        log("report art ratio failed", error);
      }
    };

    /**
     * 自适应。有 artBox（模型实际内容）时：容器就是模型 —— 内容正好铺满容器，
     * 此时 cfg 里的 scale/offsetX/offsetY（原项目为它自己的画布调的值）不再参与计算，
     * 否则会把内容裁掉一角、或在头顶留一条空隙；用户仍可用设置页滑块在容器内微调。
     * 量不到内容范围时退回旧行为（按整张画布缩放，底边对齐）。
     */
    const applyModelLayout = () => {
      if (!model || !modelNaturalWidth || !modelNaturalHeight) return;
      const art = artBox;
      // 嵌入模式：容器右边那条带子留给交互按钮，模型只占剩下的部分
      const gutter = Math.max(0, finiteNumber(cfg.controlsGutter, 0));
      const boxW = Math.max(1, layout.width - (cfg.embed ? gutter : 0));
      model.anchor.set(0.5, 1);
      if (art) {
        const fit = Math.min(boxW / art.w, layout.height / art.h);
        model.scale.set(fit);
        // 内容左上角贴 (0, layout.height - art.h * fit)：宽度不够时多出来的空隙留在头顶，
        // 脚/桌子始终贴着容器底边
        model.x = (modelNaturalWidth / 2 - art.x) * fit;
        model.y = layout.height + (modelNaturalHeight - art.y - art.h) * fit;
        return;
      }
      const fit =
        Math.min(boxW / modelNaturalWidth, layout.height / modelNaturalHeight) * layout.scale;
      model.scale.set(fit);
      model.x = boxW / 2 + layout.offsetX;
      model.y = layout.height + layout.offsetY;
    };

    const applyResponsiveLayout = () => {
      const nextLayout = createLayout();
      const changed = Object.keys(nextLayout).some((key) => nextLayout[key] !== layout[key]);
      layout = nextLayout;

      root.classList.toggle("ff-touch", layout.touch);
      showButton.classList.toggle("ff-touch", layout.touch);
      root.style.setProperty("--ff-width", `${layout.width}px`);
      root.style.setProperty("--ff-height", `${layout.height}px`);

      if (changed) app.renderer.resize(layout.width, layout.height);
      applyModelLayout();
    };

    const refreshRenderer = () => {
      if (!model || destroyed) return;
      requestAnimationFrame(() => {
        applyResponsiveLayout();
        model.visible = true;
        applyAccessories();
        positionControls();
        if (dialog.classList.contains("ff-visible")) positionDialog();
        try {
          app.renderer.render(app.stage);
        } catch (error) {
          log("forced render failed", error);
        }
      });
    };

    // 不再使用 display:none 隐藏 Canvas。部分 WebGL/Live2D 环境在重新显示
    // display:none 的画布后会出现局部 Drawable（常见为头部）未恢复的问题。
    const setHidden = (hidden, persist = true) => {
      const wasHidden = root.classList.contains("ff-hidden");
      root.classList.toggle("ff-hidden", hidden);
      root.setAttribute("aria-hidden", hidden ? "true" : "false");
      showButton.classList.toggle("ff-visible", hidden && canDisplay());
      if (persist) localStorage.setItem(cfg.storageKey, hidden ? "1" : "0");

      if (hidden && !wasHidden && model) {
        actionSerial += 1;
        clearTimeout(expressionTimer);
        stopActionAudio();
        stopCurrentMotion();
      } else if (!hidden) {
        refreshRenderer();
        if (wasHidden) model?.motion("Idle").catch?.(() => false);
      }
    };

    const motionKey = (group, index) => `${group}:${index}`;

    const captureMotionSounds = () => {
      const motionManager = model?.internalModel?.motionManager;
      const settings = model?.internalModel?.settings;
      if (!motionManager?.definitions || !settings) return;

      // pixi-live2d-display 0.3.1 的 SoundManager 在快速重播时会先 pause()
      // 尚未完成 play() 的旧音频，产生 AbortError；旧音频的异步回调还可能
      // 清空新音频状态。只对当前模型移除内置 Sound，并由下方播放器接管。
      for (const [group, definitions] of Object.entries(motionManager.definitions)) {
        if (!Array.isArray(definitions)) continue;
        definitions.forEach((definition, index) => {
          if (!definition?.Sound) return;
          motionSoundFiles.set(
            motionKey(group, index),
            settings.resolveURL(definition.Sound),
          );
          delete definition.Sound;
        });
      }
    };

    const releaseActionAudio = (audio = currentActionAudio) => {
      if (!audio) return;
      if (currentActionAudio === audio) currentActionAudio = null;
      audio.__fireflyStopped = true;
      try { audio.pause(); } catch (error) { log("audio pause failed", error); }
      try { audio.currentTime = 0; } catch (error) { log("audio rewind failed", error); }
    };

    const stopActionAudio = () => releaseActionAudio(currentActionAudio);

    const startActionAudio = (group, index, serial) => {
      const url = motionSoundFiles.get(motionKey(group, index));
      if (!url) return null;

      const audio = new Audio(url);
      audio.preload = "auto";
      audio.volume = 0.5;
      audio.__fireflyStopped = false;
      currentActionAudio = audio;

      const clearCurrent = () => {
        if (currentActionAudio === audio) currentActionAudio = null;
      };
      audio.addEventListener("ended", clearCurrent, { once: true });

      const playPromise = audio.play();
      playPromise?.catch?.((error) => {
        // 快速重播时主动停止旧音频会令它的 play() Promise 以 AbortError
        // 结束，这是正常中断，不应污染控制台，也不能影响新音频。
        if (
          audio.__fireflyStopped ||
          serial !== actionSerial ||
          error?.name === "AbortError"
        ) return;
        clearCurrent();
        console.warn("[Firefly Live2D] 音频播放失败", url, error);
      });

      return audio;
    };

    const stopCurrentMotion = () => {
      model?.internalModel?.motionManager?.stopAllMotions?.();
    };

    const beginAction = () => {
      actionSerial += 1;
      clearTimeout(expressionTimer);
      return actionSerial;
    };

    const setNormalExpression = async () => {
      if (!model) return false;
      lastExpressionName = expressionName.normal;
      const ok = await model.expression(expressionName.normal).catch?.(() => false);
      applyAccessories();
      return !!ok;
    };

    const playMotion = async ({ group, index, text }) => {
      if (!model) return false;
      const serial = beginAction();
      if (text) say(text);

      // 每次都先终止旧动作和旧音频，再从 0 秒开始播放新音频。音频先在
      // 当前点击手势内启动，避免 await 之后丢失浏览器的媒体播放授权。
      stopCurrentMotion();
      stopActionAudio();
      const audio = startActionAudio(group, index, serial);

      await setNormalExpression();
      if (serial !== actionSerial || destroyed) {
        releaseActionAudio(audio);
        return false;
      }

      const ok = await model.motion(group, index, 3).catch?.(() => false);
      if (serial !== actionSerial || destroyed) return false;
      if (!ok) {
        releaseActionAudio(audio);
        log("motion start rejected", group, index);
      }
      applyAccessories();
      return !!ok;
    };

    const playExpression = async ({ name, text, duration = cfg.expressionDuration }) => {
      if (!model || !name) return false;
      const serial = beginAction();
      if (text) say(text, Math.min(duration, 3500));

      // 表情属于新的交互动作，也应立即停止正在唱歌的音频与旧动作。
      stopActionAudio();
      stopCurrentMotion();

      // 原桌宠把这些项目标为“按键”：本质上是回正动作叠加一个表情。
      // Web 版不要求真实键盘绑定，随机按钮可直接调用它们。
      await setNormalExpression();
      if (serial !== actionSerial || destroyed) return false;
      await model.motion("Reset", 0, 3).catch?.(() => false);
      if (serial !== actionSerial || destroyed) return false;
      const ok = await model.expression(name).catch?.(() => false);
      if (serial !== actionSerial || destroyed) return false;
      lastExpressionName = name;
      applyAccessories();

      expressionTimer = window.setTimeout(async () => {
        if (serial !== actionSerial || destroyed) return;
        await setNormalExpression();
      }, duration);

      return !!ok;
    };

    const toggleAccessory = (name, textOn, textOff) => {
      if (!model || !(name in accessories)) return false;
      accessories[name] = !accessories[name];
      say(accessories[name] ? textOn : textOff);
      applyAccessories();
      return accessories[name];
    };

    const hitActions = {
      "饮料": () => playMotion({
        group: "Reset",
        index: 0,
        text: "恢复精神，继续出发吧！",
      }),
      "蛋糕": () => playMotion({
        group: "Tap",
        index: 0,
        text: "愿这一刻，使一颗心免于哀伤。",
      }),
      "左侧后发": () => playMotion({
        group: "Tap",
        index: 1,
        text: "我将，点燃星海！",
      }),
      "刘海": () => toggleAccessory(
        "sunglasses",
        "墨镜模式启动！",
        "墨镜收好啦~",
      ),
      "右侧后发": () => toggleAccessory(
        "catEars",
        "猫耳也很适合我吗？",
        "猫耳先收起来啦~",
      ),
    };

    const randomActions = [
      {
        name: "唱歌",
        run: () => playMotion({
          group: "Tap",
          index: 0,
          text: "愿这一刻，使一颗心免于哀伤。",
        }),
      },
      {
        name: "点燃星海",
        run: () => playMotion({
          group: "Tap",
          index: 1,
          text: "我将，点燃星海！",
        }),
      },
      {
        name: "难受",
        run: () => playExpression({ name: expressionName.upset, text: "难受……" }),
      },
      {
        name: "鄙夷",
        run: () => playExpression({ name: expressionName.disdain, text: "鄙夷。" }),
      },
      {
        name: "生气",
        run: () => playExpression({ name: expressionName.angry, text: "生气了！" }),
      },
      {
        name: "疑问",
        run: () => playExpression({ name: expressionName.puzzled, text: "疑问？" }),
      },
      {
        name: "哭泣",
        run: () => playExpression({ name: expressionName.crying, text: "哭泣……" }),
      },
      {
        name: "流汗",
        run: () => playExpression({ name: expressionName.sweating, text: "流汗……" }),
      },
      {
        name: "呆愣",
        run: () => playExpression({ name: expressionName.stunned, text: "呆愣……" }),
      },
      {
        name: "嘻嘻",
        run: () => playExpression({ name: expressionName.giggle, text: "嘻嘻~" }),
      },
    ];

    const randomAction = () => {
      if (!randomActions.length) return false;
      let index = Math.floor(Math.random() * randomActions.length);
      if (randomActions.length > 1 && index === lastRandomIndex) {
        index = (index + 1 + Math.floor(Math.random() * (randomActions.length - 1))) % randomActions.length;
      }
      lastRandomIndex = index;
      log("random action", randomActions[index].name);
      return randomActions[index].run();
    };

    model = PIXI.live2d.Live2DModel.fromSync(asset(cfg.model), {
      autoInteract: true,
      // 关掉库自带的自动更新：它挂在 Ticker.shared 的 rAF 上，会持续产生合成帧。
      // 改为由上面的自建节拍器按目标帧率手动 model.update()
      autoUpdate: false,
      idleMotionGroup: "Idle",
      motionPreload: "ALL",
    });

    model.once("load", async () => {
      if (destroyed) return;
      app.stage.addChild(model);
      stopSharedTicker(); // 库可能在加载过程中启动过共享 Ticker，再停一次

      modelNaturalWidth = model.width;
      modelNaturalHeight = model.height;
      // 先量内容范围，再套布局：这样第一帧就是「容器 = 模型」的尺寸
      artBox = measureArtBox();
      applyResponsiveLayout();
      reportArtRatio();

      const motionManager = model.internalModel.motionManager;
      motionManager.groups.idle = "Idle";
      // 物理仿真（头发、衣摆等摆动）是纯 CPU 开销，实测占看板娘总占用的大头；
      // 由管理器通过 phys=0 关闭（模型动作照常播放，只是少了物理摆动）
      if (Number(cfg.physics) === 0) {
        try {
          model.internalModel.physics = null;
          log("physics disabled");
        } catch (error) {
          log("disable physics failed", error);
        }
      }
      captureMotionSounds();
      await setNormalExpression();
      model.internalModel.on("beforeModelUpdate", applyAccessories);

      model.on("hit", (hitAreas) => {
        hitSerial += 1;
        lastHitAt = performance.now();
        notifyInteract();
        const hit = hitAreas.find((name) => hitActions[name]);
        if (hit) hitActions[hit]();
      });

      // 桌面端继续使用 click 兜底。触摸端不依赖浏览器合成 click，
      // 而是单独识别一次未滑动、未长按的 pointer 轻触，避免部分
      // 移动浏览器因 PIXI 命中处理或滚动手势而不派发 click。
      // 按下即视为互动：动作尾随保活（画面不会演到一半冻住），
      // 并立刻推进一次共享 Ticker，让 PIXI 的命中判定当场生效
      canvas.addEventListener(
        "pointerdown",
        () => {
          pointerDownSerial += 1; // 诊断：画布确实收到了按下（区分「事件没送达」和「命中判定没通过」）
          notifyInteract();
          tickSharedTicker();
        },
        { passive: true }
      );
      canvas.addEventListener("click", () => {
        clickSerial += 1;
        notifyInteract();
        tickSharedTicker();
        if (!cfg.fallbackClick || layout.touch) return;
        window.setTimeout(() => {
          if (performance.now() - lastHitAt > 80) randomAction();
        }, 0);
      });

      let touchTapPointerId = null;
      let touchTapStartX = 0;
      let touchTapStartY = 0;
      let touchTapStartedAt = 0;
      let touchTapHitSerial = 0;
      let touchTapMoved = false;

      const resetTouchFallbackTap = () => {
        touchTapPointerId = null;
        touchTapStartX = 0;
        touchTapStartY = 0;
        touchTapStartedAt = 0;
        touchTapHitSerial = hitSerial;
        touchTapMoved = false;
      };

      canvas.addEventListener("pointerdown", (event) => {
        if (
          !cfg.fallbackClick ||
          !layout.touch ||
          event.pointerType !== "touch" ||
          event.isPrimary === false
        ) return;

        touchTapPointerId = event.pointerId;
        touchTapStartX = event.clientX;
        touchTapStartY = event.clientY;
        touchTapStartedAt = performance.now();
        touchTapHitSerial = hitSerial;
        touchTapMoved = false;
      }, { passive: true });

      canvas.addEventListener("pointermove", (event) => {
        if (event.pointerId !== touchTapPointerId || touchTapMoved) return;
        const tolerance = Math.max(0, finiteNumber(
          cfg.touchTapMoveTolerance,
          defaults.touchTapMoveTolerance,
        ));
        if (
          Math.hypot(
            event.clientX - touchTapStartX,
            event.clientY - touchTapStartY,
          ) > tolerance
        ) touchTapMoved = true;
      }, { passive: true });

      const finishTouchFallbackTap = (event) => {
        if (event.pointerId !== touchTapPointerId) return;

        const elapsed = performance.now() - touchTapStartedAt;
        const maxDuration = Math.max(0, finiteNumber(
          cfg.touchTapMaxDuration,
          defaults.touchTapMaxDuration,
        ));
        const hitSerialAtStart = touchTapHitSerial;
        const shouldTrigger =
          event.type === "pointerup" &&
          !touchTapMoved &&
          elapsed <= maxDuration;

        resetTouchFallbackTap();
        if (!shouldTrigger) return;

        // 等待 PIXI 的 pointertap / hit 先完成。若命中了饮料、蛋糕、
        // 刘海或后发等专属区域，hitSerial 会变化，此处不会再随机一次。
        window.setTimeout(() => {
          if (
            destroyed ||
            !cfg.fallbackClick ||
            !layout.touch ||
            hitSerial !== hitSerialAtStart
          ) return;
          randomAction();
        }, 120);
      };

      canvas.addEventListener("pointerup", finishTouchFallbackTap, { passive: true });
      canvas.addEventListener("pointercancel", finishTouchFallbackTap, { passive: true });
      canvas.addEventListener("lostpointercapture", finishTouchFallbackTap, { passive: true });

      homeButton.addEventListener("click", (event) => {
        notifyInteract();
        event.stopPropagation();
        const target = new URL(cfg.homeUrl, window.location.href).href;
        window.location.assign(target);
      });

      randomButton.addEventListener("click", (event) => {
        notifyInteract();
        event.stopPropagation();
        randomAction();
      });

      profileButton.addEventListener("click", (event) => {
        notifyInteract();
        event.stopPropagation();
        openProfileLink();
      });

      root.classList.add("ff-ready");
      positionControls();
      setHidden(localStorage.getItem(cfg.storageKey) === "1", false);
      if (!root.classList.contains("ff-hidden")) say(cfg.welcome);
      pageInteractionCleanup = bindPageInteractions();
      model.motion("Idle").catch?.(() => false);
      log("loaded", model.internalModel.settings.name);
    });

    model.once("error", (error) => {
      console.error("[Firefly Live2D] 模型加载失败", error);
      say("流萤模型加载失败，请检查资源路径和 CORS。", 6000);
    });

    closeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      setHidden(true);
    });

    showButton.addEventListener("click", (event) => {
        notifyInteract();
      event.stopPropagation();
      setHidden(false);
      say("我回来啦~");
    });

    // 拖拽调整窗口/面板尺寸时会高频触发 resize；软件渲染下每帧重排+重绘 WebGL 代价极高，
    // 这里做尾随防抖：拖动过程中沿用上一帧画面（CSS 拉伸），停止后只重排重绘一次
    let resizeTimer = null;
    const onResize = () => {
      if (!canDisplay()) {
        setHidden(true, false);
        return;
      }
      if (localStorage.getItem(cfg.storageKey) !== "1") setHidden(false, false);
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => refreshRenderer(), 160);
    };
    window.addEventListener("resize", onResize, { passive: true });
    window.visualViewport?.addEventListener("resize", onResize, { passive: true });

    window.FireflyLive2D = {
      app,
      get model() { return model; },
      config: cfg,
      /** 暂停/恢复渲染（拖拽、失焦由管理器控制）：暂停时不排任何帧 */
      setPaused(paused) {
        const next = !!paused;
        if (next === renderPaused) return;
        renderPaused = next;
        if (next) {
          pacer.stop();
        } else if (paceMode === "live") {
          startPacer();
        }
      },
      get paused() { return renderPaused; },
      /**
       * 流畅 / 静止肖像：静止时停在最后一帧（画面仍是看板娘，只是不再逐帧渲染）。
       * 不需要动画时保留最后一帧，避免持续唤醒软件图形管线。
       */
      setLive(live) {
        const next = live ? "live" : "static";
        if (next === paceMode) return;
        paceMode = next;
        if (next === "live") {
          if (!renderPaused) startPacer();
        }
        // 转 static 时不在这里清定时器：交给 tick 判断 —— 刚互动过的动作尾随期内
        // 继续渲染，动作演完或超时后自然停在最后一帧
      },
      get live() { return paceMode === "live"; },
      /** 软件模式的上限；硬件模式不设置人工帧率上限，诊断值 0 表示 uncapped。 */
      get activeFps() { return hardwareRendering ? 0 : targetFps; },
      setRenderMode(hardware) {
        hardwareRendering = !!hardware;
        targetFps = 60;
        pacer.setMode(hardwareRendering, targetFps);
        const resolution = cfg.resolutionOverride ? cfg.resolution : hardwareRendering ? Math.min(2, window.devicePixelRatio || 1) : 0.8;
        if (app.renderer.resolution !== resolution) {
          cfg.resolution = resolution;
          app.renderer.resolution = resolution;
          app.renderer.resize(layout.width, layout.height);
          refreshRenderer();
        }
      },
      /**
       * 光标跟随：入参是画布内的像素坐标（管理器把主窗口的光标位置换算成 iframe 内坐标转发过来）。
       * 目标只在这里登记，实际的平滑与写回由渲染帧里的 applyGaze() 完成
       */
      focus(px, py) { focusGaze(px, py); },
      /**
       * 模型实际内容（本地坐标）与宽高比：父窗口用它把槽位高度设成和模型一样高。
       * 同时会在加载完成后用 ff-art 消息主动报一次
       */
      get art() {
        return artBox ? { ...artBox, ratio: artBox.w / artBox.h } : null;
      },
      /** 视线状态（诊断/自检用）：当前值、目标值、响应耗时（值来自库的 FocusController） */
      get gaze() {
        const fc = model && model.internalModel && model.internalModel.focusController;
        return fc
          ? { x: fc.x, y: fc.y, tx: fc.targetX, ty: fc.targetY, respMs: gazeRespMs }
          : { x: 0, y: 0, tx: 0, ty: 0, respMs: -1 };
      },
      /**
       * 按命中区名字点一下（自检用）：走的就是库内部 pointertap → tap() → hitTest 的那条路。
       * 之所以需要它：合成鼠标事件（sendInputEvent）跨 iframe 时经常只到 pointerdown、
       * 到不了 click，用点阵去试命中会误报成「点击没反应」
       */
      tapHitArea(name) {
        const center = getHitAreaCanvasBounds([name]);
        if (!center || !model || typeof model.tap !== "function") return false;
        model.tap(center.x + center.width / 2, center.y + center.height / 2);
        return true;
      },
      /** 调整 CPU 软件渲染的帧率上限；GPU 模式忽略人工上限。 */
      setFps(fps) {
        const next = Math.min(60, Math.max(1, Number(fps) || 60));
        targetFps = next;
        pacer.setMode(hardwareRendering, targetFps);
      },
      get fps() { return hardwareRendering ? 0 : targetFps; },
      show() {
        setHidden(false);
        say("我回来啦~");
      },
      hide() { setHidden(true); },
      say,
      goHome() {
        window.location.assign(new URL(cfg.homeUrl, window.location.href).href);
      },
      openProfile() { return openProfileLink(); },
      randomAction,
      play(group, index = 0) { return playMotion({ group, index }); },
      setExpression(name) { return model?.expression(name); },
      playExpression(name, duration = cfg.expressionDuration) {
        return playExpression({ name, text: name, duration });
      },
      listRandomActions() { return randomActions.map((action) => action.name); },
      toggleSunglasses() {
        return toggleAccessory("sunglasses", "墨镜模式启动！", "墨镜收好啦~");
      },
      toggleCatEars() {
        return toggleAccessory("catEars", "猫耳也很适合我吗？", "猫耳先收起来啦~");
      },
      getAccessories() { return { ...accessories }; },
      /**
       * 诊断读数（性能测试/自检用）：鼠标追踪朝向、命中次数、当前表情、关键参数。
       * 追踪用 FocusController 的当前值（-1~1），表情用几个会被表情改写的参数来判定
       */
      diag() {
        try {
          const fc = model && model.internalModel && model.internalModel.focusController;
          const cm = model && model.internalModel && model.internalModel.coreModel;
          const param = (id) => {
            try {
              const v = cm && cm.getParameterValueById ? cm.getParameterValueById(id) : undefined;
              return typeof v === "number" ? Math.round(v * 1000) / 1000 : null;
            } catch (error) {
              return null;
            }
          };
          return {
            focus: fc ? [Math.round(fc.x * 1000) / 1000, Math.round(fc.y * 1000) / 1000] : null,
            focusTarget: fc ? [Math.round(fc.targetX * 1000) / 1000, Math.round(fc.targetY * 1000) / 1000] : null,
            // 视线到位耗时（ms）：目标变化 → 平滑到位。库自带弹簧在同一段距离上要 1 秒以上
            gazeRespMs: gazeRespMs,
            hits: hitSerial,
            clicks: clickSerial,
            downs: pointerDownSerial,
            // 命中区中心（画布坐标）：自检按这里点，才点得到脑袋/身体，
            // 直接点格子中心容易落在椅子、桌子的画面上，被误判成「点击没反应」
            hitAreas: (() => {
              try {
                const names = Object.keys((model && model.internalModel && model.internalModel.hitAreas) || {});
                const out = {};
                for (const name of names) {
                  const b = getHitAreaCanvasBounds([name]);
                  if (b && b.width > 0) {
                    out[name] = [Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2)];
                  }
                }
                return out;
              } catch (error) {
                return null;
              }
            })(),
            // 画布内「真正有内容」的范围：所有 drawable 的并集（canvas 坐标）。
            // 模型原始画布通常含大片透明边距，想知道「模型实际占多大」就得看这个
            art: (() => {
              try {
                const im = model && model.internalModel;
                if (!im || typeof im.getDrawableBounds !== "function" || !im.coreModel) return null;
                const count = im.coreModel.getDrawableCount ? im.coreModel.getDrawableCount() : 0;
                let x0 = Infinity;
                let y0 = Infinity;
                let x1 = -Infinity;
                let y1 = -Infinity;
                for (let i = 0; i < count; i++) {
                  let b;
                  try {
                    b = im.getDrawableBounds(i, {});
                  } catch (error) {
                    continue;
                  }
                  if (!b || !Number.isFinite(b.x) || !Number.isFinite(b.width)) continue;
                  for (const [px, py] of [
                    [b.x, b.y],
                    [b.x + b.width, b.y],
                    [b.x, b.y + b.height],
                    [b.x + b.width, b.y + b.height],
                  ]) {
                    const p = new PIXI.Point(px, py);
                    im.localTransform.apply(p, p);
                    const g = model.toGlobal(p);
                    if (!Number.isFinite(g.x) || !Number.isFinite(g.y)) continue;
                    x0 = Math.min(x0, g.x);
                    y0 = Math.min(y0, g.y);
                    x1 = Math.max(x1, g.x);
                    y1 = Math.max(y1, g.y);
                  }
                }
                if (!Number.isFinite(x0)) return null;
                return [Math.round(x0), Math.round(y0), Math.round(x1 - x0), Math.round(y1 - y0)];
              } catch (error) {
                return null;
              }
            })(),
            natural: [Math.round(modelNaturalWidth), Math.round(modelNaturalHeight)],
            fit: model && model.scale ? Math.round(model.scale.x * 1000) / 1000 : null,
            pos: model ? [Math.round(model.x), Math.round(model.y)] : null,
            box: [layout.width, layout.height],
            fps: hardwareRendering ? 0 : targetFps, // 0 = GPU 模式不设人工帧率上限
            res: app && app.renderer ? app.renderer.resolution : null,
            expr: lastExpressionName,
            params: ["ParamEyeLOpen","ParamEyeROpen","ParamMouthForm","ParamMouthOpenY","ParamBrowLY","ParamBrowRY","ParamAngleX","ParamAngleZ"].map(param)
          };
        } catch (error) {
          return { error: String(error) };
        }
      },
      destroy() {
        destroyed = true;
        actionSerial += 1;
        pacer.stop();
        clearTimeout(resizeTimer);
        window.removeEventListener("resize", onResize);
        window.visualViewport?.removeEventListener("resize", onResize);
        clearTimeout(dialogTimer);
        clearTimeout(expressionTimer);
        clearTimeout(controlsHideTimer);
        dialogResizeObserver?.disconnect?.();
        pageInteractionCleanup();
        stopActionAudio();
        stopCurrentMotion();
        model?.destroy?.();
        app.destroy(true, { children: true, texture: true, baseTexture: true });
        root.remove();
        showButton.remove();
        delete window.FireflyLive2D;
        window.__fireflyLive2DLoading = false;
      },
    };
  }

  const start = () => boot().catch((error) => {
    window.__fireflyLive2DLoading = false;
    console.error("[Firefly Live2D] 初始化失败", error);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
