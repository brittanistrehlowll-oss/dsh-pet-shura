/**
 * dsh-pet-shura — 修罗小脑斧 animated pet for the dsh web surface.
 *
 * Host plugin (zero runtime dependencies), mirrors the dsh-quota-panel
 * mounting pattern:
 *  1. Registers an exact route `/pet/shura-sentinel.webp` that serves the
 *     v2 spritesheet (1536x2288, 8 cols x 11 rows, 192x208 cells) with a
 *     long browser cache lifetime.
 *  2. Taps the served index.html and injects one self-contained page script
 *     (lib/pet-client.js) right before `</body>` that renders the pet:
 *     full 11-row spritesheet animation, drag & drop with remembered
 *     position, 16-direction look-at-mouse, random idle actions, a
 *     right-click settings panel, and a speech bubble driven by the
 *     work-progress event stream below.
 *  3. Subscribes to session events (`session/event`) and re-broadcasts a
 *     compact progress brief over a Server-Sent Events endpoint
 *     `/pet/events`: per-thread tool activity (tool calls starting /
 *     finishing, errors, approvals, replies) plus a rolling "thread
 *     overview" — how many threads (sessions) are busy and what each one
 *     is doing right now — rendered into the pet's speech bubble.
 *
 * The script degrades silently (removes itself) when the spritesheet is
 * unavailable, and the SSE client reconnects on its own, so a broken or
 * disconnected feed never disturbs the host page.
 *
 * Example mount (profile patch):
 *
 *   - insert:
 *       - id: pet-shura
 *         name: 'dsh-pet-shura'
 *         inject: [webServer]
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const name = 'pet-shura';

export const inject = ['webServer'];

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT_SCRIPT = readFileSync(join(PACKAGE_ROOT, 'lib', 'pet-client.js'), 'utf8');
const SPRITESHEET_PATH = join(PACKAGE_ROOT, 'assets', 'spritesheet.webp');
const SPRITESHEET_ROUTE = '/pet/shura-sentinel.webp';
const EVENTS_ROUTE = '/pet/events';
const STATUS_ROUTE = '/pet/status';
const OVERVIEW_INTERVAL_MS = 15000;

/** Human-friendly Chinese verb for a tool name; unknown tools stay generic. */
const TOOL_LABELS = {
	bash: '跑终端命令',
	pwsh: '跑终端命令',
	'read': '读文件',
	'write': '写文件',
	'edit': '改文件',
	glob: '翻文件',
	grep: '搜代码',
	web_search: '上网查资料',
	subagent: '派小分队干活',
	subagent_fork: '派小分队干活',
	interrupt_agent: '叫停小分队',
	send_message: '给小分队派活',
	ralph: '跑强化循环',
	'workflow': '编排工作流',
	job_kill: '停后台任务',
	job_output: '收后台任务结果',
	job_list: '看后台任务',
	skill: '加载技能',
	todo_write: '列任务清单',
	create_goal: '定目标',
	get_goal: '查目标进度',
	update_goal: '更新目标',
	ask_user_question: '问你要不要确认',
	vision_ocr: '识别图片文字',
	vision_describe: '看图分析',
	vision_ground: '在图上定位目标',
	vision_crop: '裁剪图片',
	vision_pixel_diff: '像素对比图片',
	vision_html_screenshot: '渲染页面截图',
	vision_colors: '提取图片配色',
	vision_trace: '矢量化图形',
	'mcp__basicmemory__search_notes': '查记忆库',
	'mcp__basicmemory__write_note': '写记忆',
	'mcp__basicmemory__read_note': '读记忆',
};

/** Friendly label for a tool name, defaulting to a generic phrase. */
function toolLabel(name) {
	if (typeof name !== 'string' || !name) return '工具';
	if (TOOL_LABELS[name]) return TOOL_LABELS[name];
	if (name.startsWith('mcp__')) return '调用外部工具';
	if (name.startsWith('vision_')) return '处理图片';
	return `调用 ${name}`;
}

/** Pick one random item from a list. */
function pick(list) {
	return list[Math.floor(Math.random() * list.length)];
}

/** Line banks: 简洁、干练、偏工程师语态（参考设计方案的"可靠执行、不废话"人格），2–8 字为主。 */
const LINES = {
	user: ['收到。', '收到，开整。', '新任务，收到。', '指令收到。'],
	work: ['开始处理。', '我来做。', '进入执行。', '分析中…'],
	done: ['完成。', '搞定。', '处理好了。', '已完成。'],
	error: ['出错了，重试中。', '这里有问题。', '需要再试一次。', '异常，定位中。'],
	ask: ['需要确认。', '等你拍板。', '需要你定夺。'],
	reply: ['已处理。', '结果如下。', '处理完成。'],
	turnEnd: ['本轮完成。', '一轮处理完毕。', '收工。'],
	workflowStart: ['工作流启动。', '开始跑工作流。'],
	workflowEnd: ['工作流完成。', '流水线收尾。'],
	goalChange: ['目标更新，继续。', '新目标，推进中。'],
	waiting: ['待命中。', '随时待命。', '有事叫我。'],
};

/**
 * Track one thread (session): its display label and the tools it is
 * currently running (keyed by callId so results can resolve them).
 */
class ThreadTracker {
	constructor(sessionId) {
		this.id = sessionId;
		this.label = '主线程';
		this.active = new Map(); // callId → { tool, since }
	}
	get busy() {
		return this.active.size > 0;
	}
	firstTool() {
		for (const entry of this.active.values()) return entry.tool;
		return '';
	}
}

/**
 * Map one session event to a speech-brief payload, or null when the event
 * carries nothing worth saying. Also maintains per-thread activity state.
 * @param tracker - the ThreadTracker for the emitting session.
 * @param event - the session event.
 * @returns a brief `{ kind, text }` or null.
 */
function eventBrief(tracker, event) {
	const callId = event.data?.callId ?? '';
	switch (event.type) {
		case 'user/message':
			return { kind: 'user', text: pick(LINES.user) };
		case 'step/start':
			return { kind: 'work', text: pick(LINES.work) };
		case 'tool/call': {
			const name = event.data?.name;
			if (typeof name === 'string' && callId) {
				tracker.active.set(callId, { tool: name, since: Date.now() });
			}
			return { kind: 'tool', text: `正在${toolLabel(name)}`, tool: toolLabel(name) };
		}
		case 'tool/result': {
			const entry = callId ? tracker.active.get(callId) : undefined;
			if (entry) tracker.active.delete(callId);
			const name = entry?.tool ?? '';
			const label = toolLabel(name);
			const isError = event.data?.message?.content?.[0]?.isError === true;
			if (isError) return { kind: 'error', text: `${label}${pick(LINES.error)}`, tool: label };
			return { kind: 'done', text: `${label}${pick(LINES.done)}`, tool: label };
		}
		case 'approval/asked':
			return { kind: 'ask', text: pick(LINES.ask) };
		case 'assistant/message':
			return { kind: 'reply', text: pick(LINES.reply) };
		case 'turn/end': {
			tracker.active.clear();
			return { kind: 'idle', text: pick(LINES.turnEnd) };
		}
		case 'turn/start':
			return null;
		case 'session/title': {
			const title = event.data?.title;
			if (typeof title === 'string' && title) tracker.label = title;
			return null;
		}
		case 'tool-workflow/run-start':
			return { kind: 'work', text: pick(LINES.workflowStart) };
		case 'tool-workflow/run-end':
			return { kind: 'done', text: pick(LINES.workflowEnd) };
		case 'goal/change':
			return { kind: 'work', text: pick(LINES.goalChange) };
		default:
			return null;
	}
}

/**
 * Build the rolling thread-overview line: how many threads are busy and
 * what each one is doing. Returns null when nothing is running.
 * @param trackers - all live ThreadTrackers.
 */
function buildOverview(trackers) {
	const busy = trackers.filter((tracker) => tracker.busy);
	if (busy.length === 0) return null;
	if (busy.length === 1) {
		const tracker = busy[0];
		return `🔧 ${tracker.label}正在${toolLabel(tracker.firstTool())}`;
	}
	const parts = busy.map((tracker) => `${tracker.label}在${toolLabel(tracker.firstTool())}`);
	return `🔧 ${busy.length} 个线程在忙：${parts.join('，')}`;
}

/**
 * Build the structured thread-status payload for the status card.
 * @param trackers - all live ThreadTrackers.
 * @returns `{ threads: Array<{ label, tool, toolLabel }>, busy, total }`.
 */
function buildStatus(trackers) {
	const threads = [...trackers.values()].map((tracker) => {
		const tool = tracker.firstTool();
		return {
			label: tracker.label,
			tool,
			toolLabel: tool ? toolLabel(tool) : ''
		};
	});
	const busy = threads.filter((t) => t.tool);
	return { threads, busy: busy.length, total: threads.length };
}

/**
 * Apply the plugin: spritesheet route + index tap + SSE progress feed.
 * @param ctx - plugin context carrying the webServer service.
 * @param config - reserved for future options; currently unused.
 */
export function apply(ctx, _config) {
	ctx.effect(() => {
		const sseClients = new Set();
		const trackers = new Map(); // sessionId → ThreadTracker
		let subThreadCount = 0;
		let lastOverview = '';

		const trackerFor = (session) => {
			let tracker = trackers.get(session.id);
			if (!tracker) {
				const isSub = typeof session.header?.parentSession === 'string';
				tracker = new ThreadTracker(session.id);
				if (isSub) {
					subThreadCount += 1;
					tracker.label = `子线程 #${subThreadCount}`;
				}
				trackers.set(session.id, tracker);
			}
			return tracker;
		};

		const broadcast = (payload) => {
			const frame = `data: ${JSON.stringify(payload)}\n\n`;
			for (const res of sseClients) {
				try {
					res.write(frame);
				} catch {
					sseClients.delete(res);
				}
			}
		};

		// Rolling overview: only broadcast when the summary text actually
		// changed, so the pet does not chatter while work is steady.
		const overviewTimer = setInterval(() => {
			const line = buildOverview([...trackers.values()]);
			if (line && line !== lastOverview) {
				lastOverview = line;
				broadcast({ kind: 'overview', text: line });
			}
		}, OVERVIEW_INTERVAL_MS);

		const disposeSheetRoute = ctx.webServer.register({
			kind: 'exact',
			path: SPRITESHEET_ROUTE,
			handler: async (req, res) => {
				if (req.method !== 'GET' && req.method !== 'HEAD') {
					res.writeHead(405);
					res.end();
					return;
				}
				try {
					const body = readFileSync(SPRITESHEET_PATH);
					res.writeHead(200, {
						'content-type': 'image/webp',
						'cache-control': 'public, max-age=86400'
					});
					res.end(req.method === 'HEAD' ? undefined : body);
				} catch {
					res.writeHead(404);
					res.end();
				}
			}
		});

		const disposeEventsRoute = ctx.webServer.register({
			kind: 'exact',
			path: EVENTS_ROUTE,
			handler: (req, res) => {
				if (req.method !== 'GET') {
					res.writeHead(405);
					res.end();
					return;
				}
				res.writeHead(200, {
					'content-type': 'text/event-stream',
					'cache-control': 'no-cache',
					connection: 'keep-alive'
				});
				res.write(': connected\n\n');
				sseClients.add(res);
				req.on('close', () => sseClients.delete(res));
			}
		});

		// Structured thread-status snapshot for the pet's status card.
		const disposeStatusRoute = ctx.webServer.register({
			kind: 'exact',
			path: STATUS_ROUTE,
			handler: (req, res) => {
				if (req.method !== 'GET') {
					res.writeHead(405);
					res.end();
					return;
				}
				const payload = buildStatus([...trackers.values()]);
				res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
				res.end(JSON.stringify(payload));
			}
		});

		// Keep proxies from dropping idle SSE connections.
		const heartbeat = setInterval(() => {
			for (const res of sseClients) {
				try {
					res.write(': keepalive\n\n');
				} catch {
					sseClients.delete(res);
				}
			}
		}, 25000);

		const offSessionEvents = ctx.on('session/event', (session, event) => {
			try {
				const tracker = trackerFor(session);
				const brief = eventBrief(tracker, event);
				if (brief) {
					lastOverview = '';
					broadcast(brief);
				}
			} catch {
				// A single malformed event must never break the feed.
			}
		});

		const disposeTap = ctx.webServer.tapIndex((html) =>
			html.replace('</body>', `<script>${CLIENT_SCRIPT}<\/script></body>`)
		);

		return () => {
			disposeSheetRoute();
			disposeEventsRoute();
			disposeStatusRoute();
			clearInterval(overviewTimer);
			clearInterval(heartbeat);
			offSessionEvents();
			disposeTap();
			for (const res of sseClients) {
				try {
					res.end();
				} catch { /* ignore */ }
			}
			sseClients.clear();
		};
	}, 'pet-shura: pet script + spritesheet route + progress SSE');
}
