import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { importAsset } from './assets'
import { discoverConfigs, readConfig, readHtml, setConfigEnv, writeConfig, writeHtml } from './configEngine'
import {
	deleteFile,
	dynamicTemplate,
	importContent,
	isContentFolder,
	listContent,
	postTemplate,
	projectTemplate,
	readDataUrl,
	readFile,
	stamp,
	writeFile
} from './files'
import { plantumlImageUrl } from './plantuml'
import { networkFailures } from './webdiag'
import { getGpuStatus } from './rendering'
import {
	addAll,
	branchCreate,
	branchList,
	branchSwitch,
	commitStaged,
	diffAll,
	diffFile,
	diffNames,
	fetchRemote,
	gitCommitPush,
	gitLog,
	gitStatus,
	mergeBranch,
	mergeRef,
	pushTo,
	remoteAdd,
	remoteBranchList,
	remoteList,
	remoteRemove
} from './git'
import {
	bindProject,
	changeDataDir,
	clearWallpaper,
	clearHardwareGpuMarker,
	dataDirInfo,
	getAppearance,
	getProject,
	isValidProject,
	pickWallpaper,
	setAppearance,
	setHardwareGpu,
	wallpaperDataUrl
} from './settings'

/** 向所有窗口广播事件（git 进度等） */
function broadcast(channel: string, payload: unknown): void {
	for (const w of BrowserWindow.getAllWindows()) w.webContents.send(channel, payload)
}

/** 启动时给渲染层的状态：项目是否已绑定，以及随窗口一起送出的外观与壁纸 */
function projectStatus(): { projectPath?: string; valid: boolean; appearance: unknown; wallpaperData: string | null } {
	try {
		const projectPath = getProject()
		const s = getAppearance()
		return {
			projectPath,
			valid: true,
			appearance: s,
			wallpaperData: wallpaperDataUrl()
		}
	} catch {
		let appearance: unknown = {}
		let wallpaperData: string | null = null
		try {
			appearance = getAppearance()
			wallpaperData = wallpaperDataUrl()
		} catch {
			/* 未绑定 */
		}
		return { appearance, wallpaperData, valid: false }
	}
}

/** 配置引擎每次调用前注入项目根目录 */
function withConfigEnv<T>(fn: () => T): T {
	setConfigEnv(getProject())
	return fn()
}

export function registerIpc(): void {
	// ---------- 启动与项目绑定 ----------
	ipcMain.handle('app:init', () => projectStatus())

	ipcMain.handle('project:choose', async () => {
		const picked = await dialog.showOpenDialog({
			title: '选择 Firefly 项目根目录（包含 src 文件夹的那一层）',
			properties: ['openDirectory']
		})
		if (picked.canceled || !picked.filePaths[0]) return null
		const p = picked.filePaths[0]
		if (!isValidProject(p)) {
			throw new Error('这个文件夹不像 Firefly 项目（没找到 src/content 和 src/config），请选择项目根目录。')
		}
		bindProject(p)
		return p
	})

	// ---------- 外观与渲染（壁纸 / 主题色 / 硬件加速） ----------
	ipcMain.handle('appearance:set', (_e, patch: Record<string, unknown>) => setAppearance(patch))
	ipcMain.handle('appearance:set-wallpaper', () => pickWallpaper())
	ipcMain.handle('appearance:clear-wallpaper', () => clearWallpaper())
	ipcMain.handle('appearance:wallpaper-data', () => wallpaperDataUrl())
	// 硬件加速渲染（实验）：写入设置后重启应用生效；驱动崩溃时下次启动自动回退
	ipcMain.handle('gpu:status', () => getGpuStatus())
	ipcMain.handle('gpu:set', (_e, on: boolean) => {
		setHardwareGpu(!!on)
		// 主动重启不应被下次启动误判为崩溃；app.exit 不保证窗口关闭事件执行。
		clearHardwareGpuMarker()
		app.relaunch()
		app.exit(0)
		return true
	})

	// ---------- 数据目录 ----------
	ipcMain.handle('data-dir:info', () => dataDirInfo())
	ipcMain.handle('data-dir:choose', async () => {
		const picked = await dialog.showOpenDialog({
			title: '选择数据保存目录（设置 / 壁纸将迁移到该目录）',
			properties: ['openDirectory', 'createDirectory']
		})
		if (picked.canceled || !picked.filePaths[0]) return null
		return changeDataDir(picked.filePaths[0])
	})
	ipcMain.handle('data-dir:reset', () => changeDataDir(null))

	// ---------- 配置引擎（全部按相对路径操作，配置列表从项目文件动态发现） ----------
	ipcMain.handle('config:discover', () => withConfigEnv(() => discoverConfigs()))

	ipcMain.handle('config:read', (_e, payload: { rel: string; kind: 'ts' | 'html'; exports?: string[] }) => {
		if (payload.kind === 'html') {
			return { kind: 'html', rel: payload.rel, content: withConfigEnv(() => readHtml(payload.rel)) }
		}
		return { kind: 'ts', rel: payload.rel, exports: withConfigEnv(() => readConfig(payload.rel, payload.exports ?? [])) }
	})

	ipcMain.handle('config:write', (_e, payload: { rel: string; kind: 'ts' | 'html'; exportName?: string; values?: unknown; content?: string }) => {
		if (payload.kind === 'html') {
			withConfigEnv(() => writeHtml(payload.rel, payload.content ?? ''))
			return { ok: true }
		}
		if (!payload.exportName) throw new Error('缺少导出名')
		const exportName = payload.exportName
		return withConfigEnv(() => writeConfig(payload.rel, exportName, payload.values))
	})

	// ---------- 内容文件 ----------
	ipcMain.handle('content:list', (_e, folder: string) => {
		if (!isContentFolder(folder)) throw new Error('未知内容目录：' + folder)
		return listContent(folder)
	})

	ipcMain.handle('file:read', (_e, rel: string) => readFile(rel))
	ipcMain.handle('file:read-data-url', (_e, rel: string) => readDataUrl(rel))
	ipcMain.handle('file:write', (_e, rel: string, content: string) => writeFile(rel, content))
	ipcMain.handle('file:delete', (_e, rel: string) => deleteFile(rel))

	/** PlantUML 预览图地址：服务地址从博客 plantumlConfig 读取，缺省用官方服务器 */
	ipcMain.handle('util:plantuml-url', (_e, text: string) => {
		let server = 'https://www.plantuml.com/plantuml'
		try {
			const res = withConfigEnv(() => readConfig('src/config/plantumlConfig.ts', ['plantumlConfig']))
			const s = (res[0]?.values as { server?: string } | undefined)?.server
			if (s && /^https?:\/\//.test(s)) server = s
		} catch {
			/* 配置读不到就用默认服务器 */
		}
		return plantumlImageUrl(text, server)
	})

	ipcMain.handle('content:import', (_e, folder: string) => {
		if (!isContentFolder(folder)) throw new Error('未知内容目录：' + folder)
		return importContent(folder)
	})

	ipcMain.handle(
		'content:create',
		(_e, payload: { folder: string; kind: 'post' | 'project' | 'dynamic'; title?: string; slug?: string; content?: string; pinned?: boolean; location?: string }) => {
			const { folder, kind } = payload
			if (!isContentFolder(folder)) throw new Error('未知内容目录：' + folder)
			const stampText = stamp()
			let rel: string
			let content: string
			if (kind === 'post') {
				rel = `src/content/posts/${payload.slug || stampText}.md`
				content = postTemplate(payload.title || '未命名文章', payload.slug || 'untitled')
			} else if (kind === 'project') {
				rel = `src/content/projects/${payload.slug || stampText}.md`
				content = projectTemplate(payload.title || '未命名项目', payload.slug || 'untitled')
			} else {
				rel = `src/content/dynamic/${stampText}.md`
				content = dynamicTemplate(payload.content || '', !!payload.pinned, payload.location || '')
			}
			if (fs.existsSync(path.join(getProject(), rel))) {
				throw new Error('同名文件已存在：' + rel)
			}
			writeFile(rel, content)
			return rel
		}
	)

	// ---------- 资源导入 ----------
	ipcMain.handle('asset:import', (_e, payload: { target: string }) => importAsset(payload.target))

	// ---------- git ----------
	ipcMain.handle('git:status', () => gitStatus())
	ipcMain.handle('git:commit-push', (_e, message: string) => gitCommitPush(message))
	ipcMain.handle('git:remote-list', () => remoteList())
	ipcMain.handle('git:remote-add', (_e, name: string, url: string) => remoteAdd(name, url))
	ipcMain.handle('git:remote-remove', (_e, name: string) => remoteRemove(name))
	ipcMain.handle('git:branch-list', () => branchList())
	ipcMain.handle('git:branch-create', (_e, name: string) => branchCreate(name))
	ipcMain.handle('git:branch-switch', (_e, name: string) => branchSwitch(name))
	ipcMain.handle('git:merge', (_e, name: string) => mergeBranch(name))
	ipcMain.handle('git:merge-ref', (_e, ref: string) => mergeRef(ref))
	ipcMain.handle('git:fetch', (_e, remote: string) => fetchRemote(remote, (line) => broadcast('git:progress', line)))
	ipcMain.handle('git:remote-branch-list', (_e, remote: string) => remoteBranchList(remote))
	ipcMain.handle('git:diff-file', (_e, rel: string) => diffFile(rel))
	ipcMain.handle('git:diff-all', () => diffAll())
	ipcMain.handle('git:diff-names', () => diffNames())
	ipcMain.handle('git:push-to', (_e, remote: string, branch: string, force: boolean) =>
		pushTo(remote, branch, force, (line) => broadcast('git:progress', line))
	)
	ipcMain.handle('git:add-all', () => addAll())
	ipcMain.handle('git:commit', (_e, message: string) => commitStaged(message))
	ipcMain.handle('git:log', (_e, count: number) => gitLog(count))

	// ---------- 网页诊断 ----------
	// 内嵌网页（Memos）的请求失败 / 证书错误清单，给「动态发布 → 连接诊断」面板
	ipcMain.handle('webview:diagnostics', () => networkFailures())

	// ---------- 其它 ----------
	// 交给系统浏览器打开：只放行 http(s)，挡住 file:// 等本地协议被看板娘/页面内容滥用
	ipcMain.handle('open:external', (_e, url: string) => {
		if (!/^https?:\/\//.test(url)) throw new Error('只允许打开网页链接')
		return shell.openExternal(url)
	})
}
