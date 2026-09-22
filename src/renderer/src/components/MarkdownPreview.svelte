<script lang="ts">
	import 'katex/dist/katex.min.css'
	import 'highlight.js/styles/github.css'
	import { ansiToHtml } from '../lib/ansi'
	import { parseTags, renderMarkdown, splitFrontmatter, transformMdx } from '../lib/preview'

	let { content, rel = '', isMdx = false }: { content: string; rel?: string; isMdx?: boolean } = $props()

	let wrap = $state<HTMLElement | undefined>(undefined)

	const imgCache = new Map<string, string>()

	const view = $derived.by(() => {
		const { fm, body: rawBody } = splitFrontmatter(content)
		const body = isMdx ? transformMdx(rawBody) : rawBody
		const title = typeof fm['title'] === 'string' && fm['title'] ? fm['title'] : ''
		const tags = parseTags(fm['tags'])
		const date = typeof fm['published'] === 'string' ? fm['published'] : ''
		return { title, tags, date, html: renderMarkdown(body, rel) }
	})

	/** 本地图片 → data URL（带缓存） */
	function fillImages(el: HTMLElement): void {
		el.querySelectorAll<HTMLImageElement>('img[data-local]').forEach((img) => {
			const path = img.getAttribute('data-local') ?? ''
			if (!path) return
			const cached = imgCache.get(path)
			if (cached) {
				img.src = cached
				return
			}
			window.api
				.fileDataUrl(path)
				.then((url) => {
					imgCache.set(path, url)
					if (img.getAttribute('data-local') === path) img.src = url
				})
				.catch(() => {
					img.setAttribute('alt', `${img.getAttribute('alt') || '图片'}（缺失：${path}）`)
					img.removeAttribute('data-local')
				})
		})
	}

	/** PlantUML 代码块 → 服务器渲染图 */
	async function renderPlantuml(el: HTMLElement): Promise<void> {
		const blocks = Array.from(el.querySelectorAll('pre code.language-plantuml'))
		for (const code of blocks) {
			const pre = code.parentElement
			if (!pre) continue
			const text = code.textContent ?? ''
			const holder = document.createElement('div')
			holder.className = 'puml-box'
			pre.replaceWith(holder)
			try {
				const url = await window.api.plantumlUrl(text)
				const img = document.createElement('img')
				img.src = url
				img.alt = 'PlantUML 图'
				img.loading = 'lazy'
				holder.append(img)
			} catch {
				holder.textContent = text
			}
		}
	}

	/** Mermaid 代码块 → 渲染成图 */
	async function renderMermaid(el: HTMLElement): Promise<void> {
		const blocks = Array.from(el.querySelectorAll('pre code.language-mermaid'))
		if (!blocks.length) return
		try {
			const mermaid = (await import('mermaid')).default
			mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'neutral' })
			for (const code of blocks) {
				const pre = code.parentElement
				if (!pre) continue
				const holder = document.createElement('div')
				holder.className = 'mermaid-box'
				holder.textContent = code.textContent ?? ''
				pre.replaceWith(holder)
			}
			await mermaid.run({ nodes: Array.from(el.querySelectorAll('.mermaid-box')) as HTMLElement[] })
		} catch (err) {
			console.warn('mermaid 渲染失败', err)
		}
	}

	/** ANSI 终端代码块 → 彩色 HTML */
	function renderAnsi(el: HTMLElement): void {
		el.querySelectorAll('pre code.language-ansi').forEach((code) => {
			const pre = code.parentElement
			if (!pre || pre.dataset.ansiDone === '1') return
			pre.dataset.ansiDone = '1'
			pre.classList.add('ansi-box')
			pre.innerHTML = ansiToHtml(code.textContent ?? '')
		})
	}

	// 内容变化后：先填图片和 ANSI，再防抖渲染图表
	$effect(() => {
		void view.html
		const el = wrap
		if (!el) return
		fillImages(el)
		renderAnsi(el)
		const timer = setTimeout(() => {
			void renderPlantuml(el).then(() => renderMermaid(el))
		}, 250)
		return () => clearTimeout(timer)
	})
</script>

<div class="md-preview" bind:this={wrap}>
	{#if isMdx}
		<div class="mdx-hint">
			MDX 预览：注释已隐藏、export 数据已求值、简单表达式已替换；JSX 组件（好友卡片等布局代码）不会执行渲染。
		</div>
	{/if}
	{#if view.title}
		<h1 class="md-title">{view.title}</h1>
	{/if}
	{#if view.tags.length}
		<div class="md-meta">
			{#each view.tags as t}
				<span class="tag">{t}</span>
			{/each}
			{#if view.date}
				<span class="muted">{view.date}</span>
			{/if}
		</div>
	{/if}
	<!-- HTML 由 lib/preview.ts 渲染（marked），内容来自用户自己的本地文档，等价于博客的渲染结果 -->
	<div class="md-body">{@html view.html}</div>
</div>

<style>
	.md-preview {
		height: 100%;
		overflow: auto;
		padding: 2px 4px;
	}
	.mdx-hint {
		background: var(--warn-bg);
		border: 1px solid #f0dcb4;
		border-radius: 8px;
		padding: 6px 10px;
		font-size: 12.5px;
		color: #8a6d3b;
		margin-bottom: 10px;
	}
	.md-title {
		font-size: 22px;
		margin: 0 0 8px;
		line-height: 1.3;
	}
	.md-meta {
		display: flex;
		gap: 6px;
		align-items: center;
		flex-wrap: wrap;
		margin-bottom: 12px;
	}
	.md-body {
		line-height: 1.8;
		font-size: 14.5px;
		word-break: break-word;
	}
	.md-body :global(h1),
	.md-body :global(h2),
	.md-body :global(h3),
	.md-body :global(h4) {
		margin: 22px 0 10px;
		line-height: 1.4;
	}
	.md-body :global(h1) {
		font-size: 21px;
	}
	.md-body :global(h2) {
		font-size: 18px;
		border-bottom: 1px solid var(--line);
		padding-bottom: 6px;
	}
	.md-body :global(h3) {
		font-size: 16px;
	}
	.md-body :global(p) {
		margin: 10px 0;
	}
	.md-body :global(a) {
		color: var(--accent);
	}
	.md-body :global(img) {
		max-width: 100%;
		border-radius: 8px;
	}
	.md-body :global(blockquote) {
		margin: 12px 0;
		padding: 6px 14px;
		border-left: 3px solid var(--accent);
		background: #f4faf9;
		color: #4a5568;
		border-radius: 0 8px 8px 0;
	}
	.md-body :global(code) {
		font-family: var(--mono);
		font-size: 13px;
		background: #eef1f5;
		border-radius: 5px;
		padding: 2px 6px;
	}
	.md-body :global(pre) {
		background: #f9fafb;
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: 14px 16px;
		overflow: auto;
		line-height: 1.6;
	}
	.md-body :global(pre code) {
		background: transparent;
		padding: 0;
		color: #383a42;
		font-size: 13px;
	}
	.md-body :global(table) {
		border-collapse: collapse;
		margin: 12px 0;
		width: 100%;
	}
	.md-body :global(th),
	.md-body :global(td) {
		border: 1px solid var(--line);
		padding: 6px 12px;
		text-align: left;
	}
	.md-body :global(th) {
		background: #f3f6fa;
	}
	.md-body :global(hr) {
		border: none;
		border-top: 1px solid var(--line);
		margin: 18px 0;
	}
	.md-body :global(ul),
	.md-body :global(ol) {
		padding-left: 24px;
		margin: 10px 0;
	}
	.md-body :global(li) {
		margin: 4px 0;
	}
	/* 提示块（::: 与 [!NOTE]） */
	.md-body :global(.callout) {
		margin: 14px 0;
		border: 1px solid var(--line);
		border-left: 4px solid #4488f0;
		border-radius: 10px;
		padding: 10px 14px;
		background: #f5f9ff;
	}
	.md-body :global(.callout .co-title) {
		font-weight: 700;
		margin-bottom: 4px;
		text-transform: capitalize;
	}
	.md-body :global(.callout .co-body p) {
		margin: 6px 0;
	}
	.md-body :global(.co-note),
	.md-body :global(.co-info),
	.md-body :global(.co-abstract),
	.md-body :global(.co-quote) {
		border-left-color: #4488f0;
		background: #f5f9ff;
	}
	.md-body :global(.co-tip),
	.md-body :global(.co-success),
	.md-body :global(.co-check) {
		border-left-color: #2da44e;
		background: #f2fbf5;
	}
	.md-body :global(.co-warning),
	.md-body :global(.co-caution) {
		border-left-color: #e8a30c;
		background: #fffaf0;
	}
	.md-body :global(.co-danger),
	.md-body :global(.co-error),
	.md-body :global(.co-bug) {
		border-left-color: #d94b4b;
		background: #fff5f5;
	}
	.md-body :global(.co-important),
	.md-body :global(.co-example) {
		border-left-color: #9a63e8;
		background: #faf6ff;
	}
	/* ::github 仓库卡片 */
	.md-body :global(a.gh-card) {
		display: flex;
		align-items: center;
		gap: 10px;
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: 10px 14px;
		margin: 12px 0;
		text-decoration: none;
		color: var(--text);
		background: #fbfcfe;
	}
	.md-body :global(a.gh-card:hover) {
		border-color: var(--accent);
	}
	.md-body :global(.gh-card .gh-name) {
		font-weight: 600;
	}
	.md-body :global(.gh-card .gh-sub) {
		margin-left: auto;
		color: var(--muted);
		font-size: 12.5px;
	}
	/* ANSI 终端配色块（浅色，匹配 Firefly 主题） */
	.md-body :global(pre.ansi-box) {
		background: #f9fafb;
		color: #383a42;
		line-height: 1.7;
	}
	.md-body :global(pre.ansi-box span) {
		font-family: var(--mono);
		font-size: 13px;
	}
	/* 图表容器 */
	.md-body :global(.mermaid-box),
	.md-body :global(.puml-box) {
		margin: 14px 0;
		text-align: center;
		overflow: auto;
		background: #fff;
		border: 1px solid var(--line);
		border-radius: 10px;
		padding: 12px;
	}
	.md-body :global(.mermaid-box svg),
	.md-body :global(.puml-box img) {
		max-width: 100%;
	}
	/* KaTeX 展示公式横向滚动 */
	.md-body :global(.katex-display) {
		overflow-x: auto;
		overflow-y: hidden;
		padding: 4px 0;
	}
</style>
