import { BrowserWindow, Menu, app } from 'electron'
import path from 'node:path'
import { registerIpc } from './services/ipc'
import { installGpuStatusUpdates } from './services/rendering'
import { clearGpuCaches, clearHardwareGpuMarker, portableDataRoot, resolveHardwareGpu } from './services/settings'
import { installNetworkDiagnostics, installWebviewGuards } from './services/webdiag'

Menu.setApplicationMenu(null)

// 便携化：应用数据与 Electron 缓存（含网页会话）都放应用自身旁 data/userData，不写系统 AppData
try {
	app.setPath('userData', path.join(portableDataRoot(), 'userData'))
} catch {
	/* 目录不可写时保持系统默认位置 */
}

// 本机子进程（GPU/网络/渲染）受第三方软件 DLL 注入影响易崩溃：
// 关闭沙箱、内嵌服务进程、禁用渲染器代码完整性校验
app.commandLine.appendSwitch('no-sandbox')
app.commandLine.appendSwitch('disable-features', 'NetworkServiceSandbox,RendererCodeIntegrity')
app.commandLine.appendSwitch('network-service-in-process')

// 默认（软件渲染）：GPU 程序内运行 + 强制 ANGLE 走 SwiftShader（看板娘 Live2D 需要 WebGL）。
// 实测 in-process-gpu 下硬件 ANGLE 无法初始化（gl=none），所以「硬件加速渲染」实验
// 必须允许 GPU 独立子进程：不追加 in-process-gpu 与 swiftshader 开关，
// 显卡驱动崩溃时 Chromium 自动回落软件合成，应用不会崩。
const hardwareGpu = resolveHardwareGpu()
console.log('[Fireflux] 渲染模式:', hardwareGpu ? '硬件加速（实验）' : '软件渲染')
if (!hardwareGpu) {
	app.commandLine.appendSwitch('in-process-gpu')
	app.commandLine.appendSwitch('use-angle', 'swiftshader')
	app.commandLine.appendSwitch('enable-unsafe-swiftshader')
}

// 手动诊断：设置该环境变量时开启远程调试端口（供 DevTools 协议连入排查界面问题）
if (process.env['FF_REMOTE_DEBUG']) {
	app.commandLine.appendSwitch('remote-debugging-port', process.env['FF_REMOTE_DEBUG'])
}
// 测试辅助：窗口被其他窗口遮挡时 Chromium 会停止渲染（生产环境这是正确省电行为，
// 但会让自动化测量全部为 0）；跑性能归因台（scripts/bench-drag.mjs）时禁用遮挡节流
if (process.env['FF_DRAG_BENCH']) {
	app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
	app.commandLine.appendSwitch('disable-renderer-backgrounding')
	app.commandLine.appendSwitch('disable-background-timer-throttling')
}
// 测试辅助：强制界面按 1 倍像素渲染（验证软件光栅化下 DPR 的成本）
if (process.env['FF_FORCE_DSF']) {
	app.commandLine.appendSwitch('force-device-scale-factor', '1')
}

function createWindow(): void {
	const win = new BrowserWindow({
		width: 1400,
		height: 1050,
		minWidth: 1000,
		minHeight: 660,
		title: 'Fireflux',
		icon: app.isPackaged ? undefined : path.join(app.getAppPath(), 'build', 'icon.png'),
		backgroundColor: '#f5f6f8',
		webPreferences: {
			preload: path.join(__dirname, '../preload/index.js'),
			contextIsolation: true,
			nodeIntegration: false,
			// 动态页的远端 Tab 用 <webview> 内嵌 Memos 站点
			webviewTag: true
		}
	})

	win.webContents.on('before-input-event', (_event, input) => {
		if (input.type === 'keyDown' && input.key === 'F12') {
			win.webContents.toggleDevTools()
		}
	})

	win.webContents.on('did-finish-load', () => {
		// 开发辅助：性能/交互归因台（scripts/bench-drag.mjs 负责启动与收结果）
		if (process.env['FF_DRAG_BENCH']) {
			void import('./services/drag-bench').then((m) => m.runDragBench(win))
		}
	})
	// 渲染进程崩溃（如显卡驱动异常、GPU 缓存中毒）后窗口会变白：自动清缓存并重载恢复。
	// 限制重载次数，避免环境持续异常时陷入「崩溃→重载」死循环
	let crashReloads = 0
	win.webContents.on('render-process-gone', (_e, details) => {
		console.error('[Fireflux] 渲染进程异常退出:', details.reason, 'exitCode=', details.exitCode)
		if ((details.reason === 'crashed' || details.reason === 'oom') && crashReloads < 3) {
			crashReloads++
			clearGpuCaches()
			setTimeout(() => {
				try {
					win.webContents.reload()
				} catch {
					/* 窗口已销毁则忽略 */
				}
			}, 800)
		}
	})

	// electron-vite dev 服务器地址只在开发模式存在，打包后走本地文件
	if (process.env['ELECTRON_RENDERER_URL']) {
		void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
	} else {
		void win.loadFile(path.join(__dirname, '../renderer/index.html'))
	}
}

app.whenReady().then(() => {
	// 网页（Memos）的请求失败与证书错误：记日志 + 留给「动态页 → 连接诊断」面板
	installNetworkDiagnostics()
	installWebviewGuards()
	registerIpc()
	installGpuStatusUpdates()
	createWindow()
	// GPU 能力诊断（设置 FF_GPU_INFO=1 时输出，用于判断硬件加速是否真正生效）
	if (process.env['FF_GPU_INFO']) {
		void Promise.all([app.getGPUFeatureStatus(), app.getGPUInfo('complete')])
			.then(([status, info]) => {
				console.log('[gpu-status]' + JSON.stringify(status))
				console.log('[gpu-info]' + JSON.stringify(info).slice(0, 800))
			})
			.catch(() => console.log('[gpu-status] 获取失败'))
	}
	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow()
	})
})

app.on('window-all-closed', () => {
	clearHardwareGpuMarker()
	if (process.platform !== 'darwin') app.quit()
})
