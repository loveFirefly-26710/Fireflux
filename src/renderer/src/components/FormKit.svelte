<script lang="ts">
	import Self from './FormKit.svelte'
	import AssetPicker from './AssetPicker.svelte'
	import { isAdv, isPlainObject } from '../lib/err'
	import type { FieldDef, Widget } from '../lib/schema-types'

	/**
	 * 递归表单渲染器：一层字段一个控件，group / list 通过递归渲染自己（Self）。
	 *
	 * 改值协议：所有 setter 都是**原地修改**传进来的 value（对象改属性、数组 push/splice），
	 * 依赖 Svelte 5 的 $state 深代理触发更新 —— 所以调用方传的必须是可写的响应式对象；
	 * `oninput` 只是一次「改过了」的通知，配置中心传的是空函数（值已经在原对象上了）。
	 */
	interface Props {
		def?: FieldDef
		value: unknown
		/** 字段路径，用于按路径取配置文件里的中文注释当标签 */
		path?: string
		labels?: Record<string, string>
		oninput: (v: unknown) => void
		/** group 不画外框（顶层对象直接用） */
		bare?: boolean
	}
	let { def, value, path = '', labels = {}, oninput, bare = false }: Props = $props()

	let newKey = $state('')

	const adv = $derived(isAdv(value))
	const label = $derived(def?.label ?? labels[path] ?? (path ? path.split('.').pop() : ''))
	const hint = $derived(def?.hint ?? '')

	/** schema 没指定控件时按值类型猜一个（保证配置里每个字段都有界面可改） */
	function inferWidget(v: unknown): Widget {
		if (typeof v === 'boolean') return 'bool'
		if (typeof v === 'number') return 'number'
		if (typeof v === 'string') return v.length > 60 || v.includes('\n') ? 'textarea' : 'text'
		if (Array.isArray(v)) return v.length > 0 && isPlainObject(v[0]) ? 'list' : 'stringList'
		if (isPlainObject(v)) return 'group'
		return 'text'
	}

	const widget = $derived<Widget>(def?.w ?? inferWidget(value))

	const dualShape = $derived(
		def?.dual === 'boolObj' ? (typeof value === 'boolean' ? 'bool' : 'obj') : Array.isArray(value) ? 'list' : 'str'
	)

	// 双形态字段的两种取值互转（与 Firefly 配置里的写法一一对应）：
	// strList：字符串 ↔ 字符串数组，空数组回字符串时空串
	// boolObj：布尔 ↔ { desktop, mobile }，取回布尔时以 desktop 为准（缺省 true）
	function switchDual(e: Event): void {
		const to = (e.target as HTMLSelectElement).value
		if (def?.dual === 'strList') {
			if (to === 'multi' && !Array.isArray(value)) oninput(typeof value === 'string' && value ? [value] : [])
			else if (to === 'single' && Array.isArray(value)) oninput(String(value[0] ?? ''))
		} else if (def?.dual === 'boolObj') {
			if (to === 'single' && isPlainObject(value)) oninput((value['desktop'] as boolean) ?? true)
			else if (to === 'multi' && typeof value === 'boolean') oninput({ desktop: value, mobile: value })
		}
	}

	function firstItem(v: unknown): unknown {
		return Array.isArray(v) ? v[0] : undefined
	}

	/** schema 里没写到的字段按示例值自动补上（__ 开头的是解析占位，跳过） */
	function byAuto(fields: FieldDef[], sample: unknown): FieldDef[] {
		const keys = new Set(fields.map((f) => f.k))
		const extra: FieldDef[] = isPlainObject(sample)
			? Object.keys(sample)
					.filter((k) => !k.startsWith('__') && !keys.has(k))
					.map((k) => ({ k }))
			: []
		return [...fields, ...extra]
	}

	const groupFields = $derived(byAuto(def?.fields ?? [], value))
	const listFields = $derived(byAuto(def?.item ?? [], firstItem(value)))
	const arrayValue = $derived.by((): unknown[] => (Array.isArray(value) ? value : []))

	function itemTitle(item: unknown, i: number): string {
		const key = def?.titleKey ?? 'name'
		const t = isPlainObject(item) ? item[key] : undefined
		return typeof t === 'string' && t ? `${i + 1}. ${t}` : `第 ${i + 1} 项`
	}

	function move(i: number, d: number): void {
		const arr = value as unknown[]
		const j = i + d
		if (j < 0 || j >= arr.length) return
		;[arr[i], arr[j]] = [arr[j], arr[i]]
	}

	function addItem(): void {
		const arr = value as unknown[]
		if (def?.item?.length) {
			const obj: Record<string, unknown> = {}
			for (const f of def.item) {
				obj[f.k] =
					f.defaults ??
					(f.w === 'bool' ? true : f.w === 'number' ? 0 : f.w === 'stringList' || f.w === 'list' || f.w === 'kvList' ? [] : '')
			}
			arr.push(obj)
		} else if (isPlainObject(firstItem(value))) {
			arr.push(JSON.parse(JSON.stringify(firstItem(value))))
		} else {
			arr.push('')
		}
	}

	// ---- 模板里的类型收敛辅助 ----
	function setAt(i: number, v: unknown): void {
		;(value as unknown[])[i] = v
	}
	function removeAt(i: number): void {
		;(value as unknown[]).splice(i, 1)
	}
	function pushEmpty(): void {
		;(value as unknown[]).push('')
	}
	function pushRefs(refs: string[]): void {
		for (const r of refs) (value as unknown[]).push(r)
	}
	function getKey(obj: unknown, k: string): unknown {
		return isPlainObject(obj) ? obj[k] : undefined
	}
	function setKey(obj: unknown, k: string, v: unknown): void {
		if (isPlainObject(obj)) obj[k] = v
	}
	function delKey(key: string): void {
		delete (value as Record<string, unknown>)[key]
	}
	function addKv(key: string): void {
		;(value as Record<string, unknown>)[key] = { extraChars: '' }
	}
	function kvGet(key: string, k: string): unknown {
		const o = (value as Record<string, unknown>)[key]
		return isPlainObject(o) ? o[k] : undefined
	}
	function kvSet(key: string, k: string, v: unknown): void {
		const o = (value as Record<string, unknown>)[key] as Record<string, unknown> | undefined
		const obj = o ?? {}
		obj[k] = v
		;(value as Record<string, unknown>)[key] = obj
	}
</script>

{#snippet textInput(defx: FieldDef | undefined, val: unknown, set: (v: unknown) => void)}
	<div class="row">
		<input value={String(val ?? '')} oninput={(e) => set((e.target as HTMLInputElement).value)} />
		{#if defx?.asset}
			<AssetPicker target={defx.asset} onimported={(refs) => set(refs[0])} label="导入本地文件" />
		{/if}
		{#if typeof val === 'string' && val.startsWith('http')}
			<button class="btn small" onclick={() => window.api.openExternal(val)}>↗ 打开</button>
		{/if}
	</div>
{/snippet}

{#if adv}
	<div class="field">
		{#if !bare}<span class="flabel">{label}</span>{/if}
		<div class="adv-box">{isAdv(value) ? value.__adv : ''}</div>
		<div class="hint">此项由代码生成或为引用，暂不支持图形化修改（可在博客源文件中手动修改）。</div>
	</div>
{:else if widget === 'bool'}
	<div class="field">
		<span class="flabel">{label}</span>
		<select
			value={String(value)}
			onchange={(e) => oninput((e.target as HTMLSelectElement).value === 'true')}
		>
			<option value="true">开启</option>
			<option value="false">关闭</option>
		</select>
		{#if hint}<div class="hint">{hint}</div>{/if}
	</div>
{:else if widget === 'select'}
	<div class="field">
		<span class="flabel">{label}</span>
		<select value={String(value)} onchange={(e) => oninput((e.target as HTMLSelectElement).value)}>
			{#each def?.options ?? [] as opt}
				<option value={opt}>{opt}</option>
			{/each}
			{#if !(def?.options ?? []).includes(String(value))}
				<option value={String(value)}>{String(value)}（当前值）</option>
			{/if}
		</select>
		{#if hint}<div class="hint">{hint}</div>{/if}
	</div>
{:else if widget === 'dual'}
	<div class="field">
		<span class="flabel">{label}</span>
		<div class="row" style="margin-bottom:6px">
			<select style="max-width:180px" value={dualShape === 'str' || dualShape === 'bool' ? 'single' : 'multi'} onchange={switchDual}>
				{#if def?.dual === 'strList'}
					<option value="single">单个值</option>
					<option value="multi">多个值</option>
				{:else}
					<option value="single">统一开关</option>
					<option value="multi">分别设置</option>
				{/if}
			</select>
		</div>
		{#if def?.dual === 'strList'}
			{#if dualShape === 'str'}
				{@render textInput(def, value, oninput)}
			{:else}
				<Self def={{ k: def.k, w: 'stringList', asset: def.asset }} value={value} {path} {labels} oninput={oninput} />
			{/if}
		{:else if dualShape === 'bool' && def}
			<Self def={{ k: def.k, w: 'bool' }} value={value} {path} {labels} oninput={oninput} />
		{:else}
			{#each def?.dualFields ?? [] as f}
				<Self
					def={f}
					value={getKey(value, f.k)}
					path={path ? `${path}.${f.k}` : f.k}
					{labels}
					oninput={(v) => setKey(value, f.k, v)}
				/>
			{/each}
		{/if}
		{#if hint}<div class="hint">{hint}</div>{/if}
	</div>
{:else if widget === 'text'}
	<div class="field">
		<span class="flabel">{label}</span>
		{@render textInput(def, value, oninput)}
		{#if hint}<div class="hint">{hint}</div>{/if}
	</div>
{:else if widget === 'textarea'}
	<div class="field">
		<span class="flabel">{label}</span>
		<textarea rows="3" value={String(value ?? '')} oninput={(e) => oninput((e.target as HTMLTextAreaElement).value)}></textarea>
		{#if hint}<div class="hint">{hint}</div>{/if}
	</div>
{:else if widget === 'number'}
	<div class="field">
		<span class="flabel">{label}</span>
		<input
			type="number"
			step="any"
			value={String(value ?? 0)}
			oninput={(e) => oninput(Number((e.target as HTMLInputElement).value))}
		/>
		{#if hint}<div class="hint">{hint}</div>{/if}
	</div>
{:else if widget === 'code'}
	<div class="field">
		<span class="flabel">{label}</span>
		<textarea class="code" rows="14" value={String(value ?? '')} oninput={(e) => oninput((e.target as HTMLTextAreaElement).value)}></textarea>
	</div>
{:else if widget === 'stringList'}
	<div class="field">
		<span class="flabel">{label}</span>
		{#each arrayValue as item, i}
			<div class="row" style="margin-bottom:6px">
				<input value={String(item)} oninput={(e) => setAt(i, (e.target as HTMLInputElement).value)} />
				{#if def?.asset}
					<AssetPicker target={def.asset} onimported={pushRefs} label="导入并追加" />
				{/if}
				<button class="btn small danger" onclick={() => removeAt(i)}>✕</button>
			</div>
		{/each}
		<button class="btn small" onclick={pushEmpty}>＋ 添加一项</button>
		{#if hint}<div class="hint">{hint}</div>{/if}
	</div>
{:else if widget === 'list'}
	<div class="field">
		<span class="flabel">{label}</span>
		{#each arrayValue as item, i}
			<div class="list-card">
				<div class="list-card-head">
					<b>{itemTitle(item, i)}</b>
					<div class="row">
						<button class="btn small" disabled={i === 0} onclick={() => move(i, -1)}>↑</button>
						<button class="btn small" disabled={i === arrayValue.length - 1} onclick={() => move(i, 1)}>↓</button>
						<button class="btn small danger" onclick={() => removeAt(i)}>删除</button>
					</div>
				</div>
				{#each listFields as f}
					<Self
						def={f}
						value={getKey(item, f.k)}
						path={`${path}.${i}.${f.k}`}
						{labels}
						oninput={(v) => setKey(item, f.k, v)}
					/>
				{/each}
			</div>
		{/each}
		<button class="btn small" onclick={addItem}>＋ 添加一项</button>
		{#if hint}<div class="hint">{hint}</div>{/if}
	</div>
{:else if widget === 'kvList'}
	<div class="field">
		<span class="flabel">{label}</span>
		{#each Object.keys(value as Record<string, unknown>) as key}
			<div class="list-card">
				<div class="list-card-head">
					<b>{key}</b>
					<button class="btn small danger" onclick={() => delKey(key)}>删除</button>
				</div>
				{#each def?.item ?? [] as f}
					<Self
						def={f}
						value={kvGet(key, f.k)}
						path={`${path}.${key}.${f.k}`}
						{labels}
						oninput={(v) => kvSet(key, f.k, v)}
					/>
				{/each}
			</div>
		{/each}
		<div class="row">
			<input
				style="max-width:280px"
				placeholder="键名，如 --font-greatvibes"
				bind:value={newKey}
			/>
			<button
				class="btn small"
				onclick={() => {
					if (newKey.trim()) {
						addKv(newKey.trim())
						newKey = ''
					}
				}}>＋ 添加</button
			>
		</div>
		{#if hint}<div class="hint">{hint}</div>{/if}
	</div>
{:else if widget === 'group'}
	{#if bare}
		{#each groupFields as f}
			<Self
				def={f}
				value={getKey(value, f.k)}
				path={path ? `${path}.${f.k}` : f.k}
				{labels}
				oninput={(v) => setKey(value, f.k, v)}
			/>
		{/each}
	{:else}
		<fieldset class="group">
			<legend>{label}</legend>
			{#each groupFields as f}
				<Self
					def={f}
					value={getKey(value, f.k)}
					path={path ? `${path}.${f.k}` : f.k}
					{labels}
					oninput={(v) => setKey(value, f.k, v)}
				/>
			{/each}
		</fieldset>
		{#if hint}<div class="hint">{hint}</div>{/if}
	{/if}
{:else}
	<!-- schema 里写错控件名时的兜底：至少给个文本框，不至于整项消失 -->
	<div class="field">
		<span class="flabel">{label}</span>
		{@render textInput(def, value, oninput)}
	</div>
{/if}
