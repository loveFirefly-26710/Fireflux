<script lang="ts">
	import { onMount, setContext } from 'svelte'
	import { errMsg } from './lib/err'
	import ContentManager from './components/ContentManager.svelte'
	import ConfigCenter from './pages/ConfigCenter.svelte'
	import DragBar from './components/DragBar.svelte'
	import Dynamics from './pages/Dynamics.svelte'
	import Publish from './pages/Publish.svelte'
	import Settings from './pages/Settings.svelte'
	import { bakeBackground } from './lib/bg-bake'
	import type { AppearanceSettings, GpuStatus } from './lib/api'

	let phase = $state<'loading' | 'onboard' | 'ready'>('loading')
	let page = $state('dynamics')
	let appearance = $state<AppearanceSettings>({})
	let gpuStatus = $state<GpuStatus>({ requestedHardware: false, webgl: 'unknown', compositing: 'unknown', renderer: '' })
	const hardwareLive2d = $derived(gpuStatus.webgl === 'hardware')
	const hardwareUi = $derived(gpuStatus.compositing === 'hardware')
	const globalFollow = $derived(appearance.live2dGlobalFollow ?? hardwareLive2d)
	let wallpaperData = $state<string | null>(null)
	let live2dView = $state({ s: 1, x: 0, y: 0 })
	let live2dSrc = $state('live2d/embed.html?s=1&x=0&y=0')
	let live2dFrame = $state<HTMLIFrameElement | undefined>(undefined)
	// 看板娘容器宽高比（= 模型实际内容宽高比，由 iframe 用 ff-art 消息报来）
	let live2dRatio = $state(1.54)
	// 看板娘当前说的话：消息框画在容器上方（流萤头顶之上），文字/时长由加载器用 ff-say 驱动
	let live2dSay = $state('')
	let adjustOn = $state(false)
	let live2dCommitTimer: ReturnType<typeof setTimeout> | undefined

	// 窗口太矮时自动隐藏看板娘（避免模型被裁切）
	let live2dOn = $state(true)
	// 拖拽窗口大小时把 #app 定在原尺寸（见下面 onResize）：软件渲染下每帧全量重排重绘很贵，
	// 拖拽期间先不动布局，松手后一次性恢复
	let freezeTimer: ReturnType<typeof setTimeout> | undefined

	// ===== 看板娘节能（软件渲染下这层 WebGL 渲染循环是最大的 CPU 来源）=====
	// 三档状态，由管理器通过消息驱动 iframe：
	// - 暂停（ff-pause）：窗口缩放中 / 拖拽分隔条中 / 窗口失焦（含最小化）→ 一帧都不排
	// - 流畅（ff-live）：鼠标在窗口里移动、指针停在看板娘上、刚点击互动过 → 逐帧渲染
	//   （GPU 模式不设人工帧率上限；CPU 模式最高 60 帧，默认只响应看板娘区域）
	// - 静止肖像（ff-static）：上面都不成立时渲染最后一帧后完全停住，CPU 归零
	const LIVE_GRACE_MS = 1500 // 短暂保活，点击动作另有独立尾随时间
	// 完全暂停的来源（拖拽 / 窗口缩放 / 失焦）各自独立标记，避免互相覆盖
	let pausedByDrag = false
	let pausedByResize = false
	let pausedByFocus = false
	let pausedSent = false
	let liveUntil = 0
	let liveSent: boolean | null = null
	let graceTimer: ReturnType<typeof setTimeout> | undefined
	let pinnedFrame: { el: HTMLElement; w: string; h: string } | null = null

	// 诊断日志（性能测试读取 window.__ffEventLog，未启用时为 no-op）
	function ffLog(msg: string): void {
		const w = window as unknown as { __ffEventLog?: string[] }
		w.__ffEventLog?.push(`${Math.round(performance.now())} ${msg}`)
	}
	const anyPaused = (): boolean => pausedByDrag || pausedByResize || pausedByFocus
	const isLive = (): boolean => Date.now() < liveUntil

	// ===== 背景烘焙（拖拽/悬停时 CPU 高低的关键）=====
	// 把「渐变 + 壁纸缩放 + 混合」预合成一张设备像素 1:1 的不透明位图，
	// 每帧从三次绘制降到一次 blit；原理与实测数字见 lib/bg-bake.ts
	let bakedBg = $state<string | null>(null)
	let bakedKey = ''
	let bakeGeneration = 0
	let bakeTimer: ReturnType<typeof setTimeout> | undefined
	async function bakeBg(): Promise<void> {
		const src = wallpaperData
		const generation = ++bakeGeneration
		if (!src) {
			if (bakedBg) URL.revokeObjectURL(bakedBg)
			bakedBg = null
			bakedKey = ''
			return
		}
		const key = `${src.length}:${appearance.wallpaperDim ?? 0.45}:${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`
		if (key === bakedKey) return
		const url = await bakeBackground({
			image: src,
			dim: appearance.wallpaperDim ?? 0.45,
			width: window.innerWidth,
			height: window.innerHeight,
			dpr: window.devicePixelRatio || 1
		})
		if (generation !== bakeGeneration || src !== wallpaperData) {
			if (url) URL.revokeObjectURL(url)
			return
		}
		if (bakedBg && bakedBg !== url) URL.revokeObjectURL(bakedBg)
		bakedBg = url
		bakedKey = url ? key : ''
	}

	function setLive2dPaused(paused: boolean): void {
		if (paused) {
			if (pointerFrame !== null) cancelAnimationFrame(pointerFrame)
			pointerFrame = null
			clearTimeout(pointerTimer)
			pointerTimer = undefined
			pendingPointer = null
		}
		ffLog(paused ? 'send ff-pause' : 'send ff-resume')
		live2dFrame?.contentWindow?.postMessage({ type: paused ? 'ff-pause' : 'ff-resume' }, '*')
	}

	function syncLive2d(): void {
		const paused = anyPaused()
		const live = !paused && isLive()
		document.body.classList.toggle('ff-idle', !live)
		if (paused !== pausedSent) {
			pausedSent = paused
			setLive2dPaused(paused)
		}
		if (live !== liveSent) {
			liveSent = live
			live2dFrame?.contentWindow?.postMessage({ type: live ? 'ff-live' : 'ff-static' }, '*')
		}
	}

	/** 强制重发当前状态（拖拽起止 / iframe 重载后用，绕过「状态未变」防抖） */
	function forcePauseSync(): void {
		pausedSent = !anyPaused()
		liveSent = null
		syncLive2d()
	}

	/** 只保留一个休眠计时器，移动鼠标时延长截止时间，不反复创建计时器。 */
	function checkLiveDeadline(): void {
		graceTimer = undefined
		const left = liveUntil - Date.now()
		if (left > 0) graceTimer = setTimeout(checkLiveDeadline, left + 20)
		else syncLive2d()
	}
	function refreshLive(ms = LIVE_GRACE_MS): void {
		liveUntil = Math.max(liveUntil, Date.now() + ms)
		syncLive2d()
		if (!graceTimer) graceTimer = setTimeout(checkLiveDeadline, ms + 20)
	}

	// 高频鼠标输入合并为最新坐标；发送速率不超过模型实际需要的帧率。
	let frameRect: DOMRect | null = null
	let frameRectAt = 0
	let sentX = Number.NaN
	let sentY = Number.NaN
	let pointerTimer: ReturnType<typeof setTimeout> | undefined
	let pointerFrame: number | null = null
	let pointerLastSentAt = Number.NEGATIVE_INFINITY
	let pendingPointer: { x: number; y: number } | null = null
	function flushPointer(): void {
		pointerTimer = undefined
		pointerFrame = null
		if (!pendingPointer || !live2dFrame || anyPaused() || !globalFollow) return
		const now = performance.now()
		if (!hardwareLive2d && now - pointerLastSentAt < 1000 / 60 - 0.05) {
			pointerFrame = requestAnimationFrame(() => flushPointer())
			return
		}
		const point = pendingPointer
		pendingPointer = null
		if (!frameRect || now - frameRectAt > 250) {
			frameRect = live2dFrame.getBoundingClientRect()
			frameRectAt = now
		}
		const x = Math.round(point.x - frameRect.left)
		const y = Math.round(point.y - frameRect.top)
		if (x === sentX && y === sentY) return
		sentX = x
		sentY = y
		pointerLastSentAt = now
		refreshLive()
		live2dFrame.contentWindow?.postMessage({ type: 'ff-pointer', x, y }, '*')
	}
	function onPointerTrack(e: PointerEvent): void {
		if (!live2dFrame || anyPaused() || !globalFollow) return
		pendingPointer = { x: e.clientX, y: e.clientY }
		if (pointerTimer || pointerFrame !== null) return
		if (hardwareLive2d) {
			flushPointer()
			return
		}
		pointerFrame = requestAnimationFrame(() => flushPointer())
	}

	function syncRenderMode(hardware = hardwareLive2d): void {
		live2dFrame?.contentWindow?.postMessage({ type: 'ff-render-mode', hardware }, '*')
	}
	function clearResizeFreeze(): void {
		document.body.classList.remove('ff-freeze')
		const el = document.getElementById('app')
		if (el) { el.style.width = ''; el.style.height = '' }
		pausedByResize = false
		syncLive2d()
	}
	$effect(() => {
		document.documentElement.dataset.renderMode = hardwareUi ? 'hardware' : 'software'
		if (hardwareUi) { clearTimeout(freezeTimer); clearResizeFreeze() }
	})
	$effect(() => {
		const hardware = hardwareLive2d
		syncRenderMode(hardware)
	})

	// iframe 重载后新文档不知道之前的指令，全部重发；并先流畅几秒让用户看到看板娘
	function onLive2dLoad(): void {
		ffLog('iframe-load')
		frameRect = null
		sentX = sentY = Number.NaN
		syncRenderMode()
		forcePauseSync()
		refreshLive(hardwareLive2d ? 3000 : 1500)
	}

	// 拖拽分隔条时把看板娘画布尺寸钉住：否则侧栏宽度每变一次，WebGL 画布就重建一次，
	// 既掉帧又会产生 SharedImage 抖动（实测左拖拽卡顿的主因之一）；松手后恢复自适应
	function pinLive2dFrame(): void {
		const el = live2dFrame
		if (!el) return
		const r = el.getBoundingClientRect()
		if (r.width < 2 || r.height < 2) return
		pinnedFrame = { el, w: el.style.width, h: el.style.height }
		el.style.width = `${Math.round(r.width)}px`
		el.style.height = `${Math.round(r.height)}px`
	}
	function unpinLive2dFrame(): void {
		if (!pinnedFrame) return
		pinnedFrame.el.style.width = pinnedFrame.w
		pinnedFrame.el.style.height = pinnedFrame.h
		pinnedFrame = null
	}

	$effect(() => {
		const onResize = (): void => {
			const on = window.innerHeight >= 700
			if (on !== live2dOn) live2dOn = on
			frameRect = null
			if (hardwareUi) {
				clearResizeFreeze()
				clearTimeout(bakeTimer)
				bakeTimer = setTimeout(() => void bakeBg(), 600)
				return
			}
			const appEl = document.getElementById('app')
			if (appEl && !document.body.classList.contains('ff-freeze')) {
				document.body.classList.add('ff-freeze')
				appEl.style.width = appEl.offsetWidth + 'px'
				appEl.style.height = appEl.offsetHeight + 'px'
				pausedByResize = true
				syncLive2d()
			}
			clearTimeout(freezeTimer)
			freezeTimer = setTimeout(() => {
				document.body.classList.remove('ff-freeze')
				if (appEl) {
					appEl.style.width = ''
					appEl.style.height = ''
				}
				pausedByResize = false
				syncLive2d()
				// 窗口尺寸变了：背景位图需要按新尺寸重新烘焙（防抖，避免拖动窗口时反复编码）
				clearTimeout(bakeTimer)
				bakeTimer = setTimeout(() => void bakeBg(), 600)
			}, 180)
		}
		const onDragStart = (): void => {
			ffLog('dragstart')
			pausedByDrag = true
			forcePauseSync()
			pinLive2dFrame()
		}
		const onDragEnd = (): void => {
			ffLog('dragend')
			pausedByDrag = false
			forcePauseSync()
			unpinLive2dFrame()
		}
		const onBlur = (): void => {
			// 失焦（含最小化到任务栏）：完全暂停，把 CPU 让给前台应用。
			// 但点击看板娘（iframe 抢到焦点）时 Chromium 同样会给父窗口派发 blur，
			// 而那时窗口仍是激活状态，所以先用 hasFocus() 复核再暂停
			setTimeout(() => {
				if (document.hasFocus()) return
				ffLog('blur')
				pausedByFocus = true
				syncLive2d()
			}, 0)
		}
		const onFocus = (): void => {
			ffLog('focus')
			pausedByFocus = false
			syncLive2d()
		}
		const trackOpts: AddEventListenerOptions = { passive: true, capture: true }
		window.addEventListener('resize', onResize)
		document.body.addEventListener('ff-dragstart', onDragStart)
		document.body.addEventListener('ff-dragend', onDragEnd)
		// 看板娘渲染策略：指针在侧栏上 → 流畅；离开一段时间 → 静止肖像（零 CPU）
		window.addEventListener('pointermove', onPointerTrack, trackOpts)
		window.addEventListener('blur', onBlur)
		window.addEventListener('focus', onFocus)
		syncLive2d()
		return (): void => {
			window.removeEventListener('resize', onResize)
			document.body.removeEventListener('ff-dragstart', onDragStart)
			document.body.removeEventListener('ff-dragend', onDragEnd)
			window.removeEventListener('pointermove', onPointerTrack, trackOpts)
			clearTimeout(pointerTimer)
			if (pointerFrame !== null) cancelAnimationFrame(pointerFrame)
			pointerFrame = null
			window.removeEventListener('blur', onBlur)
			window.removeEventListener('focus', onFocus)
			clearTimeout(freezeTimer)
			clearTimeout(graceTimer)
			clearTimeout(bakeTimer)
		}
	})
	// 壁纸 / 暗度变化时重新烘焙背景位图
	$effect(() => {
		void wallpaperData
		void appearance.wallpaperDim
		void bakeBg()
	})
	$effect(() => {
		document.body.classList.toggle('ff-baked-bg', !!bakedBg)
	})
	const showLive2d = $derived(live2dOn && appearance.live2dEnabled !== false)

	async function setLive2dEnabled(v: boolean): Promise<void> {
		try {
			applyAppearance(await window.api.appearanceSet({ live2dEnabled: v }))
			notify(v ? '看板娘已显示' : '看板娘已关闭（拖拽/缩放更流畅）')
		} catch (e) {
			notify(errMsg(e), false)
		}
	}

	async function setGlobalFollow(v: boolean): Promise<void> {
		try {
			applyAppearance(await window.api.appearanceSet({ live2dGlobalFollow: v }))
			if (!v) {
				if (pointerFrame !== null) cancelAnimationFrame(pointerFrame)
				pointerFrame = null
				clearTimeout(pointerTimer)
				pointerTimer = undefined
				pendingPointer = null
			}
		} catch (e) { notify(errMsg(e), false) }
	}

	let toastMsg = $state('')
	let toastOk = $state(true)
	let toastTimer: ReturnType<typeof setTimeout> | undefined

	function notify(msg: string, ok = true): void {
		toastMsg = msg
		toastOk = ok
		if (toastTimer) clearTimeout(toastTimer)
		toastTimer = setTimeout(() => (toastMsg = ''), 5000)
	}
	setContext('notify', notify)

	function applyAppearance(a: AppearanceSettings): void {
		appearance = a
		const root = document.documentElement
		// 卡片与侧栏各自的不透明度（1 = 不透明；调低可露出后面的壁纸）。
		// 侧栏没单独设置过时跟随卡片的值
		const cardAlpha = a.cardOpacity ?? 1
		root.style.setProperty('--panel-alpha', String(cardAlpha))
		root.style.setProperty('--sidebar-alpha', String(a.sidebarOpacity ?? cardAlpha))
		if (a.accent) {
			root.style.setProperty('--accent', a.accent)
			root.style.setProperty('--accent-deep', a.accentDeep ?? a.accent)
			root.style.setProperty('--accent-soft', a.accent + '26')
		}
	}

	function live2dUrl(v: { s: number; x: number; y: number }): string {
		return `live2d/embed.html?s=${v.s}&x=${v.x}&y=${v.y}&hw=${hardwareLive2d ? 1 : 0}`
	}

	async function init(): Promise<void> {
		try {
			// GPU 能力诊断不能阻塞主界面：部分驱动在 getGPUInfo('complete') 上可能长时间等待。
			const s = await window.api.appInit()
			if (s.appearance) applyAppearance(s.appearance)
			wallpaperData = s.wallpaperData ?? null
			live2dView = {
				s: s.appearance?.live2dScale ?? 1,
				x: s.appearance?.live2dX ?? 0,
				y: s.appearance?.live2dY ?? 0
			}
			live2dSrc = live2dUrl(live2dView)
			phase = s.valid ? 'ready' : 'onboard'
			void window.api
				.gpuStatus()
				.then((status) => { gpuStatus = status })
				.catch(() => { /* GPU 诊断失败不影响界面 */ })
		} catch {
			phase = 'onboard'
		}
	}
	onMount(() => {
		const unsubscribe = window.api.onGpuStatus((status) => { gpuStatus = status })
		void init()
		return unsubscribe
	})

	// 看板娘视图：拖动/滚轮时先本地预览（只改容器尺寸与位移），停手 600ms 后才落盘
	function previewLive2d(v: { s: number; x: number; y: number }): void {
		live2dView = v
	}
	async function commitLive2d(): Promise<void> {
		try {
			applyAppearance(
				await window.api.appearanceSet({
					live2dScale: Math.round(live2dView.s * 100) / 100,
					live2dX: Math.round(live2dView.x * 10) / 10,
					live2dY: Math.round(live2dView.y * 10) / 10
				})
			)
		} catch (e) {
			notify(errMsg(e), false)
		}
	}
	function changeLive2d(v: { s: number; x: number; y: number }): void {
		previewLive2d(v)
		if (live2dCommitTimer) clearTimeout(live2dCommitTimer)
		live2dCommitTimer = setTimeout(() => {
			void commitLive2d()
		}, 600)
	}
	function toggleAdjust(): void {
		adjustOn = !adjustOn
		live2dFrame?.contentWindow?.postMessage({ type: 'ff-adjust', on: adjustOn }, '*')
		if (adjustOn) notify('调整模式：在看板娘上拖拽移动，滚轮缩放，双击完成')
	}

	// 看板娘消息（iframe → 父窗口）：ff-view 调整预览/双击提交、ff-art 模型宽高比、
	// ff-say 消息框文本、ff-open-url 外链、ff-interact 互动活跃。
	// 未列出的（ff-ticker / ff-diag）是性能归因台（drag-bench）自用的探针，这里忽略。
	// 反向（父窗口 → iframe）：ff-pause / ff-resume、ff-live / ff-static、ff-pointer、ff-adjust
	$effect(() => {
		const onMsg = (e: MessageEvent): void => {
			if (!live2dFrame || e.source !== live2dFrame.contentWindow) return
			const d = (e.data || {}) as {
				type?: string
				s?: number
				x?: number
				y?: number
				commit?: boolean
				ratio?: number
				url?: string
				text?: string
			}
			if (d.type === 'ff-view' && d.commit) {
				adjustOn = false
				const v = { s: d.s ?? 1, x: d.x ?? 0, y: d.y ?? 0 }
				live2dView = v
				void commitLive2d()
			} else if (d.type === 'ff-view') {
				// 调整模式拖动/滚轮中：实时预览（容器与模型一起动，不落盘）
				live2dView = { s: d.s ?? 1, x: d.x ?? 0, y: d.y ?? 0 }
			} else if (d.type === 'ff-art' && typeof d.ratio === 'number' && d.ratio > 0.2) {
				// 看板娘报来模型实际内容的宽高比：让槽位高度正好等于模型高度
				live2dRatio = d.ratio
				syncRenderMode()
				forcePauseSync()
			} else if (d.type === 'ff-say') {
				// 看板娘说话（欢迎语/摸头回应/动作台词）：空字符串 = 收起消息框
				live2dSay = d.text ?? ''
			} else if (d.type === 'ff-open-url' && d.url) {
				// 看板娘要打开外链（🔗「了解流萤」）：交给主进程用系统浏览器打开 ——
				// Electron 里 window.open 只会弹一个没有地址栏的裸窗口
				void window.api.openExternal(d.url).catch((err) => notify(errMsg(err), false))
			} else if (d.type === 'ff-hover') {
				if (!anyPaused()) refreshLive()
			} else if (d.type === 'ff-interact') {
				// 与看板娘互动（点击/摸头/按钮）：恢复流畅渲染一段时间
				refreshLive(12_000)
			}
		}
		window.addEventListener('message', onMsg)
		return () => window.removeEventListener('message', onMsg)
	})

	async function setWallpaper(): Promise<void> {
		try {
			applyAppearance(await window.api.appearanceSetWallpaper())
			wallpaperData = await window.api.appearanceWallpaperData()
			notify('壁纸已更换')
		} catch (e) {
			notify(errMsg(e), false)
		}
	}

	async function clearWallpaper(): Promise<void> {
		try {
			applyAppearance(await window.api.appearanceClearWallpaper())
			wallpaperData = null
			notify('壁纸已清除')
		} catch (e) {
			notify(errMsg(e), false)
		}
	}

	async function setAccent(name: string, accent: string, deep: string): Promise<void> {
		try {
			applyAppearance(await window.api.appearanceSet({ accent, accentDeep: deep }))
			notify(`主题色已切换为「${name}」`)
		} catch (e) {
			notify(errMsg(e), false)
		}
	}

	/**
	 * 数值型外观设置（壁纸减淡、各种不透明度）：拖动时先本地实时生效（不打 IPC），
	 * 松手 400ms 后才落盘 —— 否则一次拖动会往 settings.json 写几十次
	 */
	let appearanceTimer: ReturnType<typeof setTimeout> | undefined
	function setAppearanceSoon(patch: AppearanceSettings): void {
		applyAppearance({ ...appearance, ...patch })
		clearTimeout(appearanceTimer)
		appearanceTimer = setTimeout(() => {
			void window.api
				.appearanceSet(patch)
				.then((a) => applyAppearance(a))
				.catch((e) => notify(errMsg(e), false))
		}, 400)
	}
	const setDim = (v: number): void => setAppearanceSoon({ wallpaperDim: v })
	const setCardOpacity = (v: number): void => setAppearanceSoon({ cardOpacity: v })
	const setSidebarOpacity = (v: number): void => setAppearanceSoon({ sidebarOpacity: v })

	const nav = [
		{ id: 'dynamics', label: '动态发布', icon: '💬' },
		{ id: 'posts', label: '文章管理', icon: '📄' },
		{ id: 'projects', label: '项目展示', icon: '🧩' },
		{ id: 'spec', label: 'Spec 页面', icon: '📚' },
		{ id: 'configs', label: '配置中心', icon: '🎛️' },
		{ id: 'publish', label: '发布上线', icon: '🚀' },
		{ id: 'settings', label: '设置', icon: '⚙️' }
	]

	// 侧栏宽度可拖拽调整；拖拽中只更新布局，松手时才写 localStorage（避免拖拽期间高频同步 IO）
	let sidebarW = $state(Number(localStorage.getItem('ff.sidebar-w')) || 216)
	function setSidebarW(w: number): void {
		sidebarW = w
	}
	function persistSidebarW(w: number): void {
		localStorage.setItem('ff.sidebar-w', String(w))
	}

	// 看板娘格子（容器）：宽度 = 侧栏内容宽 ×「模型大小」，高度按模型实际宽高比算；
	// 容器里右侧留一条 MENU_BAND 宽的带子放交互按钮 —— 容器 = 模型 + 按钮带子，
	// 模型放大容器跟着放大、缩小跟着缩小，两边始终贴合
	// （侧栏内容宽 = 侧栏宽 − 左右各 12px 内边距 − 各 1px 边框）
	const MENU_BAND = 40 // 与 embed.html 的 controlsGutter 一致
	let live2dSlotW = $derived(
		Math.round(Math.min(1, Math.max(0.3, live2dView.s)) * Math.max(1, sidebarW - 26))
	)
	/** 容器里模型那一列的宽度（去掉右侧按钮带子） */
	let live2dBandW = $derived(Math.max(1, live2dSlotW - MENU_BAND))
	let live2dSlotH = $derived(
		// +2 是给宽高比取整留的余量：宁可容器比模型高两像素（头顶那点空背景看不见），
		// 也不要把模型顶边裁掉
		Math.round(live2dBandW / live2dRatio) + 2
	)
</script>

<!-- 引导页与设置页共用同一份设置面板（props 多，抽成 snippet 免得只改一处） -->
{#snippet settingsPanel()}
	<Settings
		{setWallpaper}
		{clearWallpaper}
		{setAccent}
		{setDim}
		{setCardOpacity}
		{setSidebarOpacity}
		{setLive2dEnabled}
		{setGlobalFollow}
		{globalFollow}
		{gpuStatus}
		{appearance}
		view={live2dView}
		onChangeLive2d={changeLive2d}
		onbound={init}
	/>
{/snippet}

{#if wallpaperData}
	<div
		class="wallpaper"
		style="background-image: url({bakedBg ?? wallpaperData}); background-size: {bakedBg ? '100% 100%' : 'cover'}; opacity: {bakedBg ? 1 : 1 - (appearance.wallpaperDim ?? 0.45)}"
	></div>
{/if}

{#if phase === 'loading'}
	<div class="boot">正在加载项目目录…</div>
{:else if phase === 'onboard'}
	<div class="onboard">
		<div class="card onboard-card">
			<h2>✨ Fireflux</h2>
			<p>
				第一次使用，请先绑定你的 <b>Firefly 博客项目文件夹</b>
				（包含 <code>src</code> 文件夹的那一层）。
			</p>
			<p class="muted">
				绑定后，本软件只通过相对路径读写项目里的文件；
				文件夹挪动位置后，在设置里重新绑定一次即可。
			</p>
			{@render settingsPanel()}
		</div>
	</div>
{:else}
	<div class="layout">
		<aside class="sidebar" style="width:{sidebarW}px">
			<div class="brand">✨ Fireflux</div>
			{#each nav as item}
				<button class="nav-item" class:active={page === item.id} onclick={() => (page = item.id)}>
					<span>{item.icon}</span>
					<span>{item.label}</span>
				</button>
			{/each}
			{#if showLive2d}
				<button class="nav-item" class:active={adjustOn} onclick={toggleAdjust} title="拖拽移动、滚轮缩放，双击完成">
					<span>✥</span>
					<span>调整看板娘</span>
				</button>
				<!-- 容器尺寸由上面的 live2dSlotW/H 算：宽度 = 侧栏内容宽 ×「模型大小」，
				     高度 = 模型宽高比；右缘那条 40px 是交互按钮的带子（按钮由 iframe 内部摆放） -->
				<div
					class="live2d-slot"
					style="width: {live2dSlotW}px; height: {live2dSlotH}px; transform: translate({live2dView.x}px, {live2dView.y}px)"
				>
					<iframe bind:this={live2dFrame} src={live2dSrc} title="流萤看板娘" onload={onLive2dLoad}></iframe>
					<!-- 容器上方这一摞（自下而上：看板娘的消息框 → 调整模式提示）：
					     都画在父页面，因为 iframe 里的内容出不了容器，而容器上沿就是模型头顶。
					     column-reverse 让 DOM 里靠前的消息框贴着容器上沿，提示条叠在它上面 -->
					<div class="live2d-above" style="left: {Math.round(live2dBandW / 2)}px; width: {live2dBandW}px">
						{#if live2dSay}
							<div class="live2d-say">{live2dSay}</div>
						{/if}
						{#if adjustOn}
							<div class="live2d-hud">调整模式：拖拽移动 · 滚轮缩放 · 双击完成</div>
						{/if}
					</div>
				</div>
			{/if}
		</aside>
		<DragBar side="right" width={sidebarW} onresize={setSidebarW} onfinish={persistSidebarW} min={190} max={460} gapLeft={14} />
		<main class="content">
			{#if page === 'dynamics'}
				<Dynamics />
			{:else if page === 'posts'}
				<ContentManager
					folder="posts"
					title="文章管理"
					icon="📄"
					canCreate
					createKind="post"
					createLabel="新建文章"
					canImage
					hint="文章是 src/content/posts/ 下的 Markdown 文件；编辑保存后到「发布上线」推送生效。"
				/>
			{:else if page === 'projects'}
				<ContentManager
					folder="projects"
					title="项目展示"
					icon="🧩"
					canCreate
					createKind="project"
					createLabel="新建项目"
					hint="项目页内容在 src/content/projects/；新建默认为草稿状态。"
				/>
			{:else if page === 'spec'}
				<ContentManager folder="spec" title="Spec 页面" icon="📚" hint="关于页（about）、友链页自定义内容（friends）、留言板（guestbook）等页面内容。" />
			{:else if page === 'configs'}
				<ConfigCenter />
			{:else if page === 'publish'}
				<Publish />
			{:else}
				{@render settingsPanel()}
			{/if}
		</main>
	</div>
{/if}

{#if toastMsg}
	<div class="toast" class:err={!toastOk}>{toastMsg}</div>
{/if}

<style>
	.wallpaper {
		position: fixed;
		inset: 0;
		z-index: 0;
		background-size: cover;
		background-position: center;
	}
	.boot {
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--muted);
	}
	.onboard {
		/* 卡片里嵌了整个设置页，高度可能超过窗口：滚动容器 + margin:auto 居中，
		   内容超出一屏时从顶部完整滚动查看，不会被裁剪 */
		height: 100%;
		overflow-y: auto;
		display: flex;
		padding: 20px;
		position: relative;
		z-index: 1;
	}
	.onboard-card {
		width: 560px;
		max-width: 100%;
		flex-shrink: 0;
		margin: auto;
		padding: 28px;
	}
	.live2d-slot {
		flex: none;
		/* 顶到侧栏底部（默认左下角）；宽高由上面的内联样式算出来 */
		margin: auto auto 0;
		position: relative;
		z-index: 1;
	}
	.live2d-slot iframe {
		width: 100%;
		height: 100%;
		border: none;
		background: transparent;
	}
	/* 容器上方那一摞（看板娘的消息框 / 调整模式提示）：自下而上排列，宽度以模型那一列为限 */
	.live2d-above {
		position: absolute;
		bottom: calc(100% + 6px); /* 容器上沿再往上 6px：正好在流萤头顶之上，不压头发 */
		transform: translateX(-50%);
		display: flex;
		flex-direction: column-reverse;
		align-items: center;
		gap: 6px;
		pointer-events: none; /* 只是提示，别挡其他操作的点击 */
	}
	.live2d-above > * {
		width: max-content;
		max-width: 100%; /* 一行放不下时自动换行，不顶出模型那一列 */
		text-align: center;
		border-radius: 8px;
		padding: 6px 10px;
		color: #fff;
		font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
	}
	.live2d-say {
		background: rgba(20, 28, 32, 0.86);
		border: 1px solid rgba(255, 255, 255, 0.3);
		font-size: 13px;
		line-height: 1.5;
	}
	.live2d-hud {
		background: rgba(20, 46, 42, 0.92);
		font-size: 12px; /* 字号固定：不跟着模型缩放 */
		line-height: 1.5;
	}
</style>
