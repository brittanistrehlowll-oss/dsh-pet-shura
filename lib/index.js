/**
 * dsh-pet-shura — 修罗小脑斧 animated pet for the dsh web surface.
 *
 * Host plugin (zero runtime dependencies), mirrors the dsh-quota-panel
 * mounting pattern:
 *  1. Registers one exact route `/pet/shura-sentinel.webp` that serves the
 *     v2 spritesheet (1536x2288, 8 cols x 11 rows, 192x208 cells) with a
 *     long browser cache lifetime.
 *  2. Taps the served index.html and injects one self-contained page script
 *     (lib/pet-client.js) right before `</body>` that renders the pet:
 *     full 11-row spritesheet animation, drag & drop with remembered
 *     position, 16-direction look-at-mouse, random idle actions, and a
 *     right-click settings panel (size / random actions / look-at-mouse /
 *     reset position) persisted in localStorage.
 *
 * The script degrades silently (removes itself) when the spritesheet is
 * unavailable, so a broken install never disturbs the host page.
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

/**
 * Apply the plugin: spritesheet route + index tap.
 * @param ctx - plugin context carrying the webServer service.
 * @param config - reserved for future options; currently unused.
 */
export function apply(ctx, _config) {
	ctx.effect(() => {
		const disposeRoute = ctx.webServer.register({
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
		const disposeTap = ctx.webServer.tapIndex((html) =>
			html.replace('</body>', `<script>${CLIENT_SCRIPT}<\/script></body>`)
		);
		return () => {
			disposeRoute();
			disposeTap();
		};
	}, 'pet-shura: pet script + spritesheet route');
}
