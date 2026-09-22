import { contextBridge, ipcRenderer } from 'electron'
import type { GpuStatus } from '../shared/types'

/**
 * 关键防线：Svelte 的 $state 是代理对象，Electron IPC 的结构化克隆无法处理代理，
 * 统一在这里把所有参数转成纯 JSON，避免 "An object could not be cloned"。
 */
function toPlain<T>(value: T): T {
	if (value === null || typeof value !== 'object') return value
	return JSON.parse(JSON.stringify(value)) as T
}

function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
	return ipcRenderer.invoke(channel, ...args.map((a) => toPlain(a)))
}

const api = {
	appInit: (): Promise<unknown> => invoke('app:init'),
	chooseProject: (): Promise<string | null> => invoke<string | null>('project:choose'),

	configDiscover: (): Promise<unknown> => invoke('config:discover'),
	configRead: (payload: { rel: string; kind: 'ts' | 'html'; exports?: string[] }): Promise<unknown> =>
		invoke('config:read', payload),
	configWrite: (payload: { rel: string; kind: 'ts' | 'html'; exportName?: string; values?: unknown; content?: string }): Promise<unknown> =>
		invoke('config:write', payload),

	contentList: (folder: string): Promise<unknown> => invoke('content:list', folder),
	fileRead: (rel: string): Promise<string> => invoke<string>('file:read', rel),
	fileDataUrl: (rel: string): Promise<string> => invoke<string>('file:read-data-url', rel),
	plantumlUrl: (text: string): Promise<string> => invoke<string>('util:plantuml-url', text),
	fileWrite: (rel: string, content: string): Promise<void> => invoke<void>('file:write', rel, content),
	fileDelete: (rel: string): Promise<void> => invoke<void>('file:delete', rel),
	contentImport: (folder: string): Promise<string[]> => invoke<string[]>('content:import', folder),
	contentCreate: (payload: {
		folder: string
		kind: 'post' | 'project' | 'dynamic'
		title?: string
		slug?: string
		content?: string
		pinned?: boolean
		location?: string
	}): Promise<string> => invoke<string>('content:create', payload),

	assetImport: (target: string): Promise<string[]> => invoke<string[]>('asset:import', { target }),

	gitStatus: (): Promise<unknown> => invoke('git:status'),
	gitCommitPush: (message: string): Promise<string> => invoke<string>('git:commit-push', message),

	remoteList: (): Promise<unknown> => invoke('git:remote-list'),
	remoteAdd: (name: string, url: string): Promise<void> => invoke<void>('git:remote-add', name, url),
	remoteRemove: (name: string): Promise<void> => invoke<void>('git:remote-remove', name),
	branchList: (): Promise<unknown> => invoke('git:branch-list'),
	branchCreate: (name: string): Promise<void> => invoke<void>('git:branch-create', name),
	branchSwitch: (name: string): Promise<void> => invoke<void>('git:branch-switch', name),
	mergeBranch: (name: string): Promise<unknown> => invoke('git:merge', name),
	mergeRef: (ref: string): Promise<unknown> => invoke('git:merge-ref', ref),
	fetchRemote: (remote: string): Promise<void> => invoke<void>('git:fetch', remote),
	remoteBranchList: (remote: string): Promise<string[]> => invoke<string[]>('git:remote-branch-list', remote),
	diffFile: (rel: string): Promise<string> => invoke<string>('git:diff-file', rel),
	diffAll: (): Promise<string> => invoke<string>('git:diff-all'),
	diffNames: (): Promise<string> => invoke<string>('git:diff-names'),
	pushTo: (remote: string, branch: string, force: boolean): Promise<string> =>
		invoke<string>('git:push-to', remote, branch, force),
	onGitProgress: (cb: (line: string) => void): (() => void) => {
		const listener = (_e: unknown, line: string): void => cb(line)
		ipcRenderer.on('git:progress', listener)
		return (): void => {
			ipcRenderer.removeListener('git:progress', listener)
		}
	},

	addAll: (): Promise<string> => invoke<string>('git:add-all'),
	commitStaged: (message: string): Promise<string> => invoke<string>('git:commit', message),
	gitLog: (count: number): Promise<unknown> => invoke('git:log', count),

	openExternal: (url: string): Promise<void> => invoke<void>('open:external', url),

	appearanceSet: (patch: Record<string, unknown>): Promise<unknown> => invoke('appearance:set', patch),
	appearanceSetWallpaper: (): Promise<unknown> => invoke('appearance:set-wallpaper'),
	appearanceClearWallpaper: (): Promise<unknown> => invoke('appearance:clear-wallpaper'),
	appearanceWallpaperData: (): Promise<string | null> => invoke<string | null>('appearance:wallpaper-data'),

	gpuStatus: (): Promise<GpuStatus> => invoke<GpuStatus>('gpu:status'),
	onGpuStatus: (cb: (status: GpuStatus) => void): (() => void) => {
		const listener = (_e: Electron.IpcRendererEvent, status: GpuStatus): void => cb(status)
		ipcRenderer.on('gpu:changed', listener)
		return () => { ipcRenderer.removeListener('gpu:changed', listener) }
	},
	gpuSet: (on: boolean): Promise<boolean> => invoke<boolean>('gpu:set', on),

	/** 内嵌网页的请求失败/证书错误清单（动态页「连接诊断」用） */
	webviewDiagnostics: (): Promise<unknown> => invoke('webview:diagnostics'),

	dataDirInfo: (): Promise<unknown> => invoke('data-dir:info'),
	dataDirChoose: (): Promise<unknown> => invoke('data-dir:choose'),
	dataDirReset: (): Promise<unknown> => invoke('data-dir:reset')
}

// 暴露给渲染层的 window.api：类型声明在 renderer/src/lib/api.d.ts（两边保持一致）
contextBridge.exposeInMainWorld('api', api)
