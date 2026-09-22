/**
 * window.api 的类型声明（实现见 src/preload/index.ts）。
 * 传输的数据结构统一放在 src/shared/types.ts，主进程与渲染层共用一份，避免字段漂移。
 */
import type {
	AppearanceSettings,
	AppSettingsInfo,
	BranchInfo,
	ConfigExportData,
	ConfigReadResult,
	ContentItem,
	DataDirInfo,
	DiscoveredConfig,
	GitStatus,
	GpuStatus,
	LogEntry,
	MergeResult,
	NetworkFailure,
	RemoteInfo
} from '../../../shared/types'

export type {
	AppearanceSettings,
	AppSettingsInfo,
	BranchInfo,
	ConfigExportData,
	ConfigReadResult,
	ContentItem,
	DataDirInfo,
	DiscoveredConfig,
	GitStatus,
	GpuStatus,
	LogEntry,
	MergeResult,
	NetworkFailure,
	RemoteInfo
} from '../../../shared/types'

export interface WindowApi {
	appInit(): Promise<AppSettingsInfo>
	chooseProject(): Promise<string | null>

	configDiscover(): Promise<DiscoveredConfig[]>
	configRead(payload: { rel: string; kind: 'ts' | 'html'; exports?: string[] }): Promise<ConfigReadResult>
	configWrite(payload: {
		rel: string
		kind: 'ts' | 'html'
		exportName?: string
		values?: unknown
		content?: string
	}): Promise<{ ok: true; patches?: number }>

	contentList(folder: string): Promise<ContentItem[]>
	fileRead(rel: string): Promise<string>
	fileDataUrl(rel: string): Promise<string>
	plantumlUrl(text: string): Promise<string>
	fileWrite(rel: string, content: string): Promise<void>
	fileDelete(rel: string): Promise<void>
	contentImport(folder: string): Promise<string[]>
	contentCreate(payload: {
		folder: string
		kind: 'post' | 'project' | 'dynamic'
		title?: string
		slug?: string
		content?: string
		pinned?: boolean
		location?: string
	}): Promise<string>

	/** 导入本地资源并返回生成的引用路径（复制到博客约定目录，见主进程 services/assets.ts） */
	assetImport(target: string): Promise<string[]>

	gitStatus(): Promise<GitStatus>
	/** git add -A + commit（不推送，推送用 pushTo） */
	gitCommitPush(message: string): Promise<string>

	remoteList(): Promise<RemoteInfo[]>
	remoteAdd(name: string, url: string): Promise<void>
	remoteRemove(name: string): Promise<void>
	branchList(): Promise<BranchInfo[]>
	branchCreate(name: string): Promise<void>
	branchSwitch(name: string): Promise<void>
	mergeBranch(name: string): Promise<MergeResult>
	mergeRef(ref: string): Promise<MergeResult>
	fetchRemote(remote: string): Promise<void>
	remoteBranchList(remote: string): Promise<string[]>
	diffFile(rel: string): Promise<string>
	diffAll(): Promise<string>
	diffNames(): Promise<string>
	pushTo(remote: string, branch: string, force: boolean): Promise<string>
	/** 订阅 fetch/push 的进度行，返回取消订阅函数 */
	onGitProgress(cb: (line: string) => void): () => void

	addAll(): Promise<string>
	commitStaged(message: string): Promise<string>
	gitLog(count: number): Promise<LogEntry[]>

	openExternal(url: string): Promise<void>

	appearanceSet(patch: AppearanceSettings): Promise<AppearanceSettings>
	appearanceSetWallpaper(): Promise<AppearanceSettings>
	appearanceClearWallpaper(): Promise<AppearanceSettings>
	appearanceWallpaperData(): Promise<string | null>

	gpuStatus(): Promise<GpuStatus>
	onGpuStatus(cb: (status: GpuStatus) => void): () => void
	gpuSet(on: boolean): Promise<boolean>

	/** 内嵌网页（Memos）最近的请求失败与证书错误，用于动态页的「连接诊断」 */
	webviewDiagnostics(): Promise<NetworkFailure[]>

	dataDirInfo(): Promise<DataDirInfo>
	dataDirChoose(): Promise<DataDirInfo | null>
	dataDirReset(): Promise<DataDirInfo>
}

declare global {
	interface Window {
		api: WindowApi
	}
}

export {}
