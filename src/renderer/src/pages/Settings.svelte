<script lang="ts">
	import { getContext, onMount } from 'svelte'
	import type { AppearanceSettings, DataDirInfo, GpuStatus } from '../lib/api'
	import Slider from '../components/Slider.svelte'
	import { errMsg } from '../lib/err'

	interface Props {
		onbound: () => void
		setWallpaper: () => Promise<void>
		clearWallpaper: () => Promise<void>
		setAccent: (name: string, accent: string, deep: string) => Promise<void>
		setDim: (v: number) => void
		setCardOpacity: (v: number) => void
		setSidebarOpacity: (v: number) => void
		setLive2dEnabled: (v: boolean) => Promise<void>
		setGlobalFollow: (v: boolean) => Promise<void>
		globalFollow: boolean
		gpuStatus: GpuStatus
		appearance: AppearanceSettings
		view: { s: number; x: number; y: number }
		onChangeLive2d: (v: { s: number; x: number; y: number }) => void
	}
	let {
		onbound,
		setWallpaper,
		clearWallpaper,
		setAccent,
		setDim,
		setCardOpacity,
		setSidebarOpacity,
		setLive2dEnabled,
		setGlobalFollow,
		globalFollow,
		gpuStatus,
		appearance,
		view: live2dView = { s: 1, x: 0, y: 0 },
		onChangeLive2d
	}: Props = $props()

	let path = $state('')
	let busy = $state(false)
	let dirInfo = $state<DataDirInfo | null>(null)
	const backendLabel = { hardware: '硬件加速', software: '软件渲染', unavailable: '不可用', unknown: '检测中' } as const
	const notify = getContext<(m: string, ok?: boolean) => void>('notify')

	async function toggleGpu(on: boolean): Promise<void> {
		try {
			await window.api.gpuSet(on) // 主进程会保存设置并立即重启应用
		} catch (e) {
			notify(errMsg(e), false)
		}
	}

	async function refreshDir(): Promise<void> {
		try {
			dirInfo = await window.api.dataDirInfo()
		} catch {
			/* 忽略 */
		}
	}
	async function chooseDir(): Promise<void> {
		try {
			const res = (await window.api.dataDirChoose()) as { dataDir: string } | null
			if (res) {
				await refreshDir()
				notify('数据目录已更换，现有数据已迁移过去')
			}
		} catch (e) {
			notify(errMsg(e), false)
		}
	}
	async function resetDir(): Promise<void> {
		try {
			await window.api.dataDirReset()
			await refreshDir()
			notify('已恢复默认位置（项目目录内）')
		} catch (e) {
			notify(errMsg(e), false)
		}
	}

	const ACCENTS = [
		{ name: '流萤·薄荷', accent: '#14B8A6', deep: '#0D9488' },
		{ name: '琥珀·余烬', accent: '#F59E0B', deep: '#D97706' },
		{ name: '樱粉·梦境', accent: '#EC7FA9', deep: '#DB5A8C' },
		{ name: '星穹·蓝', accent: '#5B8DEF', deep: '#3B6FD1' },
		{ name: '极光·紫', accent: '#8B7CF6', deep: '#6D5BD8' }
	]

	onMount(async () => {
		try {
			const s = await window.api.appInit()
			path = s.projectPath ?? ''
		} catch {
			/* 忽略 */
		}
		await refreshDir()
	})

	async function choose(): Promise<void> {
		busy = true
		try {
			const p = await window.api.chooseProject()
			if (p) {
				path = p
				notify('绑定成功！')
				onbound()
			}
		} catch (e) {
			notify(errMsg(e), false)
		} finally {
			busy = false
		}
	}
</script>

<div class="card">
	<h3>项目文件夹</h3>
	<p class="muted">
		Fireflux 只管理绑定的这个文件夹。所有读写都使用相对路径；
		文件夹挪动位置或改名后，在这里重新绑定一次即可，其余功能照常。
	</p>
	<div class="row"><code>{path || '（未绑定）'}</code></div>
	<button class="btn primary" style="margin-top:12px" onclick={choose} disabled={busy}>
		{path ? '更换项目文件夹' : '选择 Firefly 项目文件夹'}
	</button>
</div>

<div class="card" style="margin-top:14px">
	<h3>🎨 主题色</h3>
	<div class="row" style="gap:14px">
		{#each ACCENTS as a}
			<!-- accent 没设置过时用的是 app.css 里的默认色，它对应 ACCENTS 里的「流萤·薄荷」：
			     改默认色或改名时要一起改这里，否则默认状态不会有高亮 -->
			<button
				class="swatch-btn"
				class:current={appearance.accent === a.accent || (!appearance.accent && a.name === '流萤·薄荷')}
				onclick={() => setAccent(a.name, a.accent, a.deep)}
				title={a.name}
			>
				<span class="swatch" style="background: linear-gradient(135deg, {a.accent}, {a.deep})"></span>
				<span class="swatch-name">{a.name}</span>
			</button>
		{/each}
	</div>
	<p class="hint">点击即换，全局即时生效并记住选择。</p>
</div>

<div class="card" style="margin-top:14px">
	<h3>🖼️ 软件壁纸</h3>
	<div class="row" style="margin-bottom:8px">
		<button class="btn primary" onclick={setWallpaper}>📂 选择壁纸图片</button>
		{#if appearance.wallpaper}
			<button class="btn" onclick={clearWallpaper}>清除壁纸</button>
		{/if}
	</div>
	{#if appearance.wallpaper}
		<Slider
			label="壁纸减淡"
			min={0}
			max={0.85}
			step={0.05}
			unit="%"
			value={appearance.wallpaperDim ?? 0.45}
			oninput={setDim}
		/>
	{/if}
	<Slider
		label="卡片不透明度"
		min={0}
		max={1}
		step={0.05}
		unit="%"
		value={appearance.cardOpacity ?? 1}
		oninput={setCardOpacity}
		hint="范围 0~100%：作用于此页所有卡片（数据目录、看板娘等）。调低后半透明、露出后面的壁纸；文字密集的页面建议 80% 以上。"
	/>
	<Slider
		label="侧栏不透明度"
		min={0}
		max={1}
		step={0.05}
		unit="%"
		value={appearance.sidebarOpacity ?? appearance.cardOpacity ?? 1}
		oninput={setSidebarOpacity}
		hint="单独控制左侧导航栏那块（含看板娘所在区域）。不填时跟随卡片不透明度。"
	/>
	<p class="hint">
		壁纸会复制到数据目录的 <code>wallpapers/</code> 子文件夹（数据目录默认在客户端自己旁边，见下方「数据目录」）；
		它只影响客户端界面，不会写进博客项目，也不会被提交。卡片的透明程度用上面的「卡片不透明度」调。
	</p>
</div>

<div class="card" style="margin-top:14px">
	<h3>📁 数据目录</h3>
	<p class="muted">
		设置与壁纸保存在这里，<b>不会写进博客项目</b>。默认在客户端自己旁边：
		开发模式是管理器项目的 <code>data/</code>，安装版是安装目录的 <code>data\</code>（不可写时回退到系统用户目录）；也可以换成其他位置。
	</p>
	<div class="row"><code>{dirInfo?.dataDir || '（读取失败）'}</code>{#if dirInfo?.isCustom}<span class="tag">自定义位置</span>{/if}</div>
	<div class="row" style="margin-top:8px">
		<button class="btn primary" onclick={chooseDir}>📂 更换数据目录</button>
		{#if dirInfo?.isCustom}
			<button class="btn" onclick={resetDir}>恢复默认位置（客户端旁边）</button>
		{/if}
	</div>
	<p class="hint">更换时现有数据（设置 / 壁纸）会自动复制到新目录，原目录文件保留不动。</p>
</div>

<div class="card" style="margin-top:14px">
	<h3>⚡ 渲染模式（实验）</h3>
	<p class="muted">
		开启后尝试使用显卡加速；软件模式优先减少后台动画。切换需要重启，实际是否生效以下方检测结果为准。
	</p>
	<p class="hint" aria-live="polite">
		当前界面合成：<b>{backendLabel[gpuStatus.compositing]}</b> · 看板娘：<b>{backendLabel[gpuStatus.webgl]}</b>
		{#if gpuStatus.requestedHardware && gpuStatus.webgl === 'software'}
			<br />当前已回退软件渲染，自动使用节能策略。
		{/if}
	</p>
	<div class="row" style="margin-top:8px">
		<label class="l2d-switch">
			<input type="checkbox" checked={gpuStatus.requestedHardware} onchange={(e) => toggleGpu((e.target as HTMLInputElement).checked)} />
			<span>硬件加速渲染（点击后自动重启生效）</span>
		</label>
	</div>
</div>

<div class="card" style="margin-top:14px">
	<div class="row" style="justify-content:space-between; margin-bottom:4px">
		<h3 style="margin:0">🌟 看板娘</h3>
		<div class="row" style="gap:8px">
			<label class="l2d-switch">
				<input
					type="checkbox"
					checked={appearance.live2dEnabled !== false}
					onchange={(e) => setLive2dEnabled((e.target as HTMLInputElement).checked)}
				/>
				<span>显示看板娘</span>
			</label>
			{#if appearance.live2dEnabled !== false}
				<button class="btn small" onclick={() => onChangeLive2d({ s: 1, x: 0, y: 0 })}>↺ 恢复初始值</button>
			{/if}
		</div>
	</div>
	{#if appearance.live2dEnabled !== false}
		<label class="l2d-switch">
			<input type="checkbox" checked={globalFollow} onchange={(e) => setGlobalFollow((e.target as HTMLInputElement).checked)} />
			<span>全窗口鼠标跟随</span>
		</label>
		<p class="hint">
			开启后，在内容区移动鼠标也会唤醒看板娘；关闭后仍可在看板娘区域跟随、点击和播放动作。
			未手动设置时，硬件模式默认开启，软件模式默认关闭。
		</p>
		<p class="hint">
			CPU 软件渲染限制在最高 60 帧，并使用较低分辨率减少单帧成本；GPU 渲染不设置人工帧率上限。
			停止移动后自动定格，点击动作会保留播放时间；窗口失焦或拖拽时暂停。
		</p>
		<Slider
			label="模型大小"
			min={0.3}
			max={1}
			step={0.02}
			unit="%"
			value={live2dView.s}
			oninput={(v) => onChangeLive2d({ s: v, x: live2dView.x, y: live2dView.y })}
			hint="范围 30~100%：调的是看板娘容器（也就是模型本身）的宽度占比；想更大就把侧栏拉宽。"
		/>
		<Slider
			label="水平位置"
			min={-150}
			max={150}
			step={1}
			unit="px"
			value={live2dView.x}
			oninput={(v) => onChangeLive2d({ s: live2dView.s, x: v, y: live2dView.y })}
		/>
		<Slider
			label="垂直位置"
			min={-160}
			max={80}
			step={1}
			unit="px"
			value={live2dView.y}
			oninput={(v) => onChangeLive2d({ s: live2dView.s, x: live2dView.x, y: v })}
		/>
		<p class="hint">
			容器（可点击区域）大小自动等于模型本身：启动后看板娘会把自己的实际宽高比报给管理器，槽位按这个比例收紧，
			<b>模型上方不再留空框</b>，那块区域可以正常放/点其它东西。上面的三个滑块是相对这个尺寸做微调。
		</p>
		<p class="hint">调整会实时预览并自动保存；也可以直接在侧边栏点「✥ 调整看板娘」后拖拽移动、滚轮缩放。</p>
	{:else}
		<p class="hint">看板娘当前已关闭：侧栏更清爽，拖拽调整窗口/边栏也更流畅。打开开关即可恢复显示。</p>
	{/if}
</div>

<style>
	.swatch-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		border: 2px solid transparent;
		background: transparent;
		border-radius: 12px;
		padding: 10px 12px;
	}
	.swatch-btn:hover {
		background: var(--accent-soft);
	}
	.swatch-btn.current {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	.swatch {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		box-shadow: 0 3px 10px rgba(20, 184, 166, 0.3);
	}
	.swatch-name {
		font-size: 12px;
		color: var(--text);
	}
	.l2d-switch {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		cursor: pointer;
		font-size: 13.5px;
		font-weight: 600;
		color: var(--text);
		user-select: none;
	}
	.l2d-switch input {
		width: auto;
		accent-color: var(--accent);
	}
</style>
