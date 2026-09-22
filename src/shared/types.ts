/**
 * 主进程 ↔ 预加载 ↔ 渲染层之间传递的数据结构。
 * 三方共用这一份定义：主进程负责产出，渲染层通过 window.api 消费，
 * 避免两边各写一份接口后悄悄跑偏（字段漂移编译器不会报错）。
 */

/** 内容文件（文章 / 项目 / 动态 / spec）：界面只用 rel 打开文件，列表按 mtimeMs 倒序 */
export interface ContentItem {
	rel: string
	mtimeMs: number
}

/** git status --porcelain 的结果；ok=false 时 error 是给用户看的原文 */
export interface GitStatus {
	ok: boolean
	branch?: string
	files: { flag: string; file: string }[]
	error?: string
}

export interface RemoteInfo {
	name: string
	fetch: string
	push: string
}

export interface BranchInfo {
	name: string
	current: boolean
}

/** 合并结果：ok=false 时看 log 里的 git 输出；conflicted 表示留下了冲突文件 */
export interface MergeResult {
	ok: boolean
	log: string
	conflicted: boolean
}

export interface LogEntry {
	hash: string
	author: string
	date: string
	subject: string
}

/** 客户端外观偏好，存 data/settings.json，保存后立即生效（无需重启） */
export interface AppearanceSettings {
	/** 主题色与它的深色变体（十六进制） */
	accent?: string
	accentDeep?: string
	/** 壁纸减淡程度 0~0.85，越大越淡 */
	wallpaperDim?: number
	/** 卡片不透明度 0.3~1（1 = 不透明；调低可露出后面的壁纸） */
	cardOpacity?: number
	/** 侧栏不透明度 0.3~1；不填时跟随 cardOpacity */
	sidebarOpacity?: number
	/** 已导入壁纸的文件路径；为空表示不使用壁纸 */
	wallpaper?: string
	/** 是否显示侧栏看板娘（关掉后拖拽/缩放更流畅） */
	live2dEnabled?: boolean
	/** 全窗口鼠标跟随；未设置时，硬件模式开启、软件模式关闭 */
	live2dGlobalFollow?: boolean
	/** 看板娘缩放，1 = 原项目初始值 */
	live2dScale?: number
	/** 看板娘水平 / 垂直偏移（像素），叠加在原项目初始值之上 */
	live2dX?: number
	live2dY?: number
}

/** app:init 的返回值：项目是否已绑定，以及随窗口一起送出的外观与壁纸 */
export interface AppSettingsInfo {
	projectPath?: string
	valid: boolean
	appearance?: AppearanceSettings
	wallpaperData?: string | null
}

/** 单个导出对象的表单数据：values 是字段值，labels 是「注释当标签」的映射（键为字段路径） */
export interface ConfigExportData {
	name: string
	values: unknown
	labels: Record<string, string>
}

/** 主进程扫描 src/config/ 发现的配置文件 */
export interface DiscoveredConfig {
	rel: string
	kind: 'ts' | 'html'
	exports: string[]
}

/** 配置读取结果：html 走源码编辑器，ts 走表单 */
export type ConfigReadResult =
	| { kind: 'html'; rel: string; content: string }
	| { kind: 'ts'; rel: string; exports: ConfigExportData[] }

/**
 * 网页加载失败记录（动态页内嵌 Memos 的图片/接口挂掉时用来自查）：
 * kind 区分普通请求失败与证书不受信任，count 是同一 URL + 错误的重复次数。
 */
export interface NetworkFailure {
	/** 记录时间 HH:mm:ss */
	at: string
	url: string
	/** Chromium 的错误码，如 net::ERR_CONNECTION_CLOSED */
	error: string
	kind: 'request' | 'certificate'
	count: number
}

/** 数据目录状态：dataDir 为当前生效目录，isCustom 表示用户换过位置 */
export interface DataDirInfo {
	dataDir: string
	isCustom: boolean
}

/** 用户选择与当前实际渲染能力分别报告，不能用设置值代替 GPU 检测。 */
export type RenderBackend = 'hardware' | 'software' | 'unavailable' | 'unknown'
export interface GpuStatus {
	requestedHardware: boolean
	webgl: RenderBackend
	compositing: RenderBackend
	renderer: string
}
