/*
 * Reader integration: a translate button inside Zotero's text-selection popup
 * plus a floating, draggable translation card next to the selection.
 *
 * Flow (same idea as the Google Translate browser extension):
 *   select text -> Zotero shows its selection popup -> we append a "译" button
 *   -> click -> translation card appears next to the selection.
 */

/* eslint-disable no-var */
var ZPT = (typeof ZPT !== 'undefined' && ZPT) ? ZPT : {};

ZPT.readerUI = (function () {
	const EVENT = 'renderTextSelectionPopup';
	const STYLE_ID = 'zpt-reader-styles';
	const CARD_MARGIN = 12;

	// doc -> card state
	const states = new WeakMap();

	const CSS = [
		'.zpt-popup-button{display:inline-flex;align-items:center;justify-content:center;',
		'height:22px;min-width:26px;padding:0 7px;box-sizing:border-box;',
		'border:.5px solid transparent;border-radius:6px;',
		'background:var(--fill-quinary,rgba(127,127,127,.16));color:var(--fill-primary,#111);',
		'font-family:inherit;font-size:12px;font-weight:600;line-height:1;cursor:pointer;',
		'user-select:none;-moz-user-select:none;white-space:nowrap;}',
		'.zpt-popup-button:hover{background:var(--fill-quaternary,rgba(127,127,127,.3));}',
		'.zpt-popup-button:active{background:var(--fill-tertiary,rgba(127,127,127,.4));}',

		'.zpt-card{position:fixed;z-index:2147483000;box-sizing:border-box;display:flex;flex-direction:column;',
		'overflow:hidden;border:1px solid var(--color-border,rgba(0,0,0,.18));border-radius:10px;',
		'background:var(--material-background,#fff);color:var(--fill-primary,#111);',
		'box-shadow:0 10px 32px rgba(0,0,0,.28),0 2px 6px rgba(0,0,0,.16);',
		'font-family:inherit;font-size:13px;line-height:1.6;user-select:text;-moz-user-select:text;}',
		'.zpt-card[hidden]{display:none;}',
		'.zpt-card-header{display:flex;align-items:center;gap:6px;padding:7px 9px;cursor:move;',
		'background:var(--material-toolbar,rgba(127,127,127,.08));',
		'border-bottom:1px solid var(--color-border,rgba(0,0,0,.12));}',
		'.zpt-card-title{font-weight:600;font-size:12.5px;flex:0 0 auto;}',
		'.zpt-card-meta{font-size:11px;color:var(--fill-secondary,#666);flex:1 1 auto;min-width:0;',
		'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
		'.zpt-card-actions{display:flex;align-items:center;gap:3px;flex:0 0 auto;}',
		'.zpt-btn{appearance:none;border:.5px solid transparent;border-radius:6px;background:transparent;',
		'color:inherit;font-family:inherit;font-size:11.5px;padding:2px 7px;cursor:pointer;}',
		'.zpt-btn:hover{background:var(--fill-quinary,rgba(127,127,127,.18));}',
		'.zpt-btn:disabled{opacity:.45;cursor:default;}',
		'.zpt-btn:disabled:hover{background:transparent;}',
		'.zpt-btn.zpt-close{font-size:15px;line-height:1;padding:2px 6px;}',
		'.zpt-btn.zpt-retry{display:none;}',
		'.zpt-card[data-state="error"] .zpt-btn.zpt-retry{display:inline-block;}',

		'.zpt-card-body{padding:10px;display:flex;flex-direction:column;gap:9px;',
		'max-height:min(52vh,460px);overflow:auto;}',
		'.zpt-block-label{font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;',
		'color:var(--fill-secondary,#777);margin-bottom:3px;}',
		'.zpt-source{white-space:pre-wrap;word-break:break-word;color:var(--fill-secondary,#555);',
		'font-size:12.5px;max-height:8.4em;overflow:auto;',
		'border-left:2px solid var(--color-border,rgba(127,127,127,.4));padding-left:8px;}',
		'.zpt-target{white-space:pre-wrap;word-break:break-word;font-size:14px;min-height:1.6em;}',
		'.zpt-card[data-state="loading"] .zpt-target{color:var(--fill-secondary,#777);}',
		'.zpt-error{display:none;color:#c0392b;font-size:12.5px;white-space:pre-wrap;word-break:break-word;}',
		'.zpt-card[data-state="error"] .zpt-error{display:block;}',
		'.zpt-card[data-state="error"] .zpt-target{display:none;}',

		'.zpt-card-footer{display:flex;align-items:center;gap:7px;padding:6px 10px;',
		'border-top:1px solid var(--color-border,rgba(0,0,0,.1));font-size:11px;',
		'color:var(--fill-secondary,#777);background:var(--material-toolbar,rgba(127,127,127,.05));}',
		'.zpt-status{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
		'.zpt-spinner{width:11px;height:11px;flex:0 0 auto;border:2px solid currentColor;',
		'border-right-color:transparent;border-radius:50%;display:none;animation:zpt-spin .8s linear infinite;}',
		'.zpt-card[data-state="loading"] .zpt-spinner{display:block;}',
		'@keyframes zpt-spin{to{transform:rotate(360deg);}}'
	].join('');

	function ensureStyles(doc) {
		if (!doc || !doc.head || doc.getElementById(STYLE_ID)) {
			return;
		}
		let style = doc.createElement('style');
		style.id = STYLE_ID;
		style.setAttribute('type', 'text/css');
		style.textContent = CSS;
		doc.head.appendChild(style);
	}

	function register() {
		if (typeof Zotero === 'undefined' || !Zotero.Reader
			|| typeof Zotero.Reader.registerEventListener !== 'function') {
			ZPT.log.warn('Zotero.Reader.registerEventListener is unavailable — reader integration disabled');
			return false;
		}
		Zotero.Reader.registerEventListener(EVENT, onRenderTextSelectionPopup, ZPT.id);
		ZPT.log.debug('registered reader listener "' + EVENT + '"');
		return true;
	}

	function unregister() {
		if (!Zotero.Reader || typeof Zotero.Reader.unregisterEventListener !== 'function') {
			return;
		}
		try {
			Zotero.Reader.unregisterEventListener(EVENT, onRenderTextSelectionPopup);
		}
		catch (e) {
			ZPT.log.warn('failed to unregister reader listener: ' + e);
		}
	}

	function onRenderTextSelectionPopup(event) {
		try {
			if (!event || !event.doc || typeof event.append !== 'function') {
				return;
			}
			if (!ZPT.prefs.getBool('popup.showButton')) {
				return;
			}
			let annotation = event.params && event.params.annotation;
			let text = annotation && annotation.text !== undefined && annotation.text !== null
				? String(annotation.text)
				: '';
			if (!text.trim()) {
				return;
			}
			let doc = event.doc;
			ensureStyles(doc);

			let button = doc.createElement('button');
			button.className = 'zpt-popup-button';
			button.setAttribute('type', 'button');
			button.setAttribute('tabindex', '-1');
			button.setAttribute('title', ZPT.l10n.t('ui.buttonTitle'));
			button.textContent = ZPT.prefs.getString('popup.buttonLabel') || '译';

			let context = {
				reader: event.reader,
				annotation,
				text
			};
			button.addEventListener('click', (clickEvent) => {
				try {
					clickEvent.preventDefault();
					clickEvent.stopPropagation();
				}
				catch (e) {}
				try {
					openCard(doc, context, button);
				}
				catch (e) {
					ZPT.log.error('failed to open the translation card', e);
				}
			});
			event.append(button);
		}
		catch (e) {
			ZPT.log.error('renderTextSelectionPopup handler failed', e);
		}
	}

	function getState(doc) {
		let state = states.get(doc);
		if (state && state.card && state.card.isConnected) {
			return state;
		}
		state = createCard(doc);
		states.set(doc, state);
		return state;
	}

	function createCard(doc) {
		let card = doc.createElement('div');
		card.className = 'zpt-card';
		card.setAttribute('dir', 'auto');
		card.hidden = true;

		let header = doc.createElement('div');
		header.className = 'zpt-card-header';
		let title = doc.createElement('span');
		title.className = 'zpt-card-title';
		title.textContent = ZPT.l10n.t('ui.cardTitle');
		let meta = doc.createElement('span');
		meta.className = 'zpt-card-meta';
		let actions = doc.createElement('div');
		actions.className = 'zpt-card-actions';

		let makeButton = (action, label, extraClass) => {
			let button = doc.createElement('button');
			button.className = 'zpt-btn' + (extraClass ? ' ' + extraClass : '');
			button.setAttribute('type', 'button');
			button.setAttribute('data-action', action);
			button.textContent = label;
			return button;
		};
		let copyButton = makeButton('copy', ZPT.l10n.t('ui.copy'));
		let annotateButton = makeButton('annotate', ZPT.l10n.t('ui.annotate'));
		let retryButton = makeButton('retry', ZPT.l10n.t('ui.retry'), 'zpt-retry');
		let closeButton = makeButton('close', '\u00d7', 'zpt-close');
		closeButton.setAttribute('title', ZPT.l10n.t('ui.close'));
		annotateButton.disabled = true;
		copyButton.disabled = true;

		actions.append(copyButton, annotateButton, retryButton, closeButton);
		header.append(title, meta, actions);

		let body = doc.createElement('div');
		body.className = 'zpt-card-body';

		let sourceWrap = doc.createElement('div');
		let sourceLabel = doc.createElement('div');
		sourceLabel.className = 'zpt-block-label';
		sourceLabel.textContent = ZPT.l10n.t('ui.sourceLabel');
		let source = doc.createElement('div');
		source.className = 'zpt-source';
		sourceWrap.append(sourceLabel, source);

		let targetWrap = doc.createElement('div');
		let targetLabel = doc.createElement('div');
		targetLabel.className = 'zpt-block-label';
		targetLabel.textContent = ZPT.l10n.t('ui.targetLabel');
		let target = doc.createElement('div');
		target.className = 'zpt-target';
		let error = doc.createElement('div');
		error.className = 'zpt-error';
		targetWrap.append(targetLabel, target, error);

		body.append(sourceWrap, targetWrap);

		let footer = doc.createElement('div');
		footer.className = 'zpt-card-footer';
		let spinner = doc.createElement('div');
		spinner.className = 'zpt-spinner';
		let status = doc.createElement('span');
		status.className = 'zpt-status';
		status.textContent = ZPT.l10n.t('ui.pinHint');
		footer.append(spinner, status);

		card.append(header, body, footer);
		doc.body.appendChild(card);

		let state = {
			doc,
			card,
			header,
			meta,
			source,
			sourceWrap,
			sourceLabel,
			target,
			targetLabel,
			error,
			status,
			copyButton,
			annotateButton,
			retryButton,
			closeButton,
			context: null,
			translation: '',
			pending: 0,
			dragged: false,
			// Document-level listeners, kept so they can be removed again
			outsideEvents: null,
			onKeydown: null,
			onContextMenu: null
		};

		closeButton.addEventListener('click', () => hideCard(state));
		copyButton.addEventListener('click', () => copyTranslation(state));
		annotateButton.addEventListener('click', () => saveAnnotation(state));
		retryButton.addEventListener('click', () => {
			if (state.context) {
				runTranslation(state, state.context, true);
			}
		});
		state.onKeydown = (event) => {
			if (event.key === 'Escape' && !card.hidden) {
				hideCard(state);
			}
		};
		doc.addEventListener('keydown', state.onKeydown, true);
		makeDraggable(state);
		return state;
	}

	/*
	 * Click-outside handling. Zotero's own selection popup is a transient
	 * overlay, so the card is dismissed by the same interaction that dismisses
	 * it: any press that does not land on the card (the page, the annotation
	 * sidebar, the selection popup, ...). Capture phase so that the press is
	 * seen before the reader handles it, and the card gets a chance to close
	 * first.
	 */
	const OUTSIDE_EVENTS = ['pointerdown', 'mousedown'];

	/*
	 * Every document a press can land in while the card is open. `event.doc` is
	 * only the *reader* document (reader.html): the PDF pages are drawn by
	 * pdf.js in an iframe nested inside it, and a press in a child iframe never
	 * reaches the parent document — not even in the capture phase. Listening on
	 * the reader document alone therefore misses the most common "outside"
	 * press there is, the page itself. (Zotero's own overlay popups scan the
	 * reader's iframes for exactly this reason.) The reader in turn lives in a
	 * `<browser>` inside a chrome window, whose tabs and toolbars are a third
	 * document again.
	 */
	function pressDocuments(doc) {
		let documents = [doc];
		let host = hostDocument(doc);
		if (host) {
			documents.push(host);
		}
		// Nested scan — the viewer iframe may contain further ones — with an
		// indexOf guard, since the list is the queue being walked.
		for (let index = 0; index < documents.length; index++) {
			let frames;
			try {
				frames = documents[index].querySelectorAll('iframe');
			}
			catch (e) {
				continue;
			}
			for (let i = 0; i < frames.length; i++) {
				let inner = frameDocument(frames[i]);
				if (inner && documents.indexOf(inner) === -1) {
					documents.push(inner);
				}
			}
		}
		return documents;
	}

	/** The chrome document hosting this reader, or null if it cannot be reached. */
	function hostDocument(doc) {
		try {
			let win = doc.defaultView || doc.ownerGlobal;
			let frame = win && win.frameElement;
			if (frame && frame.ownerGlobal && frame.ownerGlobal !== win) {
				return frame.ownerGlobal.document || null;
			}
		}
		catch (e) {}
		try {
			let main = Zotero.getMainWindow && Zotero.getMainWindow();
			return (main && main.document) || null;
		}
		catch (e) {
			return null;
		}
	}

	/** A frame's document, or null for a frame we are not allowed to watch. */
	function frameDocument(frame) {
		let inner = null;
		try {
			inner = frame.contentDocument;
		}
		catch (e) {
			inner = null;
		}
		if (!inner) {
			try {
				inner = (frame.contentWindow && frame.contentWindow.document) || null;
			}
			catch (e) {
				inner = null;
			}
		}
		return inner;
	}

	function onOutsideEvent(state, event) {
		if (state.card.hidden) {
			return;
		}
		// Only a primary press counts: a right/middle press outside must not
		// dismiss the card (the user may be opening a context menu on it).
		if (typeof event.button === 'number' && event.button !== 0) {
			return;
		}
		let target = event.target;
		try {
			if (target && state.card.contains(target)) {
				return;
			}
		}
		catch (e) {}
		hideCard(state);
	}

	function attachOutsideClose(state) {
		if (state.outsideEvents || !ZPT.prefs.getBool('popup.closeOnClickOutside')) {
			return;
		}
		let handler = (event) => {
			try {
				onOutsideEvent(state, event);
			}
			catch (e) {
				ZPT.log.warn('click-outside handler failed: ' + e);
			}
		};
		let targets = pressDocuments(state.doc);
		state.outsideEvents = { handler, targets };
		for (let target of targets) {
			for (let type of OUTSIDE_EVENTS) {
				try {
					target.addEventListener(type, handler, true);
				}
				catch (e) {}
			}
		}
		ZPT.log.debug('dismiss-on-outside-click listening on ' + targets.length + ' document(s)');
	}

	function detachOutsideClose(state) {
		if (!state.outsideEvents) {
			return;
		}
		let { handler, targets } = state.outsideEvents;
		state.outsideEvents = null;
		for (let target of targets) {
			for (let type of OUTSIDE_EVENTS) {
				try {
					target.removeEventListener(type, handler, true);
				}
				catch (e) {}
			}
		}
	}

	function makeDraggable(state) {
		let { doc, card, header } = state;
		let drag = null;
		header.addEventListener('pointerdown', (event) => {
			if (event.button !== 0) {
				return;
			}
			try {
				if (event.target && event.target.closest && event.target.closest('button')) {
					return;
				}
			}
			catch (e) {}
			let rect = card.getBoundingClientRect();
			drag = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
			try {
				header.setPointerCapture(event.pointerId);
			}
			catch (e) {}
			event.preventDefault();
			event.stopPropagation();
		});
		header.addEventListener('pointermove', (event) => {
			if (!drag) {
				return;
			}
			moveCard(state, event.clientX - drag.dx, event.clientY - drag.dy);
			event.preventDefault();
		});
		let endDrag = (event) => {
			if (!drag) {
				return;
			}
			drag = null;
			state.dragged = true;
			try {
				header.releasePointerCapture(event.pointerId);
			}
			catch (e) {}
		};
		header.addEventListener('pointerup', endDrag);
		header.addEventListener('pointercancel', endDrag);
		// Keep clicks inside the card away from the reader UI
		card.addEventListener('pointerdown', (event) => event.stopPropagation());
		card.addEventListener('click', (event) => event.stopPropagation());
		// Keep the reader's context menu off the card's content
		state.onContextMenu = (event) => {
			if (!card.hidden && card.contains(event.target)) {
				event.stopPropagation();
			}
		};
		doc.addEventListener('contextmenu', state.onContextMenu, true);
	}


	function viewport(state) {
		let win = state.doc.defaultView || state.doc.ownerGlobal;
		return {
			width: (win && win.innerWidth) || 800,
			height: (win && win.innerHeight) || 600
		};
	}

	function cardSize(state) {
		let rect = state.card.getBoundingClientRect();
		return {
			width: rect.width || ZPT.prefs.getNumber('popup.width') || 380,
			height: rect.height || 220
		};
	}

	function moveCard(state, left, top) {
		let view = viewport(state);
		let size = cardSize(state);
		let maxLeft = Math.max(CARD_MARGIN, view.width - size.width - CARD_MARGIN);
		let maxTop = Math.max(CARD_MARGIN, view.height - size.height - CARD_MARGIN);
		state.card.style.left = Math.round(Math.min(Math.max(CARD_MARGIN, left), maxLeft)) + 'px';
		state.card.style.top = Math.round(Math.min(Math.max(CARD_MARGIN, top), maxTop)) + 'px';
	}

	function positionCard(state, anchorRect) {
		let view = viewport(state);
		let width = Math.min(
			Math.max(240, ZPT.prefs.getNumber('popup.width') || 380),
			Math.max(240, view.width - 2 * CARD_MARGIN)
		);
		state.card.style.width = width + 'px';
		let height = state.card.getBoundingClientRect().height || 220;
		let left;
		let top;
		if (anchorRect && (anchorRect.width || anchorRect.height)) {
			left = anchorRect.left + anchorRect.width / 2 - width / 2;
			top = anchorRect.bottom + 10;
			if (top + height > view.height - CARD_MARGIN) {
				let above = anchorRect.top - 10 - height;
				top = above >= CARD_MARGIN ? above : view.height - height - CARD_MARGIN;
			}
		}
		else {
			left = (view.width - width) / 2;
			top = Math.max(CARD_MARGIN, view.height / 3 - height / 2);
		}
		moveCard(state, left, top);
	}

	function openCard(doc, context, anchorElement) {
		let state = getState(doc);
		let visible = !state.card.hidden;
		let anchorRect = null;
		try {
			anchorRect = anchorElement ? anchorElement.getBoundingClientRect() : null;
		}
		catch (e) {}

		state.context = context;
		state.translation = '';
		state.meta.textContent = ZPT.translate.providerLabel()
			+ ' · ' + ZPT.translate.langLabel(ZPT.prefs.getString('sourceLang'))
			+ ' → ' + ZPT.translate.langLabel(ZPT.prefs.getString('targetLang'));
		state.error.textContent = '';
		state.target.textContent = '';
		state.source.textContent = ZPT.util.normalizeText(context.text);
		state.sourceWrap.hidden = !ZPT.prefs.getBool('popup.showSource');
		state.copyButton.disabled = true;
		state.annotateButton.disabled = true;
		state.annotateButton.hidden = !ZPT.annotations.isEnabled();
		state.status.textContent = ZPT.l10n.t('ui.pinHint');
		state.card.hidden = false;
		state.card.setAttribute('data-state', 'loading');
		attachOutsideClose(state);

		if (!visible || !state.dragged) {
			positionCard(state, anchorRect);
		}
		// Re-measure once the content is laid out
		requestAnimationFrameSafe(doc, () => {
			if (state.card.hidden || state.dragged) {
				return;
			}
			if (!state.card.style.left) {
				positionCard(state, anchorRect);
			}
		});

		runTranslation(state, context, false);
	}

	function requestAnimationFrameSafe(doc, callback) {
		let win = doc.defaultView || doc.ownerGlobal;
		if (win && typeof win.requestAnimationFrame === 'function') {
			win.requestAnimationFrame(() => callback());
		}
		else {
			setTimeout(callback, 16);
		}
	}

	/**
	 * " · word" / " · sentence" suffix so the user can see which route the
	 * automatic detection picked.
	 */
	function routeSuffix(result) {
		if (!result || !result.route) {
			return '';
		}
		let label = ZPT.translate.kindLabel(result.kind);
		return label ? ' · ' + label : '';
	}

	async function runTranslation(state, context, force) {
		let token = ++state.pending;
		state.card.setAttribute('data-state', 'loading');
		state.target.textContent = ZPT.l10n.t('ui.loading');
		state.error.textContent = '';
		state.copyButton.disabled = true;
		state.annotateButton.disabled = true;
		state.status.textContent = ZPT.l10n.t('ui.loading');
		try {
			let result = await ZPT.translate.translate(context.text, { force });
			if (token !== state.pending || state.card.hidden) {
				return;
			}
			state.translation = result.text;
			state.target.textContent = result.text;
			state.card.setAttribute('data-state', 'done');
			state.copyButton.disabled = false;
			state.annotateButton.disabled = !ZPT.annotations.isEnabled();
			let source = result.detectedLang
				? ZPT.l10n.langLabel(result.detectedLang)
				: ZPT.translate.langLabel(result.sourceLang);
			let fallback = result.fallbackFrom
				? ZPT.l10n.t('ui.fallbackSuffix', { from: ZPT.translate.providerLabel(result.fallbackFrom) })
				: '';
			state.meta.textContent = (result.providerLabel || ZPT.translate.providerLabel())
				+ ' · ' + source + ' → ' + ZPT.translate.langLabel(result.targetLang)
				+ routeSuffix(result) + fallback;
			state.status.textContent = result.cached
				? ZPT.l10n.t('ui.cached')
				: ZPT.l10n.t('ui.charCount', { count: result.text.length });
		}
		catch (e) {
			if (token !== state.pending) {
				return;
			}
			ZPT.log.error('translation failed', e);
			state.card.setAttribute('data-state', 'error');
			state.error.textContent = (e && e.message) || String(e);
			state.status.textContent = 'error' + (e && e.code ? ' (' + e.code + ')' : '');
			state.copyButton.disabled = true;
			state.annotateButton.disabled = true;
		}
	}

	function hideCard(state) {
		state.pending++;
		state.card.hidden = true;
		state.dragged = false;
		detachOutsideClose(state);
	}

	function copyTranslation(state) {
		if (!state.translation) {
			return;
		}
		try {
			Zotero.Utilities.Internal.copyTextToClipboard(state.translation);
			state.status.textContent = ZPT.l10n.t('ui.copied');
		}
		catch (e) {
			ZPT.log.error('copy failed', e);
			state.status.textContent = String(e.message || e);
		}
	}

	async function saveAnnotation(state) {
		if (!state.translation || !state.context) {
			return;
		}
		state.annotateButton.disabled = true;
		state.status.textContent = ZPT.l10n.t('ui.annotating');
		try {
			await ZPT.annotations.saveTranslation(state.context.reader, state.context.annotation, state.translation);
			state.status.textContent = ZPT.l10n.t('ui.annotated');
		}
		catch (e) {
			ZPT.log.error('saving annotation failed', e);
			state.status.textContent = String(e.message || e);
		}
		finally {
			state.annotateButton.disabled = false;
		}
	}

	/**
	 * Remove injected UI from a document (called for each open reader window on
	 * shutdown).
	 */
	function cleanupDocument(doc) {
		try {
			let state = states.get(doc);
			if (state) {
				detachOutsideClose(state);
				if (state.card) {
					state.card.remove();
				}
			}
			let style = doc.getElementById(STYLE_ID);
			if (style) {
				style.remove();
			}
			states.delete(doc);
		}
		catch (e) {}
	}

	function cleanupAll() {
		try {
			for (let reader of Zotero.Reader._readers || []) {
				let doc = reader._iframeDocument;
				if (doc) {
					cleanupDocument(doc);
				}
			}
		}
		catch (e) {
			ZPT.log.warn('cleanup failed: ' + e);
		}
	}

	return {
		register,
		unregister,
		cleanupAll,
		cleanupDocument,
		EVENT
	};
})();
