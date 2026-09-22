import { app, BrowserWindow } from 'electron'
import type { GpuStatus } from '../../shared/types'
import { classifyGpuStatus } from '../../shared/rendering'
import { getSettings } from './settings'

let pending: Promise<GpuStatus> | undefined
let lastStatus = ''

/** 读取运行时能力；GPU 初始化失败时保守使用节能策略，不把设置开关当作检测结果。 */
export function getGpuStatus(): Promise<GpuStatus> {
	if (pending) return pending
	pending = Promise.resolve().then(() => {
		let features: { webgl?: string; gpu_compositing?: string } = {}
		try {
			// 只读取同步的 feature status；getGPUInfo('complete') 可能等待 GPU 进程，
			// 不能放在窗口启动和主进程 IPC 的关键路径上。
			features = app.getGPUFeatureStatus()
		} catch {
			// GPU 状态尚未初始化时返回 unknown，不能阻塞界面启动。
		}
		return classifyGpuStatus(
			getSettings().hardwareGpu === true,
			features,
			'',
			app.commandLine.getSwitchValue('use-angle') === 'swiftshader'
		)
	}).finally(() => { pending = undefined })
	return pending
}

export function installGpuStatusUpdates(): void {
	app.on('gpu-info-update', () => {
		void getGpuStatus().then((status) => {
			const key = JSON.stringify(status)
			if (key === lastStatus) return
			lastStatus = key
			for (const win of BrowserWindow.getAllWindows()) {
				if (!win.webContents.isDestroyed()) win.webContents.send('gpu:changed', status)
			}
		}).catch(() => {})
	})
}
