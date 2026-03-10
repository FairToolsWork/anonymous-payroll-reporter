# Changelog

## [3.1.0](https://github.com/FairToolsWork/anonymous-payroll-reporter/compare/anonymous-payroll-reporter-v3.0.0...anonymous-payroll-reporter-v3.1.0) (2026-03-10)


### Features

* **pwa:** add PDF export and refresh report UI styling ([32e6224](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/32e62249dff87ad337fb7030134070a8295a1319))
* **pwa:** add PDF report navigation and colophon updates ([1cfd0bd](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/1cfd0bda99c2c0700af5729a84b21d1bf24f949f))

## [3.0.0](https://github.com/FairToolsWork/anonymous-payroll-reporter/compare/anonymous-payroll-reporter-v2.1.0...anonymous-payroll-reporter-v3.0.0) (2026-03-09)


### Features

* **pwa:** add Vite build output, manifest, and service worker caching ([2d73901](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/2d7390197406bcc1174bca08f7a88def1f677bd7))
* **pwa:** optimize loading, service worker caching, and PDF cleanup ([b36ac9d](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/b36ac9dc1f08197eb82ca219264e9c471fac513b))


### Miscellaneous Chores

* prepare major release ([415134a](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/415134a55c240696aea1e5886aec1fa31ca26997))

## [2.1.0](https://github.com/FairToolsWork/anonymous-payroll-reporter/compare/anonymous-payroll-reporter-v2.0.1...anonymous-payroll-reporter-v2.1.0) (2026-03-07)


### Features

* **pwa:** move update banner outside Vue and preload refresh resources ([85c8a7f](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/85c8a7f54073fbf8e2b2a82adc97162401ac65df))

## [2.0.1](https://github.com/FairToolsWork/anonymous-payroll-reporter/compare/anonymous-payroll-reporter-v2.0.0...anonymous-payroll-reporter-v2.0.1) (2026-03-07)


### Bug Fixes

* **fixtures:** correct address name anchor in Sage UK PDF generation ([0ed2812](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/0ed281261e13ad1eb0894914a21d0d399d699172))
* **report:** normalize currency rounding to avoid negative zero labels ([5a3a94e](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/5a3a94e47719e23ae5d171d3b76457ca597aaeeb))


### Performance Improvements

* **pwa:** cap CDN cache entries in service worker ([523f4a2](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/523f4a2a670d894697a248b8893e794e65b809ba))

## [2.0.0](https://github.com/FairToolsWork/anonymous-payroll-reporter/compare/anonymous-payroll-reporter-v1.5.1...anonymous-payroll-reporter-v2.0.0) (2026-03-06)


### ⚠ BREAKING CHANGES

* **report:** move report context to April tax-year fiscal grouping

### Features

* **pwa:** surface app version in about dialog and report output ([eacfd9f](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/eacfd9f27769349944a97980a27e91f95b1fe1cd))
* **report:** move report context to April tax-year fiscal grouping ([8b00700](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/8b0070043d5a3d047f9db8ffb419ea89ca414cf2))

## [1.5.1](https://github.com/FairToolsWork/anonymous-payroll-reporter/compare/anonymous-payroll-reporter-v1.5.0...anonymous-payroll-reporter-v1.5.1) (2026-03-06)


### Performance Improvements

* **pwa:** add CORS metadata to external script tags, reduceing memory load ([76ee5bf](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/76ee5bfa179f30b6120d8b4e8471b5b3e061f423))

## [1.5.0](https://github.com/FairToolsWork/anonymous-payroll-reporter/compare/anonymous-payroll-reporter-v1.4.0...anonymous-payroll-reporter-v1.5.0) (2026-03-05)


### Features

* **fixtures:** align Sage UK PDF generation with updated period and employee fields ([a42cbf6](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/a42cbf6db23c3aa339ea936b6f22df3c5767da97))
* **fixtures:** refresh demo and PDF fixtures after payroll layout updates ([16429ef](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/16429efd857a1f2e5e4ff8830a8cb90c9b60a014))
* **sage-uk:** generate label-driven patterns and align parser debug workflow ([4da3d20](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/4da3d20939d63e0aa97b62fcd6b4ad422e7e7168))

## [1.4.0](https://github.com/FairToolsWork/anonymous-payroll-reporter/compare/anonymous-payroll-reporter-v1.3.0...anonymous-payroll-reporter-v1.4.0) (2026-03-05)


### Features

* **fixtures:** generate demo instructions and expand attribution notices for demo assets ([b2a5c5e](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/b2a5c5eab92a2c826090442765ff3532e22a0811))

## [1.3.0](https://github.com/FairToolsWork/anonymous-payroll-reporter/compare/anonymous-payroll-reporter-v1.2.0...anonymous-payroll-reporter-v1.3.0) (2026-03-05)


### Features

* **demo:** publish demo zip and keep links versioned ([cc09df8](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/cc09df88ed44dadfb3dbbfcfbbf94b31d3af2020))


### Bug Fixes

* **fixtures:** stabilize generated outputs across runs ([d40dd8c](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/d40dd8c94607528ca42d61b7733bc800fec4d4ea))

## [1.2.0](https://github.com/FairToolsWork/anonymous-payroll-reporter/compare/anonymous-payroll-reporter-v1.1.1...anonymous-payroll-reporter-v1.2.0) (2026-03-04)


### Features

* **fixtures:** add demo zip generation and refine fixture parsing ([44ad299](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/44ad2990d15b0749ddb23eeeda16c009b07f9b8a))
* **pwa:** add about dialog and demo download entry ([c2ace29](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/c2ace29ad2d40a638bcbb03df4f8187ddbf832ee))


### Bug Fixes

* **ci:deploy:** allow pnpm workspace installs for wrangler setup ([7ea8609](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/7ea8609b3feeea20b3f3c82295ff4260b1006a3d))
* **pdf:** force system fonts for consistent rendering ([805ce84](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/805ce84c1d6556692b294b212a3d926f936c398e))
* **ui:** improve upload error messaging for payroll parsing ([7cfb46c](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/7cfb46c1fafe5f6feb75e319cf47634e05a0a167))

## [1.1.1](https://github.com/FairToolsWork/anonymous-payroll-reporter/compare/anonymous-payroll-reporter-v1.1.0...anonymous-payroll-reporter-v1.1.1) (2026-03-03)


### Bug Fixes

* **ci:deploy:** install node and pnpm before wrangler action ([2b4a7d8](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/2b4a7d80694acda123adb310f09f6bd20e46ae02))

## [1.1.0](https://github.com/FairToolsWork/anonymous-payroll-reporter/compare/anonymous-payroll-reporter-v1.0.0...anonymous-payroll-reporter-v1.1.0) (2026-03-03)


### Features

* **contributions:** validate Excel uploads and add contribution test suite ([e8d2eda](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/e8d2edaf6879084de35d127590a7fe3e8f1f4607))
* **demonstrator:** add payroll PDF processing demo with tests and docs ([de0793d](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/de0793dee21b6bc66a48d0f79697f8796e55be10))
* **deploy:** add Cloudflare Workers deployment workflow and cache control ([b702702](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/b702702ea540de57031476895ff165e7974f6af4))
* **fixtures:** split pdf/excel generators, add excel fixtures, and expand contribution tests ([94631c8](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/94631c8eaccd24be951471b00277e2c413a4efd8))
* **generate_fixtures:** add fixture generation tooling, configs, and sample inputs ([c2b6735](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/c2b6735d6d430db2a32ae8a38c90b6ba3f701f0c))
* **parser:** make format parser async and pass full parse context ([df78636](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/df78636e875ebb72a0cfc1785d54a969eea421b4))
* **parser:** tighten payroll parsing and modernize test harness ([ab832e3](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/ab832e37af5942bc90f16b8344c02c5089924476))
* **pwa:** add app icon set assets and manifest references ([2672d02](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/2672d0299dc8e070b0a27a8834ac5a94dd209e04))
* **pwa:** add collapsible prep and next steps sections ([fa490b6](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/fa490b685a18708eeadb96b48f402cffbfafb484))
* **pwa:** add Excel debug capture to parsing output ([3df35a4](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/3df35a421d9f138518f47192ac0e1ba93dbb516e))
* **pwa:** add JS type checking and align parser module paths ([2bf5645](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/2bf5645373b205d9cc3b0be24bca0f64bffb2901))
* **pwa:** add payroll validation flags and confidence cues in report ([134954a](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/134954abe3a71a3b36b0737286d0cd796e757b51))
* **pwa:** add PDF validation module and align test naming ([5dbf425](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/5dbf42579da96db2766825374ebd87fa66df6b0e))
* **pwa:** add provider badges and unify pill styling ([88ef869](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/88ef869e8727d8a83d474b2d1627765218b51503))
* **pwa:** add report anchors and contribution record counts ([2eb9e30](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/2eb9e30ddff609b1627a3714b12182cc11ae00c6))
* **pwa:** add report summary totals and scroll-to-top UX controls ([46c4bdf](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/46c4bdf1ed3e0caef99ea5ddc1ed35c4c0a0bd21))
* **pwa:** add staged uploads, contribution parsing, and report UX refinements ([9613576](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/9613576d470afeb2a534ea523878a1a0790a7de3))
* **pwa:** deliver offline payroll report UI with caching and parsing workflow ([294ad9c](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/294ad9c0cebaf684c2636d695f14a5831e1d7c42))
* **pwa:** enhance contribution summaries and handle multi-entry months ([8a3026a](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/8a3026a887808ed1514bb66fed1637b7698d1f08))
* **pwa:** enhance payroll parsing, debug output, and reporting details ([fa038c2](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/fa038c285c077e75a0f88bdf3984226126cbbf86))
* **pwa:** expand contribution reconciliation and staging feedback in payroll report ([dd9a924](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/dd9a9247a015b9465b5bcdcaea77f2c714d4ae5b))
* **pwa:** expand payroll parsing UI flow with disclosures and report refinements ([6686f90](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/6686f90d98b6149fbbeb6b170806eab870723ec4))
* **pwa:** guide next actions and improve report focus behavior ([4cc43a7](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/4cc43a7a4b97e87b1cb2fedcc83000706ba9b17b))
* **pwa:** harden Excel parsing feedback and report contribution breakdowns ([c9e78b5](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/c9e78b5c94be4a96370fb4c4fb7ac1650971c35c))
* **pwa:** improve update flow, stale instance handling, and service worker cache ([cf0eb62](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/cf0eb628596c4d8b3fd3bb93210f5cf55e04f4d7))
* **pwa:** modularize parsing helpers and harden contribution parsing ([378db6e](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/378db6ea70075c57059aa4603786103545c395ee))
* **pwa:** polish debug copy UX and consolidate misc footnotes ([fda83be](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/fda83bed4cf898a74732605c70364d14a8437991))
* **pwa:** refresh app branding assets and manifest metadata ([50326f5](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/50326f559dccc80b00649f4dedc156b273ef041f))
* **release,docs:** add release-please setup, refresh docs, and update PWA copy ([7fdece2](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/7fdece2db807e7a096aa01e835a70959c8f04318))
* **test:** add fixture generation workflow and update test harness inputs ([1038d43](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/1038d4391c19970afa0191adaa94e6bce3b7a7ed))
* **ui:** add collapsible prep guidance with persisted state ([87bfece](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/87bfece3f6b0cc3b8e539df6279bd51eee77a45f))
* **ui:** add no-esm fallback screen for unsupported browsers ([9e57525](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/9e575257dea09c8b2fc7b4e8d1047bf6ef5c01a4))
* **ui:** add prep guidance and assets for payroll workflow ([4b0c2cb](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/4b0c2cbf8085dcf0202a97dbaf0f10524534012b))
* **ui:** persist session state and clarify payroll split math typing ([069aabd](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/069aabd9d377b4d5a451ba9202d12945c90759fc))
* **ui:** refine loading states and clamp initial render flicker ([a924e79](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/a924e79376f0976807c90e37a8d02200a91499c6))


### Bug Fixes

* **deploy:** update Cloudflare domain references for production routing ([eedb775](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/eedb7750c5d72c39448302dabbb7266ae3fe13fd))
* **docs,lint:** correct copy and simplify stylelint scope ([06d377a](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/06d377a9f8d6170983ea878137e9945753d658b2))
* **parser,report:** align pension fields, improve report workflow checks, and update parser typings ([da2dc7a](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/da2dc7a5d61a7ce8455cf55997446c1a0721b0d4))
* **pwa:** correct copy typos and refine collapse grid overflow handling ([f92d4d7](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/f92d4d7aaf3d31e595135da93fbe4aa43e48c62d))
* **pwa:** guard staged file access and refine upload UI styling ([a475fac](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/a475face328d53cffd4e458feae799803215cadb))
* **pwa:** refine status messaging and polish interactive details styling ([cabcc14](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/cabcc14aa7b7f464dab48bf0238cf7b2ca298cb4))
* **pwa:** simplify app state, clean up event handlers, and harden SW fetch fallback ([0917ddf](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/0917ddfd165d749ccf1238b03ad8571d77d8418d))
* **pwa:** update collapse layout, cache assets, and icon manifest entries ([5a79cb4](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/5a79cb40e4c4a1d7daf24a98b72c3603b69a17d8))
* **release:** enable manifest package config for release-please ([2049b21](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/2049b21786bfbd962787391f4ecc41f16e8b5da5))
* **report,workflow:** pass contribution context and align progress totals ([0f4057a](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/0f4057ad144e93f90c670de875b147b1e2f7e472))
* **report:** cap missing months to current period and simplify month labeling ([64dd847](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/64dd8475d5683efcdb1de9d0ce5392e28aa4b898))
* **report:** clarify pension contribution summaries, reconcile balances, and refine onboarding guidance ([6e946e8](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/6e946e8bfa5048d97ff22c5822cd7872371f654d))
* **report:** clarify pension notes, include contribution-only years, and style employer footnotes ([cca4a28](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/cca4a28852f1c01abd05449b3cf3ad6a9e206e1c))
* **report:** clean up types and validation assignment ([77c2ddf](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/77c2ddf8dbcb645229ec501c584458b7fab034f9))
* **report:** guard empty records and expand report workflow test coverage ([49e33ea](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/49e33ea0a501e162497172738d01cfc8d2e7f70a))
* **ui,lint:** improve collapsible sections, update banner styling, and add browser globals ([0dd875a](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/0dd875a411683da12b18cb80dbb4cefcc00d7c68))
* **ui,report:** improve payroll flow messaging, debug export, and styles for stability ([d4cff31](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/d4cff3137c43ba7903af8aca358536705d67427c))
* **ui:** polish prep toggle copy, loading order, and font fallback tweaks ([49b1b6e](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/49b1b6e80d4b079b69c6ae41b86e4b6c8e99fa56))
* **ui:** prevent layout overflow in report and loading panels ([8dfa994](https://github.com/FairToolsWork/anonymous-payroll-reporter/commit/8dfa994fca533b894f59728f1be2aa2b6cf5dca9))
