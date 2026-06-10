'use strict';

const sinon = require('sinon');

const puppeteer = {
	launch: sinon.stub()
};
module.exports = puppeteer;

const mockBrowser = {
	close: sinon.stub(),
	newPage: sinon.stub()
};
puppeteer.mockBrowser = mockBrowser;

// ElementHandle returned by `page.$` for native (non-CSS) selector resolution,
// and by `jsHandle.asElement()` for bare-XPath resolution.
const mockElementHandle = {
	evaluate: sinon.stub().resolves(),
	click: sinon.stub().resolves(),
	dispose: sinon.stub().resolves()
};
puppeteer.mockElementHandle = mockElementHandle;

// JSHandle returned by `page.evaluateHandle` when resolving a bare XPath. Its
// `asElement()` yields the ElementHandle (or null when nothing matched).
const mockJSHandle = {
	asElement: sinon.stub().returns(mockElementHandle),
	dispose: sinon.stub().resolves()
};
puppeteer.mockJSHandle = mockJSHandle;

const mockPage = {
	addScriptTag: sinon.stub().resolves(),
	close: sinon.stub().resolves(),
	click: sinon.stub().resolves(),
	evaluate: sinon.stub().resolves(),
	focus: sinon.stub().resolves(),
	goto: sinon.stub().resolves(),
	on: sinon.stub(),
	off: sinon.stub(),
	screenshot: sinon.stub().resolves(),
	setExtraHTTPHeaders: sinon.stub().resolves(),
	setRequestInterception: sinon.stub().resolves(),
	setUserAgent: sinon.stub().resolves(),
	setViewport: sinon.stub().resolves(),
	type: sinon.stub().resolves(),
	waitForFunction: sinon.stub().resolves(),
	$: sinon.stub().resolves(mockElementHandle),
	evaluateHandle: sinon.stub().resolves(mockJSHandle),
	waitForSelector: sinon.stub().resolves(mockElementHandle),
	getDefaultTimeout: sinon.stub().returns(30000)
};
puppeteer.mockPage = mockPage;

puppeteer.launch.resolves(mockBrowser);
mockBrowser.newPage.resolves(mockPage);
