<script lang="ts">
	/**
	 * 垂直拖拽分隔条：拖动调整相邻面板宽度，实时预览 —— 硬件模式逐帧跟随，CPU 模式最高 60 帧，
	 * 文字实时重排。
	 *
	 * 指示只用一个「短手柄」（与平时看到的那条短竖条同一个元素），它就在拖拽条正中，
	 * 也就是两块面板的分界线上：布局跟着鼠标走，手柄天然贴着分界线，不做任何吸附平移。
	 * 不画贯穿整窗的长线：一是它和真实落点对不上会让人误判，二是软件渲染下多一个
	 * 全高图层每帧都要重画。
	 */
	interface Props {
		width: number
		min?: number
		max?: number
		/** 手柄在面板右侧时拖右变宽（right），在左侧时拖左变宽（left） */
		side?: 'left' | 'right'
		/**
		 * 右侧内容区额外的内边距（px）：用来让拖拽条两侧的留白对称。
		 * 侧栏那条拖拽条右侧是「2px 外边距 + 内容区 14px 内边距」，左侧只有 2px，
		 * 手柄看起来就偏左不居中；把这段差值从左边补上即可（列表/编辑器那条本身是
		 * flex gap，两边对称，不用传）
		 */
		gapLeft?: number
		onresize: (w: number) => void
		onfinish?: (w: number) => void
	}
	let { width, min = 160, max = 520, side = 'right', gapLeft = 0, onresize, onfinish }: Props = $props()

	let dragging = $state(false)

	function down(e: MouseEvent): void {
		e.preventDefault()
		// 手柄保持在它平时的位置（拖拽条正中，也就是两块面板中间），不做任何吸附平移：
		// 布局跟手，拖拽条会被布局带着一起走
		dragging = true
		document.body.style.cursor = 'col-resize'
		document.body.classList.add('ff-dragging')
		document.body.dispatchEvent(new CustomEvent('ff-dragstart'))

		const startX = e.clientX
		const startW = width
		const dir = side === 'right' ? 1 : -1
		let lastW = startW
		let rafId: number | null = null
		let lastApply = 0
		let sawPressed = false
		const move = (ev: MouseEvent): void => {
			// 兜底：mouseup 丢在窗口外时（会卡住拖拽状态）用 buttons 判断按钮已松开。
			// 只有在这次拖拽里确实见过「按下」状态才判定，避免合成输入的 buttons 不可靠时误判
			if (ev.buttons & 1) sawPressed = true
			else if (sawPressed && dragging) {
				up()
				return
			}
			lastW = Math.min(max, Math.max(min, Math.round(startW + (ev.clientX - startX) * dir)))
			if (rafId !== null) return
			rafId = requestAnimationFrame(() => {
				rafId = null
				const now = performance.now()
				// CPU 模式最多每 16.67ms 更新一次；高刷新率屏幕不会把布局重排推到 60 帧以上。
				const software = document.documentElement.dataset.renderMode !== 'hardware'
				if (software && now - lastApply < 1000 / 60) return
				lastApply = now
				onresize(lastW)
			})
		}
		const up = (): void => {
			dragging = false
			document.body.style.cursor = ''
			document.body.classList.remove('ff-dragging')
			document.body.dispatchEvent(new CustomEvent('ff-dragend'))
			if (rafId !== null) {
				cancelAnimationFrame(rafId)
				rafId = null
			}
			onresize(lastW)
			onfinish?.(lastW)
			window.removeEventListener('mousemove', move)
			window.removeEventListener('mouseup', up)
		}
		window.addEventListener('mousemove', move)
		window.addEventListener('mouseup', up)
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	class="dragbar"
	class:dragging
	role="separator"
	aria-orientation="vertical"
	title="拖动调整宽度"
	style="margin-left: {2 + gapLeft}px"
	onmousedown={down}
></div>

<style>
	.dragbar {
		width: 9px;
		margin: 0 2px;
		border-radius: 5px;
		cursor: col-resize;
		flex-shrink: 0;
		position: relative;
		/* 高于内容区（z-index:1），拖动时手柄不会被右侧卡片及其阴影盖住 */
		z-index: 5;
	}
	.dragbar::after {
		content: '';
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 4px;
		height: 40px;
		border-radius: 3px;
		background: #bfd9d2;
		/* 只过渡颜色和高度：位移必须逐帧跟手，不能加过渡 */
		transition: background 0.15s, height 0.15s;
	}
	.dragbar:hover::after,
	.dragbar.dragging::after {
		background: var(--accent);
		height: 64px;
		box-shadow: 0 0 8px rgba(20, 184, 166, 0.45);
	}
</style>
