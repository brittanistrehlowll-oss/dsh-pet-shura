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
 *     `/pet/events` — the pet's speech bubble reports what the agent is
 *     doing: tool calls starting/finishing, errors, approvals, replies.
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
	mcp__basicmemory__search_notes: '查记忆库',
	mcp__basicmemory__write_note: '写记忆',
	mcp__basicmemory__read_note: '读记忆',
};

/** Friendly label for a tool name, defaulting to a generic phrase. */
function toolLabel(name) {
	if (typeof name !== 'string' || !name) return '工具';
	if (TOOL_LABELS[name]) return TOOL_LABELS[name];
	if (name.startsWith('mcp__')) return '调用外部工具';
	if (name.startsWith('vision_')) return '处理图片';
	return `调用 ${name}`;
}

/**
 * Map one session event to a compact speech-brief payload, or null when the
 * event carries nothing worth saying. `callNames` tracks tool/call → name so
 * tool/result can label itself (results only carry the call id).
 * @param session - the session that produced the event.
 * @param event - the session event.
 * @param callNames - module-lifetime Map<"sessionId:callId", toolName>.
 * @returns a brief `{ kind, text }` or null.
 */
function eventBrief(session, event, callNames) {
	const key = `${session.id}:${event.data?.callId ?? ''}`;
	switch (event.type) {
		case 'user/message':
			return { kind: 'user', text: '收到指令，开工！' };
		case 'step/start':
			return { kind: 'work', text: '开始干活…' };
		case 'tool/call': {
			const name = event.data?.name;
			if (typeof name === 'string') callNames.set(key, name);
			return { kind: 'tool', text: `正在${toolLabel(name)}` };
		}
		case 'tool/result': {
			const name = callNames.get(key) ?? '';
			callNames.delete(key);
			const isError = event.data?.message?.content?.[0]?.isError === true;
			if (isError) return { kind: 'error', text: `${toolLabel(name)}出错了，我来盯着` };
			return { kind: 'done', text: `${toolLabel(name)}完成` };
		}
		case 'approval/asked':
			return { kind: 'ask', text: '需要你拍板' };
		case 'assistant/message':
			return { kind: 'reply', text: '回答完毕' };
		case 'turn/end':
			return { kind: 'idle', text: '这一轮搞定，休息一下' };
		case 'tool-workflow/run-start':
			return { kind: 'work', text: '开始跑工作流' };
		case 'tool-workflow/run-end':
			return { kind: 'done', text: '工作流跑完了' };
		case 'goal/change':
			return { kind: 'work', text: '目标有更新，继续推进' };
		default:
			return null;
	}
}

/**
 * Apply the plugin: spritesheet route + index tap + SSE progress feed.
 * @param ctx - plugin context carrying the webServer service.
 * @param config - reserved for future options; currently unused.
 */
export function apply(ctx, _config) {
	ctx.effect(() => {
		const sseClients = new Set();
		const callNames = new Map();

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
				const brief = eventBrief(session, event, callNames);
				if (brief) broadcast(brief);
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
